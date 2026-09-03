import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import { transfer, type Transaction } from '../domain/transaction';
import { goalReports, monthsLeft } from './goals';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'jar', name: 'Банка на авто', kind: 'savings', currency: 'UAH' }),
  account({ id: 'jar2', name: 'Друга банка', kind: 'savings', currency: 'UAH' }),
  account({ id: 'usd', name: 'USD банка', kind: 'savings', currency: 'USD' }),
  account({ id: 'bonds', name: 'ОВДП', kind: 'investment', currency: 'UAH' }),
];

const car: AccumulationGoal = {
  id: 'g1',
  name: 'Авто',
  target: money(20_000_000, 'UAH'),
  deadline: '2026-12-31',
  accountIds: ['jar'],
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
    expect(report!.perMonth).toBeUndefined();
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
    expect(report!.perMonth).toBeUndefined();
  });

  it('rounds a pace up, so following it exactly reaches the ціль', () => {
    const odd: AccumulationGoal = { ...car, target: money(10_001, 'UAH'), deadline: '2026-11-30' };

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
    const soon: AccumulationGoal = { ...car, id: 'g2', name: 'Ноутбук', deadline: '2026-10-31' };
    const alsoSoon: AccumulationGoal = { ...car, id: 'g3', name: 'Велосипед', deadline: '2026-10-31' };

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

describe('the цілі the пакет carries, and the ones it carries without a progress', () => {
  it('Scenario: A ціль over several UAH рахунки carries their sum', () => {
    const spread: AccumulationGoal = {
      id: 'g-reserve',
      name: 'Резерв',
      target: money(30_000_000, 'UAH'),
      deadline: '2026-12-31',
      accountIds: ['jar', 'jar2', 'bonds'],
    };
    const moves: readonly Transaction[] = [
      transfer({
        id: 'a',
        date: '2026-05-01',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(5_000_000, 'UAH'),
        arrived: money(5_000_000, 'UAH'),
      }),
      transfer({
        id: 'b',
        date: '2026-05-02',
        fromAccountId: 'card',
        toAccountId: 'jar2',
        left: money(4_000_000, 'UAH'),
        arrived: money(4_000_000, 'UAH'),
      }),
      transfer({
        id: 'c',
        date: '2026-05-03',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(1_000_000, 'UAH'),
        arrived: money(1_000_000, 'UAH'),
      }),
    ];

    const [report] = goalReports({
      goals: [spread],
      accounts,
      transactions: moves,
      builtOn: '2026-09-01',
    });

    expect(report!.progress).toEqual({ amount: '100000.00', currency: 'UAH' });
    expect(report!.remaining).toEqual({ amount: '200000.00', currency: 'UAH' });
    // …and names none of the three рахунки.
    expect(JSON.stringify(report)).not.toContain('Друга банка');
  });

  it('Scenario: A ціль without a дата has no pace and is not overdue', () => {
    const undated: AccumulationGoal = {
      id: 'g-reserve',
      name: 'Резерв',
      target: money(20_000_000, 'UAH'),
      accountIds: ['jar'],
    };

    const [report] = goalReports({
      goals: [undated],
      accounts,
      transactions: saved,
      builtOn: '2027-09-01',
    });

    expect(report!.progress).toEqual({ amount: '50000.00', currency: 'UAH' });
    expect(report!.remaining).toEqual({ amount: '150000.00', currency: 'UAH' });
    expect(report!.reached).toBe(false);
    expect(report!.deadline).toBeUndefined();
    expect(report!.monthsLeft).toBeUndefined();
    expect(report!.perMonth).toBeUndefined();
    // No deadline to be past, whatever the day the пакет is built for.
    expect(report!.overdue).toBe(false);
  });

  it('Scenario: A ціль whose progress would need a rate carries no progress', () => {
    const mixed: AccumulationGoal = {
      id: 'g-machine',
      name: 'Машина',
      target: money(70_000_000, 'UAH'),
      deadline: '2027-06-30',
      accountIds: ['jar', 'usd'],
    };

    const [report] = goalReports({
      goals: [mixed],
      accounts,
      transactions: saved,
      builtOn: '2026-09-01',
    });

    expect(report).toEqual({
      name: 'Машина',
      target: { amount: '700000.00', currency: 'UAH' },
      deadline: '2027-06-30',
      progressNotInPackage: true,
    });
  });

  it('Scenario: No сума of the пакет is approximate', () => {
    const mixed: AccumulationGoal = {
      id: 'g-machine',
      name: 'Машина',
      target: money(70_000_000, 'UAH'),
      deadline: '2027-06-30',
      accountIds: ['jar', 'usd'],
    };

    const reports = goalReports({
      goals: [car, mixed],
      accounts,
      transactions: saved,
      builtOn: '2026-09-01',
    });

    // No «≈» anywhere, and every сума the пакет holds names one currency.
    const serialised = JSON.stringify(reports);
    expect(serialised).not.toContain('≈');
    expect(serialised).not.toContain('приблиз');
    for (const report of reports) {
      for (const amount of [report.target, report.progress, report.remaining, report.perMonth]) {
        if (amount) expect(amount.currency).toBe('UAH');
      }
    }
  });

  it('Scenario: The цілі of the пакет are in one order whatever order they were read in', () => {
    const dated = (id: string, name: string, deadline: string): AccumulationGoal => ({
      id,
      name,
      target: money(1_000_000, 'UAH'),
      deadline,
      accountIds: ['jar'],
    });
    const undated = (id: string, name: string): AccumulationGoal => ({
      id,
      name,
      target: money(1_000_000, 'UAH'),
      accountIds: ['jar'],
    });
    const all = [
      dated('g1', 'Авто', '2026-12-31'),
      undated('g2', 'Резерв'),
      dated('g3', 'Ноутбук', '2027-06-30'),
      undated('g4', 'Аварійний'),
    ];
    const names = (goals: readonly AccumulationGoal[]) =>
      goalReports({ goals, accounts, transactions: saved, builtOn: '2026-09-01' }).map(
        (r) => r.name,
      );

    // The dated ones first by дата, then the дата-less ones by назва — the same order whatever
    // order the stored rows arrived in.
    expect(names(all)).toEqual(['Авто', 'Ноутбук', 'Аварійний', 'Резерв']);
    expect(names([...all].reverse())).toEqual(names(all));
    expect(names([all[1]!, all[3]!, all[0]!, all[2]!])).toEqual(names(all));
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
