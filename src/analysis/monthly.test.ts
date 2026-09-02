import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  refund,
  transfer,
  type Transaction,
} from '../domain/transaction';
import { currenciesOf, monthlyReports } from './monthly';
import { resolvePeriod } from './period';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'card-2', name: 'mono white', kind: 'spending', currency: 'UAH' }),
  account({ id: 'jar', name: 'Банка на авто', kind: 'savings', currency: 'UAH' }),
  account({ id: 'jar-usd', name: 'Банка USD', kind: 'savings', currency: 'USD' }),
  account({ id: 'bonds', name: 'Військові облігації', kind: 'investment', currency: 'UAH' }),
  account({ id: 'debt', name: 'Борг Петра', kind: 'debt', currency: 'UAH' }),
];

let seq = 0;
const id = () => `t${(seq += 1)}`;

const spend = (date: string, amount: number, categoryId = 'cafe', currency = 'UAH'): Transaction =>
  expenseByDefault({ id: id(), date, accountId: 'card', amount: money(amount, currency), categoryId });

const earn = (date: string, amount: number, sourceId = 'salary', currency = 'UAH'): Transaction => ({
  type: 'income',
  id: id(),
  date,
  accountId: 'card',
  amount: money(amount, currency),
  sourceId,
});

const move = (date: string, from: string, to: string, left: number, arrived = left, currency = 'UAH', arrivedCurrency = currency): Transaction =>
  transfer({
    id: id(),
    date,
    fromAccountId: from,
    toAccountId: to,
    left: money(left, currency),
    arrived: money(arrived, arrivedCurrency),
  });

const correct = (date: string, amount: number): Transaction => ({
  type: 'correction',
  id: id(),
  date,
  accountId: 'card',
  amount: money(amount, 'UAH'),
});

/** The UAH report of a period built on the given day. */
function uah(transactions: readonly Transaction[], choice: Parameters<typeof resolvePeriod>[0], builtOn: string) {
  const period = resolvePeriod(choice, builtOn);
  const report = monthlyReports({ period, accounts, transactions });
  return report.get('UAH')!;
}

describe('monthlyReports', () => {
  it('Scenario: A month equals its monthly picture', () => {
    const august = [
      spend('2026-08-04', 100000),
      earn('2026-08-05', 500000),
      move('2026-08-06', 'card', 'bonds', 80000),
      move('2026-08-07', 'card', 'jar', 50000),
      move('2026-08-08', 'card', 'debt', 40000),
    ];

    const [month] = uah(august, { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    expect(month).toMatchObject({
      month: '2026-08',
      partial: false,
      spent: { amount: '1000.00', currency: 'UAH' },
      income: { amount: '5000.00', currency: 'UAH' },
      invested: { amount: '800.00', currency: 'UAH' },
      saved: { amount: '500.00', currency: 'UAH' },
      lent: { amount: '400.00', currency: 'UAH' },
      left: { amount: '2300.00', currency: 'UAH' },
    });
  });

  it('Scenario: An empty month is present at zero', () => {
    const history = [spend('2026-06-10', 50000), spend('2026-08-10', 50000)];

    const months = uah(history, { from: '2026-06', to: '2026-08' }, '2026-09-01').months;

    expect(months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(months[1]).toMatchObject({
      month: '2026-07',
      spent: { amount: '0.00', currency: 'UAH' },
      income: { amount: '0.00', currency: 'UAH' },
      invested: { amount: '0.00', currency: 'UAH' },
      saved: { amount: '0.00', currency: 'UAH' },
      lent: { amount: '0.00', currency: 'UAH' },
      left: { amount: '0.00', currency: 'UAH' },
    });
  });

  it('Scenario: The glossary distinctions hold in the пакет', () => {
    const august = [
      move('2026-08-02', 'card', 'jar', 50000),
      move('2026-08-03', 'card', 'bonds', 80000),
      move('2026-08-04', 'card', 'debt', 40000),
      spend('2026-08-05', 100000, 'groceries'),
      refund({ id: id(), date: '2026-08-06', accountId: 'card', amount: money(30000, 'UAH'), categoryId: 'groceries' }),
      correct('2026-08-07', -20000),
    ];

    const [month] = uah(august, { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    // None of the three перекази is витрачено; the повернення reduces it; the negative
    // коригування adds to it: 1000.00 − 300.00 + 200.00.
    expect(month!.spent).toEqual({ amount: '900.00', currency: 'UAH' });
    expect(month!.saved).toEqual({ amount: '500.00', currency: 'UAH' });
    expect(month!.invested).toEqual({ amount: '800.00', currency: 'UAH' });
    expect(month!.lent).toEqual({ amount: '400.00', currency: 'UAH' });
    expect(month!.income).toEqual({ amount: '0.00', currency: 'UAH' });
  });

  it('Scenario: A комісія is витрачено under «Комісія» and the переказ is not', () => {
    const august = [
      move('2026-08-02', 'card', 'card-2', 100000, 99000),
      spend('2026-08-02', 1000, FEES_CATEGORY_ID),
    ];

    const [month] = uah(august, { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    // The комісія alone is витрачено; a картка → картка переказ moves no monthly number at all.
    expect(month!.spent).toEqual({ amount: '10.00', currency: 'UAH' });
    expect(month!.saved).toEqual({ amount: '0.00', currency: 'UAH' });
    expect(month!.invested).toEqual({ amount: '0.00', currency: 'UAH' });
  });

  it('Scenario: A repayment reduces позичено and only the відсотки are дохід', () => {
    const august = [
      move('2026-08-10', 'debt', 'card', 40000),
      earn('2026-08-10', 1000, INTEREST_SOURCE_ID),
    ];

    const [month] = uah(august, { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    expect(month!.lent).toEqual({ amount: '-400.00', currency: 'UAH' });
    expect(month!.income).toEqual({ amount: '10.00', currency: 'UAH' });
  });

  it('Scenario: A cross-currency переказ counts in one currency and shows both legs', () => {
    // The legs themselves are `details.ts`'s (task 2.7); what this proves is that the USD report
    // exists at all — the arrival leg opens it, at zero.
    const august = [move('2026-08-10', 'card', 'jar-usd', 410000, 10000, 'UAH', 'USD')];
    const period = resolvePeriod({ from: '2026-08', to: '2026-08' }, '2026-09-01');

    const reports = monthlyReports({ period, accounts, transactions: august });

    expect(reports.get('UAH')!.months[0]!.saved).toEqual({ amount: '4100.00', currency: 'UAH' });
    expect(reports.get('USD')!.months[0]!.saved).toEqual({ amount: '0.00', currency: 'USD' });
    expect([...reports.keys()]).toEqual(['UAH', 'USD']);
  });

  it('Scenario: A foreign purchase from a UAH card is spent in UAH and opens no foreign report', () => {
    const august: Transaction[] = [
      expenseByDefault({
        id: id(),
        date: '2026-08-10',
        accountId: 'card',
        amount: money(412534, 'UAH'),
        categoryId: 'travel',
        originalAmount: money(10000, 'USD'),
      }),
    ];
    const period = resolvePeriod({ from: '2026-08', to: '2026-08' }, '2026-09-01');

    const reports = monthlyReports({ period, accounts, transactions: august });

    expect([...reports.keys()]).toEqual(['UAH']);
    expect(reports.get('UAH')!.months[0]!.spent).toEqual({ amount: '4125.34', currency: 'UAH' });
    // The сума в оригінальній валюті is information about the витрата, never a сума of it.
    expect(currenciesOf(august)).toEqual(['UAH']);
  });

  it('Scenario: A positive коригування is дохід', () => {
    const [month] = uah([correct('2026-08-10', 2000)], { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    expect(month!.income).toEqual({ amount: '20.00', currency: 'UAH' });
    expect(month!.spent).toEqual({ amount: '0.00', currency: 'UAH' });
  });

  it('Scenario: Money back from an інвестиційний рахунок makes інвестовано negative', () => {
    const august = [move('2026-08-10', 'bonds', 'card', 30000), earn('2026-08-11', 100000)];

    const [month] = uah(august, { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    expect(month!.invested).toEqual({ amount: '-300.00', currency: 'UAH' });
    expect(month!.investmentRate).toBe(-3000);
  });

  it('Scenario: Month-over-month change', () => {
    const history = [spend('2026-07-10', 300000), spend('2026-08-10', 360000)];

    const months = uah(history, { from: '2026-07', to: '2026-08' }, '2026-09-01').months;

    expect(months[1]!.changeVsPreviousMonth!.spent).toBe(2000);
  });

  it('reads the month before the period for the first month’s change', () => {
    const history = [spend('2026-06-10', 300000), spend('2026-07-10', 360000)];

    // June lies outside the period, and July's change is still computed against it.
    const months = uah(history, { from: '2026-07', to: '2026-07' }, '2026-09-01').months;

    expect(months.map((m) => m.month)).toEqual(['2026-07']);
    expect(months[0]!.changeVsPreviousMonth!.spent).toBe(2000);
  });

  it('has no change at all against a month that holds nothing of the currency', () => {
    const months = uah([spend('2026-08-10', 360000)], { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    expect(months[0]!.changeVsPreviousMonth).toBeNull();
  });

  it('Scenario: A ratio with a zero base is absent', () => {
    const [month] = uah([spend('2026-08-10', 50000)], { from: '2026-08', to: '2026-08' }, '2026-09-01').months;

    expect(month!.savingsRate).toBeNull();
    expect(month!.investmentRate).toBeNull();
  });

  it('marks the partial month and no other', () => {
    const months = uah(
      [spend('2026-08-10', 50000), spend('2026-09-01', 1000)],
      { lastMonths: 3 },
      '2026-09-01',
    ).months;

    expect(months.map((m) => [m.month, m.partial])).toEqual([
      ['2026-07', false],
      ['2026-08', false],
      ['2026-09', true],
    ]);
  });
});

describe('the period’s totals, averages and baseline', () => {
  const history = [
    // Three baseline months before the period.
    spend('2026-04-10', 100000),
    spend('2026-05-10', 200000),
    earn('2026-05-11', 400000),
    spend('2026-06-10', 300000),
    // The period itself: July has nothing, August and September do.
    earn('2026-08-01', 1000000),
    spend('2026-08-10', 400000),
    move('2026-08-11', 'card', 'jar', 200000),
    spend('2026-09-01', 200000),
  ];

  it('totals the period and keeps the identity', () => {
    const report = uah(history, { from: '2026-07', to: '2026-09' }, '2026-09-01');

    expect(report.period.spent).toEqual({ amount: '6000.00', currency: 'UAH' });
    expect(report.period.income).toEqual({ amount: '10000.00', currency: 'UAH' });
    expect(report.period.saved).toEqual({ amount: '2000.00', currency: 'UAH' });
    // 10000 − 6000 − 0 − 2000 − 0.
    expect(report.period.left).toEqual({ amount: '2000.00', currency: 'UAH' });
    expect(report.period.savingsRate).toBe(2000);
  });

  it('averages over the months of the period that hold the currency, never the empty ones', () => {
    const report = uah(history, { from: '2026-07', to: '2026-09' }, '2026-09-01');

    // August and September hold UAH; July is empty and is not divided by.
    expect(report.period.averagePerMonth.spent).toEqual({ amount: '3000.00', currency: 'UAH' });
  });

  it('stands the baseline on the months before the period that hold транзакції', () => {
    const report = uah(history, { from: '2026-07', to: '2026-09' }, '2026-09-01');

    expect(report.baseline).toEqual({
      monthsBefore: 3,
      averagePerMonth: {
        spent: { amount: '2000.00', currency: 'UAH' },
        income: { amount: '1333.33', currency: 'UAH' },
        invested: { amount: '0.00', currency: 'UAH' },
        saved: { amount: '0.00', currency: 'UAH' },
        lent: { amount: '0.00', currency: 'UAH' },
        left: { amount: '-666.67', currency: 'UAH' },
      },
    });
  });

  it('has no baseline when nothing precedes the period', () => {
    const report = uah([spend('2026-08-10', 100000)], { from: '2026-08', to: '2026-08' }, '2026-09-01');

    expect(report.baseline).toBeNull();
  });

  it('reaches no further back than twelve months', () => {
    const report = uah(
      [spend('2024-01-10', 100000), spend('2026-07-10', 100000), spend('2026-08-10', 100000)],
      { from: '2026-08', to: '2026-08' },
      '2026-09-01',
    );

    // 2024 is outside the twelve-month window; only July stands under the baseline.
    expect(report.baseline!.monthsBefore).toBe(1);
  });
});

describe('the identity of every month', () => {
  it('left is дохід − витрачено − інвестовано − відкладено − позичено, in decimal text', () => {
    const amount = fc.integer({ min: 1, max: 5_000_00 });
    const day = fc.integer({ min: 1, max: 28 }).map((d) => String(d).padStart(2, '0'));
    const month = fc.constantFrom('2026-07', '2026-08', '2026-09');
    const date = fc.tuple(month, day).map(([m, d]) => `${m}-${d}`);

    const anyTransaction = fc.oneof(
      fc.tuple(date, amount).map(([d, a]) => spend(d, a)),
      fc.tuple(date, amount).map(([d, a]) => earn(d, a)),
      fc.tuple(date, amount).map(([d, a]) => correct(d, -a)),
      fc.tuple(date, amount).map(([d, a]) => correct(d, a)),
      fc.tuple(date, amount, fc.constantFrom('jar', 'bonds', 'debt')).map(([d, a, to]) => move(d, 'card', to, a)),
      fc.tuple(date, amount, fc.constantFrom('jar', 'bonds', 'debt')).map(([d, a, from]) => move(d, from, 'card', a)),
    );

    fc.assert(
      fc.property(fc.array(anyTransaction, { maxLength: 30 }), (transactions) => {
        const period = resolvePeriod({ lastMonths: 3 }, '2026-09-15');
        const reports = monthlyReports({ period, accounts, transactions });

        for (const report of reports.values()) {
          for (const m of report.months) {
            const minor = (text: string) => BigInt(text.replace('.', ''));
            expect(minor(m.left.amount)).toBe(
              minor(m.income.amount) -
                minor(m.spent.amount) -
                minor(m.invested.amount) -
                minor(m.saved.amount) -
                minor(m.lent.amount),
            );
          }
        }
      }),
    );
  });
});
