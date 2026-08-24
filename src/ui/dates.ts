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
