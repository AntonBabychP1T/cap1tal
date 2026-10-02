import { isoDate, type IsoDate } from '../domain/transaction';
import { Refusal } from '../domain/refusal';

/**
 * The device clock's calendar date. Built from the LOCAL parts, never from `toISOString()`: a
 * transaction recorded at 01:00 in Kyiv is dated that day, not the previous one in UTC. The
 * domain never reads a clock — `now` is passed in, per rules/domain.md.
 */
export function todayIso(now: Date): IsoDate {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return isoDate(`${year}-${month}-${day}`);
}

/**
 * The calendar date of an instant on this device — epoch milliseconds in, `IsoDate` out.
 *
 * The inverse of `startOfLocalDayMs`, and local for the same reason: a purchase at 01:00 in Kyiv
 * belongs to that day, not to the previous one in UTC. It is what both importers date their
 * транзакції by — monobank's statement items, which carry epoch seconds, and the notifications
 * the phone captures, which carry epoch milliseconds — so the two can never disagree about which
 * day the money moved.
 */
export function dateOfEpochMs(ms: number): IsoDate {
  return todayIso(new Date(ms));
}

/**
 * The instant a calendar date begins on this device — the first-sync boundary turned into the
 * cursor sync starts from. Built from the local parts for the same reason `todayIso` is: the
 * owner says «з 28 серпня», and that means midnight where they are, not midnight in UTC. An
 * hours-long shift either way would silently include or drop a whole evening of транзакції.
 *
 * The boundary is inclusive: an item at exactly this millisecond is imported, because window ends
 * are inclusive in `planWindows` too.
 */
export function startOfLocalDayMs(date: IsoDate): number {
  const [year, month, day] = isoDate(date).split('-');
  return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0).getTime();
}

/**
 * The twelve months in the genitive, as a day names its month: «30 серпня». The nominative list
 * in `./months` names a month on its own — «Серпень 2026» — and the two are different words, so
 * neither can be derived from the other.
 */
const GENITIVE_MONTHS: readonly string[] = [
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

/**
 * «09», not «9». Deliberately not `formatTimeOfDay` from `src/reminders/time.ts`, which pads the
 * same two numbers: that one takes a `TimeOfDay` — a wall-clock hour the owner chose, which its
 * own module says is "deliberately not an instant" — and this one reads the local parts of one.
 * Sharing it would make `src/ui/dates.ts` depend on a feature module and would build a `TimeOfDay`
 * out of the very thing a `TimeOfDay` is defined not to be. Two lines is the cheaper honesty.
 */
function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The month numbered 1–12 in the genitive — «вересня» — for `src/ui/months.ts` to name a month by. */
export function genitiveMonthName(month: number): string {
  return GENITIVE_MONTHS[month - 1]!;
}

/**
 * A calendar дата in the owner's words: «30 серпня», and «30 серпня 2025» once the year is no
 * longer this one — the way a дата досягнення is read, which is a day and never an instant.
 *
 * `now` is passed like every other clock here, so which year counts as "this one" is the caller's
 * and a test can say what year it is.
 */
export function calendarLabel(date: IsoDate, now: Date): string {
  const [year, month, day] = isoDate(date).split('-');
  const named = `${Number(day)} ${GENITIVE_MONTHS[Number(month) - 1]}`;
  return Number(year) === now.getFullYear() ? named : `${named} ${year}`;
}

/** The genitive month, shortened the way a дата is written beside a сума: «5 жовт.». */
const SHORT_GENITIVE_MONTHS: readonly string[] = [
  'січ.',
  'лют.',
  'бер.',
  'квіт.',
  'трав.',
  'черв.',
  'лип.',
  'серп.',
  'вер.',
  'жовт.',
  'лист.',
  'груд.',
];

/**
 * A calendar дата in few letters — «5 жовт.», and «5 жовт. 2027» once the year is no longer this
 * one — for a line that also carries a сума, such as a розстрочка's next платіж.
 */
export function shortCalendarLabel(date: IsoDate, now: Date): string {
  const [year, month, day] = isoDate(date).split('-');
  const named = `${Number(day)} ${SHORT_GENITIVE_MONTHS[Number(month) - 1]}`;
  return Number(year) === now.getFullYear() ? named : `${named} ${year}`;
}

/**
 * A транзакція's дата as a line of the стрічка says it: «сьогодні», «вчора», and otherwise
 * `calendarLabel`'s «21 вересня» / «11 серпня 2025» (app-shell, "A транзакція's дата reads as a
 * day"). No «завтра»: a future-dated транзакція is rare and deliberate, and its day is the honest
 * name for it. Today is the local calendar day, as everywhere in this file.
 */
export function dayLabel(date: IsoDate, now: Date): string {
  if (date === todayIso(now)) {
    return 'сьогодні';
  }
  if (date === shiftIsoDate(todayIso(now), -1)) {
    return 'вчора';
  }
  return calendarLabel(date, now);
}

/**
 * The calendar date `days` away from `date` — month, year and leap-day boundaries included.
 * Built through a local noon, so a daylight-saving change on the way can never land it a day off.
 */
export function shiftIsoDate(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = isoDate(date).split('-');
  return todayIso(new Date(Number(year), Number(month) - 1, Number(day) + days, 12, 0, 0, 0));
}

/**
 * What the дата field of the entry form offers beside itself (main-screen, "The дата of a
 * транзакція is set without typing a date code"): «Сьогодні» and «Вчора» always; a day back and a
 * day forward from the typed дата only when it is one, the forward step never past today; and the
 * typed дата named as a day when it parses. Pure, so which offers stand is proven by `verify`.
 */
export interface DateStepOffers {
  readonly today: IsoDate;
  readonly yesterday: IsoDate;
  readonly back?: IsoDate;
  readonly forward?: IsoDate;
  /** The typed дата as `dayLabel` says it; absent while what is typed is not a дата. */
  readonly label?: string;
}

export function dateStepOffers(typed: string, now: Date): DateStepOffers {
  const today = todayIso(now);
  const yesterday = shiftIsoDate(today, -1);
  let current: IsoDate;
  try {
    current = parseTypedDate(typed);
  } catch {
    return { today, yesterday };
  }
  return {
    today,
    yesterday,
    back: shiftIsoDate(current, -1),
    ...(current < today ? { forward: shiftIsoDate(current, 1) } : {}),
    label: dayLabel(current, now),
  };
}

/**
 * A past instant in the owner's words: «сьогодні о 09:30», «вчора о 18:05», «30 серпня о 09:00»,
 * and «30 серпня 2025 о 09:00» once the year is no longer this one.
 *
 * `now` is passed like every other clock in this app, so "today" and "yesterday" are decided by
 * the caller's instant and a test can say what day it is. Both instants are read in local parts,
 * for `todayIso`'s reason: a sync at 01:00 in Kyiv happened today, not yesterday in UTC.
 *
 * Hardcoded rather than `Intl`, as `monthLabel` is, so Vitest on Node and Hermes on the phone
 * cannot disagree about what the owner reads.
 */
export function momentLabel(ms: number, now: Date): string {
  const at = new Date(ms);
  const time = `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
  const day = todayIso(at);

  if (day === todayIso(now)) {
    return `сьогодні о ${time}`;
  }
  // Built from the local parts, so the day before the 1st is the last day of the month before it.
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === todayIso(yesterday)) {
    return `вчора о ${time}`;
  }

  const date = `${at.getDate()} ${GENITIVE_MONTHS[at.getMonth()]}`;
  return at.getFullYear() === now.getFullYear()
    ? `${date} о ${time}`
    : `${date} ${at.getFullYear()} о ${time}`;
}

/**
 * How long ago something happened, as Головний says it: «щойно», «3 хв тому», «5 год тому», and
 * `momentLabel`'s own words once it is more than a day old.
 *
 * An age rather than a moment, because the question it answers is different from the monobank
 * screen's. Головний asks «is what I am looking at current», and «оновлено 3 хв тому» answers it
 * without the owner doing arithmetic; the monobank screen asks «when did each рахунок last sync»,
 * where the moment itself is the answer. Past a day an age stops being useful — «31 год тому» is
 * work to read — and both fall through to the same words, so they converge where it matters.
 *
 * «хв» and «год» rather than «хвилини» and «годин» on purpose: `plural` in `./labels` would give
 * the three Ukrainian forms correctly, but the abbreviation is what a status line wants and it
 * keeps three grammatical forms out of the busiest string in the app.
 *
 * A moment in the future — a clock corrected backwards, a phone carried across a zone — reads as
 * «щойно» rather than as a negative age: it is the nearest true thing to say, and the alternative
 * is arithmetic nobody can act on.
 */
export function freshnessLabel(ms: number, now: Date): string {
  const elapsed = now.getTime() - ms;
  if (elapsed < MINUTE_MS) {
    return 'щойно';
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)} хв тому`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)} год тому`;
  }
  return momentLabel(ms, now);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The shapes a дата may be typed in. Any of «-», «.», «/» or a space separates the parts, and a
 * month or day may drop its leading zero, so «2026-9-5», «05.09.2026», «5/9/26» and «5 9 2026»
 * are all the same day. Year first is РРРР-ММ-ДД; day first is how a Ukrainian writes a date by
 * hand, and a two-digit year there is this century's.
 */
const SEPARATOR = '[-./\\s]+';
const YEAR_FIRST = new RegExp(`^(\\d{4})${SEPARATOR}(\\d{1,2})${SEPARATOR}(\\d{1,2})$`);
const DAY_FIRST = new RegExp(`^(\\d{1,2})${SEPARATOR}(\\d{1,2})${SEPARATOR}(\\d{4}|\\d{2})$`);
/** Eight digits and nothing else: «20260905» or «05092026», for a pad without a separator. */
const DIGITS_ONLY = /^\d{8}$/;

/** The typed parts as `РРРР-ММ-ДД`, zero-padded; the calendar is not asked yet. */
function isoShape(year: string, month: string, day: string): string {
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function isCalendarDay(shaped: string): boolean {
  try {
    isoDate(shaped);
    return true;
  } catch {
    return false;
  }
}

/** The typed дата in `РРРР-ММ-ДД` shape, or undefined when it is in none of the shapes above. */
function shapeOf(trimmed: string): string | undefined {
  const yearFirst = YEAR_FIRST.exec(trimmed);
  if (yearFirst) {
    const [, year = '', month = '', day = ''] = yearFirst;
    return isoShape(year, month, day);
  }
  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst) {
    const [, day = '', month = '', year = ''] = dayFirst;
    return isoShape(year, month, day);
  }
  if (DIGITS_ONLY.test(trimmed)) {
    // Year first when that is a real day of this or the last century, day first otherwise:
    // «20260905» is 5 вересня 2026, «05092026» cannot start with a year.
    const yearFirstDigits = isoShape(trimmed.slice(0, 4), trimmed.slice(4, 6), trimmed.slice(6));
    if (/^(19|20)/.test(trimmed) && isCalendarDay(yearFirstDigits)) {
      return yearFirstDigits;
    }
    return isoShape(trimmed.slice(4), trimmed.slice(2, 4), trimmed.slice(0, 2));
  }
  return undefined;
}

/**
 * The one place a typed дата becomes an `IsoDate`, and the one place a wrong one is refused in the
 * owner's own language. The domain's `isoDate` decides what a calendar date *is* — this wraps it so
 * that a form never shows its invariant text: «date must be YYYY-MM-DD, got "…"» is a sentence for
 * whoever is debugging, not for someone who has just mistyped a ціль's дата.
 *
 * The shape is checked here and the calendar is left to `isoDate`, so the two refusals stay two:
 * "that is not how a дата is written" and "there is no such day".
 */
export function parseTypedDate(typed: string): IsoDate {
  const trimmed = typed.trim();
  const shaped = shapeOf(trimmed);
  if (shaped === undefined) {
    throw new Refusal(`дата пишеться як ДД.ММ.РРРР або РРРР-ММ-ДД, напр. 31.08.2026, а не «${typed}»`);
  }
  try {
    return isoDate(shaped);
  } catch {
    // The shape is already right, so the only thing `isoDate` can be refusing is the calendar.
    throw new Refusal(`такого дня немає в календарі: «${trimmed}»`);
  }
}

/**
 * The instant a native date picker is opened on for a calendar date: its noon in UTC. Android's
 * Material picker reads the instant as a UTC day and iOS's reads it as a local one; noon UTC is
 * the same calendar day in both for every time zone within ±11 h, Kyiv included.
 */
export function pickerInstant(date: IsoDate): Date {
  const checked = isoDate(date);
  const year = Number(checked.slice(0, 4));
  const month = Number(checked.slice(5, 7));
  const day = Number(checked.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/**
 * The calendar date a native picker answered with. Android's Material picker answers with the
 * picked day's UTC midnight, so it is read in UTC; iOS answers with a local instant, read locally.
 */
export function pickedDate(picked: Date, reading: 'utc' | 'local'): IsoDate {
  if (reading === 'local') {
    return todayIso(picked);
  }
  const year = String(picked.getUTCFullYear()).padStart(4, '0');
  const month = String(picked.getUTCMonth() + 1).padStart(2, '0');
  const day = String(picked.getUTCDate()).padStart(2, '0');
  return isoDate(`${year}-${month}-${day}`);
}
