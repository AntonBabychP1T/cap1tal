import { account, computeBalance, type Account } from './account';
import { add, type Money } from './money';
import type { Transaction } from './transaction';

/**
 * Folding one рахунок into another of the same money (`src/ui/account-merge.ts` has the story):
 * what may be merged, and what the merged рахунок then holds. Pure; the write is
 * `src/db/account-merge-repo.ts`, which asks `mergeRefusal` before it touches anything.
 */

/**
 * Why these two cannot be merged, in the owner's words, or `undefined` when they can. Two linked
 * рахунки are refused: a рахунок is fed by at most one monobank account, and choosing which link to
 * drop is the owner's decision on the monobank screen, not a side effect here.
 */
export function mergeRefusal(input: {
  readonly from: Account;
  readonly into: Account;
  readonly fromLinked: boolean;
  readonly intoLinked: boolean;
}): string | undefined {
  const { from, into } = input;
  if (from.id === into.id) {
    return 'рахунок не можна обʼєднати сам із собою';
  }
  if (from.currency !== into.currency) {
    return `валюти різні: ${from.currency} і ${into.currency}`;
  }
  if (input.fromLinked && input.intoLinked) {
    return 'обидва рахунки приєднано до monobank — спершу відʼєднайте один';
  }
  return undefined;
}

/** A переказ with one leg on each of the two рахунки — money that never left the merged one. */
export function isBetween(t: Transaction, a: string, b: string): boolean {
  return (
    t.type === 'transfer' &&
    ((t.fromAccountId === a && t.toAccountId === b) ||
      (t.fromAccountId === b && t.toAccountId === a))
  );
}

export interface MergePreview {
  /** Транзакції of `from` that move onto `into`. */
  readonly moved: number;
  /** Перекази between the two: they would be a переказ from a рахунок to itself, so they go. */
  readonly dropped: number;
  /** `into`'s розрахунковий баланс once merged — both histories and both opening balances. */
  readonly balance: Money;
  /**
   * Коригування among the moved: «Звірити» on `from` brought its balance to its bank's, and when
   * the two рахунки were the same money that коригування is exactly the doubled part — the owner's
   * own case: «На облігацію» reconciled to +2 086,99 USD beside «облігація $» already holding them.
   * So the owner may leave them behind, and `balanceWithoutCorrections` is the balance if they do.
   */
  readonly corrections: number;
  readonly balanceWithoutCorrections: Money;
}

/**
 * What merging would do, read off both рахунки' own транзакції (`listByAccount` of each). The
 * resulting balance is the domain's `computeBalance` over the merged history, so the number the
 * confirmation names is the number the рахунок will then show.
 */
export function mergePreview(input: {
  readonly from: Account;
  readonly into: Account;
  readonly fromTransactions: readonly Transaction[];
  readonly intoTransactions: readonly Transaction[];
}): MergePreview {
  const { from, into } = input;
  const between = (t: Transaction) => isBetween(t, from.id, into.id);
  const moved = input.fromTransactions.filter((t) => !between(t)).map((t) => repoint(t, from.id, into.id));
  const kept = input.intoTransactions.filter((t) => !between(t));
  const merged = account({ ...into, openingBalance: add(into.openingBalance, from.openingBalance) });
  const uncorrected = moved.filter((t) => t.type !== 'correction');
  return {
    moved: moved.length,
    dropped: input.fromTransactions.length - moved.length,
    balance: computeBalance(merged, [...kept, ...moved]),
    corrections: moved.length - uncorrected.length,
    balanceWithoutCorrections: computeBalance(merged, [...kept, ...uncorrected]),
  };
}

/** The same транзакція with every leg on `from` now on `into`. */
export function repoint(t: Transaction, from: string, into: string): Transaction {
  const on = (id: string) => (id === from ? into : id);
  if (t.type === 'transfer') {
    return { ...t, fromAccountId: on(t.fromAccountId), toAccountId: on(t.toAccountId) };
  }
  return { ...t, accountId: on(t.accountId) };
}

