import type { Account } from '../domain/account';
import { overLimitCategories, type CategoryLimit } from '../domain/limits';
import type { CurrencyCode } from '../domain/money';
import {
  categoryBreakdown,
  monthlyPicture,
  type MonthlyNumbers,
} from '../domain/monthly-picture';
import type { Month, Transaction } from '../domain/transaction';
import { byCurrency, formatMinorUnits, formatMoney } from './amount-input';
import { approximatePicture } from './approx-uah';
import { categoryLabel } from './labels';
import { canStepForward, monthLabel, prevMonth } from './months';
import type { MonobankRate } from '../monobank/currency';

/**
 * Everything the Місяць screen renders, as strings — so what it says is under `verify` even though
 * the list itself is JSX. The screen maps over this and adds no decisions of its own.
 */

/** The six numbers, in the order the screen reads them. */
const NUMBER_KEYS = ['spent', 'invested', 'saved', 'lent', 'income', 'left'] as const;

export type NumberKey = (typeof NUMBER_KEYS)[number];

/** The glossary's words, as headings. */
const NUMBER_LABELS: Readonly<Record<NumberKey, string>> = {
  spent: 'Витрачено',
  invested: 'Інвестовано',
  saved: 'Відкладено',
  lent: 'Позичено',
  income: 'Дохід',
  left: 'Залишилось',
};

export interface MonthNumberRow {
  readonly key: NumberKey;
  readonly label: string;
  /** The amount with its currency code, e.g. "4 125,00 UAH" — never combined with another. */
  readonly amount: string;
}

export interface MonthBreakdownRow {
  readonly categoryId: string;
  readonly label: string;
  readonly currency: CurrencyCode;
  readonly amount: string;
  /**
   * The category is over its ліміт for this month, in this row's currency — the screen draws the
   * amount red. Only the row in the ліміт's own currency carries it: the same category's amount in
   * another currency never counted toward the ліміт, so marking it would say something untrue.
   */
  readonly overLimit: boolean;
  /**
   * How long this row's bar is: the amount as a fraction of the month's largest категорія in the
   * same currency, so the biggest fills the track and the rest read against it. Purely a display
   * decision, like the order — it is here so the screen keeps adding none of its own. A category
   * that a повернення pushed to or below zero gets no bar at all.
   */
  readonly share: number;
}

/** One currency's numbers and its share of spent. Two currencies are two of these, never one. */
export interface MonthCurrencyGroup {
  readonly currency: CurrencyCode;
  readonly numbers: readonly MonthNumberRow[];
  readonly breakdown: readonly MonthBreakdownRow[];
  /**
   * Which of the six numbers is read first. Залишилось while this currency's дохід is above zero,
   * витрачено while it is not: before the first дохід of a month залишилось is structurally
   * negative — the month's витрати with nothing yet set against them — and leading with it teaches
   * the owner to distrust the one number they have to trust. Every one of the six is still shown,
   * under its own name and with its own сума; only what is read first moves.
   *
   * Per currency, because the numbers are: a month with UAH дохід and only USD витрати is honestly
   * two different situations in one screen.
   */
  readonly lead: NumberKey;
  /** Says no дохід is recorded for the month yet — exactly when витрачено leads, `null` otherwise. */
  readonly note: string | null;
}

/** Why залишилось is not leading. Shown under витрачено, so the reason is on the screen. */
const NO_INCOME_NOTE = 'У цьому місяці ще не записано дохід.';

/** The secondary «≈ … грн» line for one monthly number, across every currency of that number. */
export interface MonthApproximateRow {
  readonly key: NumberKey;
  readonly label: string;
  /** Marked as approximate in the string itself, so no caller can drop the mark. */
  readonly amount: string;
}

/**
 * The month before an empty one, when that month has something to read. Its витрачено alone: that
 * is the number Місяць is opened for, and six numbers of a month the owner is not on would re-ask
 * the very question this line answers.
 */
export interface PreviousMonth {
  readonly month: Month;
  /** «Серпень 2026». */
  readonly label: string;
  readonly spent: readonly MonthNumberRow[];
}

export interface MonthViewModel {
  readonly month: Month;
  /** «Серпень 2026». */
  readonly title: string;
  readonly canStepForward: boolean;
  readonly groups: readonly MonthCurrencyGroup[];
  /**
   * `null` when the month is UAH-only or a needed rate is unknown. Its absence changes nothing
   * else on the screen.
   */
  readonly approximate: readonly MonthApproximateRow[] | null;
  /** What to say instead of an empty gap, or `null` when there are groups to show. */
  readonly emptyMessage: string | null;
  /**
   * The previous calendar month, to be offered — non-null only when the shown month holds no
   * транзакція and that one holds at least one. On the 1st of a month the shown month is empty by
   * construction, and the month the owner wants is one tap away; two empty months in a row are no
   * offer at all.
   */
  readonly previous: PreviousMonth | null;
}

/**
 * Largest first: the screen answers "where did my money go", and the biggest category is the
 * answer. Ties break by label so the order never depends on the order rows were loaded in. This
 * is a display decision — the specs pin what the rows say, not their sequence.
 *
 * Sorted on the integer, before formatting. Reading a number back out of `formatMoney`'s output
 * would have to know that it writes a typographic minus, and a refunded category would sort as
 * though it were the month's biggest expense.
 */
function byAmountThenLabel(
  a: { amount: number; label: string },
  b: { amount: number; label: string },
): number {
  return b.amount - a.amount || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}

function numbersOf(numbers: MonthlyNumbers): MonthNumberRow[] {
  return NUMBER_KEYS.map((key) => ({
    key,
    label: NUMBER_LABELS[key],
    amount: formatMoney(numbers[key]),
  }));
}

export function monthViewModel(input: {
  month: Month;
  /** Every account, archived included: a month may hold a transfer touching a since-archived one,
   * and classifying it needs its вид (design decision 8). */
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  rates: readonly MonobankRate[];
  /** The categories list as the screen loaded it, so a breakdown row reads the owner's own name
   * for the category — a renamed one included. See `categoryLabel` in ./labels. */
  categoryNames: ReadonlyMap<string, string>;
  /** The ліміти as the screen loaded them; an empty list marks nothing. */
  limits: readonly CategoryLimit[];
  /**
   * The transactions of the calendar month before the shown one — one more bounded read, so an
   * empty month can name the month that has numbers. Never the whole history: a month-shaped gap
   * is not the case this answers.
   */
  previousTransactions: readonly Transaction[];
  now: Date;
}): MonthViewModel {
  const picture = monthlyPicture({
    month: input.month,
    accounts: input.accounts,
    transactions: input.transactions,
  });
  const breakdown = categoryBreakdown({
    month: input.month,
    transactions: input.transactions,
  });

  // Judged once for the whole month, in each ліміт's own currency (domain/limits.ts): the map says
  // which categories are over and which currency each was judged in, so a row is marked only when
  // it is the row that was judged.
  const over = overLimitCategories({ breakdown, limits: input.limits });

  const groups: MonthCurrencyGroup[] = [...picture.keys()]
    .sort(byCurrency)
    .map((currency) => {
      const sorted = [...(breakdown.get(currency) ?? [])]
        .map(([categoryId, money]) => ({
          categoryId,
          label: categoryLabel(categoryId, input.categoryNames),
          amount: money.amount,
          formatted: formatMoney(money),
        }))
        .sort(byAmountThenLabel);
      // The largest is the first, since that is what the sort just did. Zero or less — a month
      // whose every категорія was refunded away — leaves every bar empty rather than dividing.
      const largest = sorted[0]?.amount ?? 0;
      const rows: MonthBreakdownRow[] = sorted.map(({ categoryId, label, amount, formatted }) => ({
        categoryId,
        label,
        currency,
        amount: formatted,
        overLimit: over.get(categoryId) === currency,
        share: largest > 0 ? Math.max(0, amount / largest) : 0,
      }));
      const numbers = picture.get(currency)!;
      const lead: NumberKey = numbers.income.amount > 0 ? 'left' : 'spent';
      return {
        currency,
        numbers: numbersOf(numbers),
        breakdown: rows,
        lead,
        note: lead === 'spent' ? NO_INCOME_NOTE : null,
      };
    });

  const approximatePic = approximatePicture(picture, input.rates);
  const approximate = approximatePic
    ? NUMBER_KEYS.map((key) => ({
        key,
        label: NUMBER_LABELS[key],
        amount: `≈ ${formatMinorUnits(approximatePic[key].amount)} грн`,
      }))
    : null;

  const inMonth = input.transactions.some((t) => t.date.startsWith(`${input.month}-`));

  return {
    month: input.month,
    title: monthLabel(input.month),
    canStepForward: canStepForward(input.month, input.now),
    groups,
    approximate,
    emptyMessage: emptyMessageFor(groups.length, inMonth),
    previous: inMonth
      ? null
      : previousMonthOf({
          month: prevMonth(input.month),
          accounts: input.accounts,
          transactions: input.previousTransactions,
        }),
  };
}

/**
 * The previous month as one line of витрачено per currency, or `null` when it holds no транзакція
 * of its own. The numbers come from the same `monthlyPicture` the screen would show after stepping
 * back, so the offer and what it leads to can never disagree.
 */
function previousMonthOf(input: {
  month: Month;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
}): PreviousMonth | null {
  if (!input.transactions.some((t) => t.date.startsWith(`${input.month}-`))) {
    return null;
  }
  const picture = monthlyPicture(input);
  return {
    month: input.month,
    label: monthLabel(input.month),
    spent: [...picture.keys()].sort(byCurrency).map((currency) => ({
      key: 'spent' as const,
      label: NUMBER_LABELS.spent,
      amount: formatMoney(picture.get(currency)!.spent),
    })),
  };
}

/**
 * A month with nothing recorded says so. A month that holds only transfers between рахунки that
 * move no monthly number — card to wallet, say — would otherwise be an equally blank screen while
 * being a different situation, so it gets its own sentence rather than the wrong one.
 */
function emptyMessageFor(groupCount: number, hasTransactions: boolean): string | null {
  if (groupCount > 0) {
    return null;
  }
  return hasTransactions
    ? 'У цьому місяці гроші лише переходили між рахунками.'
    : 'У цьому місяці ще нічого не записано.';
}
