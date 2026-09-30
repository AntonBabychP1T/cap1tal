import { computeBalances, type Account } from '../domain/account';
import type { Money } from '../domain/money';
import { monthOf, type Month, type Transaction } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { sealed, stampedMemo } from './stamp';
import type { Storage } from './storage';
import { transactionsRepo } from './transactions-repo';

/**
 * The stored-history memo, and the stamp-keyed memo it is built on (persistence, "A read repeated
 * between writes is answered without reading storage again"; app-speed-pass design D1). The
 * primitives live in `stamp.ts` so a repository can memoize its own reads without importing this
 * module, which reads through the repositories.
 */
export { outsideStamp, sealed, stampedMemo, storageStamp } from './stamp';

/**
 * The whole stored history, as every screen that needs all of it reads it: the рахунки, every
 * транзакція in the latest listing's order, and what is derived from them without another read.
 */
export interface StoredHistory {
  /** Every рахунок, archived included, in `accountsRepo.list()`'s order. */
  readonly accounts: readonly Account[];
  /** Every stored транзакція, newest first — `transactionsRepo.listAll()`'s order. */
  readonly transactions: readonly Transaction[];
  /** The місяці the транзакції touch, newest first — `monthsOf`'s answer, from the same pass. */
  readonly months: readonly Month[];
  /**
   * The транзакції by місяць, each in `listMonth`'s own order (date, then id, ascending), so a
   * reading built on `listMonth` sees exactly the rows it saw, in the order it saw them. Lazy.
   */
  byMonth(): ReadonlyMap<Month, readonly Transaction[]>;
  /**
   * Every рахунок's розрахунковий баланс — the domain's `computeBalances` over the same rows, so
   * it equals the whole-history balance by construction. Lazy, so a balance beyond the safe range
   * is refused only to the reader who asked for balances.
   */
  balances(): ReadonlyMap<string, Money>;
  /**
   * `balances()`, or nothing when a balance is beyond the safe range — for a reader that can fall
   * back to computing only the рахунки it needs (a ціль's склад), so a refusal about one рахунок
   * never reaches a screen that does not show it.
   */
  balancesIfSafe(): ReadonlyMap<string, Money> | undefined;
}

/** Lazily computed once, then the same answer — or the same refusal — on every later call. */
function once<T>(compute: () => T): () => T {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
  return () => {
    if (!outcome) {
      try {
        outcome = { ok: true, value: sealed(compute()) };
      } catch (error) {
        outcome = { ok: false, error };
      }
    }
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  };
}

/**
 * `listMonth`'s order: date ascending, then id ascending. Ids are compared as JS strings (UTF-16)
 * where SQLite compares BINARY (UTF-8); the two agree for the ASCII ids every writer makes.
 */
function monthOrder(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** One read of the whole history. Not memoized itself — {@link storedHistory} is. */
function readStoredHistory(db: Storage): StoredHistory {
  const accounts = accountsRepo(db).list();
  const transactions = transactionsRepo(db).listAll();
  const months: Month[] = [];
  const seen = new Set<Month>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    if (!seen.has(month)) {
      seen.add(month);
      months.push(month);
    }
  }
  // `listAll` is newest first by date, so the months come out newest first already; sorted anyway,
  // so the answer is `monthsOf`'s by construction and not by an ordering this depends on.
  months.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  sealed(accounts);
  sealed(transactions);
  sealed(months);

  const byMonth = once(() => {
    const grouped = new Map<Month, Transaction[]>();
    for (const t of transactions) {
      const month = monthOf(t.date);
      const list = grouped.get(month);
      if (list) list.push(t);
      else grouped.set(month, [t]);
    }
    for (const list of grouped.values()) list.sort(monthOrder);
    return grouped as ReadonlyMap<Month, readonly Transaction[]>;
  });
  const balances = once(
    () => computeBalances(accounts, transactions) as ReadonlyMap<string, Money>,
  );

  const balancesIfSafe = () => {
    try {
      return balances();
    } catch (error) {
      // Only the safe-range refusal `money` makes of a sum; anything else is a fault and surfaces.
      if (error instanceof Error && error.message.startsWith('money amount must be an integer')) {
        return undefined;
      }
      throw error;
    }
  };

  return { accounts, transactions, months, byMonth, balances, balancesIfSafe };
}

/**
 * The stored-history memo over one connection: `read()` returns the whole history, read at most
 * once per change stamp whoever asks first. `repos.ts` exports the device one.
 */
export function storedHistory(db: Storage) {
  const memo = stampedMemo(db, () => readStoredHistory(db));
  return {
    read: (): StoredHistory => memo(),
  };
}

export type StoredHistoryRepo = ReturnType<typeof storedHistory>;
