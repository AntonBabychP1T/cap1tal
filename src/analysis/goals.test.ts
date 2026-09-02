import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Goal } from '../domain/goals';
import { money } from '../domain/money';
import { transfer, type Transaction } from '../domain/transaction';
import { goalReports, monthsLeft } from './goals';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'jar', name: 'Банка на авто', kind: 'savings', currency: 'UAH' }),
];

const car: Goal = {
  id: 'g1',
  name: 'Авто',
  target: money(20_000_000, 'UAH'),
  deadline: '2026-12-31',
  accountId: 'jar',
};

/** 50 000.00 UAH already on the банка. */
const saved: readonly Transaction[] = [
  transfer({
    id: 't1',
    date: '2026-05-01',
    fromAccountId: 'card',
    toAccountId: 'jar',
    left: money(5_000_000, 'UAH'),
    arrived: money(5_000_000, 'UAH'),
  }),
];

describe('goalReports', () => {
  it("Scenario: A ціль's pace", () => {
    const [report] = goalReports({
      goals: [car],
      accounts,
      transactions: saved,
      builtOn: '2026-09-01',
    });

    expect(report).toEqual({
      name: 'Авто',
      target: { amount: '200000.00', currency: 'UAH' },
      progress: { amount: '50000.00', currency: 'UAH' },
      remaining: { amount: '150000.00', currency: 'UAH' },
      deadline: '2026-12-31',
      reached: false,
      overdue: false,
      monthsLeft: 4,
      perMonth: { amount: '37500.00', currency: 'UAH' },
    });
  });

  it('Scenario: A month started still counts', () => {
    const [report] = goalReports({
      goals: [car],
      accounts,
      transactions: saved,
      builtOn: '2026-09-15',
    });

    expect(report!.monthsLeft).toBe(4);
    expect(report!.perMonth).toEqual({ amount: '37500.00', currency: 'UAH' });
  });

  it('Scenario: An overdue ціль has no pace', () => {
    const [report] = goalReports({
      goals: [car],
      accounts,
      transactions: saved,
      builtOn: '2027-01-10',
    });

    expect(report!.overdue).toBe(true);
    expect(report!.monthsLeft).toBe(0);
    expect(report!.perMonth).toBeNull();
  });

  it('a reached ціль has nothing remaining and no pace', () => {
    const reached: readonly Transaction[] = [
      transfer({
        id: 't2',
        date: '2026-05-01',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(21_000_000, 'UAH'),
        arrived: money(21_000_000, 'UAH'),
      }),
    ];

    const [report] = goalReports({
      goals: [car],
      accounts,
      transactions: reached,
      builtOn: '2026-09-01',
    });

    expect(report!.reached).toBe(true);
    expect(report!.overdue).toBe(false);
    // Overshooting is not a negative remainder — what remains of a reached ціль is nothing.
    expect(report!.remaining).toEqual({ amount: '0.00', currency: 'UAH' });
    expect(report!.perMonth).toBeNull();
  });

  it('rounds a pace up, so following it exactly reaches the ціль', () => {
    const odd: Goal = { ...car, target: money(10_001, 'UAH'), deadline: '2026-11-30' };

    const [report] = goalReports({
      goals: [odd],
      accounts,
      transactions: [],
      builtOn: '2026-09-01',
    });

    // 100.01 over three months is 33.34 a month, not 33.33 — the last kopiyka has to be saved too.
    expect(report!.monthsLeft).toBe(3);
    expect(report!.perMonth).toEqual({ amount: '33.34', currency: 'UAH' });
  });

  it('names no рахунок, of any kind', () => {
    const reports = goalReports({
      goals: [car],
      accounts,
      transactions: saved,
      builtOn: '2026-09-01',
    });

    const serialised = JSON.stringify(reports);
    expect(serialised).not.toContain('jar');
    expect(serialised).not.toContain('Банка на авто');
    expect(serialised).not.toContain('savings');
  });

  it('orders the цілі by дата, then by назва', () => {
    const soon: Goal = { ...car, id: 'g2', name: 'Ноутбук', deadline: '2026-10-31' };
    const alsoSoon: Goal = { ...car, id: 'g3', name: 'Велосипед', deadline: '2026-10-31' };

    expect(
      goalReports({
        goals: [car, soon, alsoSoon],
        accounts,
        transactions: saved,
        builtOn: '2026-09-01',
      }).map((r) => r.name),
    ).toEqual(['Велосипед', 'Ноутбук', 'Авто']);
  });
});

describe('monthsLeft', () => {
  it('counts the month started and the month of the дата', () => {
    expect(monthsLeft('2026-09-01', '2026-12-31')).toBe(4);
    expect(monthsLeft('2026-09-30', '2026-09-30')).toBe(1);
    expect(monthsLeft('2026-12-01', '2027-01-31')).toBe(2);
  });

  it('is 0 once the дата has passed', () => {
    expect(monthsLeft('2027-01-10', '2026-12-31')).toBe(0);
    expect(monthsLeft('2026-09-16', '2026-09-15')).toBe(0);
  });
});
