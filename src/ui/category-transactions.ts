import { overLimitCategories, type CategoryLimit } from '../domain/limits';
import { categoryBreakdown } from '../domain/monthly-picture';
import {
  CORRECTION_CATEGORY_ID,
  monthOf,
  type Month,
  type Transaction,
} from '../domain/transaction';
import { categoryLabel } from './labels';

/**
 * The transactions behind one breakdown row: the shown month's витрати and повернення of one
 * category, and — for the correction category, which no transaction carries an id for — its
 * коригування.
 *
 * Corrections of **either** sign are listed, positive ones included, even though only the negative
 * ones entered the row's amount. The row answers "how much did this cost"; the list answers "what
 * is in here", and hiding the positive коригування would leave the owner unable to find one they
 * recorded by mistake.
 *
 * No currency is taken. A category is one category: the breakdown shows a row per currency because
 * amounts of different currencies never sum, but tapping one opens the category, not the currency.
 * Each row of the list carries its own amount in its own currency.
 *
 * Order is the order given — `transactionsRepo.listMonth` returns a month by date, then id.
 */
export function categoryTransactions(input: {
  month: Month;
  categoryId: string;
  transactions: readonly Transaction[];
}): Transaction[] {
  const wantsCorrections = input.categoryId === CORRECTION_CATEGORY_ID;
  return input.transactions.filter((t) => {
    if (monthOf(t.date) !== input.month) {
      return false;
    }
    switch (t.type) {
      case 'expense':
      case 'refund':
        return t.categoryId === input.categoryId;
      case 'correction':
        return wantsCorrections;
      case 'income':
      case 'transfer':
        // Neither is spent, so neither has a row in the breakdown to be opened from.
        return false;
    }
  });
}

/**
 * What the drill-down says it is showing: the category's own name, and whether that category is
 * over its ліміт for the shown month.
 *
 * The mark lives on the heading rather than on each row because the heading is where this screen
 * names the category — every row below it is that same category, so marking each one would say the
 * same thing many times. It is the same determination the feed and the Місяць breakdown make, from
 * the same month's whole breakdown (main-screen: "wherever a category's month-scoped транзакції
 * are listed").
 */
export function categoryMonthHeading(input: {
  month: Month;
  categoryId: string;
  /** The month's транзакції, whole — the breakdown is the month's, not this list's. */
  transactions: readonly Transaction[];
  categoryNames: ReadonlyMap<string, string>;
  limits: readonly CategoryLimit[];
}): { readonly label: string; readonly overLimit: boolean } {
  const breakdown = categoryBreakdown({ month: input.month, transactions: input.transactions });
  const over = overLimitCategories({ breakdown, limits: input.limits });
  return {
    label: categoryLabel(input.categoryId, input.categoryNames),
    overLimit: over.has(input.categoryId),
  };
}
