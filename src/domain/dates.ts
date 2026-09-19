import type { IsoDate } from './transaction';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days between two dates, both read as UTC midnights so no device timezone can
 * move them. Both are `IsoDate`, already validated by whoever built them.
 */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}
