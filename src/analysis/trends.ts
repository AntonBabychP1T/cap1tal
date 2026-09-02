import type { Category } from '../domain/category';
import type { CurrencyCode, Money } from '../domain/money';
import { categoryBreakdown } from '../domain/monthly-picture';
import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import {
  averageMinor,
  changeBp,
  decimalOf,
  minorUnitsOf,
  type Amount,
  type BasisPoints,
} from './decimal';
import { anchorOf, type Anchor, type CategoryReport } from './categories';
import { byMonth } from './monthly';
import { monthsOfPeriod, type AnalysisPeriod } from './period';

/**
 * The тренди of a пакет: what grew, what fell, what was large and what comes back every month —
 * all of it computed here, deterministically, before any assistant sees the file.
 *
 * That is the whole point of this module. «Which категорія grew most» is arithmetic, and an
 * assistant asked to do arithmetic invents; asked to explain an answer it was given, it explains.
 * So the пакет hands over the ranking, and the file's instructions forbid recomputing it.
 */

/**
 * The caps, and the rule for «recurring», stated once — proposal §20 names them as the owner's to
 * overturn, and overturning them is editing these five constants.
 *
 * Five is what fits in a paragraph an assistant writes about a month: a list of twenty largest
 * категорії is the table again, not a reading of it. Twenty merchants is larger because merchants
 * are the finer grain the owner opted into and the answer they are opted in for («which shops
 * drive Кафе») needs more than five rows to be worth the опис leaving the phone.
 */
export const LARGEST_CATEGORIES = 5;
export const LARGEST_CHANGES = 5;
export const NOTABLE_EXPENSES = 5;
export const MERCHANTS = 20;

/**
 * How near the median a витрата has to be to count as «the same сума again»: 15 %. Rent and a
 * subscription vary by a few percent; groceries vary by half. Fifteen per cent is wide enough for
 * a utility bill that follows the weather and narrow enough that «Продукти» — different every
 * week — does not come out as a recurring payment.
 */
export const RECURRING_TOLERANCE_BP = 1500;

/**
 * How many months of the period have to hold such a витрата: two thirds of them, and never fewer
 * than three. Two thirds lets one missed month (a holiday, a payment made early) pass without
 * denying a rent that plainly recurs; three is the floor because two points make a line out of a
 * coincidence, and a period shorter than three months therefore has no recurring candidates at all.
 */
export const RECURRING_MONTHS_NUMERATOR = 2;
export const RECURRING_MONTHS_DENOMINATOR = 3;
export const RECURRING_MONTHS_FLOOR = 3;

/** The same defensive fallback `categories.ts` uses: a назва, never the id the spec forbids. */
const UNNAMED = 'Без назви';

export interface CategoryChange extends Anchor {
  readonly name: string;
  readonly before: Amount;
  readonly after: Amount;
  readonly change: BasisPoints;
}

export interface NotableExpense {
  readonly amount: Amount;
  readonly category: string;
  readonly month: Month;
  /** Only when individual транзакції are included — otherwise the month is as near as it gets. */
  readonly date?: IsoDate;
  /** Only when описи are included. */
  readonly description?: string;
}

export interface RecurringCandidate {
  readonly category: string;
  readonly typicalAmount: Amount;
  readonly monthsHit: number;
  readonly monthsInPeriod: number;
}

export interface Trends {
  readonly largestCategories: readonly {
    readonly name: string;
    readonly total: Amount;
    readonly share: BasisPoints | null;
  }[];
  readonly largestIncreases: readonly CategoryChange[];
  readonly largestDecreases: readonly CategoryChange[];
  readonly notable: readonly NotableExpense[];
  readonly recurring: readonly RecurringCandidate[];
}

/** How many months of a period must hold a similar сума before it is called recurring. */
export function recurringThreshold(monthsInPeriod: number): number {
  const twoThirds = Math.ceil(
    (RECURRING_MONTHS_NUMERATOR * monthsInPeriod) / RECURRING_MONTHS_DENOMINATOR,
  );
  return Math.max(RECURRING_MONTHS_FLOOR, twoThirds);
}

/**
 * The middle сума of a list. An even count takes the mean of the two middle ones, rounded half
 * away from zero like every other mean in the пакет — a median that picked «the lower of the two»
 * would answer a different question for an even number of months than for an odd one.
 */
export function medianOf(amounts: readonly Money[]): Money {
  const sorted = [...amounts].sort((a, b) => a.amount - b.amount);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : averageMinor([sorted[middle - 1]!, sorted[middle]!]);
}

/**
 * Whether one сума per month, over the months that had one, is the same сума coming back — and
 * what that сума typically is.
 *
 * Shared with `details.ts`, which asks it of a merchant instead of a категорія: «recurring» is one
 * rule in the пакет, not two that could drift apart.
 *
 * In BigInt, because the tolerance test multiplies a сума by 10 000.
 */
export function recurrenceOf(
  largestPerMonth: readonly Money[],
  monthsInPeriod: number,
): { readonly typicalAmount: Money; readonly monthsHit: number } | null {
  if (largestPerMonth.length === 0) {
    return null;
  }
  const median = medianOf(largestPerMonth);
  const tolerance = (BigInt(Math.abs(median.amount)) * BigInt(RECURRING_TOLERANCE_BP)) / 10000n;
  const monthsHit = largestPerMonth.filter((m) => {
    const distance = BigInt(Math.abs(m.amount - median.amount));
    return distance <= tolerance;
  }).length;

  return monthsHit >= recurringThreshold(monthsInPeriod) ? { typicalAmount: median, monthsHit } : null;
}

/**
 * The largest single витрата of each key in each month — what «recurring» is measured over.
 *
 * The largest one and not the sum: rent is one payment a month, and a month in which the owner
 * also bought a lamp under «Житло» must not read as a rent that went up.
 *
 * `expense` only. A повернення would net a purchase away, a коригування is unexplained money and
 * not a purchase at all, and neither is something that «recurs» in any sense the owner means.
 *
 * Keyed by whatever the caller says: the категорія here, the folded опис in `details.ts`, so a
 * recurring merchant and a recurring категорія are found the one way.
 */
export function largestPerMonthByKey(input: {
  readonly transactions: readonly Transaction[];
  readonly months: readonly Month[];
  readonly currency: CurrencyCode;
  readonly keyOf: (t: Extract<Transaction, { type: 'expense' }>) => string | null;
}): Map<string, Money[]> {
  const months = new Set(input.months);
  const largest = new Map<string, Map<Month, Money>>();

  for (const t of input.transactions) {
    if (t.type !== 'expense' || t.amount.currency !== input.currency) continue;
    const month = monthOf(t.date);
    if (!months.has(month)) continue;
    const key = input.keyOf(t);
    if (key === null) continue;

    const perMonth = largest.get(key) ?? new Map<Month, Money>();
    const seen = perMonth.get(month);
    if (!seen || t.amount.amount > seen.amount) {
      perMonth.set(month, t.amount);
    }
    largest.set(key, perMonth);
  }

  // In the period's own month order, so the median never depends on the order rows were read in.
  return new Map(
    [...largest].map(([key, perMonth]) => [
      key,
      input.months.flatMap((month) => (perMonth.has(month) ? [perMonth.get(month)!] : [])),
    ]),
  );
}

export function trendsOf(input: {
  readonly period: AnalysisPeriod;
  readonly currency: CurrencyCode;
  readonly transactions: readonly Transaction[];
  readonly categories: readonly Category[];
  /** Already computed, already sorted largest first — the trends rank what the table holds. */
  readonly categoryReports: readonly CategoryReport[];
  readonly included: { readonly descriptions: boolean; readonly transactions: boolean };
}): Trends {
  const months = monthsOfPeriod(input.period);
  const anchor = anchorOf(input.period);
  const grouped = byMonth(input.transactions);
  const nameOf = new Map(input.categories.map((category) => [category.id, category.name]));

  const breakdownAt = (month: Month): ReadonlyMap<string, Money> =>
    categoryBreakdown({ month, transactions: grouped.get(month) ?? [] }).get(input.currency) ??
    new Map<string, Money>();
  const before = breakdownAt(anchor.from);
  const after = breakdownAt(anchor.to);

  // Only категорії the two months compared both hold: a категорія that was not there last month
  // did not grow, it appeared, and a change against nothing is not a number (`changeBp` says so).
  const changes: CategoryChange[] = [];
  for (const [categoryId, earlier] of before) {
    const later = after.get(categoryId);
    if (!later) continue;
    const change = changeBp(earlier, later);
    if (change === null) continue;
    changes.push({
      ...anchor,
      name: nameOf.get(categoryId) ?? UNNAMED,
      before: decimalOf(earlier),
      after: decimalOf(later),
      change,
    });
  }
  // Ties broken by назва, so the same state always ranks the same way.
  const byChange = (a: CategoryChange, b: CategoryChange, sign: number): number =>
    a.change !== b.change ? sign * (b.change - a.change) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

  const notable = [...input.transactions]
    .filter(
      (t): t is Extract<Transaction, { type: 'expense' }> =>
        // Витрати only: a повернення is money coming back and a коригування is unexplained money,
        // and «the largest thing you bought» is neither of them.
        t.type === 'expense' &&
        t.amount.currency === input.currency &&
        months.includes(monthOf(t.date)),
    )
    .sort(
      (a, b) =>
        b.amount.amount - a.amount.amount ||
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0),
    )
    .slice(0, NOTABLE_EXPENSES)
    .map((t) => ({
      amount: decimalOf(t.amount),
      category: nameOf.get(t.categoryId) ?? UNNAMED,
      month: monthOf(t.date),
      ...(input.included.transactions ? { date: t.date } : {}),
      ...(input.included.descriptions && t.description ? { description: t.description } : {}),
    }));

  const recurring: RecurringCandidate[] = [];
  for (const [categoryId, largest] of largestPerMonthByKey({
    transactions: input.transactions,
    months,
    currency: input.currency,
    keyOf: (t) => t.categoryId,
  })) {
    const recurrence = recurrenceOf(largest, months.length);
    if (recurrence) {
      recurring.push({
        category: nameOf.get(categoryId) ?? UNNAMED,
        typicalAmount: decimalOf(recurrence.typicalAmount),
        monthsHit: recurrence.monthsHit,
        monthsInPeriod: months.length,
      });
    }
  }

  return {
    largestCategories: input.categoryReports
      .slice(0, LARGEST_CATEGORIES)
      .map(({ name, total, share }) => ({ name, total, share })),
    largestIncreases: changes
      .filter((c) => c.change > 0)
      .sort((a, b) => byChange(a, b, 1))
      .slice(0, LARGEST_CHANGES),
    largestDecreases: changes
      .filter((c) => c.change < 0)
      .sort((a, b) => byChange(a, b, -1))
      .slice(0, LARGEST_CHANGES),
    notable,
    // Largest typical сума first — the rent before the subscription. Through `minorUnitsOf`,
    // which is the one place a сума of the пакет is read back and the one that validates its shape.
    recurring: recurring.sort(
      (a, b) =>
        minorUnitsOf(b.typicalAmount).amount - minorUnitsOf(a.typicalAmount).amount ||
        (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
    ),
  };
}
