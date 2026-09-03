import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import { namesById } from '../domain/category';
import type { AccumulationGoal } from '../domain/goals';
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
/** The 1st of the next month: the day the newest month of the span holds nothing at all. */
const september = new Date(2026, 8, 1, 12, 0, 0);

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
      '1 000,00 UAH',
      '2 000,00 UAH',
      '4 000,00 UAH',
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

    expect(invested.amount).toBe('−1 500,00 UAH');
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
      ['2026-08', '3 000,00 UAH'],
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
      '3 000,00 UAH',
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
      ['1 200,00 UAH', false, 1],
    ]);
    expect(view(transactions, { chosenCategoryId: 'groceries' }).categoryChartHasNegative).toBe(true);
    expect(view(history, { chosenCategoryId: 'groceries' }).categoryChartHasNegative).toBe(false);
  });
});

describe('the Звіти цілі', () => {
  const car: AccumulationGoal = {
    id: 'g-car',
    name: 'Авто',
    target: money(20000000, 'UAH'),
    deadline: '2026-12-31',
    accountIds: ['jar'],
  };
  const restaurants = { categoryId: 'groceries', amount: money(200000, 'UAH') };
  const categories = [
    { id: 'groceries', name: 'Groceries', archived: false },
    { id: 'pets', name: 'Pets', archived: true },
  ];

  it('Scenario: A ціль shows its progress', () => {
    const model = view([], { goals: [{ ...car, accountIds: ['jar', 'card', 'wallet', 'ib'] }] });

    expect(model.goals.accumulation).toEqual([
      {
        kind: 'accumulation',
        id: 'g-car',
        name: 'Авто',
        target: '200 000,00 UAH',
        deadline: '2026-12-31',
        progress: '50 000,00 UAH',
        percentage: 25,
        leftToAccumulate: '150 000,00 UAH',
        accountCount: '4 рахунки',
        reached: false,
        overdue: false,
        approximate: false,
        uncountable: null,
        route: '/goal/g-car',
      },
    ]);
    expect(model.emptyGoalsMessage).toBeNull();
  });

  it('Scenario: A ціль витрат shows what is left of its month', () => {
    const model = view([spend('e1', '2026-08-10', 132000)], {
      limits: [restaurants],
      categories,
    });

    expect(model.goals.spending).toEqual([
      {
        kind: 'spending',
        categoryId: 'groceries',
        name: 'Groceries',
        spent: '1 320,00 UAH',
        ceiling: '2 000,00 UAH',
        percentageUsed: 66,
        mayStillSpend: '680,00 UAH',
        exceededBy: null,
        month: '2026-08',
        monthLabel: 'Серпень 2026',
        archived: false,
        route: '/category/2026-08/groceries',
      },
    ]);
  });

  it('Scenario: An exceeded ціль витрат shows the excess and no percentage', () => {
    const model = view([spend('e1', '2026-08-10', 248000)], {
      limits: [restaurants],
      categories,
    });

    const row = model.goals.spending[0]!;
    expect(row.exceededBy).toBe('480,00 UAH');
    expect(row.percentageUsed).toBeNull();
    expect(row.mayStillSpend).toBeNull();
    // Nothing about it reads as reached, done or complete.
    expect('reached' in row).toBe(false);
  });

  it('Scenario: The two kinds are not mixed together', () => {
    const model = view([spend('e1', '2026-08-10', 132000)], {
      goals: [car],
      limits: [restaurants],
      categories,
    });

    expect(model.goals.accumulationTitle).toBe('Накопичення');
    expect(model.goals.spendingTitle).toBe('Ліміти витрат');
    expect(model.goals.accumulation.every((row) => row.kind === 'accumulation')).toBe(true);
    expect(model.goals.spending.every((row) => row.kind === 'spending')).toBe(true);
    expect(model.goals.accumulation).toHaveLength(1);
    expect(model.goals.spending).toHaveLength(1);
  });

  it('Scenario: A reached ціль is marked', () => {
    const small: AccumulationGoal = { ...car, target: money(5000000, 'UAH') };

    const row = view([], { goals: [small] }).goals.accumulation[0]!;

    expect(row.reached).toBe(true);
    expect(row.overdue).toBe(false);
    expect(row.leftToAccumulate).toBeNull();
  });

  it('Scenario: An overdue ціль is marked', () => {
    const lastYear: AccumulationGoal = { ...car, deadline: '2025-12-31' };

    const row = view([], { goals: [lastYear] }).goals.accumulation[0]!;

    expect(row.overdue).toBe(true);
    expect(row.reached).toBe(false);
    // A reached ціль past its дата is not overdue.
    const reached: AccumulationGoal = { ...lastYear, target: money(5000000, 'UAH') };
    expect(view([], { goals: [reached] }).goals.accumulation[0]!.overdue).toBe(false);
  });

  it('Scenario: An approximate progress is marked', () => {
    const mixed: AccumulationGoal = { ...car, accountIds: ['jar', 'usd'] };
    const arrival = transfer({
      id: 't-usd',
      date: '2026-08-02',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(1000000, 'UAH'),
      arrived: money(30000, 'USD'),
    });

    const row = view([arrival], {
      goals: [mixed],
      rates: [{ currency: 'USD', rateMillionths: 41_250_000 }],
    }).goals.accumulation[0]!;

    expect(row.approximate).toBe(true);
    expect(row.progress).toBe('62 375,00 UAH');
    expect(row.uncountable).toBeNull();
  });

  it('Scenario: A progress that cannot be counted says so', () => {
    const mixed: AccumulationGoal = { ...car, accountIds: ['jar', 'usd'] };
    const arrival = transfer({
      id: 't-usd',
      date: '2026-08-02',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(1000000, 'UAH'),
      arrived: money(30000, 'USD'),
    });

    // No rate at all for USD.
    const row = view([arrival], { goals: [mixed], rates: [] }).goals.accumulation[0]!;

    expect(row.progress).toBeNull();
    expect(row.percentage).toBeNull();
    expect(row.uncountable).toContain('USD');
    // Marked neither reached nor overdue: an unknown progress is not a verdict.
    expect(row.reached).toBe(false);
    expect(row.overdue).toBe(false);
  });

  it('An overdue дата does not make an uncountable ціль overdue', () => {
    const mixed: AccumulationGoal = {
      ...car,
      deadline: '2025-12-31',
      accountIds: ['jar', 'usd'],
    };
    const arrival = transfer({
      id: 't-usd',
      date: '2026-08-02',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(1000000, 'UAH'),
      arrived: money(30000, 'USD'),
    });

    expect(view([arrival], { goals: [mixed], rates: [] }).goals.accumulation[0]!.overdue).toBe(
      false,
    );
  });

  it('Scenario: A ціль витрат of an archived категорія is set apart, not hidden', () => {
    const model = view([], {
      limits: [restaurants, { categoryId: 'pets', amount: money(100000, 'UAH') }],
      categories,
    });

    expect(model.goals.spending.map((row) => ({ id: row.categoryId, archived: row.archived }))).toEqual([
      { id: 'groceries', archived: false },
      // Listed among the цілі витрат, after the rest, visibly set apart.
      { id: 'pets', archived: true },
    ]);
  });

  it('A переказ into a рахунок of the склад moves the progress the ціль shows', () => {
    const arrival = transfer({
      id: 't1',
      date: '2026-08-20',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(1000000, 'UAH'),
      arrived: money(1000000, 'UAH'),
    });

    expect(view([arrival], { goals: [car] }).goals.accumulation[0]!.progress).toBe(
      '60 000,00 UAH',
    );
  });

  it('A ціль without a дата is shown without one and is never overdue', () => {
    const undated: AccumulationGoal = {
      id: 'g-reserve',
      name: 'Резерв',
      target: money(30000000, 'UAH'),
      accountIds: ['jar'],
    };

    const row = view([], { goals: [undated] }).goals.accumulation[0]!;
    expect(row.deadline).toBeNull();
    expect(row.overdue).toBe(false);
  });

  it('Scenario: No цілі is said plainly', () => {
    const model = view([spend('e1', '2026-08-10', 100000)]);

    expect(model.goals.accumulation).toEqual([]);
    expect(model.goals.spending).toEqual([]);
    expect(model.emptyGoalsMessage).toBe('Цілей поки немає.');
  });

  it('A ліміт alone is цілі enough: the tab does not say there are none', () => {
    const model = view([], { limits: [restaurants], categories });

    expect(model.emptyGoalsMessage).toBeNull();
  });
});

describe('every chart states its scale', () => {
  it('Scenario: The history chart states its tallest сума', () => {
    const model = view([
      spend('e1', '2026-06-10', 100000),
      spend('e2', '2026-08-10', 4500000),
    ]);

    expect(model.historyAxis).toEqual({ top: '45 000,00 UAH', zero: '0,00 UAH', bottom: null });
    // The top of the scale is what a full-height bar stands for, so the two agree by construction.
    const tallest = model.history.flatMap((c) => c.bars).find((b) => b.size === 1)!;
    expect(tallest.amount).toBe(model.historyAxis!.top);
  });

  it('Scenario: A chart with no negative month states no bottom', () => {
    const model = view([spend('e1', '2026-08-10', 100000)]);

    expect(model.historyHasNegative).toBe(false);
    expect(model.historyAxis!.bottom).toBeNull();
  });

  it('Scenario: A chart with a negative month states its bottom', () => {
    // Money out of an інвестиційний рахунок: інвестовано below zero for that month.
    const back = transfer({
      id: 't1',
      date: '2026-08-15',
      fromAccountId: 'ib',
      toAccountId: 'card',
      left: money(4500000, 'UAH'),
      arrived: money(4500000, 'UAH'),
    });
    const model = view([back]);

    expect(model.historyHasNegative).toBe(true);
    expect(model.historyAxis).toEqual({
      top: '45 000,00 UAH',
      zero: '0,00 UAH',
      bottom: '−45 000,00 UAH',
    });
  });

  it('Scenario: The stated scale follows the shown currency', () => {
    const transactions = [
      spend('e1', '2026-08-10', 100000),
      spend('e2', '2026-08-11', 5000, 'groceries', 'USD'),
    ];

    expect(view(transactions).historyAxis!.top).toBe('1 000,00 UAH');
    expect(view(transactions, { shownCurrency: 'USD' }).historyAxis!.top).toBe('50,00 USD');
    // And the category chart is scaled in the same currency, never in the other one.
    expect(
      view(transactions, { shownCurrency: 'USD', chosenCategoryId: 'groceries' }).categoryAxis!.top,
    ).toBe('50,00 USD');
  });

  it('Scenario: An all-zero chart states a scale of zero', () => {
    // Books carries no транзакція in UAH, so every month of its chart is zero.
    const model = view(
      [spend('e1', '2026-08-10', 100000), spend('e2', '2026-08-11', 5000, 'books', 'USD')],
      { chosenCategoryId: 'books' },
    );

    expect(model.categoryChart.every((c) => c.amount === '0,00 UAH')).toBe(true);
    expect(model.categoryAxis).toEqual({ top: '0,00 UAH', zero: '0,00 UAH', bottom: null });
  });

  it('There is no axis where there is no chart', () => {
    expect(view([]).historyAxis).toBeNull();
    // No category chosen yet — nothing to scale.
    expect(view([spend('e1', '2026-08-10', 100000)]).categoryAxis).toBeNull();
  });
});

describe('one month of each chart is spelled out in full', () => {
  const threeMonths = [
    spend('e1', '2026-06-10', 100000),
    spend('e2', '2026-07-10', 200000),
    spend('e3', '2026-08-10', 400000),
  ];

  it('Scenario: The newest month is spelled out first', () => {
    const model = view(threeMonths);

    expect(model.historyReadout!.month).toBe('2026-08');
    expect(model.historyReadout!.label).toBe('Сер 2026');
    expect(model.historyReadout!.numbers).toEqual([
      { key: 'spent', label: 'Витрачено', amount: '4 000,00 UAH' },
      { key: 'income', label: 'Дохід', amount: '0,00 UAH' },
      { key: 'invested', label: 'Інвестовано', amount: '0,00 UAH' },
    ]);
    expect(model.history.filter((c) => c.selected).map((c) => c.month)).toEqual(['2026-08']);
  });

  it('Scenario: Choosing a month spells that month out', () => {
    const model = view(threeMonths, { chosenMonth: '2026-06' });

    expect(model.historyReadout!.month).toBe('2026-06');
    expect(model.historyReadout!.numbers[0]!.amount).toBe('1 000,00 UAH');
    expect(model.history.filter((c) => c.selected).map((c) => c.month)).toEqual(['2026-06']);
  });

  it('Scenario: The picked month governs both charts', () => {
    const model = view(threeMonths, { chosenCategoryId: 'groceries', chosenMonth: '2026-06' });

    expect(model.historyReadout!.month).toBe('2026-06');
    expect(model.categoryReadout).toEqual({
      month: '2026-06',
      label: 'Чер 2026',
      amount: '1 000,00 UAH',
    });
    expect(model.categoryChart.filter((c) => c.selected).map((c) => c.month)).toEqual(['2026-06']);
  });

  it('Scenario: A negative month is spelled out with its sign', () => {
    const model = view(
      [
        spend('e1', '2026-08-01', 100000),
        refund({
          id: 'r1',
          date: '2026-08-02',
          accountId: 'card',
          amount: money(120000, 'UAH'),
          categoryId: 'groceries',
        }),
      ],
      { chosenCategoryId: 'groceries' },
    );

    expect(model.categoryReadout!.amount).toBe('−200,00 UAH');
    expect(model.categoryChartHasNegative).toBe(true);
  });

  it('Scenario: A spelled-out month equals its bar', () => {
    const model = view(threeMonths, { chosenCategoryId: 'groceries', chosenMonth: '2026-07' });
    const column = model.history.find((c) => c.selected)!;

    expect(model.historyReadout!.numbers.map((n) => n.amount)).toEqual(
      column.bars.map((b) => b.amount),
    );
    expect(model.categoryReadout!.amount).toBe(
      model.categoryChart.find((c) => c.selected)!.amount,
    );
  });

  it('Scenario: A month that has not started yet is not the one spelled out', () => {
    // The span always runs to the current month, and the current month holds nothing until its
    // first транзакція is recorded — which is the state of every 1st.
    const model = view(threeMonths, { now: september });

    expect(model.history.map((c) => c.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(model.historyReadout!.month).toBe('2026-08');
    expect(model.historyReadout!.numbers[0]!.amount).toBe('4 000,00 UAH');
    // Marked as the one being read, and September is still drawn beside it.
    expect(model.history.filter((c) => c.selected).map((c) => c.month)).toEqual(['2026-08']);
  });

  it('Scenario: An all-zero history still spells out its newest month', () => {
    // Відкладено is not one of the tab's three numbers, so this UAH history is a chart of zeroes
    // across its whole span. Blank would be worse than a zero: nothing happened is an answer.
    const model = view([
      transfer({
        id: 's1',
        date: '2026-06-05',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(200000, 'UAH'),
        arrived: money(200000, 'UAH'),
      }),
    ]);

    expect(model.history.map((c) => c.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(model.historyReadout!.month).toBe('2026-08');
    expect(model.historyReadout!.numbers.map((n) => n.amount)).toEqual([
      '0,00 UAH',
      '0,00 UAH',
      '0,00 UAH',
    ]);
  });

  it('A picked month the span lost falls back to the month the tab would have opened on', () => {
    // Not simply the newest of the span: the same choice the tab makes before anything is picked.
    const model = view(threeMonths, { now: september, chosenMonth: '2020-01' });

    expect(model.historyReadout!.month).toBe('2026-08');
  });

  it('A month the span does not hold falls back to the newest', () => {
    // A USD history that starts later than the UAH one: the picked UAH month is not in it.
    const model = view(
      [
        spend('e1', '2026-06-10', 100000),
        spend('e2', '2026-08-11', 5000, 'groceries', 'USD'),
      ],
      { shownCurrency: 'USD', chosenMonth: '2020-01' },
    );

    expect(model.historyReadout!.month).toBe('2026-08');
    expect(model.history.filter((c) => c.selected)).toHaveLength(1);
  });

  it('There is nothing to spell out where there is no chart', () => {
    expect(view([]).historyReadout).toBeNull();
    expect(view([spend('e1', '2026-08-10', 100000)]).categoryReadout).toBeNull();
  });
});

/**
 * The tab itself is JSX that `verify` never runs, so what it *shows* is held structurally: the
 * scale and the spelled-out numbers must come out of this model and be drawn, not recomputed
 * beside it. That is the defect this change fixes — the model already carried every сума and the
 * screen threw them away — and this is where it would come back. The pattern and the reason such
 * a test lives in `src/ui/` are `onboarding-screen.test.ts`'s.
 */
const screen = readFileSync(new URL('../app/(tabs)/reports.tsx', import.meta.url), 'utf8');

describe('the Звіти tab draws what this model decided', () => {
  it('Scenario: The history chart states its tallest сума — the screen draws that axis', () => {
    for (const field of ['model.historyAxis', 'model.categoryAxis']) {
      expect(screen, `${field} is never drawn`).toContain(field);
    }
    // The three labels of an axis are read off it, not derived from a bar's height.
    for (const label of ['axis.top', 'axis.zero', 'axis.bottom']) {
      expect(screen, `${label} is never drawn`).toContain(label);
    }
  });

  it('Scenario: The newest month is spelled out first — the screen draws the read-outs', () => {
    expect(screen).toContain('model.historyReadout');
    expect(screen).toContain('model.categoryReadout');
    // And the month the owner taps is handed back to this model, which resolves it.
    expect(screen).toContain('setChosenMonth(column.month)');
    expect(screen).toMatch(/chosenMonth,/);
    expect(screen).toContain('selected={column.selected}');
  });

  it('No сума is formatted on the screen — every one of them comes from here', () => {
    expect(screen).not.toContain('amount-input');
    expect(screen).not.toContain('formatMoney');
  });

  it('Scenario: The offer says nothing about the data', () => {
    // «Звіти» offers AI-аналіз as a way in and nothing more. It builds no пакет — the whole of
    // `src/analysis` is unreachable from this tab — and it renders no count, no preview and no
    // файл: the AI-аналіз screen is the one that computes, once it is open.
    expect(screen).toContain("router.push('/ai-analysis')");
    expect(screen).toContain('AI-аналіз');
    expect(screen).not.toContain('src/analysis');
    expect(screen).not.toContain('@/analysis');
    expect(screen).not.toContain('@/ui/ai-analysis-screen');
    for (const built of ['buildAnalysisPackage', 'renderDocument', 'aiAnalysisModel', 'analysisShare']) {
      expect(screen, `«Звіти» reaches ${built}`).not.toContain(built);
    }
  });

  it('the offer is shown on an empty history too', () => {
    // The card sits outside the `emptyHistoryMessage` branch, so a device with nothing stored
    // still has the way in — and the AI-аналіз screen says there is nothing to analyse yet.
    const start = screen.indexOf('model.emptyHistoryMessage ?');
    const end = screen.indexOf(') : (', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    // What an empty history renders instead of the charts holds no way in of its own …
    expect(screen.slice(start, end)).not.toContain('/ai-analysis');
    // … because the offer sits after the whole ternary, and so is drawn either way.
    expect(screen.indexOf('/ai-analysis')).toBeGreaterThan(end);
  });
});
