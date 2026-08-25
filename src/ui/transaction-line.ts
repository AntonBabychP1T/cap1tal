import type { Account } from '../domain/account';
import {
  UNCATEGORISED_CATEGORY_ID,
  type IsoDate,
  type Transaction,
} from '../domain/transaction';
import { formatMoney } from './amount-input';
import { categoryLabel, transactionTypeLabel } from './labels';

/**
 * One row of the стрічка: what the feed requirement asks it to show — the amount with its
 * currency, the account (both accounts for a переказ) and the date. Pure, so the feed's content
 * is proven by `verify` even though the list itself is JSX.
 */
export interface TransactionLine {
  readonly id: string;
  /** витрата, переказ, дохід, повернення, коригування. */
  readonly type: string;
  readonly amount: string;
  readonly accounts: string;
  readonly date: IsoDate;
  /** The category label where the type has one; absent otherwise. */
  readonly category?: string;
  /**
   * The line carries «Без категорії», so the feed marks it and offers the one-tap categorisation
   * (main-screen: "«Без категорії» is highlighted and categorised in one tap"). Deciding it here
   * rather than in the feed keeps the reserved id out of JSX and puts the rule under `verify`.
   */
  readonly uncategorised: boolean;
}

/** An account whose row is gone shows its id rather than an empty gap. */
function nameOf(accountId: string, accountsById: ReadonlyMap<string, Account>): string {
  return accountsById.get(accountId)?.name ?? accountId;
}

export function transactionLine(
  t: Transaction,
  accountsById: ReadonlyMap<string, Account>,
  /** The categories list as the screen loaded it — see `categoryLabel` in ./labels. */
  categoryNames: ReadonlyMap<string, string>,
): TransactionLine {
  const common = { id: t.id, type: transactionTypeLabel(t.type), date: t.date, uncategorised: false };
  if (t.type === 'transfer') {
    const legs =
      t.left.currency === t.arrived.currency
        ? formatMoney(t.left)
        : `${formatMoney(t.left)} → ${formatMoney(t.arrived)}`;
    return {
      ...common,
      amount: legs,
      accounts: `${nameOf(t.fromAccountId, accountsById)} → ${nameOf(t.toAccountId, accountsById)}`,
    };
  }
  return {
    ...common,
    amount: formatMoney(t.amount),
    accounts: nameOf(t.accountId, accountsById),
    ...(t.type === 'expense' || t.type === 'refund'
      ? {
          category: categoryLabel(t.categoryId, categoryNames),
          // A повернення can carry it too, and it is as uncategorised as a витрата is.
          uncategorised: t.categoryId === UNCATEGORISED_CATEGORY_ID,
        }
      : {}),
  };
}

export function accountsById(accounts: readonly Account[]): ReadonlyMap<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}
