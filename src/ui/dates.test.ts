import { describe, expect, it } from 'vitest';

import { monthOf } from '../domain/transaction';
import { planWindows } from '../monobank/sync';
import { startOfLocalDayMs, todayIso } from './dates';

describe('todayIso', () => {
  it('The date defaults to today', () => {
    expect(todayIso(new Date(2026, 7, 24, 12, 0, 0))).toBe('2026-08-24');
  });

  it('A late evening keeps the local day, not the UTC one', () => {
    // 23:30 local on 24 August is already 25 August in UTC east of Greenwich; the transaction
    // still belongs to the 24th, because a date here is a calendar date.
    const late = new Date(2026, 7, 24, 23, 30, 0);
    expect(todayIso(late)).toBe('2026-08-24');
    expect(monthOf(todayIso(late))).toBe('2026-08');
  });

  it('Single digits are padded so the date is always YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
  });
});

describe('startOfLocalDayMs', () => {
  it('Scenario: An existing same-currency рахунок is linked', () => {
    // The owner confirms 2026-08-28, and that becomes the instant the first sync starts from:
    // midnight where they are, whatever the device's zone happens to be.
    const boundary = startOfLocalDayMs('2026-08-28');

    expect(todayIso(new Date(boundary))).toBe('2026-08-28');
    expect(new Date(boundary).getHours()).toBe(0);
    expect(new Date(boundary).getMinutes()).toBe(0);
    expect(new Date(boundary).getSeconds()).toBe(0);
    expect(new Date(boundary).getMilliseconds()).toBe(0);

    // Inclusive: the first planned window starts *at* the boundary, so an item dated exactly
    // 2026-08-28 00:00 local is imported rather than falling a millisecond outside.
    const [first] = planWindows(boundary, boundary + 86_400_000);
    expect(first?.fromMs).toBe(boundary);
  });

  it('The instant precedes every moment of that day and no moment of the day before', () => {
    const boundary = startOfLocalDayMs('2026-08-28');

    expect(boundary).toBeLessThan(new Date(2026, 7, 28, 0, 0, 1).getTime());
    expect(boundary).toBeGreaterThan(new Date(2026, 7, 27, 23, 59, 59).getTime());
  });

  it('A date that is not a calendar date is refused before it can become a cursor', () => {
    expect(() => startOfLocalDayMs('2026-02-31')).toThrow(/not a calendar date/);
    expect(() => startOfLocalDayMs('28.08.2026')).toThrow(/YYYY-MM-DD/);
  });
});
