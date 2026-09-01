import { monthOf, type IsoDate, type Month } from '../domain/transaction';
import { todayIso } from './dates';

/**
 * Moving between calendar months, and naming them in Ukrainian. Pure string arithmetic over
 * `'YYYY-MM'`: no `Date` is constructed from a month, so no timezone can shift one, and
 * `'YYYY-MM'` sorts lexicographically in calendar order, so comparing two months is comparing
 * two strings.
 *
 * The clock is passed in — nothing below the screen reads one (rules/domain.md).
 */

const MONTH = /^(\d{4})-(\d{2})$/;

/** The twelve names in the nominative, as a month is named on its own: «Серпень 2026». */
const MONTH_NAMES: readonly string[] = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

interface Parts {
  readonly year: number;
  /** 1–12, as the string carries it — not JavaScript's 0–11. */
  readonly month: number;
}

function partsOf(month: Month): Parts {
  const match = MONTH.exec(month);
  if (!match) {
    throw new Error(`month must be YYYY-MM, got "${month}"`);
  }
  const parsed = { year: Number(match[1]), month: Number(match[2]) };
  if (parsed.month < 1 || parsed.month > 12) {
    throw new Error(`not a calendar month: "${month}"`);
  }
  return parsed;
}

function format({ year, month }: Parts): Month {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * The month the device clock is in, derived from the same local parts as `todayIso` — literally
 * from it, so the two can never disagree. Building it from `toISOString()` would put an expense
 * recorded at 01:00 on the 1st of August into July, in the very screen that is supposed to explain
 * where August's money went.
 */
export function currentMonth(now: Date): Month {
  return monthOf(todayIso(now));
}

export function prevMonth(month: Month): Month {
  const { year, month: m } = partsOf(month);
  return m === 1 ? format({ year: year - 1, month: 12 }) : format({ year, month: m - 1 });
}

export function nextMonth(month: Month): Month {
  const { year, month: m } = partsOf(month);
  return m === 12 ? format({ year: year + 1, month: 1 }) : format({ year, month: m + 1 });
}

/**
 * Whether stepping forward from `month` stays at or before the current one. The screen asks this
 * to decide whether to offer the control at all: the current month is the far edge, and a
 * disabled-looking button that does nothing is worse than no button.
 */
export function canStepForward(month: Month, now: Date): boolean {
  return nextMonth(month) <= currentMonth(now);
}

/**
 * The forward step, clamped. The screen already hides the control at the edge; this is what makes
 * the clamp true rather than merely offered — a month in the future has no transactions to show
 * and would be a screen full of zeroes claiming to be a picture.
 */
export function stepForward(month: Month, now: Date): Month {
  return canStepForward(month, now) ? nextMonth(month) : month;
}

/** «Серпень 2026». Hardcoded rather than `Intl`, so Vitest on Node and Hermes cannot disagree. */
export function monthLabel(month: Month): string {
  const { year, month: m } = partsOf(month);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

/**
 * The same twelve, shortened — the standard three-letter Ukrainian abbreviations. A chart puts a
 * label under every month of a whole history, and «Серпень 2026» under each of twenty-four of them
 * is a wall of text rather than a time axis.
 */
const SHORT_MONTH_NAMES: readonly string[] = [
  'Січ',
  'Лют',
  'Бер',
  'Кві',
  'Тра',
  'Чер',
  'Лип',
  'Сер',
  'Вер',
  'Жов',
  'Лис',
  'Гру',
];

/** «Сер 2026» — the month and its year, short enough to sit under a bar. */
export function shortMonthLabel(month: Month): string {
  const { year, month: m } = partsOf(month);
  return `${SHORT_MONTH_NAMES[m - 1]} ${year}`;
}

/**
 * The місяці the stored транзакції actually touch, newest first — what «Транзакції» offers as its
 * місяць narrowing. Derived from the data and never from the calendar: a month the owner has
 * nothing in is a filter that can only ever produce «нічого не знайдено», and a month older than
 * any fixed window would be unreachable.
 */
export function monthsOf(transactions: readonly { readonly date: IsoDate }[]): Month[] {
  return [...new Set(transactions.map((t) => monthOf(t.date)))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
}
