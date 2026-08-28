import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import { namesById } from '../domain/category';
import type { Goal } from '../domain/goals';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  FEES_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { reportsViewModel } from './reports-screen';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const usdCard = account({ id: 'usd', name: 'USD card', kind: 'spending', currency: 'USD' });
const wallet = account({ id: 'wallet', name: 'готівка', kind: 'cash', currency: 'UAH' });
const jar = account({
  id: 'jar',
  name: 'Подушка',
  kind: 'savings',
  currency: 'UAH',
  openingBalance: money(5000000, 'UAH'),
});
const brokerage = account({ id: 'ib', name: 'IB', kind: 'investment', currency: 'UAH' });
const ACCOUNTS: readonly Account[] = [card, usdCard, wallet, jar, brokerage];

/** A fixed instant in August 2026 — the clock is data these tests control. */
const august = new Date(2026, 7, 24, 12, 0, 0);

const names = namesById([
  { id: 'groceries', name: 'Groceries' },
  { id: 'pets', name: 'Pets' },
  { id: 'books', name: 'Books' },
  { id: FEES_CATEGORY_ID, name: 'Комісія' },
]);

const spend = (
  id: string,
  date: string,
  amount: number,
  categoryId = 'groceries',
  currency = 'UAH',
) =>
  expenseByDefault({
    id,
    date,
    accountId: currency === 'USD' ? 'usd' : 'card',
    amount: money(amount, currency),
    categoryId,
  });

const view = (
  transactions: Transaction[],
  over: Partial<Parameters<typeof reportsViewModel>[0]> = {},
) =>
  reportsViewModel({
    accounts: ACCOUNTS,
    transactions,
    categoryNames: names,
    goals: [],
    now: august,
    ...over,
  });

describe('the Звіти history chart', () => {
  it('Scenario: The history is shown by month', () => {
    const model = view([
      spend('e1', '2026-06-10', 100000),
      spend('e2', '2026-07-10', 200000),
      spend('e3', '2026-08-10', 400000),
    ]);

    expect(model.history.map((column) => column.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(model.history.map((column) => column.label)).toEqual([
      'Чер 2026',
      'Лип 2026',
      'Сер 2026',
    ]);
    // Each column holds витрачено, дохід and інвестовано — the month's own picture.
    expect(model.history[0]!.bars.map((b) => b.label)).toEqual([
      'Витрачено',
      'Дохід',
      'Інвестовано',
    ]);
    expect(model.history.map((c) => c.bars[0]!.amount)).toEqual([
      '1000,00 UAH',
      '2000,00 UAH',
      '4000,00 UAH',
    ]);
    // Bars are measured against the largest of the chart, so the biggest month is full height.
    expect(model.history.map((c) => c.bars[0]!.size)).toEqual([0.25, 0.5, 1]);
    expect(model.emptyHistoryMessage).toBeNull();
  });

  it('A month of returns is flagged negative rather than drawn upwards', () => {
    // Money coming back out of an інвестиційний рахунок: інвестовано below zero for that month.
    const back = transfer({
      id: 't1',
      date: '2026-08-15',
      fromAccountId: 'ib',
      toAccountId: 'card',
      left: money(150000, 'UAH'),
      arrived: money(150000, 'UAH'),
    });

    const invested = view([back]).history.at(-1)!.bars.find((b) => b.key === 'invested')!;

    expect(invested.amount).toBe('−1500,00 UAH');
    expect(invested.negative).toBe(true);
    // Its height is its size, which is never negative — the flag is what puts it below the line.
    expect(invested.size).toBe(1);
    // And the chart says it needs room under the baseline; a chart without one does not.
    expect(view([back]).historyHasNegative).toBe(true);
    expect(view([spend('e1', '2026-08-10', 100000)]).historyHasNegative).toBe(false);
  });

  it('Scenario: One currency at a time, UAH first', () => {
    const model = view([spend('e1', '2026-08-10', 100000), spend('e2', '2026-08-11', 5000, 'groceries', 'USD')]);

    expect(model.currencies).toEqual(['UAH', 'USD']);
    expect(model.shownCurrency).toBe('UAH');
    expect(model.canSwitchCurrency).toBe(true);
    // No number of the shown chart is anything but UAH.
    expect(model.history.flatMap((c) => c.bars).every((b) => b.amount.endsWith('UAH'))).toBe(true);

    const switched = view(
      [spend('e1', '2026-08-10', 100000), spend('e2', '2026-08-11', 5000, 'groceries', 'USD')],
      { shownCurrency: 'USD' },
    );
    expect(switched.shownCurrency).toBe('USD');
    expect(switched.history.flatMap((c) => c.bars).every((b) => b.amount.endsWith('USD'))).toBe(true);
  });

  it('Without UAH the tab opens on the first occurring currency alphabetically', () => {
    const model = view([
      spend('e1', '2026-08-10', 5000, 'groceries', 'USD'),
    ]);

    expect(model.currencies).toEqual(['USD']);
    expect(model.shownCurrency).toBe('USD');
  });

  it('Scenario: A single-currency history offers no switch', () => {
    const model = view([spend('e1', '2026-08-10', 100000)]);

    expect(model.currencies).toEqual(['UAH']);
    expect(model.canSwitchCurrency).toBe(false);
  });

  it('Scenario: An empty history says it is empty', () => {
    const model = view([]);

    expect(model.history).toEqual([]);
    expect(model.shownCurrency).toBeNull();
    expect(model.canSwitchCurrency).toBe(false);
    expect(model.emptyHistoryMessage).toBe('Історія порожня — ще нічого не записано.');
  });

  it('A history of nothing but neutral переказ says so in its own words', () => {
    const move = transfer({
      id: 't1',
      date: '2026-08-15',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(50000, 'UAH'),
      arrived: money(50000, 'UAH'),
    });

    expect(view([move]).emptyHistoryMessage).toBe(
      'За всю історію гроші лише переходили між рахунками.',
    );
  });
});

describe('the Звіти category chart', () => {
  const history: Transaction[] = [
    spend('e1', '2026-08-10', 300000, 'groceries'),
    spend('e2', '2026-08-11', 500, FEES_CATEGORY_ID),
    spend('e3', '2026-07-10', 20000, 'pets'),
  ];

  it('Scenario: The chooser offers the categories of the history', () => {
    // Pets is archived with stored витрати and is offered all the same; Books carries no
    // транзакція and is not.
    const model = view(history);

    expect(model.categoryChoices.map((c) => c.label)).toEqual(['Комісія', 'Groceries', 'Pets']);
    expect(model.categoryChoices.map((c) => c.id)).not.toContain('books');
  });

  it('Scenario: The chosen category is shown by month', () => {
    const model = view(history, { chosenCategoryId: 'groceries' });

    expect(model.chosenCategoryId).toBe('groceries');
    expect(model.chosenCategoryLabel).toBe('Groceries');
    expect(model.categoryChart.map((c) => [c.month, c.amount])).toEqual([
      ['2026-07', '0,00 UAH'],
      ['2026-08', '3000,00 UAH'],
    ]);
    // Nothing chosen, nothing charted — the chooser is a question, not a default.
    expect(view(history).categoryChart).toEqual([]);
    expect(view(history).chosenCategoryId).toBeNull();
  });

  it('Scenario: A two-currency category follows the shown currency', () => {
    const both: Transaction[] = [
      spend('e1', '2026-08-10', 300000, 'groceries'),
      spend('e2', '2026-08-11', 5000, 'groceries', 'USD'),
    ];

    expect(view(both, { chosenCategoryId: 'groceries' }).categoryChart.map((c) => c.amount)).toEqual([
      '3000,00 UAH',
    ]);
    expect(
      view(both, { chosenCategoryId: 'groceries', shownCurrency: 'USD' }).categoryChart.map(
        (c) => c.amount,
      ),
    ).toEqual(['50,00 USD']);
  });

  it('Scenario: A renamed category is offered under its new name', () => {
    const renamed = namesById([{ id: 'groceries', name: 'Продукти' }]);

    const model = reportsViewModel({
      accounts: ACCOUNTS,
      transactions: history,
      categoryNames: renamed,
      goals: [],
      chosenCategoryId: 'groceries',
      now: august,
    });

    expect(model.categoryChoices.find((c) => c.id === 'groceries')?.label).toBe('Продукти');
    expect(model.chosenCategoryLabel).toBe('Продукти');
    // The same stored id, the same series — only the name the owner gave the row moved.
    expect(model.categoryChart.map((c) => c.amount)).toEqual(
      view(history, { chosenCategoryId: 'groceries' }).categoryChart.map((c) => c.amount),
    );
  });

  it('A refunded month is flagged negative, and the bars are measured against the largest', () => {
    const transactions: Transaction[] = [
      spend('e1', '2026-07-10', 40000, 'groceries'),
      refund({
        id: 'r1',
        date: '2026-07-11',
        accountId: 'card',
        amount: money(100000, 'UAH'),
        categoryId: 'groceries',
      }),
      spend('e2', '2026-08-10', 120000, 'groceries'),
    ];

    const chart = view(transactions, { chosenCategoryId: 'groceries' }).categoryChart;

    expect(chart.map((c) => [c.amount, c.negative, c.size])).toEqual([
      ['−600,00 UAH', true, 0.5],
      ['1200,00 UAH', false, 1],
    ]);
    expect(view(transactions, { chosenCategoryId: 'groceries' }).categoryChartHasNegative).toBe(true);
    expect(view(history, { chosenCategoryId: 'groceries' }).categoryChartHasNegative).toBe(false);
  });
});

describe('the Звіти цілі', () => {
  const car: Goal = {
    id: 'g-car',
    name: 'Авто',
    target: money(20000000, 'UAH'),
    deadline: '2026-12-31',
    accountId: 'jar',
  };

  it('Scenario: A ціль shows its progress', () => {
    const model = view([], { goals: [car] });

    expect(model.goals).toEqual([
      {
        id: 'g-car',
        name: 'Авто',
        target: '200000,00 UAH',
        deadline: '2026-12-31',
        progress: '50000,00 UAH',
        reached: false,
        overdue: false,
      },
    ]);
    expect(model.emptyGoalsMessage).toBeNull();
  });

  it('Scenario: A reached ціль is marked', () => {
    const small: Goal = { ...car, target: money(5000000, 'UAH') };

    const row = view([], { goals: [small] }).goals[0]!;

    expect(row.reached).toBe(true);
    expect(row.overdue).toBe(false);
  });

  it('Scenario: An overdue ціль is marked', () => {
    const lastYear: Goal = { ...car, deadline: '2025-12-31' };

    const row = view([], { goals: [lastYear] }).goals[0]!;

    expect(row.overdue).toBe(true);
    expect(row.reached).toBe(false);
    // A reached ціль past its дата is not overdue.
    const reached: Goal = { ...lastYear, target: money(5000000, 'UAH') };
    expect(view([], { goals: [reached] }).goals[0]!.overdue).toBe(false);
  });

  it('A переказ into the рахунок moves the progress the ціль shows', () => {
    const arrival = transfer({
      id: 't1',
      date: '2026-08-20',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(1000000, 'UAH'),
      arrived: money(1000000, 'UAH'),
    });

    expect(view([arrival], { goals: [car] }).goals[0]!.progress).toBe('60000,00 UAH');
  });

  it('Scenario: No цілі is said plainly', () => {
    const model = view([spend('e1', '2026-08-10', 100000)]);

    expect(model.goals).toEqual([]);
    expect(model.emptyGoalsMessage).toBe('Цілей поки немає.');
  });
});
