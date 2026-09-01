import { asc, desc, eq } from 'drizzle-orm';

import { money } from '../domain/money';
import { isoDate, type Transaction } from '../domain/transaction';
import type { CaptureOutcome, Draft, DraftProposal, Watch } from '../notifications/draft';
import { toTransactionRow } from './mappers';
import {
  accounts,
  notificationDrafts,
  notificationFingerprints,
  notificationWatches,
  transactions as transactionsTable,
  type NotificationDraftRow,
} from './schema';
import type { Storage } from './storage';

/**
 * Everything the bank-notifications flow has to survive a restart with: which apps are read and
 * onto which рахунок, which captured notifications have already been decided, and which чернетки
 * still await the owner's word.
 *
 * The one write that matters is `commitOutcome`: the fingerprint and what the notification came
 * to — a чернетка, or the витрата a правило auto-confirmed — land in one SQLite transaction or
 * neither does. That is what lets the drain acknowledge a capture only once it is safely stored,
 * so a crash between collecting and storing loses nothing and doubles nothing. The precedent is
 * `commitStatementAnswer`, and the reason is the same.
 *
 * A settled чернетка is deleted rather than marked: nothing ever reads one, and the fingerprint —
 * which references neither the чернетка nor the транзакція — is what "it never returns" rests on.
 */

/** A чернетка as storage holds it, with the рахунок it awaits on. The engine's own `Draft`. */
export type StoredDraft = Draft;

function proposalOf(row: NotificationDraftRow): DraftProposal {
  switch (row.kind) {
    case 'expense':
    case 'income': {
      if (row.amount === null) {
        throw new Error(`чернетка "${row.id}" of kind ${row.kind} is missing its amount`);
      }
      return { kind: row.kind, amount: money(row.amount, row.currency) };
    }
    case 'raw': {
      const original =
        row.originalAmount === null || row.originalCurrency === null
          ? undefined
          : money(row.originalAmount, row.originalCurrency);
      // Spread, never assigned: a raw чернетка with no foreign reference must carry no
      // `original` property at all, so it equals the one the engine built.
      return { kind: 'raw', ...(original ? { original } : {}) };
    }
    default:
      throw new Error(`чернетка "${row.id}" has an unknown proposal "${row.kind}"`);
  }
}

function toDraft(row: NotificationDraftRow): StoredDraft {
  return {
    id: row.id,
    accountId: row.accountId,
    currency: row.currency,
    date: isoDate(row.date),
    text: row.text,
    proposal: proposalOf(row),
  };
}

function toDraftRow(draft: Draft, createdAt: Date) {
  const proposal = draft.proposal;
  return {
    id: draft.id,
    accountId: draft.accountId,
    currency: draft.currency,
    date: isoDate(draft.date),
    text: draft.text,
    kind: proposal.kind,
    amount: proposal.kind === 'raw' ? null : proposal.amount.amount,
    originalAmount: proposal.kind === 'raw' ? (proposal.original?.amount ?? null) : null,
    originalCurrency: proposal.kind === 'raw' ? (proposal.original?.currency ?? null) : null,
    createdAt,
  };
}

export function notificationsRepo(db: Storage) {
  return {
    /**
     * Every watch, each carrying its рахунок's currency — read from `accounts`, never stored on
     * the watch row. A сума attaches to a чернетка in exactly this currency, so joining is what
     * makes it impossible for the two to disagree after a рахунок is edited.
     */
    watches(): Watch[] {
      return db
        .select()
        .from(notificationWatches)
        .innerJoin(accounts, eq(notificationWatches.accountId, accounts.id))
        .orderBy(asc(notificationWatches.packageName))
        .all()
        .map((row) => ({
          packageName: row.notification_watches.packageName,
          accountId: row.notification_watches.accountId,
          currency: row.accounts.currency,
        }));
    },

    /**
     * Stores one watch. The engine's `addWatch` decides whether it may exist at all and the
     * capture port decides whether the device accepts the resulting set — this only writes the
     * row the two of them have already agreed on, and the primary key is the backstop for the
     * "one app, one рахунок" rule they enforce in words.
     */
    addWatch(watch: { readonly packageName: string; readonly accountId: string }): void {
      db.insert(notificationWatches)
        .values({ packageName: watch.packageName, accountId: watch.accountId })
        .run();
    },

    /**
     * Forgets one watch. Only the row goes: every чернетка and every транзакція that app's
     * notifications produced stays exactly where it is, and so does every fingerprint — removing
     * a watch stops the reading, it does not unmake what was read.
     */
    removeWatch(packageName: string): void {
      db.delete(notificationWatches).where(eq(notificationWatches.packageName, packageName)).run();
    },

    /**
     * The чернетки still awaiting a word, newest first — the order Головний shows them in.
     *
     * By when they were drafted, not by the date they carry: a bank can post about yesterday's
     * purchase this morning, and the owner is answering what has just arrived. The id is the last
     * tie-break so the order is total.
     */
    pendingDrafts(): StoredDraft[] {
      return db
        .select()
        .from(notificationDrafts)
        .orderBy(desc(notificationDrafts.createdAt), desc(notificationDrafts.id))
        .all()
        .map(toDraft);
    },

    /**
     * Every fingerprint already decided. Handed to `processCapture` as its `seenFingerprints`; it
     * is the whole of the app's memory of what a captured notification has already come to, and
     * it outlives both the чернетка and the транзакція.
     */
    seenFingerprints(): Set<string> {
      return new Set(
        db
          .select()
          .from(notificationFingerprints)
          .all()
          .map((row) => row.fingerprint),
      );
    },

    /**
     * One decided capture, stored whole or not at all: the fingerprint together with the чернетка
     * it drafted, or together with the витрата a правило auto-confirmed. An outcome that stores
     * nothing — an unwatched app, a fingerprint already seen — writes nothing and says so, and
     * the drain acknowledges it all the same.
     *
     * If any part is refused, none of it is stored: the fingerprint must never outlive the money
     * it was supposed to mark, or the redelivered capture would be silently swallowed.
     */
    commitOutcome(outcome: CaptureOutcome, storedAt: Date): void {
      if (outcome.kind === 'ignored' || outcome.kind === 'duplicate') {
        return;
      }
      if (outcome.kind === 'drafted') {
        const row = toDraftRow(outcome.draft, storedAt);
        db.transaction((tx) => {
          tx.insert(notificationFingerprints).values({ fingerprint: outcome.fingerprint }).run();
          tx.insert(notificationDrafts).values(row).run();
        });
        return;
      }
      // Nothing may be stored that the date column would take and the reader could not bring
      // back — the guard `transactionsRepo.save` applies, before the transaction opens.
      isoDate(outcome.transaction.date);
      db.transaction((tx) => {
        tx.insert(notificationFingerprints).values({ fingerprint: outcome.fingerprint }).run();
        tx.insert(transactionsTable)
          .values({ ...toTransactionRow(outcome.transaction), createdAt: storedAt })
          .run();
      });
    },

    /**
     * The owner's yes: the транзакція the чернетка proposed is stored and the чернетка is spent,
     * in one transaction. The fingerprint stays — a confirmed notification never drafts again,
     * however the транзакція is later edited or deleted.
     */
    confirm(draftId: string, transaction: Transaction, storedAt: Date): void {
      isoDate(transaction.date);
      db.transaction((tx) => {
        tx.insert(transactionsTable)
          .values({ ...toTransactionRow(transaction), createdAt: storedAt })
          .run();
        const settled = tx
          .delete(notificationDrafts)
          .where(eq(notificationDrafts.id, draftId))
          .run();
        if (settled.changes === 0) {
          // The чернетка was settled between reading it and confirming it — twice on one screen,
          // or on a second surface. Storing the транзакція anyway would double the money.
          throw new Error(`чернетки «${draftId}» вже немає`);
        }
      });
    },

    /**
     * The owner's no: nothing is created and the чернетка is spent. The fingerprint is untouched,
     * which is what makes a dismissal survive the phone posting the same notification again.
     */
    dismiss(draftId: string): void {
      db.delete(notificationDrafts).where(eq(notificationDrafts.id, draftId)).run();
    },
  };
}

export type NotificationsRepo = ReturnType<typeof notificationsRepo>;
