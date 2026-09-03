import { describe, expect, it } from 'vitest';

import { isoDate, monthOf } from '../domain/transaction';
import { planWindows } from '../monobank/sync';
import {
  dateOfEpochMs,
  freshnessLabel,
  momentLabel,
  parseTypedDate,
  startOfLocalDayMs,
  todayIso,
} from './dates';

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

describe('dateOfEpochMs', () => {
  it('Every instant of a local day is that same day', () => {
    // Both bounds of the local day and one moment in between: the day a bank posted about is one
    // date from its first millisecond to its last, whatever the device's zone.
    const start = startOfLocalDayMs('2026-08-26');
    const end = startOfLocalDayMs('2026-08-27') - 1;
    expect(dateOfEpochMs(start)).toBe('2026-08-26');
    expect(dateOfEpochMs(end)).toBe('2026-08-26');
    expect(dateOfEpochMs(new Date(2026, 7, 26, 13, 45).getTime())).toBe('2026-08-26');
    // And the next millisecond is already the next day — the boundary is where it is stated.
    expect(dateOfEpochMs(end + 1)).toBe('2026-08-27');
  });

  it('It is the inverse of startOfLocalDayMs, which is what both importers rely on', () => {
    for (const date of ['2026-01-05', '2026-08-26', '2026-12-31'] as const) {
      expect(dateOfEpochMs(startOfLocalDayMs(date))).toBe(date);
    }
    // monobank's statement carries epoch seconds, the phone's notifications epoch milliseconds;
    // one function dates both, so a purchase cannot land on two different days.
    const unixSeconds = Math.floor(new Date(2026, 7, 26, 23, 30).getTime() / 1000);
    expect(dateOfEpochMs(unixSeconds * 1000)).toBe(todayIso(new Date(unixSeconds * 1000)));
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

/**
 * The moment a sync last completed, in the owner's words. `now` is data these tests control, as
 * every clock in this app is.
 */
describe('momentLabel', () => {
  /** 1 September 2026, 10:15 local — the caller's instant. */
  const now = new Date(2026, 8, 1, 10, 15, 0);
  const at = (...parts: [number, number, number, number, number]) =>
    new Date(parts[0], parts[1], parts[2], parts[3], parts[4], 0).getTime();

  it('The same calendar day reads as today, with the time of day', () => {
    expect(momentLabel(at(2026, 8, 1, 9, 30), now)).toBe('сьогодні о 09:30');
    // Local parts, not UTC: 01:00 in Kyiv is today, not yesterday.
    expect(momentLabel(at(2026, 8, 1, 1, 0), now)).toBe('сьогодні о 01:00');
  });

  it('The day before reads as yesterday, across a month boundary', () => {
    expect(momentLabel(at(2026, 7, 31, 18, 5), now)).toBe('вчора о 18:05');
  });

  it('An older day of this year is named by its day and month', () => {
    expect(momentLabel(at(2026, 7, 30, 9, 0), now)).toBe('30 серпня о 09:00');
    expect(momentLabel(at(2026, 0, 5, 23, 59), now)).toBe('5 січня о 23:59');
  });

  it('Another year carries its year', () => {
    expect(momentLabel(at(2025, 7, 30, 9, 0), now)).toBe('30 серпня 2025 о 09:00');
    // Even the day that would be «вчора» in another year is not: it is a different day.
    expect(momentLabel(at(2025, 8, 1, 10, 15), now)).toBe('1 вересня 2025 о 10:15');
  });

  it('The clock is the caller’s, never an ambient one', () => {
    const sameMoment = at(2026, 8, 1, 9, 30);

    expect(momentLabel(sameMoment, now)).toBe('сьогодні о 09:30');
    // A day later, the very same instant reads as yesterday — nothing here reads a real clock.
    expect(momentLabel(sameMoment, new Date(2026, 8, 2, 8, 0, 0))).toBe('вчора о 09:30');
    expect(momentLabel(sameMoment, new Date(2026, 8, 3, 8, 0, 0))).toBe('1 вересня о 09:30');
  });

  it('The hour and the minute are always two digits, and the day never is', () => {
    expect(momentLabel(at(2026, 7, 3, 7, 4), now)).toBe('3 серпня о 07:04');
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

describe('freshnessLabel', () => {
  const now = new Date('2026-09-02T12:00:00');
  const ago = (ms: number) => now.getTime() - ms;
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  it('Scenario: Minutes are stated as minutes', () => {
    expect(freshnessLabel(ago(3 * MINUTE), now)).toBe('3 хв тому');
  });

  it('Scenario: A sync just now is щойно', () => {
    expect(freshnessLabel(ago(20_000), now)).toBe('щойно');
    // The edge: a minute exactly is a minute, and the second before it is still «щойно».
    expect(freshnessLabel(ago(MINUTE), now)).toBe('1 хв тому');
    expect(freshnessLabel(ago(MINUTE - 1), now)).toBe('щойно');
  });

  it('Scenario: Hours are stated as hours', () => {
    expect(freshnessLabel(ago(5 * HOUR), now)).toBe('5 год тому');
    // Rounded down, never up: 59 minutes is not yet an hour, and 119 is one hour and not two.
    expect(freshnessLabel(ago(59 * MINUTE), now)).toBe('59 хв тому');
    expect(freshnessLabel(ago(HOUR), now)).toBe('1 год тому');
    expect(freshnessLabel(ago(119 * MINUTE), now)).toBe('1 год тому');
  });

  it('Scenario: Beyond a day it is a calendar moment', () => {
    const yesterdayEvening = new Date('2026-09-01T21:14:00');
    const nextMorning = new Date('2026-09-02T22:00:00');
    // More than 24 hours later, so the age gives way to the words the monobank screen uses.
    expect(freshnessLabel(yesterdayEvening.getTime(), nextMorning)).toBe(
      momentLabel(yesterdayEvening.getTime(), nextMorning),
    );
    expect(freshnessLabel(yesterdayEvening.getTime(), nextMorning)).toContain('вчора о 21:14');
  });

  it('a moment in the future is щойно rather than a negative age', () => {
    // An NTP correction or a zone change; «-3 хв тому» is not something anyone can act on.
    expect(freshnessLabel(now.getTime() + HOUR, now)).toBe('щойно');
  });

  it('never spells a Ukrainian plural it would have to decline', () => {
    for (const minutes of [1, 2, 5, 11, 21, 44]) {
      expect(freshnessLabel(ago(minutes * MINUTE), now)).toBe(`${minutes} хв тому`);
    }
  });
});
