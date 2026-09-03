import { isoDate, type IsoDate } from '../domain/transaction';

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

/** The shape a дата is typed in, and the shape the placeholder «РРРР-ММ-ДД» asks for. */
const TYPED_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one place a typed дата becomes an `IsoDate`, and the one place a wrong one is refused in the
 * owner's own language. The domain's `isoDate` decides what a calendar date *is* — this wraps it so
 * that a form never shows its invariant text: «date must be YYYY-MM-DD, got "31.12.2026"» is a
 * sentence for whoever is debugging, not for someone who has just mistyped a ціль's дата.
 *
 * The shape is checked here and the calendar is left to `isoDate`, so the two refusals stay two:
 * "that is not how a дата is written" and "there is no such day".
 */
export function parseTypedDate(typed: string): IsoDate {
  const trimmed = typed.trim();
  if (!TYPED_DATE.test(trimmed)) {
    throw new Error(`дата пишеться як РРРР-ММ-ДД, напр. 2026-08-31, а не «${typed}»`);
  }
  try {
    return isoDate(trimmed);
  } catch {
    // The shape is already right, so the only thing `isoDate` can be refusing is the calendar.
    throw new Error(`такого дня немає в календарі: «${trimmed}»`);
  }
}
