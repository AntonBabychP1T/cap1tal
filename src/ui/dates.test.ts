import { describe, expect, it } from 'vitest';

import { isoDate, monthOf } from '../domain/transaction';
import { planWindows } from '../monobank/sync';
import { parseTypedDate, startOfLocalDayMs, todayIso } from './dates';

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

describe('parseTypedDate', () => {
  it('A дата written as РРРР-ММ-ДД is the same IsoDate the domain makes', () => {
    expect(parseTypedDate('2026-08-31')).toBe(isoDate('2026-08-31'));
    // Trimmed, because a keyboard leaves spaces where a finger did.
    expect(parseTypedDate('  2026-08-31 ')).toBe(isoDate('2026-08-31'));
  });

  it('Scenario: A дата in the wrong shape is refused in Ukrainian', () => {
    // What the smoke found on «Цілі»: this used to answer `date must be YYYY-MM-DD, got "…"`.
    expect(() => parseTypedDate('31.12.2026')).toThrow(
      'дата пишеться як РРРР-ММ-ДД, напр. 2026-08-31, а не «31.12.2026»',
    );
    for (const typed of ['', '2026-8-31', '31-12-2026', 'вчора', '2026/08/31']) {
      expect(refusalOf(() => parseTypedDate(typed)), `"${typed}" was refused in English`).not.toMatch(
        /[A-Za-z]/,
      );
    }
  });

  it('Scenario: A day that does not exist is refused in Ukrainian', () => {
    expect(() => parseTypedDate('2026-02-31')).toThrow('такого дня немає в календарі: «2026-02-31»');
    expect(() => parseTypedDate('2026-13-01')).toThrow('такого дня немає в календарі: «2026-13-01»');
    expect(refusalOf(() => parseTypedDate('2026-02-31'))).not.toMatch(/[A-Za-z]/);
  });
});

/** The refusal as the owner reads it — the same helper `amount-input.test.ts` keeps. */
function refusalOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('nothing was refused');
}
