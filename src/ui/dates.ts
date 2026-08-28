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
