import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql, type SQL } from 'drizzle-orm';

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
     *
     * `storedAt` is when the row is first inserted — storage metadata the domain transaction has
     * no room for, and the tie-break between transactions of the same calendar date. It is left
     * out of the update set on purpose: replacing a transaction keeps the place it already had.
     * The caller passes the clock (`new Date()` in the app, a fixed instant in tests).
     */
    save(t: Transaction, storedAt: Date): void {
      // The column's GLOB check only proves the shape 'NNNN-NN-NN'; '2026-02-31' would pass it and
      // then fail on read. Nothing may be stored that cannot come back out.
      isoDate(t.date);
      const row = { ...toTransactionRow(t), createdAt: storedAt };
      const { id: _id, createdAt: _createdAt, ...replaceable } = row;
      db.insert(transactions)
        .values(row)
        .onConflictDoUpdate({ target: transactions.id, set: replaceable })
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

    /**
     * The feed: the latest transactions, newest date first, same-date ones most recently stored
     * first. The id is the last tie-break so the order is total and does not depend on the
     * insertion order SQLite happens to return.
     */
    listLatest(limit: number): Transaction[] {
      return db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
        .limit(limit)
        .all()
        .map(toTransaction);
    },

    /**
     * Every stored транзакція, in the latest listing's order. The Saldo import needs them whole:
     * the verification report compares the plan against what the owner already recorded by hand,
     * and "the latest a very large number of them" is not the same question.
     */
    listAll(): Transaction[] {
      return db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
        .all()
        .map(toTransaction);
    },

    /**
     * The «Транзакції» screen's one read: the stored транзакції narrowed by рахунок and місяць,
     * matched against what the owner typed, in the latest listing's order, one page at a time.
     *
     * Where the work happens is design D12. SQLite's `LIKE` and `lower()` fold ASCII case only, so
     * «СІЛЬПО» would never match a typed «сільпо» and an SQL-only text search is not an option for
     * Ukrainian data. So SQL narrows — by рахунок, by місяць, and by the half of the search it can
     * answer exactly (the сума on either leg, and the категорії and джерела named) — while rows
     * that could still match only by their опис are let through on `description IS NOT NULL` and
     * judged here. `limit`/`offset` are applied last, to the matches: a page is a page of results,
     * not of candidates.
     *
     * The ceiling is honest: this reads the narrowed rows into memory, which is right for the
     * hundreds-to-low-thousands this app holds. If it stops being right the next step is a
     * lowercase shadow column filled by a migration.
     */
    search(input: {
      /** What the owner typed, resolved by `src/ui/transaction-search.ts`. Absent narrows nothing. */
      match?: {
        /** Matched in the опис, case-insensitively, at any position. Empty matches no опис. */
        text: string;
        /** A сума in minor units, matched on either leg, whatever the currency. */
        amountMinor?: number;
        categoryIds: readonly string[];
        sourceIds: readonly string[];
      };
      /** One рахунок, counting a переказ on either leg. */
      accountId?: string;
      month?: Month;
      limit: number;
      offset: number;
    }): Transaction[] {
      const { match } = input;
      const filters: SQL[] = [];

      if (input.accountId) {
        filters.push(
          or(
            eq(transactions.accountId, input.accountId),
            eq(transactions.fromAccountId, input.accountId),
            eq(transactions.toAccountId, input.accountId),
          )!,
        );
      }
      if (input.month) {
        // Validates the month by validating its first day; a bad month cannot reach SQL.
        const first = isoDate(`${input.month}-01`);
        filters.push(and(gte(transactions.date, first), lte(transactions.date, `${input.month}-31`))!);
      }
      if (match) {
        const alternatives: SQL[] = [];
        if (match.amountMinor !== undefined) {
          alternatives.push(
            or(
              eq(transactions.amount, match.amountMinor),
              eq(transactions.leftAmount, match.amountMinor),
              eq(transactions.arrivedAmount, match.amountMinor),
            )!,
          );
        }
        if (match.categoryIds.length > 0) {
          alternatives.push(inArray(transactions.categoryId, [...match.categoryIds]));
        }
        if (match.sourceIds.length > 0) {
          alternatives.push(inArray(transactions.sourceId, [...match.sourceIds]));
        }
        // Anything carrying an опис could still match on it, and only TypeScript can say whether
        // it does — the fold Ukrainian needs is not SQLite's.
        if (match.text !== '') {
          alternatives.push(isNotNull(transactions.description));
        }
        // Nothing to match on at all: a search that names no text, no сума and no label matches
        // nothing rather than everything.
        filters.push(alternatives.length > 0 ? or(...alternatives)! : sqlFalse());
      }

      const narrowed = db
        .select()
        .from(transactions)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
        .all()
        .map(toTransaction);

      const matched = match ? narrowed.filter((t) => satisfies(t, match)) : narrowed;
      return matched.slice(input.offset, input.offset + input.limit);
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


/** A predicate SQL can hold that is never true — «нічого не знайдено» as a query, not as a branch. */
function sqlFalse(): SQL {
  return sql`0`;
}

/** The whole of what a search matches, applied to one транзакція. */
function satisfies(
  t: Transaction,
  match: {
    text: string;
    amountMinor?: number;
    categoryIds: readonly string[];
    sourceIds: readonly string[];
  },
): boolean {
  if (match.amountMinor !== undefined && amountsOf(t).includes(match.amountMinor)) {
    return true;
  }
  if (t.type === 'expense' || t.type === 'refund') {
    if (match.categoryIds.includes(t.categoryId)) return true;
  } else if (t.type === 'income') {
    if (match.sourceIds.includes(t.sourceId)) return true;
  }
  if (match.text === '' || !t.description) {
    return false;
  }
  // `toLocaleLowerCase('uk')` and not `toLowerCase()`: the owner's data is Ukrainian, and this is
  // the fold SQLite cannot do. Matched at any position, so part of an опис finds it.
  return t.description.toLocaleLowerCase('uk').includes(match.text.toLocaleLowerCase('uk'));
}

/** Every сума a транзакція carries — both legs of a переказ, the single amount of the rest. */
function amountsOf(t: Transaction): number[] {
  return t.type === 'transfer' ? [t.left.amount, t.arrived.amount] : [t.amount.amount];
}
