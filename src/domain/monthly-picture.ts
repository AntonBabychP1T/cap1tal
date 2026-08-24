import { classifyTransfer, type Account } from './account';
import { money, type CurrencyCode, type Money } from './money';
import { monthOf, type Month, type Transaction } from './transaction';

/** The per-currency numbers of one calendar month. */
export interface MonthlyNumbers {
  readonly spent: Money;
  readonly invested: Money;
  readonly saved: Money;
  readonly lent: Money;
  readonly income: Money;
  readonly left: Money;
}

interface RunningTotals {
  spent: number;
  invested: number;
  saved: number;
  lent: number;
  income: number;
}

function assertNever(value: never): never {
  throw new Error(`unhandled transaction type: ${JSON.stringify(value)}`);
}

/**
 * The monthly picture: spent, invested, saved, lent, income and
 * left = income − spent − invested − saved − lent, separately per currency.
 * A currency appears only when some number of it moved this month.
 */
export function monthlyPicture(input: {
  month: Month;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
}): Map<CurrencyCode, MonthlyNumbers> {
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const accountFor = (id: string): Account => {
    const account = accountsById.get(id);
    if (!account) {
      throw new Error(`transaction references unknown account "${id}"`);
    }
    return account;
  };

  const totals = new Map<CurrencyCode, RunningTotals>();
  const totalsFor = (currency: CurrencyCode): RunningTotals => {
    let row = totals.get(currency);
    if (!row) {
      row = { spent: 0, invested: 0, saved: 0, lent: 0, income: 0 };
      totals.set(currency, row);
    }
    return row;
  };

  for (const t of input.transactions) {
    if (monthOf(t.date) !== input.month) {
      continue;
    }
    switch (t.type) {
      case 'expense':
        totalsFor(t.amount.currency).spent += t.amount.amount;
        break;
      case 'refund':
        totalsFor(t.amount.currency).spent -= t.amount.amount;
        break;
      case 'income':
        totalsFor(t.amount.currency).income += t.amount.amount;
        break;
      case 'correction':
        if (t.amount.amount < 0) {
          totalsFor(t.amount.currency).spent += -t.amount.amount;
        } else if (t.amount.amount > 0) {
          totalsFor(t.amount.currency).income += t.amount.amount;
        }
        break;
      case 'transfer': {
        const from = accountFor(t.fromAccountId);
        const to = accountFor(t.toAccountId);
        for (const contribution of classifyTransfer({ from, to, left: t.left, arrived: t.arrived })) {
          totalsFor(contribution.amount.currency)[contribution.bucket] += contribution.amount.amount;
        }
        break;
      }
      default:
        assertNever(t);
    }
  }

  const picture = new Map<CurrencyCode, MonthlyNumbers>();
  for (const [currency, sums] of totals) {
    const left = sums.income - sums.spent - sums.invested - sums.saved - sums.lent;
    picture.set(currency, {
      spent: money(sums.spent, currency),
      invested: money(sums.invested, currency),
      saved: money(sums.saved, currency),
      lent: money(sums.lent, currency),
      income: money(sums.income, currency),
      left: money(left, currency),
    });
  }
  return picture;
}
