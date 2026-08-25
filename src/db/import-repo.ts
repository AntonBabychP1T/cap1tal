import { eq } from 'drizzle-orm';

import { account } from '../domain/account';
import { isoDate, type Transaction } from '../domain/transaction';
import type { ImportPlan } from '../saldo/interpret';
import { newId } from '../ui/id';
import { toAccountRow, toTransactionRow } from './mappers';
import { listName } from './named-list-repo';
import { accounts, categories, saldoImport, sources, transactions as transactionsTable } from './schema';
import type { Storage } from './storage';

/**
 * The one-time Saldo import in storage: the marker saying it has been committed, and the atomic
 * commit of a plan the engine built (`src/saldo/`).
 *
 * The marker is not bookkeeping for its own sake. Committing a second plan silently doubles the
 * owner's entire history, and nothing else on the device can tell that apart from an honest
 * import — транзакції recorded by hand before the import are legitimate, so "storage is not
 * empty" says nothing. It is written inside the commit's own transaction, so a commit that fails
 * leaves no marker to warn about an import that never happened.
 *
 * `now` is passed in, never read from a clock here, so the moment is data the tests control.
 */

/** The fixed id of the single marker row; the table's CHECK keeps it to this one. */
const MARKER_ID = 'saldo';

export function importRepo(db: Storage) {
  return {
    /** When the last import was committed, or nothing on a device that has imported nothing. */
    committedAt(): Date | undefined {
      return db.select().from(saldoImport).where(eq(saldoImport.id, MARKER_ID)).get()
        ?.committedAt;
    },

    /**
     * Records that an import was committed at `now`, replacing any earlier moment — the marker
     * answers "has an import happened, and when was the last one", not "how many".
     */
    markCommitted(now: Date): void {
      markCommitted(db, now);
    },

    /**
     * Writes a whole import plan, or nothing. One database transaction covers the рахунки, the
     * категорії, the джерела, every транзакція in the plan's order and the marker — a plan that
     * fails partway leaves the device exactly as it was, which is what makes the verification
     * report the owner read still true of what they end up with.
     *
     * The plan's own ids are plan-local (`saldo:account:…`, `saldo:category:…`): they name things
     * inside one interpretation, not rows. Every one of them becomes a fresh app id here, and
     * every reference is rewritten through the same map, so the import's vocabulary never becomes
     * part of the database. An id the map does not hold is already a real one — an existing
     * рахунок the owner merged onto, a категорія the plan matched by name, a reserved row.
     */
    commit(plan: ImportPlan, now: Date): CommitSummary {
      return db.transaction((tx) => {
        const ids = new Map<string, string>();
        for (const planned of plan.accounts) {
          if (!planned.existingId) {
            ids.set(planned.id, newId());
          }
        }
        // `plan.categories` and `plan.sources` are already only the names the plan has to create:
        // anything the survey matched by name, or the owner redirected, resolved to a real id and
        // is not here at all.
        for (const proposal of [...plan.categories, ...plan.sources]) {
          ids.set(proposal.proposedId, newId());
        }
        const real = (id: string): string => ids.get(id) ?? id;

        for (const planned of plan.accounts) {
          if (planned.existingId) {
            // An existing рахунок keeps its name, its вид and its archived flag; the import
            // replaces only the початковий залишок, which is the one thing Saldo knows better.
            tx.update(accounts)
              .set({ openingAmount: planned.openingBalance.amount })
              .where(eq(accounts.id, planned.existingId))
              .run();
          } else {
            tx.insert(accounts)
              .values(
                toAccountRow(
                  account({
                    id: real(planned.id),
                    name: planned.name,
                    kind: planned.kind,
                    currency: planned.currency,
                    openingBalance: planned.openingBalance,
                  }),
                ),
              )
              .run();
          }
        }

        for (const [table, proposals] of [
          [categories, plan.categories],
          [sources, plan.sources],
        ] as const) {
          for (const proposal of proposals) {
            // Through the list's own name rule, not around it: `named-list-repo` is what makes a
            // stored name trimmed, and a name only the import left untrimmed is a name the
            // manage lists could never match again.
            tx.insert(table)
              .values({ id: real(proposal.proposedId), name: listName(proposal.saldoName) })
              .run();
          }
        }

        plan.transactions.forEach((planned, index) => {
          const remapped = withRealIds(planned.transaction, real);
          // The same guard the transactions repository applies: nothing may be stored that the
          // date column would take and the reader could not bring back.
          isoDate(remapped.date);
          tx.insert(transactionsTable)
            .values({ ...toTransactionRow(remapped), createdAt: storedAt(now, index) })
            .run();
        });

        markCommitted(tx, now);

        return {
          // Created, not touched: a рахунок the plan only re-opened keeps its place in the list,
          // so counting it here would disagree with what the flow promised before the commit.
          accounts: plan.accounts.filter((planned) => !planned.existingId).length,
          categories: plan.categories.length,
          sources: plan.sources.length,
          transactions: plan.transactions.length,
        };
      });
    },
  };
}

/** What a committed import wrote, for the flow to show the owner afterwards. */
export interface CommitSummary {
  readonly accounts: number;
  readonly categories: number;
  readonly sources: number;
  readonly transactions: number;
}

/**
 * When the transaction at `index` of the plan counts as stored. One millisecond apart, in plan
 * order, because that is what the plan's order *is*: the export's own order, transaction after
 * transaction. `createdAt` is storage metadata and the tie-break between транзакції of one
 * calendar date, so writing 2 400 rows under a single instant would leave the whole import's
 * intra-day order to the last tie-break — the id, which carries a random suffix. Saldo's order
 * would come back shuffled.
 */
function storedAt(now: Date, index: number): Date {
  return new Date(now.getTime() + index);
}

function markCommitted(db: Pick<Storage, 'insert'>, now: Date): void {
  db.insert(saldoImport)
    .values({ id: MARKER_ID, committedAt: now })
    .onConflictDoUpdate({ target: saldoImport.id, set: { committedAt: now } })
    .run();
}

/**
 * One транзакція with every plan-local id replaced. Written per type rather than by spreading a
 * generic object, so a transaction type that gains a reference later fails to compile here
 * instead of quietly storing a plan-local id.
 */
function withRealIds(t: Transaction, real: (id: string) => string): Transaction {
  const id = newId();
  switch (t.type) {
    case 'transfer':
      return {
        ...t,
        id,
        fromAccountId: real(t.fromAccountId),
        toAccountId: real(t.toAccountId),
      };
    case 'income':
      return { ...t, id, accountId: real(t.accountId), sourceId: real(t.sourceId) };
    case 'correction':
      return { ...t, id, accountId: real(t.accountId) };
    default:
      return { ...t, id, accountId: real(t.accountId), categoryId: real(t.categoryId) };
  }
}

export type ImportRepo = ReturnType<typeof importRepo>;
