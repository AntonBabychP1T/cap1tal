import type { Account } from '../domain/account';
import { resolveCategoryIcon } from '../domain/category-icon';
import type { ThemeColor } from '../constants/theme';
import { overLimitCategories, type CategoryLimit } from '../domain/limits';
import type { CurrencyCode } from '../domain/money';
import {
  categoryBreakdown,
  monthlyPicture,
  type MonthlyNumbers,
} from '../domain/monthly-picture';
import {
  freeAfterInstallments,
  installmentPartStates,
  type Installment,
  type InstallmentFacts,
  type InstallmentPartStateKind,
} from '../domain/installments';
import { money } from '../domain/money';
import { monthOf, type Month, type Transaction } from '../domain/transaction';
import { byCurrency, formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { approximatePicture } from './approx-uah';
import { categoryLabel } from './labels';
import {
  canStepBack,
  canStepForward,
  currentMonth,
  monthLabel,
  prevMonth,
  type ReachableMonths,
} from './months';
import type { MonobankRate } from '../monobank/currency';
import { categoryIconDefinition } from './category-icons';
import type { IconName } from './icons';
import { shortCalendarLabel, todayIso } from './dates';
import { formatHryvnia } from './receipt-screen';
import type { Observation } from '../observations/observation';
import {
  noObservationsSentence,
  observationLines,
  summaryOffer,
  type ObservationLine,
  type SummaryOffer,
} from './observations';

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
  readonly icon: IconName;
  readonly iconTone: ThemeColor;
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
  /**
   * «Вільно після розстрочок» — only on the current month's UAH group, and only while a платіж of
   * the month is still owed (month-screen, "The current month's UAH group states Вільно після
   * розстрочок"). Drawn directly beneath залишилось wherever залишилось stands; never the lead.
   */
  readonly freeAfterInstallments?: { readonly label: string; readonly amount: string };
}

/** The name the reading goes by. */
export const FREE_AFTER_INSTALLMENTS_LABEL = 'Вільно після розстрочок';

/** One платіж of the month in the «Розстрочки» block. */
export interface MonthInstallmentRow {
  /** Unique within the month: the розстрочка's id and the платіж's number. */
  readonly key: string;
  /** The назва of its розстрочка. */
  readonly name: string;
  /** «платіж 5 з 10». */
  readonly number: string;
  /** «5 жовт.». */
  readonly date: string;
  /** «1 000,00 ₴». */
  readonly amount: string;
  readonly state: Exclude<InstallmentPartStateKind, 'closed'>;
  /** «сплачено», «очікується», «списання не знайдено». */
  readonly stateLabel: string;
}

/**
 * The «Розстрочки» block of a month that holds a платіж not закрито (month-screen, "A month with
 * платежі shows its розстрочки"). Tapping it opens the «Розстрочки» screen. It changes none of the
 * six numbers.
 */
export interface MonthInstallmentsBlock {
  readonly rows: readonly MonthInstallmentRow[];
  /** «1 500,00 ₴» — every платіж of the month. */
  readonly total: string;
  /** «500,00 ₴» — what of that is not сплачено yet; `null` when all of it is. */
  readonly unpaid: string | null;
}

const STATE_LABELS: Readonly<Record<Exclude<InstallmentPartStateKind, 'closed'>, string>> = {
  paid: 'сплачено',
  expected: 'очікується',
  notFound: 'списання не знайдено',
};

/**
 * Why залишилось is not leading. Shown under витрачено, so the reason is on the screen. Exported
 * because Головний says the same thing about the same month — one sentence for one situation,
 * rather than two screens wording it differently.
 */
export const NO_INCOME_NOTE = 'У цьому місяці ще не записано дохід.';

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
  /** Both arrows are always drawn; these say which one is live (`reachableMonths`). */
  readonly canStepBack: boolean;
  readonly canStepForward: boolean;
  /**
   * The month «Сьогодні» jumps to — the current one — or `null` while it is the one shown, when
   * the control is not drawn at all: a jump to where the owner already stands is no offer.
   */
  readonly currentMonth: Month | null;
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
  /** The «Розстрочки» block, or `null` for a month in which no розстрочка has a платіж. */
  readonly installments: MonthInstallmentsBlock | null;
  /**
   * «Підсумок вересня», beneath the month's name — only for a завершений активний місяць
   * (month-screen, "A finished month on Місяць leads to its підсумок"); `null` otherwise.
   */
  readonly summaryOffer: SummaryOffer | null;
  /**
   * The «Спостереження» block, beneath the breakdown and before any block of the month's платежі —
   * only when the month holds a транзакція; `null` otherwise. Changes none of the six numbers.
   */
  readonly observations: { readonly lines: readonly ObservationLine[]; readonly empty: string | null } | null;
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
  /** Optional to keep old pure callers compatible; unknown and absent values always resolve safely. */
  categoryIconKeys?: ReadonlyMap<string, string | undefined>;
  /** The ліміти as the screen loaded them; an empty list marks nothing. */
  limits: readonly CategoryLimit[];
  /**
   * The transactions of the calendar month before the shown one — one more bounded read, so an
   * empty month can name the month that has numbers. Never the whole history: a month-shaped gap
   * is not the case this answers.
   */
  previousTransactions: readonly Transaction[];
  now: Date;
  /**
   * The months the arrows may reach, from what is recorded (`reachableMonths`). Optional to keep
   * old pure callers compatible: without it back is unbounded and forward stops at the current
   * month, as both did before the bounds existed.
   */
  reach?: ReachableMonths;
  /** Every розстрочка and the states of their платежі; absent reads as none. */
  installments?: { readonly installments: readonly Installment[]; readonly facts: InstallmentFacts };
  /** The shown month's спостереження, already ordered (`observationsOf`); absent reads as none. */
  observations?: readonly Observation[];
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
      const rows: MonthBreakdownRow[] = sorted.map(({ categoryId, label, amount, formatted }) => {
        const overLimit = over.get(categoryId) === currency;
        const key = resolveCategoryIcon({ id: categoryId, name: label, iconKey: input.categoryIconKeys?.get(categoryId) });
        return {
          categoryId, label, currency, amount: formatted, overLimit,
          icon: categoryIconDefinition(key).glyph,
          iconTone: overLimit ? 'textDanger' : 'textSecondary',
          share: largest > 0 ? Math.max(0, amount / largest) : 0,
        };
      });
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

  const today = todayIso(input.now);
  const statuses = (input.installments?.installments ?? []).map((installment) =>
    installmentPartStates(installment, input.installments!.facts, today),
  );
  const free = freeAfterInstallments(
    picture.get('UAH')?.left,
    statuses.flatMap((status) => status.parts),
    input.month,
    today,
  );
  if (free !== undefined) {
    const at = groups.findIndex((group) => group.currency === 'UAH');
    groups[at] = {
      ...groups[at]!,
      freeAfterInstallments: { label: FREE_AFTER_INSTALLMENTS_LABEL, amount: formatMoney(free) },
    };
  }

  const approximatePic = approximatePicture(picture, input.rates);
  const approximate = approximatePic
    ? NUMBER_KEYS.map((key) => ({
        key,
        label: NUMBER_LABELS[key],
        amount: `≈ ${formatMinorUnitsGrouped(approximatePic[key].amount)} грн`,
      }))
    : null;

  const inMonth = input.transactions.some((t) => t.date.startsWith(`${input.month}-`));
  const observed = input.observations ?? [];

  return {
    month: input.month,
    title: monthLabel(input.month),
    canStepBack: input.reach ? canStepBack(input.month, input.reach) : true,
    canStepForward: canStepForward(input.month, input.now, input.reach),
    currentMonth: input.month === currentMonth(input.now) ? null : currentMonth(input.now),
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
    installments: installmentsBlockOf(statuses, input.month, input.now),
    // A finished month holding a транзакція is a завершений активний місяць; the current month,
    // a month ahead and an empty one offer none.
    summaryOffer: inMonth && input.month < currentMonth(input.now) ? summaryOffer(input.month) : null,
    observations: inMonth
      ? {
          lines: observationLines(observed, {
            categoryNames: input.categoryNames,
            accountNames: new Map(input.accounts.map((a) => [a.id, a.name])),
            now: input.now,
          }),
          empty: observed.length === 0 ? noObservationsSentence(input.month, today) : null,
        }
      : null,
  };
}

/**
 * The month's платежі that are not закрито, by дата — then the розстрочка recorded first, then the
 * number — with their total and what of it is not сплачено yet.
 */
function installmentsBlockOf(
  statuses: readonly ReturnType<typeof installmentPartStates>[],
  month: Month,
  now: Date,
): MonthInstallmentsBlock | null {
  const parts = statuses
    .flatMap((status) =>
      status.parts
        .filter((part) => monthOf(part.due) === month && part.state !== 'closed')
        .map((part) => ({ status, part })),
    )
    .sort(
      (a, b) =>
        a.part.due.localeCompare(b.part.due) ||
        a.status.installment.recordedAt - b.status.installment.recordedAt ||
        a.part.number - b.part.number,
    );
  if (parts.length === 0) {
    return null;
  }
  const uah = (amount: number) => formatHryvnia(money(amount, 'UAH'));
  const total = parts.reduce((sum, { part }) => sum + part.amount, 0);
  const unpaid = parts
    .filter(({ part }) => part.state !== 'paid')
    .reduce((sum, { part }) => sum + part.amount, 0);
  return {
    rows: parts.map(({ status, part }) => {
      const state = part.state as Exclude<InstallmentPartStateKind, 'closed'>;
      return {
        key: `${status.installment.id}#${part.number}`,
        name: status.installment.name,
        number: `платіж ${part.number} з ${status.installment.partsCount}`,
        date: shortCalendarLabel(part.due, now),
        amount: uah(part.amount),
        state,
        stateLabel: STATE_LABELS[state],
      };
    }),
    total: uah(total),
    unpaid: unpaid === 0 ? null : uah(unpaid),
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
 *
 * Exported for Головний, which faces the same two situations in its month status.
 */
export function emptyMessageFor(groupCount: number, hasTransactions: boolean): string | null {
  if (groupCount > 0) {
    return null;
  }
  return hasTransactions
    ? 'У цьому місяці гроші лише переходили між рахунками.'
    : 'У цьому місяці ще нічого не записано.';
}
