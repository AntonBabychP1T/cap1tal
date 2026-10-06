import { isoDate, type IsoDate } from './transaction';

/**
 * A дата in the owner's words, as running text says it (app-shell, "A дата in running text is a
 * day and a month in words"). Pure and clock-free, so the screens (`src/ui/dates.ts`) and the
 * досягнення catalogue (`src/progress`) say a day the same way without `src/progress` reaching
 * into `src/ui`.
 */

/**
 * The twelve months in the genitive, as a day names its month: «30 серпня». The nominative list
 * in `src/ui/months.ts` names a month on its own — «Серпень 2026» — and the two are different
 * words, so neither can be derived from the other.
 */
export const GENITIVE_MONTHS: readonly string[] = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

/** The month numbered 1–12 in the genitive — «вересня». */
export function genitiveMonthName(month: number): string {
  return GENITIVE_MONTHS[month - 1]!;
}

/**
 * «30 серпня», and «30 серпня 2025» once the year is not the year of `today` — the caller's own
 * calendar day, so which year counts as "this one" is the caller's and a test can say it.
 */
export function dayInWords(date: IsoDate, today: IsoDate): string {
  const [year, month, day] = isoDate(date).split('-');
  const named = `${Number(day)} ${genitiveMonthName(Number(month))}`;
  return year === today.slice(0, 4) ? named : `${named} ${year}`;
}
