import { add, money, subtract, type CurrencyCode, type Money } from './money';
import type { Transaction } from './transaction';

/**
 * The kind — never the name — decides how a transfer touching the account is
 * classified in the monthly picture.
 */
export type AccountKind = 'spending' | 'savings' | 'investment' | 'cash' | 'debt';

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  /** Where the account stood before the first recorded transaction, in its own currency. */
  readonly openingBalance: Money;
}

/**
 * The one place an Account is built: the opening balance defaults to zero in the account's own
 * currency, and an opening balance in any other currency is rejected — amounts of different
 * currencies never combine.
 */
export function account(input: {
  id: string;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  openingBalance?: Money;
}): Account {
  const openingBalance = input.openingBalance ?? money(0, input.currency);
  if (openingBalance.currency !== input.currency) {
    throw new Error(
      `opening balance of ${input.currency} account "${input.id}" cannot be ${openingBalance.currency}`,
    );
  }
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    currency: input.currency,
    openingBalance,
  };
}

/** The monthly numbers a transfer can move. Spent is never one of them. */
export type TransferBucket = 'saved' | 'invested' | 'lent';

const BUCKET_BY_KIND: Partial<Record<AccountKind, TransferBucket>> = {
  savings: 'saved',
  investment: 'invested',
  debt: 'lent',
};

export interface TransferContribution {
  readonly bucket: TransferBucket;
  /** Positive adds to the bucket, negative subtracts from it. */
  readonly amount: Money;
}

/**
 * How a transfer counts in the monthly picture. A savings/investment/debt
 * destination adds to its bucket, a savings/investment/debt source subtracts;
 * spending and cash ends contribute nothing. Cross-currency contributions are
 * measured by the opposite leg (in that leg's currency), same-currency ones by
 * the classified account's own leg, so a shortfall is accounted for exactly by
 * its proposed fee expense.
 */
export function classifyTransfer(input: {
  from: Account;
  to: Account;
  left: Money;
  arrived: Money;
}): TransferContribution[] {
  const { from, to, left, arrived } = input;
  const crossCurrency = left.currency !== arrived.currency;
  const contributions: TransferContribution[] = [];

  const toBucket = BUCKET_BY_KIND[to.kind];
  if (toBucket) {
    const measured = crossCurrency ? left : arrived;
    contributions.push({ bucket: toBucket, amount: measured });
  }

  const fromBucket = BUCKET_BY_KIND[from.kind];
  if (fromBucket) {
    const measured = crossCurrency ? arrived : left;
    contributions.push({
      bucket: fromBucket,
      amount: money(-measured.amount, measured.currency),
    });
  }

  return contributions;
}

/**
 * The computed balance (розрахунковий баланс): the opening balance plus the effect of every
 * transaction touching the account. Nothing is stored — a balance transactions cannot explain
 * does not exist. An amount in any currency other than the account's is rejected; amounts of
 * different currencies never combine.
 */
export function computeBalance(
  account: Account,
  transactions: readonly Transaction[],
): Money {
  let balance = account.openingBalance;
  for (const t of transactions) {
    switch (t.type) {
      case 'expense':
        if (t.accountId !== account.id) break;
        balance = subtract(balance, t.amount);
        break;
      case 'income':
      case 'refund':
      case 'correction':
        // A correction's amount is signed, so adding it moves the balance either way.
        if (t.accountId !== account.id) break;
        balance = add(balance, t.amount);
        break;
      case 'transfer':
        if (t.fromAccountId === account.id) {
          balance = subtract(balance, t.left);
        }
        if (t.toAccountId === account.id) {
          balance = add(balance, t.arrived);
        }
        break;
    }
  }
  return balance;
}
