import type { Account } from '../domain/account';
import { resolveCategoryIcon } from '../domain/category-icon';
import type { ThemeColor } from '../constants/theme';
import { overLimitCategories, type CategoryLimit } from '../domain/limits';
import {
  categoryBreakdown,
  monthlyPicture,
  type MonthlyNumbers,
} from '../domain/monthly-picture';
import {
  commitmentDues,
  freeAfterCommitments,
  owedByCurrency,
  type Commitment,
  type CommitmentDueStateKind,
  type CommitmentFacts,
} from '../domain/commitments';
import {
  installmentPartStates,
  INSTALLMENT_CURRENCY,
  type Installment,
  type InstallmentFacts,
} from '../domain/installments';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { monthOf, type Month, type Transaction } from '../domain/transaction';
import { byCurrency, formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { approximatePicture } from './approx-uah';
import { categoryLabel } from './labels';
import {
  canStepBack,
  canStepForward,
  currentMonth,
  monthInLabel,
  monthLabel,
  prevMonth,
  type ReachableMonths,
} from './months';
import type { MonobankRate } from '../monobank/currency';
import { categoryIconDefinition } from './category-icons';
import type { IconName } from './icons';
import { calendarLabel, todayIso } from './dates';
import type { Observation } from '../observations/observation';
import {
  foldedObservationLines,
  noObservationsSentence,
  observationLines,
  summaryOffer,
  type ObservationLine,
  type ObservationsMore,
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
   * «Вільно після зобов'язань» — only on the current month, only in a currency in which a платіж of
   * the month is still owed (month-screen, "The current month states Вільно після зобов'язань in
   * every currency that owes"). Drawn directly beneath залишилось wherever залишилось stands; never
   * the lead.
   */
  readonly freeAfterCommitments?: { readonly label: string; readonly amount: string };
}

/** The name the reading goes by. */
export const FREE_AFTER_COMMITMENTS_LABEL = "Вільно після зобов'язань";

/** The title of the block. */
export const MONTH_DUES_TITLE = 'Платежі місяця';

/** One платіж of the month, of a розстрочка or of a зобов'язання. */
export interface MonthDueRow {
  /** Unique within the month: the plan's kind and id, and the платіж's number. */
  readonly key: string;
  /** The назва of its розстрочка or зобов'язання. */
  readonly name: string;
  /** «платіж 5 з 10» for a розстрочка; `null` for a зобов'язання, which has no count. */
  readonly number: string | null;
  /** «5 жовтня». */
  readonly date: string;
  /** The scheduled сума in its currency: «1 000,00 UAH», «20,00 USD». */
  readonly amount: string;
  readonly state: CommitmentDueStateKind;
  /** «сплачено», «пропущено», «очікується», «списання не знайдено». */
  readonly stateLabel: string;
  /** Its розстрочка or its зобов'язання. */
  readonly href: string;
}

/** One currency's total in the block. */
export interface MonthDuesTotal {
  readonly currency: string;
  /** Every платіж of the month in this currency, пропущено ones left out. */
  readonly total: string;
  /** What of that is not сплачено yet; `null` when all of it is. */
  readonly unpaid: string | null;
}

/**
 * «Платежі місяця» (month-screen, "A month with платежі shows them in Платежі місяця"): the платежі
 * of розстрочки (not закрито) and of зобов'язання dated in the shown month, each row opening its
 * plan, totalled per currency. It changes none of the six numbers.
 */
export interface MonthDuesBlock {
  readonly title: string;
  readonly rows: readonly MonthDueRow[];
  /** UAH first, then the rest alphabetically; a currency whose every платіж is пропущено has none. */
  readonly totals: readonly MonthDuesTotal[];
}

const STATE_LABELS: Readonly<Record<CommitmentDueStateKind, string>> = {
  paid: 'сплачено',
  skipped: 'пропущено',
  expected: 'очікується',
  notFound: 'списання не знайдено',
};

/**
 * Why залишилось is not leading. Shown under витрачено, so the reason is on the screen. Exported
 * because Головний says the same thing about the same month — one sentence for one situation,
 * rather than two screens wording it differently.
 */
export const NO_INCOME_NOTE = 'У цьому місяці ще не записано дохід.';

/**
 * `NO_INCOME_NOTE` for the month it is said about: a finished month will not get its дохід any
 * more, so it is told without «ще» — «Дохід у вересні не записано.» (month-screen). The current
 * month, and one ahead of it, keep the promise.
 */
export function noIncomeNote(month: Month, now: Date): string {
  return month < currentMonth(now) ? `Дохід ${monthInLabel(month)} не записано.` : NO_INCOME_NOTE;
}

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
  /** «Платежі місяця», or `null` for a month in which no розстрочка and no зобов'язання has a платіж. */
  readonly dues: MonthDuesBlock | null;
  /**
   * «Підсумок вересня», beneath the month's name — only for a завершений активний місяць
   * (month-screen, "A finished month on Місяць leads to its підсумок"); `null` otherwise.
   */
  readonly summaryOffer: SummaryOffer | null;
  /**
   * The «Спостереження» block, beneath the breakdown and before any block of the month's платежі —
   * only when the month holds a транзакція; `null` otherwise. Changes none of the six numbers.
   */
  readonly observations: {
    readonly lines: readonly ObservationLine[];
    /** «Ще N» past the first five (design D11); `null` when every line is shown. */
    readonly more: ObservationsMore | null;
    readonly empty: string | null;
  } | null;
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
  /** Every зобов'язання and the states of their платежі; absent reads as none. */
  commitments?: { readonly commitments: readonly Commitment[]; readonly facts: CommitmentFacts };
  /** The shown month's спостереження, already ordered (`observationsOf`); absent reads as none. */
  observations?: readonly Observation[];
  /** The owner chose «Ще N» on this month: every спостереження is listed. */
  observationsExpanded?: boolean;
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
        note: lead === 'spent' ? noIncomeNote(input.month, input.now) : null,
      };
    });

  const today = todayIso(input.now);
  const dues = monthDuesOf(input, today);
  const free = freeAfterCommitments(
    new Map([...picture].map(([currency, numbers]): [string, Money] => [currency, numbers.left])),
    owedByCurrency(
      dues.map((d) => d.due),
      input.month,
    ),
    input.month,
    today,
  );
  for (const [at, group] of groups.entries()) {
    const reading = free.get(group.currency);
    if (reading !== undefined) {
      groups[at] = {
        ...group,
        freeAfterCommitments: { label: FREE_AFTER_COMMITMENTS_LABEL, amount: formatMoney(reading) },
      };
    }
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
    dues: duesBlockOf(dues, input.now),
    // A finished month holding a транзакція is a завершений активний місяць; the current month,
    // a month ahead and an empty one offer none.
    summaryOffer: inMonth && input.month < currentMonth(input.now) ? summaryOffer(input.month) : null,
    observations: inMonth
      ? {
          ...foldedObservationLines(
            observationLines(observed, {
              categoryNames: input.categoryNames,
              accountNames: new Map(input.accounts.map((a) => [a.id, a.name])),
              now: input.now,
            }),
            input.observationsExpanded ?? false,
          ),
          empty: observed.length === 0 ? noObservationsSentence(input.month, today) : null,
        }
      : null,
  };
}

/** One платіж of the month with what orders it and what its row says. */
interface MonthDue {
  readonly kind: 'installment' | 'commitment';
  readonly planId: string;
  readonly name: string;
  readonly recordedAt: number;
  readonly number: number;
  /** «платіж 5 з 10», a розстрочка's only. */
  readonly ofCount: string | null;
  readonly due: {
    readonly due: string;
    readonly amount: number;
    readonly currency: string;
    readonly state: CommitmentDueStateKind;
  };
}

/** The last calendar day of a month — the bound a зобов'язання's графік is read to. */
function lastDayOfMonth(month: Month): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/**
 * The month's платежі of both plans — a розстрочка's not закрито — by дата, then the plan recorded
 * first, then a розстрочка before a зобов'язання, then the number.
 */
function monthDuesOf(
  input: {
    readonly month: Month;
    readonly installments?: { readonly installments: readonly Installment[]; readonly facts: InstallmentFacts };
    readonly commitments?: { readonly commitments: readonly Commitment[]; readonly facts: CommitmentFacts };
  },
  today: string,
): MonthDue[] {
  const all: MonthDue[] = [];
  for (const installment of input.installments?.installments ?? []) {
    for (const part of installmentPartStates(installment, input.installments!.facts, today).parts) {
      if (monthOf(part.due) !== input.month || part.state === 'closed') {
        continue;
      }
      all.push({
        kind: 'installment',
        planId: installment.id,
        name: installment.name,
        recordedAt: installment.recordedAt,
        number: part.number,
        ofCount: `платіж ${part.number} з ${installment.partsCount}`,
        due: { due: part.due, amount: part.amount, currency: INSTALLMENT_CURRENCY, state: part.state },
      });
    }
  }
  const until = lastDayOfMonth(input.month);
  for (const commitment of input.commitments?.commitments ?? []) {
    for (const due of commitmentDues(commitment, input.commitments!.facts, { until, today })) {
      if (monthOf(due.due) !== input.month) {
        continue;
      }
      all.push({
        kind: 'commitment',
        planId: commitment.id,
        name: commitment.name,
        recordedAt: commitment.recordedAt,
        number: due.number,
        ofCount: null,
        due,
      });
    }
  }
  const kindOrder = (kind: MonthDue['kind']) => (kind === 'installment' ? 0 : 1);
  return all.sort(
    (a, b) =>
      a.due.due.localeCompare(b.due.due) ||
      a.recordedAt - b.recordedAt ||
      kindOrder(a.kind) - kindOrder(b.kind) ||
      a.number - b.number,
  );
}

function duesBlockOf(dues: readonly MonthDue[], now: Date): MonthDuesBlock | null {
  if (dues.length === 0) {
    return null;
  }
  const sums = new Map<string, { total: number; unpaid: number }>();
  for (const { due } of dues) {
    if (due.state === 'skipped') {
      continue;
    }
    const sum = sums.get(due.currency) ?? { total: 0, unpaid: 0 };
    sums.set(due.currency, {
      total: sum.total + due.amount,
      unpaid: sum.unpaid + (due.state === 'paid' ? 0 : due.amount),
    });
  }
  return {
    title: MONTH_DUES_TITLE,
    rows: dues.map((d) => ({
      key: `${d.kind}:${d.planId}#${d.number}`,
      name: d.name,
      number: d.ofCount,
      date: calendarLabel(d.due.due, now),
      amount: formatMoney(money(d.due.amount, d.due.currency)),
      state: d.due.state,
      stateLabel: STATE_LABELS[d.due.state],
      href: `/${d.kind}/${d.planId}`,
    })),
    totals: [...sums.keys()].sort(byCurrency).map((currency) => {
      const sum = sums.get(currency)!;
      return {
        currency,
        total: formatMoney(money(sum.total, currency)),
        unpaid: sum.unpaid === 0 ? null : formatMoney(money(sum.unpaid, currency)),
      };
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
