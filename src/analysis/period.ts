import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import { nextMonth, prevMonth } from '../ui/months';

/**
 * Which calendar months a пакет для аналізу is about, and whether they hold enough to read a
 * trend from.
 *
 * A period is whole calendar months and nothing else (vision §8): the month is the unit every
 * number of the пакет is computed over, and a period ending mid-month would compare a fortnight
 * against a month and call the difference a change. The month the пакет is built in is the one
 * exception, and it is not an exception to the rule but a label on it — it is in the period, whole,
 * and marked as partial with the days elapsed, so a reader (and the assistant) knows the last
 * column is not finished.
 *
 * The day is an input. Nothing here reads a clock, so a test can say what day it is and the same
 * stored state always builds the same пакет.
 */

/** What the screen offers as a period, before it is resolved against the day. */
export type PeriodChoice =
  | 'this-month'
  | { readonly lastMonths: 3 | 6 | 12 }
  | { readonly from: Month; readonly to: Month };

export interface AnalysisPeriod {
  readonly calendar: 'calendar-month';
  /** Inclusive, `'YYYY-MM'`. */
  readonly from: Month;
  readonly to: Month;
  readonly months: number;
  /** The month `builtOn` falls in, when it lies inside the period. */
  readonly partialMonth: {
    readonly month: Month;
    readonly daysElapsed: number;
    readonly daysInMonth: number;
  } | null;
}

/** Why a пакет was not built. The one refusal the builder itself can answer with. */
export interface AnalysisRefusal {
  readonly kind: 'empty-period';
}

/** What the history of a period comes to, once the транзакції are counted against it. */
export interface HistoryOfPeriod {
  /** 'short' when fewer than two months of the period hold транзакції. */
  readonly history: 'short' | 'sufficient';
  readonly monthsWithData: number;
}

const MONTH = /^(\d{4})-(\d{2})$/;

/**
 * The days a calendar month has. The domain has this rule too, privately, inside `isoDate`
 * (`src/domain/transaction.ts`); it is written out again rather than exported from there because
 * exporting it would widen the domain's surface for a reason that is not the domain's — this is a
 * label on a partial month, not a money rule. `reports.ts` makes the same trade with its own
 * `nextMonth`, and `monthly.ts` with its own `byMonth`: six lines, kept local, over a domain export
 * nothing in the domain needs.
 */
export function daysInMonth(month: Month): number {
  const { year, month: m } = partsOf(month);
  if (m === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function partsOf(month: Month): { year: number; month: number } {
  const match = MONTH.exec(month);
  if (!match) {
    throw new Error(`month must be YYYY-MM, got "${month}"`);
  }
  const parts = { year: Number(match[1]), month: Number(match[2]) };
  if (parts.month < 1 || parts.month > 12) {
    throw new Error(`not a calendar month: "${month}"`);
  }
  return parts;
}

/**
 * Whether this text is a calendar month at all — total, and the one question that may be asked of
 * a string the owner is still typing.
 *
 * Everything else in this file speaks of months as `'YYYY-MM'` and throws at anything that is not
 * one, which is right for a programming error and wrong for a half-typed field: «2026-0» is not a
 * broken month, it is a month with one more keystroke to go. The screen asks this first, so a
 * partial month is a sentence the owner reads and never an exception (`ai-analysis-screen.ts`).
 */
export function isMonth(value: string): boolean {
  const match = MONTH.exec(value);
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/**
 * Whether a custom range is one the screen must refuse: a range that ends before it starts.
 *
 * Asked by the screen before anything is built, so the refusal is a sentence the owner reads and
 * never an exception — `resolvePeriod` throws on such a range precisely because the screen has
 * already asked this and no other caller may pass one.
 *
 * Months are `'YYYY-MM'`, which sort lexicographically in calendar order, so this is a string
 * comparison and no `Date` is built from a month.
 */
export function refusesRange(from: Month, to: Month): boolean {
  partsOf(from);
  partsOf(to);
  return to < from;
}

/**
 * The choice and the day the пакет is built for, as the period it means.
 *
 * «Останні 3 місяці» on 2026-09-01 is July through September — the month in progress and the two
 * finished ones before it — and September is marked partial with 1 of 30 days elapsed. Counting
 * back three *finished* months instead would answer a question nobody asked on the 1st and would
 * hide the month the owner is actually living in.
 */
export function resolvePeriod(choice: PeriodChoice, builtOn: IsoDate): AnalysisPeriod {
  const currentMonth = monthOf(builtOn);
  let from: Month;
  let to: Month;

  if (choice === 'this-month') {
    from = currentMonth;
    to = currentMonth;
  } else if ('lastMonths' in choice) {
    to = currentMonth;
    from = currentMonth;
    for (let step = 1; step < choice.lastMonths; step += 1) {
      from = prevMonth(from);
    }
  } else {
    if (refusesRange(choice.from, choice.to)) {
      throw new Error(`a range ends after it starts, got ${choice.from}..${choice.to}`);
    }
    from = choice.from;
    to = choice.to;
  }

  const months = monthsOfPeriod({ from, to });
  const partial = months.includes(currentMonth)
    ? {
        month: currentMonth,
        // The day itself counts as elapsed: on the 1st, one day of the month has happened.
        daysElapsed: Number(builtOn.slice(8, 10)),
        daysInMonth: daysInMonth(currentMonth),
      }
    : null;

  return { calendar: 'calendar-month', from, to, months: months.length, partialMonth: partial };
}

/**
 * Every month of the period, in calendar order, none missing — the series the пакет carries has
 * no holes, so a month in which nothing moved is present at zero rather than absent. A time axis
 * with a month left out reads as a month that was not lived.
 */
export function monthsOfPeriod(period: { readonly from: Month; readonly to: Month }): Month[] {
  if (refusesRange(period.from, period.to)) {
    throw new Error(`a range ends after it starts, got ${period.from}..${period.to}`);
  }
  const months: Month[] = [];
  for (let month = period.from; month <= period.to; month = nextMonth(month)) {
    months.push(month);
  }
  return months;
}

/**
 * What the период actually holds: how many of its months carry a транзакція, and whether that is
 * enough to read a trend from.
 *
 * A period with nothing in it builds no пакет at all — a пакет of zeros would be a page of numbers
 * that all say the same nothing, and every change in it would be `null` anyway. One month is
 * built, and marked `short`: a single month's picture is still worth explaining, and the file says
 * so rather than letting a reader draw a line through one point.
 */
export function historyOf(
  period: AnalysisPeriod,
  transactions: readonly Transaction[],
): HistoryOfPeriod | AnalysisRefusal {
  const months = new Set(monthsOfPeriod(period));
  const withData = new Set<Month>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    if (months.has(month)) {
      withData.add(month);
    }
  }
  if (withData.size === 0) {
    return { kind: 'empty-period' };
  }
  return {
    history: withData.size < 2 ? 'short' : 'sufficient',
    monthsWithData: withData.size,
  };
}
