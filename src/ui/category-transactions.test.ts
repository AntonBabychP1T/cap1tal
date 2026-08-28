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
      { label: 'Groceries', overLimit: true },
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
    ).toEqual({ label: 'Groceries', overLimit: false });
  });
});
