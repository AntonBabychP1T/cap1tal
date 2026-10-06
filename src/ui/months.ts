import { monthOf, type IsoDate, type Month } from '../domain/transaction';
import { genitiveMonthName, todayIso } from './dates';

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
 * The months Місяць's arrows can reach: from the month of the first recorded транзакція to the
 * later of the current month and the month of the last one. The current month is always inside —
 * with nothing recorded it is the only one, and a record dated only ahead of it still leaves it
 * the first.
 *
 * Why bounds at all (QA 2026-09-29): «назад» had none and walked into January 2024 on a phone whose
 * history starts later — month after empty month claiming to be a picture — while a транзакція
 * dated after the current month showed on Головний yet lay past the far edge, unreachable. The
 * recording forms now ask before a future дата and refuse one more than a year ahead
 * (`entryDateCheck`), so the forward stretch is short; but what is recorded must be reachable.
 *
 * `recorded` is the earliest and latest дата in storage (`transactions.recordedSpan()`), read once
 * — two dates, never the history.
 */
export interface ReachableMonths {
  readonly first: Month;
  readonly last: Month;
}

export function reachableMonths(
  recorded: { readonly earliest: IsoDate; readonly latest: IsoDate } | undefined,
  now: Date,
): ReachableMonths {
  const current = currentMonth(now);
  if (!recorded) {
    return { first: current, last: current };
  }
  const first = monthOf(recorded.earliest);
  const last = monthOf(recorded.latest);
  return { first: first < current ? first : current, last: last > current ? last : current };
}

/**
 * Whether stepping forward from `month` stays inside what can be reached. The screen asks this to
 * decide whether the control is live: past the edge a month has no transactions to show and would
 * be a screen full of zeroes claiming to be a picture.
 *
 * Without `reach` the edge is the current month, which is what it always was before records dated
 * ahead of it became reachable.
 */
export function canStepForward(month: Month, now: Date, reach?: ReachableMonths): boolean {
  return nextMonth(month) <= (reach?.last ?? currentMonth(now));
}

/**
 * The forward step, clamped. The screen already disables the control at the edge; this is what
 * makes the clamp true rather than merely offered.
 */
export function stepForward(month: Month, now: Date, reach?: ReachableMonths): Month {
  return canStepForward(month, now, reach) ? nextMonth(month) : month;
}

/** Whether stepping back from `month` stays at or after the month of the first record. */
export function canStepBack(month: Month, reach: ReachableMonths): boolean {
  return prevMonth(month) >= reach.first;
}

/** The back step, clamped at the month of the first record, as `stepForward` is at the far edge. */
export function stepBack(month: Month, reach: ReachableMonths): Month {
  return canStepBack(month, reach) ? prevMonth(month) : month;
}

/** «Серпень 2026». Hardcoded rather than `Intl`, so Vitest on Node and Hermes cannot disagree. */
export function monthLabel(month: Month): string {
  const { year, month: m } = partsOf(month);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

/**
 * The twelve in the locative, as a month is named *in* it: «у вересні». The nominative list above
 * cannot be bent into this by rule — Ukrainian changes the stem («Березень» → «березні»,
 * «Листопад» → «листопаді») — so the forms are written out, like the two lists around them.
 */
const MONTH_NAMES_IN: readonly string[] = [
  'січні',
  'лютому',
  'березні',
  'квітні',
  'травні',
  'червні',
  'липні',
  'серпні',
  'вересні',
  'жовтні',
  'листопаді',
  'грудні',
];

/**
 * «у вересні» — the month as part of a sentence about it, for the Головний heading «Залишилось у
 * вересні». No year: Головний shows the current month and nothing else, and «у вересні 2026» in a
 * heading reads like a report about a month that is over.
 */
export function monthInLabel(month: Month): string {
  const { month: m } = partsOf(month);
  return `у ${MONTH_NAMES_IN[m - 1]}`;
}

/**
 * «у вересні 2026» — the month and its year as part of a sentence about it: «У вересні 2026 ще 9
 * записів…». Unlike `monthInLabel` it carries the year, because the month it names is over and
 * may be any of the past ones.
 */
export function monthInYearLabel(month: Month): string {
  const { year, month: m } = partsOf(month);
  return `у ${MONTH_NAMES_IN[m - 1]} ${year}`;
}

/**
 * «вересень 2026» — the month and its year as the object of a verb: «Закрий вересень 2026». A month
 * name is inanimate, so its accusative is the nominative, in lower case inside a sentence.
 */
export function monthAccusativeYearLabel(month: Month): string {
  return `${monthAccusativeLabel(month)} ${partsOf(month).year}`;
}

/**
 * «вересня» — the month as what a thing belongs to: «Підсумок вересня», «AI-аналіз вересня», «за
 * 10 днів жовтня». The genitive list is `dates.ts`'s, the one a day names its month with, so the
 * two can never spell one month two ways.
 */
export function monthGenitiveLabel(month: Month): string {
  return genitiveMonthName(partsOf(month).month);
}

/**
 * «вересень» — the month as the object of «за весь …». A month name is inanimate, so its
 * accusative is the nominative, written in lower case inside a sentence.
 */
export function monthAccusativeLabel(month: Month): string {
  return MONTH_NAMES[partsOf(month).month - 1]!.toLowerCase();
}

/**
 * What a `MonthStepper` offers beside the місяць it holds (app-shell, "A дата or a місяць the owner
 * sets is set with the app's own control"): the місяць in words — «вересень 2026», lower case, as it
 * reads inside a range «липень 2026 — вересень 2026» — a step back always, and a step forward only
 * while it stays at or before the current month. Pure, like `dateStepOffers`, so which steps stand
 * is proven by `verify`; the control draws them and decides nothing.
 */
export interface MonthStepOffers {
  readonly label: string;
  readonly back: Month;
  /** Absent at the current month: no end of a range can be a month after it. */
  readonly forward?: Month;
}

export function monthStepOffers(month: Month, now: Date): MonthStepOffers {
  return {
    label: monthAccusativeYearLabel(month),
    back: prevMonth(month),
    ...(canStepForward(month, now) ? { forward: nextMonth(month) } : {}),
  };
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
