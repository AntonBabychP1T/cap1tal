import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { expenseByDefault, type Transaction } from '../domain/transaction';
import { historyOf, isMonth, monthsOfPeriod, refusesRange, resolvePeriod } from './period';

const spend = (id: string, date: string, amount = 10000): Transaction =>
  expenseByDefault({
    id,
    date,
    accountId: 'card',
    amount: money(amount, 'UAH'),
    categoryId: 'cafe',
  });

describe('resolvePeriod', () => {
  it('Scenario: The period is whole calendar months', () => {
    // «Останні 3 місяці» on the 1st of September.
    expect(resolvePeriod({ lastMonths: 3 }, '2026-09-01')).toEqual({
      calendar: 'calendar-month',
      from: '2026-07',
      to: '2026-09',
      months: 3,
      partialMonth: { month: '2026-09', daysElapsed: 1, daysInMonth: 30 },
    });
  });

  it('«Цей місяць» is the month in progress, marked partial', () => {
    expect(resolvePeriod('this-month', '2026-09-15')).toEqual({
      calendar: 'calendar-month',
      from: '2026-09',
      to: '2026-09',
      months: 1,
      partialMonth: { month: '2026-09', daysElapsed: 15, daysInMonth: 30 },
    });
  });

  it('steps back across a year end', () => {
    const period = resolvePeriod({ lastMonths: 12 }, '2026-02-28');
    expect(period.from).toBe('2025-03');
    expect(period.to).toBe('2026-02');
    expect(period.months).toBe(12);
    // 2026 is not a leap year, and February is the month the пакет is built in.
    expect(period.partialMonth).toEqual({ month: '2026-02', daysElapsed: 28, daysInMonth: 28 });
  });

  it('counts the days of a leap February', () => {
    expect(resolvePeriod('this-month', '2028-02-03').partialMonth).toEqual({
      month: '2028-02',
      daysElapsed: 3,
      daysInMonth: 29,
    });
  });

  it('Scenario: A custom range is whole months', () => {
    expect(resolvePeriod({ from: '2026-01', to: '2026-06' }, '2026-09-01')).toEqual({
      calendar: 'calendar-month',
      from: '2026-01',
      to: '2026-06',
      months: 6,
      // The month the пакет is built in lies outside the range, so no month of it is partial.
      partialMonth: null,
    });
  });

  it('marks the partial month of a custom range that reaches it', () => {
    expect(resolvePeriod({ from: '2026-07', to: '2026-09' }, '2026-09-01').partialMonth).toEqual({
      month: '2026-09',
      daysElapsed: 1,
      daysInMonth: 30,
    });
  });
});

describe('isMonth', () => {
  it('answers about a month still being typed instead of throwing at it', () => {
    expect(isMonth('2026-08')).toBe(true);
    expect(isMonth('2026-01')).toBe(true);
    expect(isMonth('2026-12')).toBe(true);

    // Every one of these reaches the screen while the owner types, and none of them may throw.
    for (const half of ['2026-0', '2026-', '2026', '', '20261', '2026-00', '2026-13', 'серпень']) {
      expect(isMonth(half), half).toBe(false);
    }
  });
});

describe('refusesRange', () => {
  it('Scenario: A custom range that ends before it starts is refused', () => {
    expect(refusesRange('2026-06', '2026-01')).toBe(true);
    // The screen asks first, so the builder never sees such a range — and says so if it does.
    expect(() => resolvePeriod({ from: '2026-06', to: '2026-01' }, '2026-09-01')).toThrow(
      /2026-06\.\.2026-01/,
    );
  });

  it('one month from itself to itself is a range', () => {
    expect(refusesRange('2026-06', '2026-06')).toBe(false);
  });

  it('is not total, which is why the screen asks `isMonth` first', () => {
    // This throw is the one the emulator surfaced as a red «Render Error» on the AI-аналіз screen
    // after a single backspace. It stays a throw — a half-typed month is a programming error this
    // far down — and `ai-analysis-screen.ts` is what turns it into a sentence before it happens.
    expect(() => refusesRange('2026-0', '2026-09')).toThrow(/YYYY-MM/);
  });
});

describe('monthsOfPeriod', () => {
  it('every month of the period, in calendar order and with no hole', () => {
    expect(monthsOfPeriod({ from: '2025-11', to: '2026-02' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});

describe('historyOf', () => {
  it('Scenario: An empty period is refused', () => {
    const period = resolvePeriod({ from: '2026-01', to: '2026-03' }, '2026-09-01');

    // The транзакції exist — they are just not in the period.
    expect(historyOf(period, [spend('a', '2026-08-10')])).toEqual({ kind: 'empty-period' });
    expect(historyOf(period, [])).toEqual({ kind: 'empty-period' });
  });

  it('Scenario: A short history is flagged', () => {
    const period = resolvePeriod({ lastMonths: 6 }, '2026-09-01');

    expect(historyOf(period, [spend('a', '2026-09-01'), spend('b', '2026-09-02')])).toEqual({
      history: 'short',
      monthsWithData: 1,
    });
  });

  it('two months of the period with транзакції are enough', () => {
    const period = resolvePeriod({ lastMonths: 6 }, '2026-09-01');

    expect(historyOf(period, [spend('a', '2026-08-31'), spend('b', '2026-09-01')])).toEqual({
      history: 'sufficient',
      monthsWithData: 2,
    });
  });

  it('counts only the months of the period', () => {
    const period = resolvePeriod({ from: '2026-07', to: '2026-08' }, '2026-09-01');

    expect(
      historyOf(period, [spend('a', '2026-06-30'), spend('b', '2026-07-01'), spend('c', '2026-09-01')]),
    ).toEqual({ history: 'short', monthsWithData: 1 });
  });
});
