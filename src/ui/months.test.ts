import { describe, expect, it } from 'vitest';

import { todayIso } from './dates';
import {
  canStepBack,
  canStepForward,
  currentMonth,
  monthInLabel,
  monthLabel,
  monthsOf,
  nextMonth,
  prevMonth,
  reachableMonths,
  shortMonthLabel,
  stepBack,
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

/**
 * QA 2026-09-29: «назад» reached January 2024 on a phone whose first транзакція is from 2025, and a
 * транзакція dated ahead of the current month was on Головний yet unreachable on Місяць. The arrows
 * are bounded by what is recorded; the current month is always inside the bounds.
 */
describe('the months Місяць can reach', () => {
  it('From the month of the first record to the current month', () => {
    const reach = reachableMonths({ earliest: '2025-03-14', latest: '2026-08-02' }, august);
    expect(reach).toEqual({ first: '2025-03', last: '2026-08' });
  });

  it('Nothing recorded: the current month alone', () => {
    expect(reachableMonths(undefined, august)).toEqual({ first: '2026-08', last: '2026-08' });
  });

  it('A record dated after the current month makes its month reachable', () => {
    const reach = reachableMonths({ earliest: '2026-01-05', latest: '2027-01-15' }, august);
    expect(reach).toEqual({ first: '2026-01', last: '2027-01' });
    expect(canStepForward('2026-08', august, reach)).toBe(true);
    expect(stepForward('2026-12', august, reach)).toBe('2027-01');
    expect(canStepForward('2027-01', august, reach)).toBe(false);
    expect(stepForward('2027-01', august, reach)).toBe('2027-01');
  });

  it('Only future records: back still reaches the current month, and no earlier', () => {
    const reach = reachableMonths({ earliest: '2026-10-01', latest: '2026-10-01' }, august);
    expect(reach).toEqual({ first: '2026-08', last: '2026-10' });
    expect(canStepBack('2026-08', reach)).toBe(false);
  });

  it('Back stops at the month of the first record', () => {
    const reach = reachableMonths({ earliest: '2025-12-31', latest: '2026-08-02' }, august);
    expect(canStepBack('2026-01', reach)).toBe(true);
    expect(stepBack('2026-01', reach)).toBe('2025-12');
    expect(canStepBack('2025-12', reach)).toBe(false);
    expect(stepBack('2025-12', reach)).toBe('2025-12');
  });

  it('Without bounds, forward keeps the current month as its edge', () => {
    // What every caller that passes no bounds already relied on.
    expect(canStepForward('2026-08', august)).toBe(false);
    expect(canStepForward('2026-07', august)).toBe(true);
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

describe('monthsOf', () => {
  it('The місяці the транзакції touch, newest first, each once', () => {
    const dated = ['2026-03-31', '2026-04-01', '2026-03-01', '2025-12-24'].map((date) => ({ date }));

    expect(monthsOf(dated)).toEqual(['2026-04', '2026-03', '2025-12']);
  });

  it('Nothing stored touches no місяць', () => {
    expect(monthsOf([])).toEqual([]);
  });
});

describe('monthInLabel', () => {
  it('The month is named as part of the sentence about it', () => {
    expect(monthInLabel('2026-09')).toBe('у вересні');
    expect(monthInLabel('2026-08')).toBe('у серпні');
  });

  it('All twelve months are named, in the locative', () => {
    const names = Array.from({ length: 12 }, (_, i) =>
      monthInLabel(`2026-${String(i + 1).padStart(2, '0')}`),
    );
    expect(names).toEqual([
      'у січні',
      'у лютому',
      'у березні',
      'у квітні',
      'у травні',
      'у червні',
      'у липні',
      'у серпні',
      'у вересні',
      'у жовтні',
      'у листопаді',
      'у грудні',
    ]);
  });

  it('The year is not part of it — the heading is about the month the app is in', () => {
    expect(monthInLabel('2026-09')).toBe(monthInLabel('2019-09'));
  });

  it('A month that is not one is refused, like every other reader here', () => {
    for (const bad of ['2026-13', '2026-00', '2026', 'вересень'] as const) {
      expect(() => monthInLabel(bad)).toThrow();
    }
  });
});
