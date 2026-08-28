import type { Account } from './account';
import { money, type CurrencyCode, type Money } from './money';
import { categoryBreakdown, monthlyPicture } from './monthly-picture';
import { CORRECTION_CATEGORY_ID, monthOf, type Month, type Transaction } from './transaction';

/**
 * The history series behind «Звіти»: витрачено, дохід and інвестовано by calendar month over the
 * whole stored history, and one category's spent by month.
 *
 * Nothing is computed a second way here. Each month's numbers are `monthlyPicture`'s and each
 * category's month is `categoryBreakdown`'s — this module decides only *which* months there are
 * and folds the existing answers over them, which is what keeps "a month equals its monthly
 * picture" true by construction rather than by agreement.
 *
 * The month arithmetic is its own, small and local: `src/ui/months.ts` has the same step and the
 * Ukrainian names, but the domain never imports from `src/ui` (design D4).
 */

/** One month of the history series, in one currency. */
export interface MonthTotals {
  readonly month: Month;
  readonly spent: Money;
  readonly income: Money;
  readonly invested: Money;
}

/** One month of one category's series, in one currency. */
export interface CategoryMonth {
  readonly month: Month;
  readonly amount: Money;
}

const MONTH = /^(\d{4})-(\d{2})$/;

function nextMonth(month: Month): Month {
  const match = MONTH.exec(month);
  if (!match) {
    throw new Error(`month must be YYYY-MM, got "${month}"`);
  }
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) {
    throw new Error(`not a calendar month: "${month}"`);
  }
  return m === 12
    ? `${String(year + 1).padStart(4, '0')}-01`
    : `${String(year).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Every month the series covers: the earliest stored транзакція's month through the current one,
 * or through the latest stored транзакція's month when that lies beyond it — consecutively, so a
 * month holding nothing is present rather than skipped and the time axis never lies.
 *
 * An empty history has no span at all: there is no month to be honest about.
 *
 * Months are `'YYYY-MM'` strings, which sort lexicographically in calendar order, so the earliest
 * and the latest are a min and a max over strings.
 */
export function historyMonths(input: {
  transactions: readonly Transaction[];
  currentMonth: Month;
}): Month[] {
  if (input.transactions.length === 0) {
    return [];
  }
  let earliest = monthOf(input.transactions[0]!.date);
  let latest = earliest;
  for (const t of input.transactions) {
    const month = monthOf(t.date);
    if (month < earliest) earliest = month;
    if (month > latest) latest = month;
  }
  const end = latest > input.currentMonth ? latest : input.currentMonth;

  const months: Month[] = [];
  for (let month = earliest; month <= end; month = nextMonth(month)) {
    months.push(month);
  }
  return months;
}

/** The транзакції of each month, so the fold below is one pass over the history, not one per month. */
function byMonth(transactions: readonly Transaction[]): Map<Month, Transaction[]> {
  const grouped = new Map<Month, Transaction[]>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    const bucket = grouped.get(month);
    if (bucket) {
      bucket.push(t);
    } else {
      grouped.set(month, [t]);
    }
  }
  return grouped;
}

/**
 * витрачено, дохід and інвестовано for every month of the span, per currency. A currency that
 * occurs anywhere in the history holds every month of the span, empty ones at zero — a currency's
 * series is a line, and a line with holes in it would read as a line with zeroes.
 *
 * Amounts of different currencies are never summed: each currency is its own entry, exactly as
 * `monthlyPicture` returns them.
 */
export function historySeries(input: {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  currentMonth: Month;
}): Map<CurrencyCode, MonthTotals[]> {
  const months = historyMonths(input);
  const grouped = byMonth(input.transactions);

  const pictures = months.map((month) =>
    monthlyPicture({ month, accounts: input.accounts, transactions: grouped.get(month) ?? [] }),
  );

  const currencies = new Set<CurrencyCode>();
  for (const picture of pictures) {
    for (const currency of picture.keys()) {
      currencies.add(currency);
    }
  }

  const series = new Map<CurrencyCode, MonthTotals[]>();
  for (const currency of currencies) {
    series.set(
      currency,
      months.map((month, index) => {
        const numbers = pictures[index]!.get(currency);
        return {
          month,
          spent: numbers?.spent ?? money(0, currency),
          income: numbers?.income ?? money(0, currency),
          invested: numbers?.invested ?? money(0, currency),
        };
      }),
    );
  }
  return series;
}

/**
 * One category's spent by month over the same span, per currency: the breakdown amount of that
 * category, so a month of повернення shows it negative and a month the category does not occur in
 * shows it at zero.
 *
 * The currencies are given rather than derived, and that is the point: «Звіти» shows one currency
 * at a time and the same one governs both charts, so a category never spent in the shown currency
 * must still answer with a line of zeroes rather than with nothing at all.
 */
export function categorySeries(input: {
  categoryId: string;
  transactions: readonly Transaction[];
  currentMonth: Month;
  currencies: readonly CurrencyCode[];
}): Map<CurrencyCode, CategoryMonth[]> {
  const months = historyMonths(input);
  const grouped = byMonth(input.transactions);

  const breakdowns = months.map((month) =>
    categoryBreakdown({ month, transactions: grouped.get(month) ?? [] }),
  );

  const series = new Map<CurrencyCode, CategoryMonth[]>();
  for (const currency of input.currencies) {
    series.set(
      currency,
      months.map((month, index) => ({
        month,
        amount: breakdowns[index]!.get(currency)?.get(input.categoryId) ?? money(0, currency),
      })),
    );
  }
  return series;
}

/**
 * The categories the stored history actually carries — exactly the ones a category series can say
 * something about. It is the breakdown's own set: a витрата or a повернення carries its category,
 * a negative коригування carries «Коригування» (the domain fixes it), and a positive коригування
 * is дохід and enters no breakdown. Offering anything else would answer an honest question with an
 * empty chart.
 *
 * Ids, not names: what a category is called is the owner's editable list, read where it is shown.
 */
export function categoriesInHistory(transactions: readonly Transaction[]): string[] {
  const ids = new Set<string>();
  for (const t of transactions) {
    switch (t.type) {
      case 'expense':
      case 'refund':
        ids.add(t.categoryId);
        break;
      case 'correction':
        if (t.amount.amount < 0) {
          ids.add(CORRECTION_CATEGORY_ID);
        }
        break;
      case 'income':
      case 'transfer':
        break;
    }
  }
  return [...ids];
}
