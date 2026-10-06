import type { Account } from '../domain/account';
import type { Category } from '../domain/category';
import { compositionBalanceChange, spendingGoalSpent, type AccumulationGoal } from '../domain/goals';
import { overLimitBy, type CategoryLimit } from '../domain/limits';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { categoryBreakdown, monthlyPicture, type MonthlyNumbers } from '../domain/monthly-picture';
import type { MonthFigure } from '../domain/net-worth';
import {
  CORRECTION_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  monthOf,
  type IsoDate,
  type Month,
  type Transaction,
} from '../domain/transaction';
import type { AnsweredPair, MerchantKeyOf, Observation } from '../observations/observation';
import { observationsIn } from '../observations/observations';
import { byCurrency } from '../ui/amount-input';
import { CORRECTION_MEASURE_BP } from '../observations/thresholds';
import {
  changePercentOf,
  currenciesOfTransaction,
  ledgerOf,
  monthBefore,
  typicalSpentOf,
  windowOf,
  type Ledger,
} from '../observations/window';

/**
 * The **підсумок місяця** (month-summary): one finished month read as a whole, per currency and
 * never converted. It adds no money rule of its own — every number is the one the screen that owns
 * it already computes (`monthlyPicture`, `categoryBreakdown`, `monthFigures`, `overLimitBy`, the
 * observations' `typicalSpentOf`), called again here rather than recomputed, so «the картина
 * equals Місяць» and «the зміна equals Статок's» hold by construction. Computed when shown,
 * stored nowhere, and it writes nothing.
 */

/** Why a month has no підсумок, or that it has one. */
export type SummaryAvailability = 'available' | 'current' | 'future' | 'empty' | 'not-a-month';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Which months have a підсумок (month-summary, "Every завершений активний місяць has a підсумок, and
 * no other month does"): a calendar month that has ended by today and holds at least one транзакція
 * of any type. `activeMonths` are the months holding a транзакція — the stored history's own list.
 */
export function summaryAvailability(
  month: string,
  today: IsoDate,
  activeMonths: ReadonlySet<Month>,
): SummaryAvailability {
  if (!MONTH.test(month)) return 'not-a-month';
  const current = monthOf(today);
  if (month === current) return 'current';
  if (month > current) return 'future';
  return activeMonths.has(month) ? 'available' : 'empty';
}

/** A сума against an earlier one: the difference, and its whole percentage when the base is positive. */
export interface Comparison {
  readonly before: Money;
  readonly difference: Money;
  /** Rounded half away from zero; `null` when `before` is not positive. */
  readonly percent: number | null;
}

function compare(before: Money, after: Money): Comparison {
  return {
    before,
    difference: money(after.amount - before.amount, after.currency),
    percent: before.amount > 0 ? changePercentOf(before, after) : null,
  };
}

export type TypicalComparison =
  | ({ readonly status: 'available'; readonly months: number } & Comparison)
  | { readonly status: 'too-little-history' | 'not-positive' };

export interface SpentReading {
  readonly currency: CurrencyCode;
  /** Equal to the витрачено Місяць shows for the month and currency. */
  readonly spent: Money;
  /**
   * How much of `spent` the negative коригування are, so the «Витрати» of the зміна статку, which
   * keep коригування on their own line, is not read as a second витрачено. Absent when none is.
   */
  readonly corrections?: Money;
  readonly previous: Comparison;
  readonly typical: TypicalComparison;
}

export interface ChangedCategory {
  readonly categoryId: string;
  readonly current: Money;
  readonly previous: Money;
  readonly difference: Money;
  /** When the previous сума was positive — an absent категорія is then −100 %. */
  readonly percent: number | null;
  /** Present in both months, new this month, or absent from it. */
  readonly status: 'changed' | 'new' | 'absent';
}

export interface ChangedCategories {
  readonly currency: CurrencyCode;
  /** `false` when the previous month holds no транзакція in this currency: nothing to compare. */
  readonly comparable: boolean;
  /** Up to three, the largest absolute difference first. */
  readonly rows: readonly ChangedCategory[];
}

export interface PictureReading {
  readonly currency: CurrencyCode;
  /** The six numbers, equal to Місяць's. */
  readonly numbers: MonthlyNumbers;
  readonly incomeAgainstPrevious: Comparison;
}

export type NetWorthReading =
  | { readonly currency: CurrencyCode; readonly status: 'available'; readonly figure: MonthFigure }
  | {
      readonly currency: CurrencyCode;
      /** The history's first month, or a month before any рахунок entered it. */
      readonly status: 'first-month';
      readonly figure?: MonthFigure;
    }
  | { readonly currency: CurrencyCode; readonly status: 'overflow'; readonly figure: MonthFigure };

export interface GoalReading {
  readonly goalId: string;
  readonly name: string;
  /** Per currency of the склад that moved, UAH first; empty when nothing moved. */
  readonly moved: readonly Money[];
}

export interface LimitReading {
  readonly categoryId: string;
  readonly limit: Money;
  readonly spent: Money;
  /** How far over; `null` when the month finished within it. */
  readonly overBy: Money | null;
}

export interface UnansweredReading {
  readonly uncategorised: { readonly count: number; readonly sums: readonly Money[] };
  readonly unsourced: { readonly count: number; readonly sums: readonly Money[] };
  /** Чернетки dated in the month that still wait — stated apart, not part of a чистий місяць. */
  readonly waitingDrafts: number;
  /** No витрата or повернення «Без категорії» and no дохід «Без джерела». */
  readonly clean: boolean;
}

export interface CorrectionReading {
  readonly currency: CurrencyCode;
  readonly count: number;
  /** The коригування's absolute сум added together. */
  readonly total: Money;
  /** The частка in tenths of a percent, rounded toward zero; `null` when витрачено is not positive. */
  readonly shareTenths: number | null;
  /** At or above vision §15's 2 %, judged on the exact ratio. */
  readonly atMeasure: boolean;
}

export interface MonthSummary {
  readonly month: Month;
  /** Every currency some транзакція of the month names, UAH first. */
  readonly currencies: readonly CurrencyCode[];
  readonly spent: readonly SpentReading[];
  readonly changed: readonly ChangedCategories[];
  readonly observations: readonly Observation[];
  readonly picture: readonly PictureReading[];
  readonly netWorth: readonly NetWorthReading[];
  readonly goals: readonly GoalReading[];
  readonly limits: readonly LimitReading[];
  readonly unanswered: UnansweredReading;
  readonly corrections: readonly CorrectionReading[];
}

export interface MonthSummaryInput {
  readonly month: Month;
  readonly today: IsoDate;
  /** The whole stored history — the window and the previous month are read from it. */
  readonly transactions: readonly Transaction[];
  /** Every рахунок, archived included: a переказ is classified by its рахунки' види. */
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly limits: readonly CategoryLimit[];
  readonly goals: readonly AccumulationGoal[];
  /** Чернетки dated in the month that still wait for a word. */
  readonly waitingDrafts: number;
  /** `monthFigures`' own reading, per currency of the статок — the «Статок» screen's. */
  readonly figures: ReadonlyMap<CurrencyCode, readonly MonthFigure[]>;
  readonly answers: readonly AnsweredPair[];
  /** The рахунки linked to monobank, for the можливий дубль. */
  readonly linkedAccountIds: ReadonlySet<string>;
  readonly merchantKeyOf?: MerchantKeyOf;
}

/** The підсумок of `month`, or `null` when the month has none. */
export function monthSummaryOf(input: MonthSummaryInput, ledger?: Ledger): MonthSummary | null {
  const history = ledger ?? ledgerOf(input.transactions, input.today);
  const { month } = input;
  const active = new Set(history.months);
  if (summaryAvailability(month, input.today, active) !== 'available') return null;

  const previous = monthBefore(month);
  const inMonth = history.inMonth(month);
  const inPrevious = history.inMonth(previous);
  const currencies = [...new Set(inMonth.flatMap(currenciesOfTransaction))].sort(byCurrency);
  const names = new Map(input.categories.map((c) => [c.id, c.name]));

  const picture = monthlyPicture({ month, accounts: input.accounts, transactions: inMonth });
  const previousPicture = monthlyPicture({ month: previous, accounts: input.accounts, transactions: inPrevious });
  const breakdown = categoryBreakdown({ month, transactions: inMonth });
  const zero = (currency: CurrencyCode) => money(0, currency);
  const spentOf = (currency: CurrencyCode) => picture.get(currency)?.spent ?? zero(currency);

  const spent: SpentReading[] = currencies.map((currency) => {
    const amount = spentOf(currency);
    const window = windowOf(history, month, currency);
    let typical: TypicalComparison;
    if (!window) {
      typical = { status: 'too-little-history' };
    } else {
      const median = typicalSpentOf(history, window, currency);
      typical =
        median.amount > 0
          ? { status: 'available', months: window.length, ...compare(median, amount) }
          : { status: 'not-positive' };
    }
    // The коригування `categoryBreakdown` counts into витрачено, by size.
    const inside = breakdown.get(currency)?.get(CORRECTION_CATEGORY_ID);
    return {
      currency,
      spent: amount,
      ...(inside && inside.amount > 0 ? { corrections: inside } : {}),
      previous: compare(previousPicture.get(currency)?.spent ?? zero(currency), amount),
      typical,
    };
  });

  const changed = currencies.map((currency) =>
    changedCategoriesOf(currency, inMonth, inPrevious, month, previous, names),
  );

  const pictureReadings: PictureReading[] = currencies.flatMap((currency) => {
    const numbers = picture.get(currency);
    if (!numbers) return [];
    return [
      {
        currency,
        numbers,
        incomeAgainstPrevious: compare(previousPicture.get(currency)?.income ?? zero(currency), numbers.income),
      },
    ];
  });

  const netWorth: NetWorthReading[] = [...input.figures.keys()].sort(byCurrency).map((currency) => {
    const figure = input.figures.get(currency)!.find((f) => f.month === month);
    if (!figure) return { currency, status: 'first-month' };
    if (figure.change.status === 'available') return { currency, status: 'available', figure };
    return figure.change.reason === 'no-baseline'
      ? { currency, status: 'first-month', figure }
      : { currency, status: 'overflow', figure };
  });

  const goals: GoalReading[] = input.goals.map((goal) => ({
    goalId: goal.id,
    name: goal.name,
    moved: [...compositionBalanceChange(inMonth, goal.accountIds, month).values()]
      .filter((m) => m.amount !== 0)
      .sort((a, b) => byCurrency(a.currency, b.currency)),
  }));

  const limits: LimitReading[] = [...input.limits]
    .sort((a, b) => compareText(names.get(a.categoryId) ?? a.categoryId, names.get(b.categoryId) ?? b.categoryId))
    .map((limit) => {
      const amount = spendingGoalSpent({ breakdown, limit });
      return { categoryId: limit.categoryId, limit: limit.amount, spent: amount, overBy: overLimitBy(amount, limit.amount) };
    });

  const observations = observationsIn(history, {
    month,
    categories: input.categories,
    answers: input.answers,
    linkedAccountIds: input.linkedAccountIds,
    ...(input.merchantKeyOf ? { merchantKeyOf: input.merchantKeyOf } : {}),
  });

  return {
    month,
    currencies,
    spent,
    changed,
    observations,
    picture: pictureReadings,
    netWorth,
    goals,
    limits,
    unanswered: unansweredOf(inMonth, input.waitingDrafts),
    corrections: currencies.map((currency) => correctionsOf(currency, inMonth, spentOf(currency))),
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The категорії a month has витрати or повернення of in one currency — present, whatever the net. */
function presentIn(transactions: readonly Transaction[], currency: CurrencyCode): Set<string> {
  const present = new Set<string>();
  for (const t of transactions) {
    if ((t.type === 'expense' || t.type === 'refund') && t.amount.currency === currency) present.add(t.categoryId);
  }
  return present;
}

/** How many категорії «Найбільше змінилися» names. */
export const CHANGED_CATEGORIES = 3;

function changedCategoriesOf(
  currency: CurrencyCode,
  inMonth: readonly Transaction[],
  inPrevious: readonly Transaction[],
  month: Month,
  previous: Month,
  names: ReadonlyMap<string, string>,
): ChangedCategories {
  const comparable = inPrevious.some((t) => currenciesOfTransaction(t).includes(currency));
  if (!comparable) return { currency, comparable, rows: [] };

  const now = categoryBreakdown({ month, transactions: inMonth }).get(currency) ?? new Map<string, Money>();
  const before = categoryBreakdown({ month: previous, transactions: inPrevious }).get(currency) ?? new Map<string, Money>();
  const presentNow = presentIn(inMonth, currency);
  const presentBefore = presentIn(inPrevious, currency);

  const rows: ChangedCategory[] = [];
  for (const categoryId of new Set([...presentNow, ...presentBefore])) {
    if (categoryId === CORRECTION_CATEGORY_ID || categoryId === UNCATEGORISED_CATEGORY_ID) continue;
    const current = now.get(categoryId) ?? money(0, currency);
    const earlier = before.get(categoryId) ?? money(0, currency);
    const difference = current.amount - earlier.amount;
    if (difference === 0) continue;
    const status = !presentBefore.has(categoryId) ? 'new' : !presentNow.has(categoryId) ? 'absent' : 'changed';
    rows.push({
      categoryId,
      current,
      previous: earlier,
      difference: money(difference, currency),
      percent: earlier.amount > 0 ? changePercentOf(earlier, current) : null,
      status,
    });
  }
  const nameOf = (id: string) => names.get(id) ?? id;
  rows.sort(
    (a, b) =>
      Math.abs(b.difference.amount) - Math.abs(a.difference.amount) ||
      compareText(nameOf(a.categoryId), nameOf(b.categoryId)) ||
      compareText(a.categoryId, b.categoryId),
  );
  return { currency, comparable, rows: rows.slice(0, CHANGED_CATEGORIES) };
}

function unansweredOf(inMonth: readonly Transaction[], waitingDrafts: number): UnansweredReading {
  let uncategorised = 0;
  let unsourced = 0;
  const uncategorisedSums = new Map<CurrencyCode, number>();
  const unsourcedSums = new Map<CurrencyCode, number>();
  for (const t of inMonth) {
    // The same predicates as `transactionsRepo` and `unansweredIn` (design D7).
    if ((t.type === 'expense' || t.type === 'refund') && t.categoryId === UNCATEGORISED_CATEGORY_ID) {
      uncategorised += 1;
      const signed = t.type === 'expense' ? t.amount.amount : -t.amount.amount;
      uncategorisedSums.set(t.amount.currency, (uncategorisedSums.get(t.amount.currency) ?? 0) + signed);
    } else if (t.type === 'income' && t.sourceId === UNSOURCED_SOURCE_ID) {
      unsourced += 1;
      unsourcedSums.set(t.amount.currency, (unsourcedSums.get(t.amount.currency) ?? 0) + t.amount.amount);
    }
  }
  const sums = (byCurrencyMap: Map<CurrencyCode, number>) =>
    [...byCurrencyMap].sort(([a], [b]) => byCurrency(a, b)).map(([currency, amount]) => money(amount, currency));
  return {
    uncategorised: { count: uncategorised, sums: sums(uncategorisedSums) },
    unsourced: { count: unsourced, sums: sums(unsourcedSums) },
    waitingDrafts,
    clean: uncategorised === 0 && unsourced === 0,
  };
}

function correctionsOf(currency: CurrencyCode, inMonth: readonly Transaction[], spent: Money): CorrectionReading {
  let count = 0;
  let total = 0;
  for (const t of inMonth) {
    if (t.type === 'correction' && t.amount.currency === currency) {
      count += 1;
      total += Math.abs(t.amount.amount);
    }
  }
  const positive = spent.amount > 0;
  return {
    currency,
    count,
    total: money(total, currency),
    // Toward zero, so a частка just under 2 % never reads «2,0 %».
    shareTenths: positive ? Number((BigInt(total) * 1000n) / BigInt(spent.amount)) : null,
    atMeasure: positive && BigInt(total) * 10000n >= BigInt(CORRECTION_MEASURE_BP) * BigInt(spent.amount),
  };
}
