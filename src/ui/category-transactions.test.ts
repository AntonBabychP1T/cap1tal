import { describe, expect, it } from 'vitest';

import { namesById } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { money, type CurrencyCode } from '../domain/money';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Expense,
  type Income,
  type Refund,
  type Transaction,
} from '../domain/transaction';
import { categoryMonthHeading, categoryTransactions } from './category-transactions';

const expense = (
  id: string,
  date: string,
  categoryId: string,
  amount = 10000,
  currency: CurrencyCode = 'UAH',
): Expense => ({
  type: 'expense',
  id,
  date,
  accountId: 'card',
  amount: money(amount, currency),
  categoryId,
});

const refundTx = (id: string, date: string, categoryId: string, amount = 5000): Refund => ({
  type: 'refund',
  id,
  date,
  accountId: 'card',
  amount: money(amount, 'UAH'),
  categoryId,
});

const correction = (id: string, date: string, amount: number): Correction => ({
  type: 'correction',
  id,
  date,
  accountId: 'card',
  amount: money(amount, 'UAH'),
});

const income = (id: string, date: string): Income => ({
  type: 'income',
  id,
  date,
  accountId: 'card',
  amount: money(5000000, 'UAH'),
  sourceId: 'salary',
});

const transferTx = (id: string, date: string) =>
  transfer({
    id,
    date,
    fromAccountId: 'card',
    toAccountId: 'jar',
    left: money(200000, 'UAH'),
    arrived: money(200000, 'UAH'),
  });

const idsOf = (transactions: Transaction[]) => transactions.map((t) => t.id);

describe('categoryTransactions', () => {
  it('Scenario: A category opens its month\'s transactions', () => {
    const transactions: Transaction[] = [
      expense('e1', '2026-08-03', UNCATEGORISED_CATEGORY_ID),
      refundTx('r1', '2026-08-09', UNCATEGORISED_CATEGORY_ID),
      // Another category, the same month.
      expense('e2', '2026-08-11', FEES_CATEGORY_ID),
      // The same category, another month — on both sides of August.
      expense('e3', '2026-07-31', UNCATEGORISED_CATEGORY_ID),
      expense('e4', '2026-09-01', UNCATEGORISED_CATEGORY_ID),
      // Neither is spent, so neither belongs to any category's list.
      income('i1', '2026-08-05'),
      transferTx('t1', '2026-08-06'),
      // A коригування belongs to the correction category, not to this one.
      correction('c1', '2026-08-07', -3000),
    ];

    expect(
      idsOf(
        categoryTransactions({
          month: '2026-08',
          categoryId: UNCATEGORISED_CATEGORY_ID,
          transactions,
        }),
      ),
    ).toEqual(['e1', 'r1']);
  });

  it('Scenario: The correction list holds corrections of either sign', () => {
    const transactions: Transaction[] = [
      correction('c1', '2026-08-07', -3000),
      correction('c2', '2026-08-08', 3000),
      expense('e1', '2026-08-03', UNCATEGORISED_CATEGORY_ID),
      correction('c3', '2026-07-31', -9999),
    ];

    // Both signs are listed, even though only the negative one entered the row's amount.
    expect(
      idsOf(
        categoryTransactions({
          month: '2026-08',
          categoryId: CORRECTION_CATEGORY_ID,
          transactions,
        }),
      ),
    ).toEqual(['c1', 'c2']);
  });

  it('Scenario: A category\'s list is not split by currency', () => {
    const transactions: Transaction[] = [
      expense('e1', '2026-08-03', UNCATEGORISED_CATEGORY_ID, 100000, 'UAH'),
      expense('e2', '2026-08-04', UNCATEGORISED_CATEGORY_ID, 10000, 'USD'),
      expense('e3', '2026-08-05', UNCATEGORISED_CATEGORY_ID, 5000, 'EUR'),
    ];

    const listed = categoryTransactions({
      month: '2026-08',
      categoryId: UNCATEGORISED_CATEGORY_ID,
      transactions,
    });

    expect(idsOf(listed)).toEqual(['e1', 'e2', 'e3']);
    // Each keeps its own currency; nothing is converted or combined to get them into one list.
    expect(listed.map((t) => (t.type === 'transfer' ? '' : t.amount.currency))).toEqual([
      'UAH',
      'USD',
      'EUR',
    ]);
  });

  it('A category with nothing in the month yields an empty list, not an error', () => {
    expect(
      categoryTransactions({
        month: '2026-08',
        categoryId: 'food',
        transactions: [expense('e1', '2026-08-03', UNCATEGORISED_CATEGORY_ID)],
      }),
    ).toEqual([]);
  });

  it('A category that is not the correction one never picks up a коригування', () => {
    const transactions: Transaction[] = [correction('c1', '2026-08-07', -3000)];

    for (const categoryId of [UNCATEGORISED_CATEGORY_ID, FEES_CATEGORY_ID, 'food']) {
      expect(categoryTransactions({ month: '2026-08', categoryId, transactions })).toEqual([]);
    }
  });

  it('The order given is the order kept', () => {
    const transactions: Transaction[] = [
      expense('e3', '2026-08-01', 'food'),
      expense('e1', '2026-08-02', 'food'),
      expense('e2', '2026-08-03', 'food'),
    ];

    expect(idsOf(categoryTransactions({ month: '2026-08', categoryId: 'food', transactions }))).toEqual(
      ['e3', 'e1', 'e2'],
    );
  });
});

/**
 * The drill-down carries the same over-limit mark the feed and the Місяць breakdown do
 * (main-screen: "wherever a category's month-scoped транзакції are listed").
 */
describe('categoryMonthHeading', () => {
  const names = namesById([{ id: 'food', name: 'Groceries' }]);
  const limits: CategoryLimit[] = [{ categoryId: 'food', amount: money(250000, 'UAH') }];

  it('Scenario: A витрата in an over-limit category is marked', () => {
    const transactions: Transaction[] = [expense('e1', '2026-08-10', 'food', 260000)];

    expect(categoryMonthHeading({ month: '2026-08', categoryId: 'food', transactions, categoryNames: names, limits })).toEqual(
      {
        label: 'Groceries',
        overLimit: true,
        spent: ['2 600,00 UAH'],
        overrun: 'Перевищено ліміт на 100,00 UAH',
        settled: null,
      },
    );
  });

  it('Scenario: A line in an under-limit month is not marked', () => {
    const transactions: Transaction[] = [
      expense('e1', '2026-08-10', 'food', 260000),
      expense('e2', '2026-07-10', 'food', 100000),
    ];

    expect(
      categoryMonthHeading({ month: '2026-07', categoryId: 'food', transactions, categoryNames: names, limits })
        .overLimit,
    ).toBe(false);
  });

  it('A category with no ліміт is named and never marked', () => {
    const transactions: Transaction[] = [expense('e1', '2026-08-10', 'food', 99_000_000)];

    expect(
      categoryMonthHeading({ month: '2026-08', categoryId: 'food', transactions, categoryNames: names, limits: [] }),
    ).toEqual({
      label: 'Groceries',
      overLimit: false,
      spent: ['990 000,00 UAH'],
      overrun: null,
      settled: null,
    });
  });
});

/**
 * The drill-down carried a red title and nothing else: the сума it is a drill-down of was one tap
 * behind it. It is the breakdown's own number, from the same `categoryBreakdown` the row came from.
 */
describe('the category’s own сума and its overrun', () => {
  const names = namesById([{ id: 'food', name: 'Groceries' }]);
  const uahLimit: CategoryLimit[] = [{ categoryId: 'food', amount: money(250000, 'UAH') }];

  const heading = (transactions: Transaction[], limits: CategoryLimit[] = uahLimit) =>
    categoryMonthHeading({
      month: '2026-08',
      categoryId: 'food',
      transactions,
      categoryNames: names,
      limits,
    });

  it('Scenario: The category’s own сума is stated', () => {
    expect(heading([expense('e1', '2026-08-10', 'food', 260000)], []).spent).toEqual([
      '2 600,00 UAH',
    ]);
  });

  it('Scenario: An over-limit category says by how much', () => {
    const model = heading([expense('e1', '2026-08-10', 'food', 260000)]);

    expect(model.overLimit).toBe(true);
    expect(model.overrun).toBe('Перевищено ліміт на 100,00 UAH');
  });

  it('Scenario: Spending at the ліміт states no overrun', () => {
    const model = heading([expense('e1', '2026-08-10', 'food', 250000)]);

    expect(model.spent).toEqual(['2 500,00 UAH']);
    expect(model.overLimit).toBe(false);
    expect(model.overrun).toBeNull();
  });

  it('Scenario: A category with no ліміт states no overrun', () => {
    const model = heading([expense('e1', '2026-08-10', 'food', 260000)], []);

    expect(model.spent).toEqual(['2 600,00 UAH']);
    expect(model.overrun).toBeNull();
  });

  it('Scenario: Two currencies are stated apart', () => {
    const model = heading([
      expense('e1', '2026-08-10', 'food', 260000),
      expense('e2', '2026-08-11', 'food', 10000, 'USD'),
    ]);

    // Two sums, UAH first, neither combined with the other.
    expect(model.spent).toEqual(['2 600,00 UAH', '100,00 USD']);
    // And one overrun, in the currency the ліміт is judged in.
    expect(model.overrun).toBe('Перевищено ліміт на 100,00 UAH');
  });

  it('A month the category has nothing in states no сума', () => {
    const model = heading([expense('e1', '2026-08-10', 'other', 260000)], []);

    expect(model.spent).toEqual([]);
    expect(model.overrun).toBeNull();
  });

  it('An overrun is stated exactly when the category is over its ліміт', () => {
    for (const amount of [1, 249999, 250000, 250001, 999999]) {
      const model = heading([expense('e1', '2026-08-10', 'food', amount)]);
      expect(model.overrun !== null, `${amount} minor units`).toBe(model.overLimit);
    }
  });

  it('Spending in another currency alone never states an overrun', () => {
    // The UAH ліміт was never touched: nothing in it was spent, and no rate exists to convert.
    const model = heading([expense('e1', '2026-08-11', 'food', 99_000_000, 'USD')]);

    expect(model.spent).toEqual(['990 000,00 USD']);
    expect(model.overLimit).toBe(false);
    expect(model.overrun).toBeNull();
  });
});

describe('the settled verdict of a month that has ended', () => {
  const restaurants: CategoryLimit = { categoryId: 'restaurants', amount: money(200000, 'UAH') };
  const eat = (id: string, date: string, amount: number) =>
    expense(id, date, 'restaurants', amount);
  const names = new Map([['restaurants', 'Ресторани']]);

  const heading = (month: string, transactions: readonly Transaction[], currentMonth?: string) =>
    categoryMonthHeading({
      month,
      categoryId: 'restaurants',
      transactions,
      categoryNames: names,
      limits: [restaurants],
      ...(currentMonth === undefined ? {} : { currentMonth }),
    });

  it('Scenario: A month that ended within the ліміт says so', () => {
    const august = [eat('a1', '2026-08-05', 180000)];

    expect(heading('2026-08', august, '2026-09').settled).toBe('Місяць завершено в межах ліміту');
  });

  it('Scenario: The current month gets no settled verdict', () => {
    const august = [eat('a1', '2026-08-05', 180000)];

    // Still being spent: the сума and, where there is one, the overrun — and no verdict.
    const shown = heading('2026-08', august, '2026-08');
    expect(shown.settled).toBeNull();
    expect(shown.spent).toEqual(['1 800,00 UAH']);
    expect(shown.overrun).toBeNull();
  });

  it('Scenario: A month that ended over the ліміт states its overrun, not a verdict of keeping it', () => {
    const august = [eat('a1', '2026-08-05', 248000)];

    const shown = heading('2026-08', august, '2026-09');
    expect(shown.overrun).toBe('Перевищено ліміт на 480,00 UAH');
    expect(shown.settled).toBeNull();
  });

  it('Scenario: A month that has not started carries no verdict', () => {
    // Later than the current month: nothing has been spent in it yet, and «в межах» about a month
    // nobody has lived is an absence dressed as a verdict. The state is the caller's to withhold,
    // and this is the caller.
    const shown = heading('2026-12', [], '2026-09');

    expect(shown.settled).toBeNull();
    expect(shown.overrun).toBeNull();
    expect(shown.spent).toEqual([]);
  });

  it('A category carrying no ліміт states no verdict, whatever month it is', () => {
    const shown = categoryMonthHeading({
      month: '2026-08',
      categoryId: 'restaurants',
      transactions: [eat('a1', '2026-08-05', 180000)],
      categoryNames: names,
      limits: [],
      currentMonth: '2026-09',
    });

    expect(shown.settled).toBeNull();
  });

  it('A verdict is settled by that month’s own транзакції and by no later month’s', () => {
    const history = [eat('a1', '2026-08-05', 180000), eat('s1', '2026-09-05', 250000)];

    // September running far past the ceiling does not reopen August.
    expect(heading('2026-08', history, '2026-10').settled).toBe('Місяць завершено в межах ліміту');
    // …and a retroactive транзакція dated inside August does settle it anew.
    const late = [...history, eat('a2', '2026-08-27', 30000)];
    expect(heading('2026-08', late, '2026-10').settled).toBeNull();
    expect(heading('2026-08', late, '2026-10').overrun).toBe('Перевищено ліміт на 100,00 UAH');
  });
});
