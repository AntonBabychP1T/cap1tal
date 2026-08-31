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
