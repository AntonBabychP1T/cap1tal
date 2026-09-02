import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Category, Source } from '../domain/category';
import type { Goal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import { expenseByDefault, transfer, type Transaction } from '../domain/transaction';
import {
  ANALYSIS_PACKAGE_SCHEMA,
  ANALYSIS_PACKAGE_VERSION,
  buildAnalysisPackage,
  type AnalysisInput,
  type AnalysisPackage,
} from './package';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'cash', name: 'Готівка', kind: 'cash', currency: 'UAH' }),
  account({ id: 'bonds', name: 'Військові облігації', kind: 'investment', currency: 'UAH' }),
  account({ id: 'jar-usd', name: 'Банка USD', kind: 'savings', currency: 'USD' }),
];

const categories: readonly Category[] = [
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'groceries', name: 'Продукти', archived: false },
];

const sources: readonly Source[] = [{ id: 'salary', name: 'Зарплата', archived: false }];

let seq = 0;
const id = () => `t${(seq += 1)}`;

const spend = (date: string, amount: number, categoryId = 'cafe', currency = 'UAH'): Transaction =>
  expenseByDefault({ id: id(), date, accountId: 'card', amount: money(amount, currency), categoryId });

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    kind: 'monthly-picture',
    period: { from: '2026-06', to: '2026-08' },
    included: { descriptions: false, transactions: false },
    builtOn: '2026-09-01',
    accounts,
    transactions: [spend('2026-06-10', 100000), spend('2026-07-10', 200000), spend('2026-08-10', 300000)],
    categories,
    sources,
    limits: [] as readonly CategoryLimit[],
    goals: [] as readonly Goal[],
    rates: [],
    ...over,
  };
}

const built = (over: Partial<AnalysisInput> = {}): AnalysisPackage =>
  buildAnalysisPackage(input(over)) as AnalysisPackage;

describe('buildAnalysisPackage', () => {
  it('Scenario: The same state builds the same пакет', () => {
    const transactions = [
      spend('2026-06-10', 100000, 'cafe'),
      spend('2026-07-10', 200000, 'groceries'),
      spend('2026-08-10', 300000, 'cafe'),
      spend('2026-08-11', 50000, 'groceries'),
    ];

    const once = built({ transactions });
    const again = built({ transactions: [...transactions].reverse() });

    expect(again).toEqual(once);
    expect(once).toMatchObject({
      schema: ANALYSIS_PACKAGE_SCHEMA,
      version: 1,
      kind: 'monthly-picture',
      builtOn: '2026-09-01',
      period: { from: '2026-06', to: '2026-08', months: 3, calendar: 'calendar-month' },
    });
    expect(ANALYSIS_PACKAGE_VERSION).toBe(1);
  });

  it('builds the same пакет from any read order at all', () => {
    // The requirement says «whatever the order the stored rows were read in», and names рахунки,
    // транзакції, категорії, ліміти and цілі — so every input list is shuffled, not just the
    // транзакції. A repository is free to return its rows in any order it likes.
    const transactions = [
      spend('2026-06-10', 100000, 'cafe'),
      spend('2026-07-10', 200000, 'groceries'),
      spend('2026-07-10', 200000, 'cafe'),
      spend('2026-08-10', 300000, 'cafe'),
      spend('2026-08-10', 300000, 'groceries'),
      spend('2026-08-11', 50000, 'groceries'),
      spend('2026-08-12', 7000, 'cafe', 'USD'),
    ];
    const limits: readonly CategoryLimit[] = [
      { categoryId: 'cafe', amount: money(80000, 'UAH') },
      { categoryId: 'groceries', amount: money(100000, 'UAH') },
    ];
    const goals: readonly Goal[] = [
      { id: 'g1', name: 'Авто', target: money(20_000_000, 'UAH'), deadline: '2026-12-31', accountId: 'bonds' },
      { id: 'g2', name: 'Ноутбук', target: money(5_000_000, 'UAH'), deadline: '2026-10-31', accountId: 'bonds' },
    ];
    const rates = [
      { currency: 'USD', rateMillionths: 41_000_000, obtainedAt: new Date(2026, 7, 30, 9, 0) },
      { currency: 'EUR', rateMillionths: 45_000_000, obtainedAt: new Date(2026, 7, 30, 9, 0) },
    ];
    const base = { transactions, limits, goals, rates };
    const expected = JSON.stringify(built(base));

    const shuffle = <T,>(rows: readonly T[]) =>
      fc.shuffledSubarray(rows as T[], { minLength: rows.length });

    fc.assert(
      fc.property(
        shuffle(transactions),
        shuffle(accounts),
        shuffle(categories),
        shuffle(sources),
        shuffle(limits),
        shuffle(goals),
        shuffle(rates),
        (...read) => {
          const [shuffledTransactions, shuffledAccounts, shuffledCategories, shuffledSources, shuffledLimits, shuffledGoals, shuffledRates] = read;
          expect(
            JSON.stringify(
              built({
                transactions: shuffledTransactions,
                accounts: shuffledAccounts,
                categories: shuffledCategories,
                sources: shuffledSources,
                limits: shuffledLimits,
                goals: shuffledGoals,
                rates: shuffledRates,
              }),
            ),
          ).toBe(expected);
        },
      ),
    );
  });

  it('Scenario: Building leaves the stored state untouched', () => {
    const transactions = Object.freeze([
      spend('2026-06-10', 100000),
      spend('2026-08-10', 300000),
    ]) as readonly Transaction[];
    const frozenAccounts = Object.freeze([...accounts]) as readonly Account[];
    const frozenCategories = Object.freeze([...categories]) as readonly Category[];
    const before = JSON.stringify({ transactions, frozenAccounts, frozenCategories });

    built({ transactions, accounts: frozenAccounts, categories: frozenCategories });

    expect(JSON.stringify({ transactions, frozenAccounts, frozenCategories })).toBe(before);
  });

  it('Scenario: Two currencies are two reports', () => {
    const transactions = [spend('2026-08-10', 412534, 'cafe'), spend('2026-08-11', 10000, 'cafe', 'USD')];

    const packaged = built({ transactions });

    expect(packaged.byCurrency.map((report) => report.currency)).toEqual(['UAH', 'USD']);
    expect(packaged.byCurrency[0]!.period.spent).toEqual({ amount: '4125.34', currency: 'UAH' });
    expect(packaged.byCurrency[1]!.period.spent).toEqual({ amount: '100.00', currency: 'USD' });
    expect(packaged.counts.currencies).toEqual(['UAH', 'USD']);
  });

  it('Scenario: The approximation is marked and dated', () => {
    const transactions = [spend('2026-08-10', 400000, 'cafe'), spend('2026-08-11', 10000, 'cafe', 'USD')];
    const rates = [
      { currency: 'USD', rateMillionths: 41_000_000, obtainedAt: new Date(2026, 7, 30, 9, 0) },
    ];

    const packaged = built({ transactions, rates });

    expect(packaged.approximateUah).toEqual({
      note: 'approximate',
      period: {
        // 4000.00 UAH + 100.00 USD at 41.
        spent: { amount: '8100.00', currency: 'UAH' },
        income: { amount: '0.00', currency: 'UAH' },
        invested: { amount: '0.00', currency: 'UAH' },
        saved: { amount: '0.00', currency: 'UAH' },
        lent: { amount: '0.00', currency: 'UAH' },
        left: { amount: '-8100.00', currency: 'UAH' },
      },
      rates: [{ currency: 'USD', rateAsOf: '2026-08-30' }],
    });
    // The per-currency reports are untouched by it.
    expect(packaged.byCurrency[0]!.period.spent).toEqual({ amount: '4000.00', currency: 'UAH' });
  });

  it('Scenario: No rate, no approximation', () => {
    const transactions = [spend('2026-08-10', 400000, 'cafe'), spend('2026-08-11', 10000, 'cafe', 'EUR')];

    expect(built({ transactions, rates: [] }).approximateUah).toBeNull();
  });

  it('has no approximation for a period of hryvnia alone', () => {
    expect(built().approximateUah).toBeNull();
  });

  it('Scenario: Account names stay on the phone', () => {
    const packaged = built();

    expect(packaged.counts.accountsByKind).toEqual({
      spending: 1,
      cash: 1,
      investment: 1,
      savings: 1,
      debt: 0,
    });
    const serialised = JSON.stringify(packaged);
    for (const name of ['mono black', 'Готівка', 'Військові облігації', 'Банка USD']) {
      expect(serialised).not.toContain(name);
    }
  });

  it('counts what the preview shows', () => {
    const transactions = [
      spend('2026-06-10', 100000, 'cafe'),
      spend('2026-07-10', 200000, 'groceries'),
      spend('2026-08-10', 300000, 'cafe'),
      // Outside the period: counted by neither the transactions nor the months.
      spend('2026-05-10', 900000, 'cafe'),
    ];

    const packaged = built({ transactions });

    expect(packaged.counts).toEqual({
      transactions: 3,
      categories: 2,
      currencies: ['UAH'],
      accountsByKind: { spending: 1, cash: 1, investment: 1, savings: 1, debt: 0 },
      monthsWithData: 3,
    });
    expect(packaged.history).toBe('sufficient');
  });

  it('Scenario: An empty period is refused', () => {
    expect(buildAnalysisPackage(input({ period: { from: '2026-01', to: '2026-03' } }))).toEqual({
      kind: 'empty-period',
    });
  });

  it('Scenario: A short history is flagged', () => {
    const packaged = built({
      period: { lastMonths: 6 },
      transactions: [spend('2026-09-01', 100000)],
    });

    expect(packaged.history).toBe('short');
    expect(packaged.counts.monthsWithData).toBe(1);
  });

  it('carries the два opt-ins only when they are switched on', () => {
    const transactions = [
      expenseByDefault({
        id: id(),
        date: '2026-08-10',
        accountId: 'card',
        amount: money(100000, 'UAH'),
        categoryId: 'groceries',
        description: 'СІЛЬПО',
      }),
      transfer({
        id: id(),
        date: '2026-08-11',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
      }),
    ];

    const closed = built({ transactions });
    expect(closed.transactions).toBeUndefined();
    expect(closed.byCurrency[0]!.merchants).toBeUndefined();
    expect(JSON.stringify(closed)).not.toContain('СІЛЬПО');

    const open = built({ transactions, included: { descriptions: true, transactions: true } });
    expect(open.transactions).toHaveLength(2);
    expect(open.byCurrency[0]!.merchants).toEqual([
      {
        merchant: 'сільпо',
        total: { amount: '1000.00', currency: 'UAH' },
        count: 1,
        categories: ['Продукти'],
        recurring: false,
      },
    ]);
  });

  it('carries every ціль with what remains, and no рахунок', () => {
    const goals: readonly Goal[] = [
      {
        id: 'g1',
        name: 'Авто',
        target: money(20_000_000, 'UAH'),
        deadline: '2026-12-31',
        accountId: 'bonds',
      },
    ];

    const packaged = built({ goals });

    expect(packaged.goals).toEqual([
      {
        name: 'Авто',
        target: { amount: '200000.00', currency: 'UAH' },
        progress: { amount: '0.00', currency: 'UAH' },
        remaining: { amount: '200000.00', currency: 'UAH' },
        deadline: '2026-12-31',
        reached: false,
        overdue: false,
        monthsLeft: 4,
        perMonth: { amount: '50000.00', currency: 'UAH' },
      },
    ]);
  });
});
