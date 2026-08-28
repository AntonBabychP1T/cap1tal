import { describe, expect, it } from 'vitest';

import { todayIso } from './dates';
import {
  canStepForward,
  currentMonth,
  monthLabel,
  nextMonth,
  prevMonth,
  shortMonthLabel,
  stepForward,
} from './months';

/** A fixed instant in August 2026 — the clock is data these tests control. */
const august = new Date(2026, 7, 24, 12, 0, 0);

describe('currentMonth', () => {
  it('Scenario: Opening lands on the current month', () => {
    expect(currentMonth(august)).toBe('2026-08');
    expect(monthLabel(currentMonth(august))).toBe('Серпень 2026');
  });

  it('A late evening keeps the local month, not the UTC one', () => {
    // 23:30 on 31 August is already 1 September in UTC east of Greenwich. An expense recorded then
    // is dated 31 August, so the month that opens must be August too, or the screen would show a
    // month the expense is not in.
    const lateOnTheLast = new Date(2026, 7, 31, 23, 30, 0);
    expect(currentMonth(lateOnTheLast)).toBe('2026-08');
    expect(todayIso(lateOnTheLast)).toBe('2026-08-31');
  });

  it('The month always agrees with what todayIso would date a transaction', () => {
    for (const now of [
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 0, 31, 23, 59, 59),
      new Date(2026, 11, 31, 23, 59, 59),
      new Date(2027, 1, 28, 3, 0, 0),
    ]) {
      expect(currentMonth(now)).toBe(todayIso(now).slice(0, 7));
    }
  });
});

describe('prevMonth / nextMonth', () => {
  it('Scenario: Stepping back shows the earlier month', () => {
    expect(prevMonth('2026-08')).toBe('2026-07');
  });

  it('December and January roll the year, both ways', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(nextMonth(prevMonth('2026-01'))).toBe('2026-01');
    expect(prevMonth(nextMonth('2025-12'))).toBe('2025-12');
  });

  it('Stepping is reversible for any month of the year', () => {
    for (let m = 1; m <= 12; m += 1) {
      const month = `2026-${String(m).padStart(2, '0')}`;
      expect(nextMonth(prevMonth(month))).toBe(month);
      expect(prevMonth(nextMonth(month))).toBe(month);
    }
  });

  it('A month that is not a calendar month is refused rather than guessed at', () => {
    for (const bad of ['2026-13', '2026-00', '2026', '2026-8', '08-2026', '', 'серпень']) {
      expect(() => prevMonth(bad)).toThrow();
      expect(() => nextMonth(bad)).toThrow();
      expect(() => monthLabel(bad)).toThrow();
    }
  });
});

describe('the clamp at the current month', () => {
  it('Scenario: Stepping forward returns toward the current month', () => {
    const back = prevMonth(prevMonth(currentMonth(august)));
    expect(back).toBe('2026-06');
    expect(stepForward(back, august)).toBe('2026-07');
  });

  it('Scenario: The current month is the far edge', () => {
    expect(canStepForward('2026-08', august)).toBe(false);
    expect(stepForward('2026-08', august)).toBe('2026-08');
    // Right up to the edge it is offered, and at the edge it is not.
    expect(canStepForward('2026-07', august)).toBe(true);
    expect(stepForward('2026-07', august)).toBe('2026-08');
  });

  it('The edge holds across a year boundary', () => {
    const january = new Date(2026, 0, 15, 12, 0, 0);
    expect(currentMonth(january)).toBe('2026-01');
    expect(canStepForward('2025-12', january)).toBe(true);
    expect(stepForward('2025-12', january)).toBe('2026-01');
    expect(canStepForward('2026-01', january)).toBe(false);
    expect(stepForward('2026-01', january)).toBe('2026-01');
  });

  it('A month somehow already past the current one is not carried further forward', () => {
    expect(canStepForward('2026-11', august)).toBe(false);
    expect(stepForward('2026-11', august)).toBe('2026-11');
  });
});

describe('monthLabel', () => {
  it('The shown month is named in Ukrainian with its year', () => {
    expect(monthLabel('2026-08')).toBe('Серпень 2026');
    expect(monthLabel('2026-07')).toBe('Липень 2026');
    expect(monthLabel('2025-12')).toBe('Грудень 2025');
    expect(monthLabel('2026-01')).toBe('Січень 2026');
  });

  it('All twelve months are named, in the nominative', () => {
    const names = Array.from({ length: 12 }, (_, i) =>
      monthLabel(`2026-${String(i + 1).padStart(2, '0')}`),
    );
    expect(names).toEqual([
      'Січень 2026',
      'Лютий 2026',
      'Березень 2026',
      'Квітень 2026',
      'Травень 2026',
      'Червень 2026',
      'Липень 2026',
      'Серпень 2026',
      'Вересень 2026',
      'Жовтень 2026',
      'Листопад 2026',
      'Грудень 2026',
    ]);
  });
});

describe('shortMonthLabel', () => {
  it('Names the month short, with its year', () => {
    expect(shortMonthLabel('2026-08')).toBe('Сер 2026');
    expect(shortMonthLabel('2026-01')).toBe('Січ 2026');
    expect(shortMonthLabel('2025-12')).toBe('Гру 2025');
  });

  it('Refuses what is not a calendar month, like every other month function here', () => {
    expect(() => shortMonthLabel('2026-13')).toThrow();
    expect(() => shortMonthLabel('серпень')).toThrow();
  });
});
