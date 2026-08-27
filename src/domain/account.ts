import { add, money, subtract, type CurrencyCode, type Money } from './money';
import { isoDate, type Correction, type IsoDate, type Transaction } from './transaction';

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
  /** An archived account keeps its history and balance but is offered for no new transaction. */
  readonly archived: boolean;
}

/**
 * The one place an Account is built: the opening balance defaults to zero in the account's own
 * currency, and an opening balance in any other currency is rejected — amounts of different
 * currencies never combine. A new account is unarchived.
 */
export function account(input: {
  id: string;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  openingBalance?: Money;
  archived?: boolean;
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
    archived: input.archived ?? false,
  };
}

/**
 * The accounts offered as a choice when a transaction is recorded, edited or retyped — the one
 * list every picker uses. An archived account is absent from it, yet keeps being shown on the
 * transactions it already has.
 */
export function activeAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((a) => !a.archived);
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

/**
 * Звірити: the коригування that makes a рахунок's розрахунковий баланс agree with what is
 * actually there — the баланс банку of a linked рахунок, or the notes the owner just counted.
 *
 * The signed amount is `actual − computed`, so applying it makes `computeBalance` return the
 * actual balance exactly; the month then counts a shortfall as spent and a surplus as дохід,
 * which is what a коригування means. Balances that already agree create nothing — a коригування
 * of zero would be a transaction that says nothing happened.
 *
 * An actual balance in another currency is rejected the way every other cross-currency amount in
 * this module is: amounts of different currencies never combine, and no rate exists here.
 */
export function reconcile(input: {
  accountId: string;
  computed: Money;
  actual: Money;
  date: IsoDate;
  newId: () => string;
}): Correction | undefined {
  if (input.actual.currency !== input.computed.currency) {
    throw new Error(
      `actual balance of ${input.computed.currency} account "${input.accountId}" cannot be ${input.actual.currency}`,
    );
  }
  const difference = subtract(input.actual, input.computed);
  if (difference.amount === 0) {
    return undefined;
  }
  return {
    type: 'correction',
    id: input.newId(),
    date: isoDate(input.date),
    accountId: input.accountId,
    amount: difference,
  };
}
