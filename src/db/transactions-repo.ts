import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  isoDate,
  UNCATEGORISED_CATEGORY_ID,
  type IsoDate,
  type Month,
  type Transaction,
} from '../domain/transaction';
import { toTransaction, toTransactionRow } from './mappers';
import { counterpartIncomeAwaits, transactions, type TransactionRow } from './schema';
import type { Storage } from './storage';
import { stampedMemo } from './stamp';

/**
 * `rows`, each turned into a `Transaction` — a переказ among them carrying
 * `awaitingCounterpartIncome` when its id awaits one. One extra query per read rather than a join
 * on every one of them: only переказ rows can possibly await anything (design D4).
 *
 * How that query asks depends on how many rows it serves (app-speed-pass design D2). A read of a
 * few rows names their перекази in an `IN (…)` list. A read of the whole history — `listAll`,
 * `search` — reads `counterpart_income_awaits` whole instead: it holds one row per unresolved
 * переказ, so it stays tiny, while an `IN` list of every stored переказ id is one large statement
 * to prepare per read and fails outright past SQLite's bound-parameter ceiling (32 766).
 */
function withAwaiting(
  db: Storage,
  rows: readonly TransactionRow[],
  scope: 'rows' | 'whole-history' = 'rows',
): Transaction[] {
  const awaitingIds = new Set<string>();
  if (scope === 'whole-history') {
    for (const row of db.select().from(counterpartIncomeAwaits).all()) {
      awaitingIds.add(row.transactionId);
    }
  } else {
    const transferIds = rows.filter((row) => row.type === 'transfer').map((row) => row.id);
    if (transferIds.length > 0) {
      for (const row of db
        .select()
        .from(counterpartIncomeAwaits)
        .where(inArray(counterpartIncomeAwaits.transactionId, transferIds))
        .all()) {
        awaitingIds.add(row.transactionId);
      }
    }
  }
  return rows.map((row) => toTransaction(row, awaitingIds.has(row.id)));
}

/**
 * «Without a категорія», said once: a витрата or a повернення carrying «Без категорії» — exactly
 * the lines `transactionLine` marks. Головний's count and the «Транзакції» narrowing both read it,
 * which is what keeps «Потребує уваги · 7» and the list it opens naming the same seven.
 *
 * The повернення is in on purpose: the form and retype never leave one there, but older data can,
 * the стрічка marks it, and a marked line nothing ever leads to would be a question nobody asks.
 */
const uncategorised = and(
  inArray(transactions.type, ['expense', 'refund']),
  eq(transactions.categoryId, UNCATEGORISED_CATEGORY_ID),
)!;

/**
 * Transactions in storage. Speaks domain `Transaction`s only — rows never leave this module.
 * See design.md §1 (one table, five types) and §2 (calendar dates as TEXT 'YYYY-MM-DD').
 */
export function transactionsRepo(db: Storage) {
  // Remembered under the change stamp (app-speed-pass design D1): Головний counts on every focus,
  // and with nothing written in between the count is the one it already has.
  const countUncategorised = stampedMemo(db, () => {
    const row = db.get<{ n: number }>(
      sql`select count(*) as n from ${transactions} where ${uncategorised}`,
    );
    return row?.n ?? 0;
  });

  // The місяці holding at least one транзакція, newest first — `monthsOf`'s answer, from the date
  // index alone (a covering scan, no row is read) and remembered under the change stamp
  // (app-speed-pass design D6).
  const months = stampedMemo(db, () =>
    db
      .all<{ month: string }>(
        sql`select distinct substr(${transactions.date}, 1, 7) as month from ${transactions} order by month desc`,
      )
      .map((row) => row.month as Month),
  );

  // Every stored транзакція a search matches, newest first — read, narrowed in SQL and judged here
  // (design D12 of transaction-search), remembered per criteria under the change stamp.
  const searchMatches = stampedMemo(db, (key): Transaction[] => {
    const criteria = JSON.parse(key) as SearchCriteria & { match: SearchMatch };
    const narrowed = withAwaiting(
      db,
      db
        .select()
        .from(transactions)
        .where(narrowing(criteria))
        .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
        .all(),
      'whole-history',
    );
    return narrowed.filter((t) => satisfies(t, criteria.match));
  });

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
      // Only a переказ ever awaits, and every stored переказ awaits at most what it says it does:
      // any id saved as anything else — including a переказ retyped into something else under the
      // same id — reads back awaiting nothing (persistence, design D4). A CHECK cannot look across
      // tables, so this is the one write path that keeps it true.
      if (t.type === 'transfer' && t.awaitingCounterpartIncome) {
        db.insert(counterpartIncomeAwaits)
          .values({ transactionId: t.id })
          .onConflictDoNothing()
          .run();
      } else {
        db.delete(counterpartIncomeAwaits).where(eq(counterpartIncomeAwaits.transactionId, t.id)).run();
      }
    },

    /**
     * The one column a розбір changes, on a row it never parsed as a whole.
     *
     * `save` would work — it already keeps `createdAt` out of its update set — but it rebuilds
     * every per-type column from a domain value, and the розбір decides over a `CategoryMove` and
     * nothing else. Writing one column is what makes "every field of a moved витрата other than
     * its категорія SHALL be unchanged" true by construction rather than by a round trip.
     *
     * Silent about a row that is not there and about one that is not a витрата: the moves come
     * from `sweepUncategorised`, which only ever names витрати it has just read.
     */
    setCategory(id: string, categoryId: string): void {
      db.update(transactions)
        .set({ categoryId })
        .where(and(eq(transactions.id, id), eq(transactions.type, 'expense')))
        .run();
    },

    get(id: string): Transaction | undefined {
      const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
      return row ? withAwaiting(db, [row])[0] : undefined;
    },

    /** Cascades onto `counterpart_income_awaits` — a row with no переказ to describe means nothing. */
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
      return withAwaiting(
        db,
        db
          .select()
          .from(transactions)
          .where(and(gte(transactions.date, first), lte(transactions.date, last)))
          .orderBy(asc(transactions.date), asc(transactions.id))
          .all(),
      );
    },

    /**
     * The earliest and the latest дата any stored транзакція carries, or nothing when none is
     * stored — what Місяць bounds its arrows by: back no further than the first month holding a
     * record, forward as far as the last one when that lies past the current month.
     *
     * One aggregate over `transactions_date_idx`, so SQLite answers MIN and MAX from the ends of
     * the index instead of reading the history. Every row counts, коригування included: a month
     * holding only one still has something to show.
     */
    recordedSpan(): { readonly earliest: IsoDate; readonly latest: IsoDate } | undefined {
      // A raw `db.get`, the way the counts in `reporting-repo.ts` are read: the typed builder's
      // partial select is not callable on the union `Storage` of both drivers.
      const row = db.get<{ earliest: string | null; latest: string | null }>(
        sql`select min(${transactions.date}) as earliest, max(${transactions.date}) as latest from ${transactions}`,
      );
      return row?.earliest && row.latest
        ? { earliest: isoDate(row.earliest), latest: isoDate(row.latest) }
        : undefined;
    },

    /**
     * The feed: the latest transactions, newest date first, same-date ones most recently stored
     * first. The id is the last tie-break so the order is total and does not depend on the
     * insertion order SQLite happens to return.
     */
    listLatest(limit: number): Transaction[] {
      return withAwaiting(
        db,
        db
          .select()
          .from(transactions)
          .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
          .limit(limit)
          .all(),
      );
    },

    /**
     * Every stored транзакція, in the latest listing's order. The Saldo import needs them whole:
     * the verification report compares the plan against what the owner already recorded by hand,
     * and "the latest a very large number of them" is not the same question.
     */
    listAll(): Transaction[] {
      return withAwaiting(
        db,
        db
          .select()
          .from(transactions)
          .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
          .all(),
        'whole-history',
      );
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
     * not of candidates. With nothing typed there is nothing to judge, so storage pages the listing
     * itself; with something typed the matches are remembered under the change stamp, and the next
     * page slices them without reading storage again (app-speed-pass design D6).
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
      /** Only what `countUncategorised` counts — the «Без категорії» narrowing. */
      uncategorised?: boolean;
      limit: number;
      offset: number;
    }): Transaction[] {
      const { limit, offset, ...criteria } = input;
      if (!criteria.match) {
        // Nothing is judged after the read, so storage pages the listing itself, walking
        // `transactions_order_idx` newest first — a page reads one page (app-speed-pass design D6).
        return withAwaiting(
          db,
          db
            .select()
            .from(transactions)
            .where(narrowing(criteria))
            .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
            .limit(limit)
            .offset(offset)
            .all(),
        );
      }
      // A search's matches are remembered under the change stamp with the criteria as the key, so
      // «Показати ще» slices what was already matched instead of reading the history again.
      return searchMatches(JSON.stringify(criteria)).slice(offset, offset + limit);
    },

    /**
     * How many stored транзакції still carry «Без категорії» — the one number the «Потребує уваги»
     * section on Головний is built from. A `COUNT(*)` rather than a listing: the screen names the
     * count and leads to «Транзакції» narrowed to those транзакції, and counting in TypeScript
     * over the five latest would answer a different question.
     *
     * The same `uncategorised` predicate that narrowing reads, so the number and the list cannot
     * disagree. A дохід carries a джерело, not a категорія — «Без джерела» is a different reserved
     * row, and naming it here would ask the owner to fix something this section never leads to.
     */
    countUncategorised(): number {
      return countUncategorised();
    },

    /** The місяці holding at least one транзакція, newest first — what «Транзакції» narrows by. */
    months(): readonly Month[] {
      return months();
    },

    /** Everything touching the account, transfers included on either leg. */
    listByAccount(accountId: string): Transaction[] {
      return withAwaiting(
        db,
        db
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
          .all(),
      );
    },
  };
}

export type TransactionsRepo = ReturnType<typeof transactionsRepo>;


/** What a search names beyond its page: the text it matches and the narrowings around it. */
interface SearchMatch {
  /** Matched in the опис, case-insensitively, at any position. Empty matches no опис. */
  text: string;
  /** A сума in minor units, matched on either leg, whatever the currency. */
  amountMinor?: number;
  categoryIds: readonly string[];
  sourceIds: readonly string[];
}

interface SearchCriteria {
  match?: SearchMatch;
  accountId?: string;
  month?: Month;
  uncategorised?: boolean;
}

/**
 * The SQL half of a search: narrowed by рахунок, by місяць, by «Без категорії», and by the part of
 * the match SQL can answer exactly — rows that could still match only by their опис are let
 * through on `description IS NOT NULL` and judged by `satisfies`.
 */
function narrowing(input: SearchCriteria): SQL | undefined {
  const { match } = input;
  const filters: SQL[] = [];

  if (input.uncategorised) {
    filters.push(uncategorised);
  }
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
  return filters.length > 0 ? and(...filters) : undefined;
}

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
