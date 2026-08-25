import { classifyTransfer, type Account } from './account';
import { money, type CurrencyCode, type Money } from './money';
import { CORRECTION_CATEGORY_ID, monthOf, type Month, type Transaction } from './transaction';

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

/**
 * Spent, broken down by category: per currency, category id → the signed amount that category
 * accounts for. An expense adds to its category, a refund subtracts from it, and a negative
 * correction adds to `CORRECTION_CATEGORY_ID`. Nothing else appears — a transfer never enters
 * spent, an income is not spent, and a positive correction is income.
 *
 * Per currency the amounts sum exactly to `monthlyPicture().spent`; that identity is what makes
 * this a breakdown rather than a second opinion, and it is held as a property test. A category
 * may be negative when its refunds outran its expenses, and a category whose expenses and refunds
 * cancel stays in the map at zero — money did move there this month.
 *
 * Unlike `monthlyPicture` this needs no accounts: only transfers need classifying, and transfers
 * are not spent.
 */
export function categoryBreakdown(input: {
  month: Month;
  transactions: readonly Transaction[];
}): Map<CurrencyCode, Map<string, Money>> {
  const totals = new Map<CurrencyCode, Map<string, number>>();
  const add = (currency: CurrencyCode, categoryId: string, amount: number): void => {
    let byCategory = totals.get(currency);
    if (!byCategory) {
      byCategory = new Map<string, number>();
      totals.set(currency, byCategory);
    }
    byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + amount);
  };

  for (const t of input.transactions) {
    if (monthOf(t.date) !== input.month) {
      continue;
    }
    switch (t.type) {
      case 'expense':
        add(t.amount.currency, t.categoryId, t.amount.amount);
        break;
      case 'refund':
        add(t.amount.currency, t.categoryId, -t.amount.amount);
        break;
      case 'correction':
        // The sign decides: below zero it is spent, and its category is fixed by the domain.
        // A positive коригування is income and has no place in a breakdown of spent.
        if (t.amount.amount < 0) {
          add(t.amount.currency, CORRECTION_CATEGORY_ID, -t.amount.amount);
        }
        break;
      case 'income':
      case 'transfer':
        break;
      default:
        assertNever(t);
    }
  }

  const breakdown = new Map<CurrencyCode, Map<string, Money>>();
  for (const [currency, byCategory] of totals) {
    const row = new Map<string, Money>();
    for (const [categoryId, amount] of byCategory) {
      // Paired with its currency here, so no caller ever holds a bare amount (rules/domain.md).
      row.set(categoryId, money(amount, currency));
    }
    breakdown.set(currency, row);
  }
  return breakdown;
}
