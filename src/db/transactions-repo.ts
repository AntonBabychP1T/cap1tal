import { and, asc, eq, gte, lte, or } from 'drizzle-orm';

import { isoDate, type Month, type Transaction } from '../domain/transaction';
import { toTransaction, toTransactionRow } from './mappers';
import { transactions } from './schema';
import type { Storage } from './storage';

/**
 * Transactions in storage. Speaks domain `Transaction`s only — rows never leave this module.
 * See design.md §1 (one table, five types) and §2 (calendar dates as TEXT 'YYYY-MM-DD').
 */
export function transactionsRepo(db: Storage) {
  return {
    /**
     * Insert or replace under the same id: every per-type column is written, so retyping an
     * expense into a transfer leaves no stale amount, category or account behind. Written as
     * `ON CONFLICT DO UPDATE` rather than SQLite's `INSERT OR REPLACE`, which is a delete
     * followed by an insert.
     */
    save(t: Transaction): void {
      // The column's GLOB check only proves the shape 'NNNN-NN-NN'; '2026-02-31' would pass it and
      // then fail on read. Nothing may be stored that cannot come back out.
      isoDate(t.date);
      const row = toTransactionRow(t);
      const { id: _id, ...withoutId } = row;
      db.insert(transactions)
        .values(row)
        .onConflictDoUpdate({ target: transactions.id, set: withoutId })
        .run();
    },

    get(id: string): Transaction | undefined {
      const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
      return row ? toTransaction(row) : undefined;
    },

    remove(id: string): void {
      db.delete(transactions).where(eq(transactions.id, id)).run();
    },

    /**
     * One calendar month, by lexicographic range over the date column — no `strftime`, and no
     * dependence on the device timezone. A transaction belongs to the month of its date.
     */
    listMonth(month: Month): Transaction[] {
      // Validates the month by validating its first day; a bad month cannot reach SQL.
      const first = isoDate(`${month}-01`);
      const last = `${month}-31`;
      return db
        .select()
        .from(transactions)
        .where(and(gte(transactions.date, first), lte(transactions.date, last)))
        .orderBy(asc(transactions.date), asc(transactions.id))
        .all()
        .map(toTransaction);
    },

    /** Everything touching the account, transfers included on either leg. */
    listByAccount(accountId: string): Transaction[] {
      return db
        .select()
        .from(transactions)
        .where(
          or(
            eq(transactions.accountId, accountId),
            eq(transactions.fromAccountId, accountId),
            eq(transactions.toAccountId, accountId),
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.id))
        .all()
        .map(toTransaction);
    },
  };
}

export type TransactionsRepo = ReturnType<typeof transactionsRepo>;
