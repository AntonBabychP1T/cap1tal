import { and, asc, eq } from 'drizzle-orm';

import type { Account } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { isoDate, type IsoDate, type Transaction } from '../domain/transaction';
import { validateLink, type MonobankLink } from '../monobank/link';
import { toAccountRow, toTransactionRow } from './mappers';
import {
  accounts,
  monobankAccounts,
  monobankImportedItems,
  monobankLinks,
  monobankSyncAttempt,
  transactions as transactionsTable,
} from './schema';
import type { Storage } from './storage';

/**
 * Everything monobank sync has to survive a restart with: which bank accounts the token showed
 * us, which рахунок each one is, how far each has been imported, every item id already imported,
 * and the latest баланс банку.
 *
 * Two things are deliberately absent. The token — it lives in the device's secure storage and in
 * nothing this module can reach (`src/platform/monobank-token.ts`). And any computed balance: the
 * розрахунковий баланс stays "opening balance plus транзакції" in the domain, and what is stored
 * here is a cached observation of the bank's own number, never a substitute for it.
 *
 * The one write that matters is `commitStatementAnswer`: one statement answer's транзакції, its
 * newly seen item ids, the latest bank balance and the resulting cursor all land in one SQLite
 * transaction, or none of them do. That is what makes an interrupted sync resumable instead of
 * half-true — the precedent is `importRepo.commit`.
 */

/** A monobank account as storage remembers it: bank identity plus the last баланс банку seen. */
export interface StoredMonobankAccount {
  readonly id: string;
  readonly kind: 'card' | 'jar';
  /** What the bank calls it — `black ··1234`, or a банка's title. */
  readonly name: string;
  readonly currency: CurrencyCode;
  /** The owner's own money at the bank, the credit limit already subtracted. */
  readonly bankBalance: Money;
  /** When that figure was fetched, so a stale one can say how stale it is. */
  readonly obtainedAt: Date;
}

/** What client-info gives us about one account; the rest of `MonobankAccount` is not stored. */
export type FetchedMonobankAccount = Omit<StoredMonobankAccount, 'obtainedAt'>;

/** An active link, with everything sync needs to carry on where it left off. */
export interface StoredMonobankLink extends MonobankLink {
  /** The inclusive calendar date the owner confirmed as the first day sync may import. */
  readonly syncStartDate: IsoDate;
  /** Epoch milliseconds: everything up to and including this instant is imported and committed. */
  readonly cursorMs: number;
  /**
   * Epoch milliseconds of the last sync that *completed* for this link, or `null` for a link no
   * sync has ever completed for. `null` and a moment of zero are two different things, and the
   * screen says them differently.
   */
  readonly lastSyncedAtMs: number | null;
}

/**
 * The last sync run this phone attempted, as storage remembers it.
 *
 * `outcome` is `undefined` while the run has not reported one — a run going on now, or one the
 * phone did not survive. That is a third answer, not a missing one: the moment already counts
 * against the quiet interval, and nothing about how it went is known yet.
 */
export interface StoredSyncAttempt {
  /** Epoch milliseconds of the moment the run started. */
  readonly attemptedAtMs: number;
  /** One of the coordinator's account outcomes, or `undefined` while the run has not reported. */
  readonly outcome?: string;
}

/** The one row's key; the CHECK in the schema is what keeps the table to it. */
const ATTEMPT_ROW = 'attempt';

/** One statement answer, whole — the unit `commitStatementAnswer` either stores or does not. */
export interface StatementAnswer {
  readonly monobankAccountId: string;
  /** Already mapped by `src/monobank/sync.ts`; this module adds no rule of its own to them. */
  readonly transactions: readonly Transaction[];
  /**
   * The item ids this answer made known, including those of items that mapped to no транзакція.
   * Only the *new* ones: a pair already remembered is refused by the composite primary key, which
   * is what "an item can never import twice" means at the storage level.
   */
  readonly newlySeenIds: readonly string[];
  /** The latest баланс банку, in the account's own currency. */
  readonly bankBalance: Money;
  readonly obtainedAt: Date;
  /** Where the cursor stands once this answer is stored. */
  readonly cursorMs: number;
  /** The moment the транзакції count as stored — the feed's tie-break, passed in as everywhere. */
  readonly storedAt: Date;
}

const KINDS: readonly StoredMonobankAccount['kind'][] = ['card', 'jar'];

function accountKind(value: string): StoredMonobankAccount['kind'] {
  const kind = KINDS.find((candidate) => candidate === value);
  if (!kind) {
    throw new Error(`stored monobank account kind is neither card nor jar: "${value}"`);
  }
  return kind;
}

function toStoredAccount(row: {
  id: string;
  kind: string;
  name: string;
  currency: string;
  bankBalanceAmount: number;
  obtainedAt: Date;
}): StoredMonobankAccount {
  return {
    id: row.id,
    kind: accountKind(row.kind),
    name: row.name,
    currency: row.currency,
    bankBalance: money(row.bankBalanceAmount, row.currency),
    obtainedAt: row.obtainedAt,
  };
}

function toStoredLink(row: {
  monobankAccountId: string;
  accountId: string;
  syncStartDate: string;
  cursorMs: Date;
  lastSyncedAt: Date | null;
}): StoredMonobankLink {
  return {
    monobankAccountId: row.monobankAccountId,
    accountId: row.accountId,
    syncStartDate: row.syncStartDate,
    cursorMs: row.cursorMs.getTime(),
    lastSyncedAtMs: row.lastSyncedAt?.getTime() ?? null,
  };
}

/**
 * One member of a reviewed set of links: a monobank account onto a рахунок that exists, or onto
 * one this write creates. Named rather than inlined so a screen can build the set and keep its
 * two shapes straight.
 */
export type AcceptedLink =
  | { readonly kind: 'existing'; readonly monobankAccountId: string; readonly accountId: string }
  | { readonly kind: 'new'; readonly monobankAccountId: string; readonly account: Account };

export function monobankRepo(db: Storage) {
  /**
   * The links as the one-to-one rule needs to see them: every one that already exists, so
   * `validateLink` can refuse a second link on either side before the unique constraints have to.
   * The constraints stay the backstop; this is what turns a refusal into a sentence the owner
   * reads.
   */
  function links(): StoredMonobankLink[] {
    return db
      .select()
      .from(monobankLinks)
      .orderBy(asc(monobankLinks.monobankAccountId))
      .all()
      .map(toStoredLink);
  }

  function requireAccount(monobankAccountId: string): StoredMonobankAccount {
    const row = db
      .select()
      .from(monobankAccounts)
      .where(eq(monobankAccounts.id, monobankAccountId))
      .get();
    if (!row) {
      throw new Error(`рахунок monobank «${monobankAccountId}» невідомий`);
    }
    return toStoredAccount(row);
  }

  return {
    /** Every monobank account the last successful client-info showed, ordered for the screen. */
    listAccounts(): StoredMonobankAccount[] {
      return db
        .select()
        .from(monobankAccounts)
        .orderBy(asc(monobankAccounts.name), asc(monobankAccounts.id))
        .all()
        .map(toStoredAccount);
    },

    getAccount(monobankAccountId: string): StoredMonobankAccount | undefined {
      const row = db
        .select()
        .from(monobankAccounts)
        .where(eq(monobankAccounts.id, monobankAccountId))
        .get();
      return row ? toStoredAccount(row) : undefined;
    },

    listLinks: links,

    /**
     * What a successful client-info answer leaves behind: the bank's own identity for each
     * account and its latest баланс банку. An account the new answer does not mention is left
     * exactly as it was — its ids, its link and its history are the owner's, not the token's, so
     * a token belonging to someone else can disconnect an account but never erase one.
     */
    upsertAccounts(fetched: readonly FetchedMonobankAccount[], obtainedAt: Date): void {
      if (fetched.length === 0) {
        return;
      }
      db.transaction((tx) => {
        for (const a of fetched) {
          if (a.bankBalance.currency !== a.currency) {
            throw new Error(
              `баланс рахунку monobank «${a.id}» у ${a.bankBalance.currency}, а сам рахунок у ${a.currency}`,
            );
          }
          const row = {
            id: a.id,
            kind: a.kind,
            name: a.name,
            currency: a.currency,
            bankBalanceAmount: a.bankBalance.amount,
            obtainedAt,
          };
          tx.insert(monobankAccounts)
            .values(row)
            .onConflictDoUpdate({
              target: monobankAccounts.id,
              set: {
                kind: row.kind,
                name: row.name,
                currency: row.currency,
                bankBalanceAmount: row.bankBalanceAmount,
                obtainedAt: row.obtainedAt,
              },
            })
            .run();
        }
      });
    },

    /**
     * Links a monobank account to a рахунок that already exists. The currencies must be equal and
     * neither side may already be linked — `validateLink` says so in the owner's words, and the
     * primary key and the unique index say it again for the case where two writes race.
     */
    link(input: {
      readonly monobankAccountId: string;
      readonly accountId: string;
      readonly syncStartDate: IsoDate;
      readonly cursorMs: number;
    }): void {
      const monobankAccount = requireAccount(input.monobankAccountId);
      const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      if (!account) {
        throw new Error(`рахунку «${input.accountId}» не існує`);
      }
      validateLink({ monobankAccount, account, links: links() });
      insertLink(db, { ...input, syncStartDate: isoDate(input.syncStartDate) });
    },

    /**
     * Creates a рахунок for a monobank account and links it, in one database transaction. Both or
     * neither: a link that failed after the рахунок was written would leave an accidental account
     * the owner never asked for, and рахунки are archived rather than deleted, so it would stay.
     */
    createAccountAndLink(input: {
      readonly account: Account;
      readonly monobankAccountId: string;
      readonly syncStartDate: IsoDate;
      readonly cursorMs: number;
    }): void {
      const monobankAccount = requireAccount(input.monobankAccountId);
      validateLink({ monobankAccount, account: input.account, links: links() });
      const syncStartDate = isoDate(input.syncStartDate);
      db.transaction((tx) => {
        tx.insert(accounts).values(toAccountRow(input.account)).run();
        insertLink(tx, {
          monobankAccountId: input.monobankAccountId,
          accountId: input.account.id,
          syncStartDate,
          cursorMs: input.cursorMs,
        });
      });
    },

    /**
     * A whole reviewed set of links, written together or not at all: every accepted proposal —
     * onto a рахунок that exists, or onto one this call creates — under one sync boundary.
     *
     * Everything is checked before anything is written, and the check is cumulative: a set that
     * points two monobank accounts at one рахунок, or one monobank account at two рахунки, is
     * refused by `validateLink` against the links this very set is adding, not only against the
     * links already stored. A half-applied set is the outcome worth ruling out entirely — the
     * owner would be left working out which of ten cards got linked, under a boundary that
     * applied to some of them.
     */
    linkMany(input: {
      readonly accepted: readonly AcceptedLink[];
      readonly syncStartDate: IsoDate;
      readonly cursorMs: number;
    }): void {
      const syncStartDate = isoDate(input.syncStartDate);
      // The links as they would be after each accepted proposal, so the one-to-one rule is
      // enforced within the set and not only against what is already stored.
      const pending: MonobankLink[] = [...links()];
      const planned: { monobankAccountId: string; accountId: string; created?: Account }[] = [];

      for (const entry of input.accepted) {
        const monobankAccount = requireAccount(entry.monobankAccountId);
        if (entry.kind === 'new') {
          validateLink({ monobankAccount, account: entry.account, links: pending });
          planned.push({
            monobankAccountId: entry.monobankAccountId,
            accountId: entry.account.id,
            created: entry.account,
          });
        } else {
          const row = db.select().from(accounts).where(eq(accounts.id, entry.accountId)).get();
          if (!row) {
            throw new Error(`рахунку «${entry.accountId}» не існує`);
          }
          validateLink({ monobankAccount, account: row, links: pending });
          planned.push({
            monobankAccountId: entry.monobankAccountId,
            accountId: entry.accountId,
          });
        }
        const last = planned[planned.length - 1];
        if (last) {
          pending.push({
            monobankAccountId: last.monobankAccountId,
            accountId: last.accountId,
          });
        }
      }

      db.transaction((tx) => {
        for (const link of planned) {
          if (link.created) {
            tx.insert(accounts).values(toAccountRow(link.created)).run();
          }
          insertLink(tx, {
            monobankAccountId: link.monobankAccountId,
            accountId: link.accountId,
            syncStartDate,
            cursorMs: input.cursorMs,
          });
        }
      });
    },

    /**
     * Disconnects one monobank account. Only the link goes: the bank identity, the last known
     * баланс банку, every imported item id and every транзакція stay exactly where they are, so
     * linking again later can never import the same item a second time.
     */
    unlink(monobankAccountId: string): void {
      db.delete(monobankLinks).where(eq(monobankLinks.monobankAccountId, monobankAccountId)).run();
    },

    /**
     * Every monobank item id this device has imported for one bank account. Handed to
     * `mapStatement` as its `seenIds`; it is the whole of the app's memory of what an import has
     * already done, and it outlives the транзакції it produced.
     */
    importedIds(monobankAccountId: string): Set<string> {
      // `select()` without a projection, like every other repository here: `Storage` is a union
      // of the two drivers' database types, and only the no-argument overload is common to both.
      return new Set(
        db
          .select()
          .from(monobankImportedItems)
          .where(eq(monobankImportedItems.monobankAccountId, monobankAccountId))
          .all()
          .map((row) => row.itemId),
      );
    },

    /**
     * One statement answer, stored whole or not at all: its транзакції, the item ids it made
     * known, the latest баланс банку and the cursor it leaves behind. Any constraint failure —
     * a транзакція referencing a category no row has, an item id already remembered — rolls the
     * whole answer back, and the same answer can simply be fetched again.
     *
     * The транзакції are stored one millisecond apart in the answer's order, for the reason the
     * Saldo import gives: `created_at` is the tie-break between транзакції of one calendar date,
     * so writing a page under a single instant would leave the bank's own order to the random
     * suffix of an id.
     */
    commitStatementAnswer(answer: StatementAnswer): void {
      const monobankAccount = requireAccount(answer.monobankAccountId);
      if (answer.bankBalance.currency !== monobankAccount.currency) {
        throw new Error(
          `баланс у ${answer.bankBalance.currency} не належить рахунку monobank у ${monobankAccount.currency}`,
        );
      }
      // Nothing may be stored that the date column would take and the reader could not bring
      // back — the same guard `transactionsRepo.save` applies, before the transaction opens.
      for (const t of answer.transactions) {
        isoDate(t.date);
      }

      db.transaction((tx) => {
        answer.transactions.forEach((t, index) => {
          tx.insert(transactionsTable)
            .values({
              ...toTransactionRow(t),
              createdAt: new Date(answer.storedAt.getTime() + index),
            })
            .run();
        });
        for (const itemId of answer.newlySeenIds) {
          tx.insert(monobankImportedItems)
            .values({ monobankAccountId: answer.monobankAccountId, itemId })
            .run();
        }
        tx.update(monobankAccounts)
          .set({
            bankBalanceAmount: answer.bankBalance.amount,
            obtainedAt: answer.obtainedAt,
          })
          .where(eq(monobankAccounts.id, answer.monobankAccountId))
          .run();
        const advanced = tx
          .update(monobankLinks)
          .set({ cursorMs: new Date(answer.cursorMs) })
          .where(eq(monobankLinks.monobankAccountId, answer.monobankAccountId))
          .run();
        if (advanced.changes === 0) {
          // The link went away between planning and committing — unlinked mid-run. Storing the
          // транзакції of an account that is no longer connected would be an import the owner
          // just said they did not want.
          throw new Error(`рахунок monobank «${answer.monobankAccountId}» уже відʼєднано`);
        }
      });
    },

    /**
     * Records that a sync completed for this link, at `at`. Called for an account whose run
     * settled as `complete` and for no other outcome, and deliberately outside the transaction
     * that stores money: a statement answer is one page of a paginated sync, so an account that
     * is rate-limited halfway would otherwise have committed pages and claimed a finished sync.
     *
     * A link that is gone takes no moment — the same silence as any other write to nothing.
     */
    markSynced(monobankAccountId: string, at: Date): void {
      db
        .update(monobankLinks)
        .set({ lastSyncedAt: at })
        .where(eq(monobankLinks.monobankAccountId, monobankAccountId))
        .run();
    },

    /** The link of one monobank account, when it has one. */
    linkOf(monobankAccountId: string): StoredMonobankLink | undefined {
      const row = db
        .select()
        .from(monobankLinks)
        .where(eq(monobankLinks.monobankAccountId, monobankAccountId))
        .get();
      return row ? toStoredLink(row) : undefined;
    },

    /** The link a рахунок takes part in, when it takes part in one — what «Рахунки» joins on. */
    linkForAccount(accountId: string): StoredMonobankLink | undefined {
      const row = db
        .select()
        .from(monobankLinks)
        .where(eq(monobankLinks.accountId, accountId))
        .get();
      return row ? toStoredLink(row) : undefined;
    },

    /**
     * The last run this phone attempted, or `undefined` on a device that has attempted none.
     * `undefined` and «a moment with no outcome» are two different answers and the caller tells
     * them apart: the first means nothing has been tried, the second that something was.
     */
    attempt(): StoredSyncAttempt | undefined {
      const row = db.select().from(monobankSyncAttempt).get();
      return row
        ? {
            attemptedAtMs: row.attemptedAt.getTime(),
            ...(row.outcome === null ? {} : { outcome: row.outcome }),
          }
        : undefined;
    },

    /**
     * A run is starting: this moment, and no outcome yet. Written before the first request rather
     * than after the last, so a run the phone does not survive still spends its interval — see
     * the table's own comment. Replaces whatever was remembered; there is one row.
     */
    beginAttempt(at: Date): void {
      db.insert(monobankSyncAttempt)
        .values({ id: ATTEMPT_ROW, attemptedAt: at, outcome: null })
        .onConflictDoUpdate({
          target: monobankSyncAttempt.id,
          set: { attemptedAt: at, outcome: null },
        })
        .run();
    },

    /**
     * The run reported: the same moment, now with how it went. An update rather than an upsert —
     * `beginAttempt` always ran first, and writing a moment here would date the attempt from when
     * it ended, which is not what the interval measures.
     */
    finishAttempt(outcome: string): void {
      db.update(monobankSyncAttempt)
        .set({ outcome })
        .where(eq(monobankSyncAttempt.id, ATTEMPT_ROW))
        .run();
    },

    /**
     * The run never reached monobank — no token kept, no link, or the token storage unreadable —
     * so nothing was tried and nothing is remembered as tried. Without this, a device with no
     * token would wait out a quiet interval before every non-attempt.
     */
    withdrawAttempt(): void {
      db.delete(monobankSyncAttempt).where(eq(monobankSyncAttempt.id, ATTEMPT_ROW)).run();
    },

    /** Whether this exact pair is already remembered — the read behind "at most once, forever". */
    hasImported(monobankAccountId: string, itemId: string): boolean {
      return (
        db
          .select()
          .from(monobankImportedItems)
          .where(
            and(
              eq(monobankImportedItems.monobankAccountId, monobankAccountId),
              eq(monobankImportedItems.itemId, itemId),
            ),
          )
          .get() !== undefined
      );
    },
  };
}

function insertLink(
  db: Pick<Storage, 'insert'>,
  input: {
    readonly monobankAccountId: string;
    readonly accountId: string;
    readonly syncStartDate: IsoDate;
    readonly cursorMs: number;
  },
): void {
  db.insert(monobankLinks)
    .values({
      monobankAccountId: input.monobankAccountId,
      accountId: input.accountId,
      syncStartDate: input.syncStartDate,
      cursorMs: new Date(input.cursorMs),
    })
    .run();
}

export type MonobankRepo = ReturnType<typeof monobankRepo>;
