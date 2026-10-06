import { describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { netWorthRepo } from '../db/net-worth-repo';
import { openTestDb, seedReferences } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { account, type Account } from '../domain/account';
import type { Category } from '../domain/category';
import type { CurrentValue } from '../domain/investments';
import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { ledgerBuilder, monthsFrom } from '../observations/test-fixtures';
import { formatMoney } from '../ui/amount-input';
import { monthViewModel } from '../ui/month-screen';
import { netWorthFigures, netWorthSeries } from '../ui/net-worth';
import { monthSummaryOf, summaryAvailability, type MonthSummaryInput } from './summary';

const ACCOUNTS: readonly Account[] = [
  account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'jar', name: 'Подушка', kind: 'savings', currency: 'UAH' }),
  account({ id: 'jar-2', name: 'Резерв', kind: 'savings', currency: 'UAH' }),
  account({ id: 'usd', name: 'USD', kind: 'spending', currency: 'USD' }),
  account({ id: 'loan', name: 'Борг Олі', kind: 'debt', currency: 'UAH' }),
  account({ id: 'broker', name: 'Брокер', kind: 'investment', currency: 'UAH' }),
];

const CATEGORIES: readonly Category[] = [
  { id: 'food', name: 'Продукти', archived: false },
  { id: 'travel', name: 'Подорожі', archived: false },
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'pharmacy', name: 'Аптека', archived: false },
  { id: 'clothes', name: 'Одяг', archived: false },
  { id: 'repair', name: 'Ремонт', archived: false },
  { id: 'other', name: 'Інше', archived: false },
];

function summaryOf(transactions: readonly Transaction[], over: Partial<MonthSummaryInput> = {}) {
  return monthSummaryOf({
    month: '2026-09',
    today: '2026-10-02',
    transactions,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    limits: [],
    goals: [],
    waitingDrafts: 0,
    figures: new Map(),
    answers: [],
    linkedAccountIds: new Set(),
    ...over,
  });
}

describe('which months have a підсумок', () => {
  it('Scenario: September has a підсумок in October', () => {
    const b = ledgerBuilder();
    const rows = [b.expense('2026-09-10', 'food', 1000), b.expense('2026-10-01', 'food', 1000)];
    const active = new Set(['2026-09', '2026-10']);
    expect(summaryAvailability('2026-09', '2026-10-02', active)).toBe('available');
    expect(summaryAvailability('2026-10', '2026-10-02', active)).toBe('current');
    expect(summaryOf(rows)).not.toBeNull();
    expect(summaryOf(rows, { month: '2026-10' })).toBeNull();
  });

  it('Scenario: A month of перекази alone still has one', () => {
    const b = ledgerBuilder();
    const summary = summaryOf([b.transfer('2026-08-12', 'black', 'jar', 500000)], { month: '2026-08' });
    expect(summary).not.toBeNull();
    expect(summary!.spent).toMatchObject([{ currency: 'UAH', spent: money(0, 'UAH') }]);
  });

  it('Scenario: An empty month has none', () => {
    const b = ledgerBuilder();
    const rows = [b.expense('2026-06-10', 'food', 1000), b.expense('2026-08-10', 'food', 1000)];
    expect(summaryAvailability('2026-07', '2026-10-02', new Set(['2026-06', '2026-08']))).toBe('empty');
    expect(summaryOf(rows, { month: '2026-07' })).toBeNull();
    // A month ahead of the current one and text that is not a month have none either.
    expect(summaryAvailability('2026-12', '2026-10-02', new Set())).toBe('future');
    expect(summaryAvailability('2026-13', '2026-10-02', new Set())).toBe('not-a-month');
  });

  it('Scenario: Reading it twice changes nothing', () => {
    const b = ledgerBuilder();
    const rows = monthsFrom('2026-03', '2026-09').map((m) => b.expense(`${m}-10`, 'food', 1000000));
    const frozen = structuredClone(rows);
    expect(summaryOf(rows)).toEqual(summaryOf(rows));
    expect(rows).toEqual(frozen);
  });
});

describe('витрачено against the month before and a typical month', () => {
  it('Scenario: September against August and the median of six', () => {
    const b = ledgerBuilder();
    const spentBy: Record<string, number> = {
      '2026-03': 5000000,
      '2026-04': 5000000,
      '2026-05': 5100000,
      '2026-06': 5000000,
      '2026-07': 5000000,
      '2026-08': 4810000,
      '2026-09': 5230000,
    };
    const rows = Object.entries(spentBy).map(([m, amount]) => b.expense(`${m}-10`, 'food', amount));

    expect(summaryOf(rows)!.spent).toEqual([
      {
        currency: 'UAH',
        spent: money(5230000, 'UAH'),
        previous: { before: money(4810000, 'UAH'), difference: money(420000, 'UAH'), percent: 9 },
        typical: {
          status: 'available',
          months: 6,
          before: money(5000000, 'UAH'),
          difference: money(230000, 'UAH'),
          percent: 5,
        },
      },
    ]);
  });

  it('Scenario: Too little history for a типова сума', () => {
    const b = ledgerBuilder();
    const rows = ['2026-07', '2026-08', '2026-09'].map((m) => b.expense(`${m}-10`, 'food', 100000));
    const [uah] = summaryOf(rows)!.spent;
    expect(uah!.previous.percent).toBe(0);
    expect(uah!.typical).toEqual({ status: 'too-little-history' });
  });

  it('says there is nothing typical when the typical витрачено is not positive', () => {
    const b = ledgerBuilder();
    const rows = [
      ...['2026-06', '2026-07', '2026-08'].map((m) => b.income(`${m}-01`, 100000)),
      b.expense('2026-09-10', 'food', 1000),
    ];
    expect(summaryOf(rows)!.spent[0]!.typical).toEqual({ status: 'not-positive' });
  });

  it('Scenario: Коригування inside витрачено are named', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-09-03', 'food', 6868249 - 77686),
      b.correction('2026-09-10', -77686),
      // A positive коригування is дохід, not part of витрачено.
      b.correction('2026-09-20', 5000),
    ];
    const [uah] = summaryOf(rows)!.spent;
    expect(uah!.spent).toEqual(money(6868249, 'UAH'));
    expect(uah!.corrections).toEqual(money(77686, 'UAH'));
    // Without a negative коригування nothing is named.
    expect(summaryOf([b.expense('2026-09-03', 'food', 5000)])!.spent[0]!.corrections).toBeUndefined();
  });

  it('Scenario: A переказ into a банка is not витрачено', () => {
    const b = ledgerBuilder();
    const summary = summaryOf([b.expense('2026-09-03', 'food', 250000), b.transfer('2026-09-05', 'black', 'jar', 1000000)])!;
    expect(summary.spent[0]!.spent).toEqual(money(250000, 'UAH'));
    expect(summary.picture[0]!.numbers.saved).toEqual(money(1000000, 'UAH'));
  });
});

describe('the категорії that changed most', () => {
  const august = (b: ReturnType<typeof ledgerBuilder>) => [
    b.expense('2026-08-03', 'food', 1000000),
    b.expense('2026-08-04', 'travel', 600000),
    b.expense('2026-08-05', 'cafe', 300000),
    b.expense('2026-08-06', 'pharmacy', 50000),
  ];

  it('Scenario: The three largest changes', () => {
    const b = ledgerBuilder();
    const rows = [
      ...august(b),
      b.expense('2026-09-03', 'food', 1380000),
      b.expense('2026-09-04', 'travel', 200000),
      b.expense('2026-09-05', 'cafe', 385000),
      b.expense('2026-09-06', 'pharmacy', 70000),
    ];
    const [uah] = summaryOf(rows)!.changed;
    expect(uah!.comparable).toBe(true);
    expect(uah!.rows.map((r) => [r.categoryId, r.difference.amount, r.percent, r.status])).toEqual([
      ['travel', -400000, -67, 'changed'],
      ['food', 380000, 38, 'changed'],
      ['cafe', 85000, 28, 'changed'],
    ]);
  });

  it('Scenario: A повернення is part of its категорія’s change', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-08-03', 'clothes', 200000),
      b.expense('2026-09-03', 'clothes', 300000),
      b.refund('2026-09-20', 'clothes', 300000),
    ];
    expect(summaryOf(rows)!.changed[0]!.rows).toEqual([
      {
        categoryId: 'clothes',
        current: money(0, 'UAH'),
        previous: money(200000, 'UAH'),
        difference: money(-200000, 'UAH'),
        percent: -100,
        status: 'changed',
      },
    ]);
  });

  it('Scenario: A new категорія is marked new', () => {
    const b = ledgerBuilder();
    const rows = [
      ...august(b),
      b.expense('2026-09-03', 'food', 1050000),
      b.expense('2026-09-04', 'travel', 650000),
      b.expense('2026-09-05', 'cafe', 310000),
      b.expense('2026-09-06', 'pharmacy', 50000),
      b.expense('2026-09-07', 'repair', 900000),
    ];
    const [first] = summaryOf(rows)!.changed[0]!.rows;
    expect(first).toMatchObject({ categoryId: 'repair', current: money(900000, 'UAH'), status: 'new', percent: null });
  });

  it('Scenario: An empty August leaves nothing to compare with', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-08-03', 'food', 1000, { currency: 'USD', accountId: 'usd' }),
      b.expense('2026-09-03', 'food', 1000000),
      b.expense('2026-09-04', 'repair', 900000),
    ];
    expect(summaryOf(rows)!.changed.find((c) => c.currency === 'UAH')).toEqual({
      currency: 'UAH',
      comparable: false,
      rows: [],
    });
  });

  it('never names «Коригування» or «Без категорії», nor a difference of zero', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-08-03', 'food', 1000),
      b.expense('2026-08-04', 'uncategorised', 1000),
      b.expense('2026-09-03', 'food', 1000),
      b.expense('2026-09-04', 'uncategorised', 900000),
      b.correction('2026-09-30', -500000),
    ];
    expect(summaryOf(rows)!.changed[0]!.rows).toEqual([]);
  });
});

describe('the картина and the статок of the підсумок', () => {
  it('Scenario: The картина equals Місяць', () => {
    const b = ledgerBuilder();
    const rows = [
      b.income('2026-09-01', 6100000),
      b.expense('2026-09-03', 'food', 1380000),
      b.refund('2026-09-04', 'food', 20000),
      b.transfer('2026-09-05', 'black', 'jar', 1000000),
      b.transfer('2026-09-06', 'black', 'broker', 500000),
      b.transfer('2026-09-07', 'black', 'loan', 300000),
      b.correction('2026-09-30', -30000),
      b.expense('2026-09-08', 'cafe', 4500, { currency: 'USD', accountId: 'usd' }),
      b.expense('2026-08-10', 'food', 1000000),
    ];
    const summary = summaryOf(rows)!;
    const month = monthViewModel({
      month: '2026-09',
      accounts: ACCOUNTS,
      transactions: rows.filter((t) => t.date.startsWith('2026-09')),
      rates: [],
      categoryNames: new Map(),
      limits: [],
      previousTransactions: rows.filter((t) => t.date.startsWith('2026-08')),
      now: new Date(2026, 9, 2, 12),
    });

    const fromSummary = summary.picture.map((p) => ({
      currency: p.currency,
      numbers: (['spent', 'invested', 'saved', 'lent', 'income', 'left'] as const).map((key) => [
        key,
        formatMoney(p.numbers[key]),
      ]),
    }));
    const fromMonth = month.groups.map((g) => ({
      currency: g.currency,
      numbers: g.numbers.map((n) => [n.key, n.amount]),
    }));
    expect(fromSummary).toEqual(fromMonth);
    expect(fromSummary.map((p) => p.currency)).toEqual(['UAH', 'USD']);
  });

  it('Scenario: A repayment above the principal is дохід only for the відсотки', () => {
    const b = ledgerBuilder();
    const rows = [
      b.transfer('2026-09-10', 'loan', 'black', 1000000),
      b.income('2026-09-10', 50000, { sourceId: 'interest' }),
    ];
    const [uah] = summaryOf(rows)!.picture;
    expect(uah!.numbers.lent).toEqual(money(-1000000, 'UAH'));
    expect(uah!.numbers.income).toEqual(money(50000, 'UAH'));
  });

  it('Scenario: A positive коригування is дохід', () => {
    const b = ledgerBuilder();
    const [uah] = summaryOf([b.correction('2026-09-30', 30000)])!.picture;
    expect(uah!.numbers.income).toEqual(money(30000, 'UAH'));
    expect(uah!.numbers.spent).toEqual(money(0, 'UAH'));
  });

  it('Scenario: Дохід against August', () => {
    const b = ledgerBuilder();
    const rows = [b.income('2026-08-01', 5800000), b.income('2026-09-01', 6100000)];
    expect(summaryOf(rows)!.picture[0]!.incomeAgainstPrevious).toEqual({
      before: money(5800000, 'UAH'),
      difference: money(300000, 'UAH'),
      percent: 5,
    });
  });

  /**
   * The Статок screen's own reading and the підсумок's, both from the repository's reads of one
   * stored state — not two fixtures that happen to agree.
   */
  function statokOf(
    rows: readonly Transaction[],
    accounts: readonly Account[],
    currentValues: ReadonlyMap<string, CurrentValue> = new Map(),
    today = '2026-10-02',
  ) {
    const storage = openTestDb();
    try {
      seedReferences(storage.db, {
        categories: ['food', 'cafe', 'correction', 'uncategorised'],
        sources: ['salary', 'interest'],
      });
      for (const a of accounts) accountsRepo(storage.db).save(a);
      rows.forEach((t, i) => transactionsRepo(storage.db).save(t, new Date(1_790_000_000_000 + i)));
      const repo = netWorthRepo(storage.db);
      const reads = {
        accounts,
        monthlyMovement: repo.monthlyMovement(today),
        monthlyMovementByType: repo.monthlyMovementByType(today),
        firstDates: repo.firstDates(today),
        firstDateMovement: repo.firstDateMovement(today),
        today,
      };
      const series = netWorthSeries({
        ...reads,
        transactions: rows,
        currentValues,
        rates: [],
        requestedHistory: 'UAH',
        now: new Date(2026, 9, 2, 12),
      });
      return { figures: netWorthFigures(reads), screen: series.reading!.months };
    } finally {
      storage.close();
    }
  }

  it('Scenario: The зміна equals Статок’s', () => {
    const accounts = [
      account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH', openingDate: '2026-07-01' }),
      account({ id: 'usd', name: 'USD', kind: 'spending', currency: 'USD', openingBalance: money(100000, 'USD'), openingDate: '2026-07-01' }),
    ];
    const b = ledgerBuilder();
    const rows = [
      b.income('2026-08-01', 1000000),
      b.income('2026-09-01', 6100000),
      b.expense('2026-09-03', 'food', 5230000),
      b.correction('2026-09-30', -30000),
      b.transfer('2026-09-15', 'usd', 'black', 10000, { currency: 'USD', arrived: 400000, arrivedCurrency: 'UAH' }),
    ];
    const { figures, screen } = statokOf(rows, accounts);
    const summary = summaryOf(rows, { accounts, figures })!;
    const uah = summary.netWorth.find((n) => n.currency === 'UAH')!;

    expect(uah.status).toBe('available');
    expect(uah.figure).toEqual(screen.find((f) => f.month === '2026-09'));
    expect(uah.figure!.change).toMatchObject({ status: 'available', absolute: 1240000 });
    expect(uah.figure!.breakdown).toEqual({
      income: 6100000,
      spending: -5230000,
      correction: -30000,
      transfer: 400000,
      entered: 0,
    });
  });

  it('Scenario: The first month of the history', () => {
    const accounts = [
      account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH', openingBalance: money(250000, 'UAH'), openingDate: '2026-09-01' }),
    ];
    const b = ledgerBuilder();
    const rows = [b.expense('2026-09-03', 'food', 1000)];
    const { figures } = statokOf(rows, accounts);
    const [uah] = summaryOf(rows, { accounts, figures })!.netWorth;
    expect(uah).toMatchObject({ currency: 'UAH', status: 'first-month', figure: { entered: 250000 } });
  });

  it('Scenario: An інвестиційний рахунок counts its вкладено', () => {
    const accounts = [
      account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH', openingBalance: money(2000000, 'UAH'), openingDate: '2026-08-01' }),
      account({ id: 'broker', name: 'Брокер', kind: 'investment', currency: 'UAH', openingDate: '2026-08-01' }),
    ];
    const b = ledgerBuilder();
    const rows = [b.expense('2026-08-03', 'food', 1000), b.transfer('2026-09-05', 'black', 'broker', 1000000)];
    // The broker says it is worth half as much again; the history still reads what was put in.
    const { figures, screen } = statokOf(
      rows,
      accounts,
      new Map([['broker', { amount: money(1500000, 'UAH'), asOf: '2026-09-30' }]]),
    );
    const [uah] = summaryOf(rows, { accounts, figures })!.netWorth;
    expect(uah!.figure).toEqual(screen.find((f) => f.month === '2026-09'));
    expect(uah!.figure!.change).toMatchObject({ status: 'available', absolute: 0 });
    expect(Object.keys(uah!.figure!.breakdown).sort()).toEqual(
      ['correction', 'entered', 'income', 'spending', 'transfer'],
    );
  });
});

describe('цілі, ліміти, what is unanswered, the коригування and the спостереження', () => {
  it('Scenario: A ліміт exceeded is stated with its overrun', () => {
    const b = ledgerBuilder();
    const summary = summaryOf([b.expense('2026-09-05', 'cafe', 390000)], {
      limits: [{ categoryId: 'cafe', amount: money(300000, 'UAH') }],
    })!;
    expect(summary.limits).toEqual([
      { categoryId: 'cafe', limit: money(300000, 'UAH'), spent: money(390000, 'UAH'), overBy: money(90000, 'UAH') },
    ]);
  });

  it('Scenario: A ліміт kept is stated as kept', () => {
    const b = ledgerBuilder();
    const [food] = summaryOf([b.expense('2026-09-05', 'food', 1380000)], {
      limits: [{ categoryId: 'food', amount: money(1500000, 'UAH') }],
    })!.limits;
    expect(food).toMatchObject({ spent: money(1380000, 'UAH'), overBy: null });
  });

  it('states each ціль’s movement in the month, and one that did not move as unchanged', () => {
    const b = ledgerBuilder();
    const rows = [
      b.transfer('2026-09-05', 'black', 'jar', 1000000),
      b.transfer('2026-09-20', 'jar', 'jar-2', 200000),
    ];
    const goals = summaryOf(rows, {
      goals: [
        { id: 'g-cushion', name: 'Подушка', target: money(10000000, 'UAH'), accountIds: ['jar', 'jar-2'] },
        { id: 'g-holiday', name: 'Відпустка', target: money(5000000, 'UAH'), accountIds: ['broker'] },
      ],
    })!.goals;
    expect(goals).toEqual([
      { goalId: 'g-cushion', name: 'Подушка', moved: [money(1000000, 'UAH')] },
      { goalId: 'g-holiday', name: 'Відпустка', moved: [] },
    ]);
  });

  it('Scenario: Three uncategorised and one unsourced', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-09-03', 'uncategorised', 20000),
      b.expense('2026-09-04', 'uncategorised', 15000),
      b.expense('2026-09-05', 'uncategorised', 10000),
      b.income('2026-09-06', 200000, { sourceId: 'unsourced' }),
      b.expense('2026-09-07', 'food', 99999),
    ];
    expect(summaryOf(rows)!.unanswered).toEqual({
      uncategorised: { count: 3, sums: [money(45000, 'UAH')] },
      unsourced: { count: 1, sums: [money(200000, 'UAH')] },
      waitingDrafts: 0,
      clean: false,
    });
  });

  it('Scenario: A clean month is called clean', () => {
    const b = ledgerBuilder();
    const unanswered = summaryOf([b.expense('2026-09-03', 'food', 1000)], { waitingDrafts: 1 })!.unanswered;
    expect(unanswered).toMatchObject({ clean: true, waitingDrafts: 1 });
  });

  it('counts a повернення «Без категорії» net, as the breakdown does', () => {
    const b = ledgerBuilder();
    const rows = [b.expense('2026-09-03', 'uncategorised', 20000), b.refund('2026-09-04', 'uncategorised', 5000)];
    expect(summaryOf(rows)!.unanswered.uncategorised).toEqual({ count: 2, sums: [money(15000, 'UAH')] });
  });

  it('Scenario: Corrections of both signs count by size', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-09-03', 'food', 5230000 - 40000),
      b.correction('2026-09-10', -40000),
      b.correction('2026-09-20', 23000),
    ];
    expect(summaryOf(rows)!.corrections).toEqual([
      { currency: 'UAH', count: 2, total: money(63000, 'UAH'), shareTenths: 12, atMeasure: false },
    ]);
  });

  it('Scenario: A частка of two per cent is marked', () => {
    const b = ledgerBuilder();
    const rows = [b.expense('2026-09-03', 'food', 5000000), b.correction('2026-09-10', 100000)];
    expect(summaryOf(rows)!.corrections[0]).toMatchObject({ shareTenths: 20, atMeasure: true });
  });

  it('Scenario: No витрачено, no частка', () => {
    const b = ledgerBuilder();
    const rows = [b.expense('2026-09-03', 'food', 5000), b.correction('2026-09-10', 1000, { currency: 'USD', accountId: 'usd' })];
    expect(summaryOf(rows)!.corrections.find((c) => c.currency === 'USD')).toEqual({
      currency: 'USD',
      count: 1,
      total: money(1000, 'USD'),
      shareTenths: null,
      atMeasure: false,
    });
  });

  it('Scenario: Just under the measure is not rounded up to it', () => {
    const b = ledgerBuilder();
    const rows = [b.expense('2026-09-03', 'food', 5000000), b.correction('2026-09-10', 98000)];
    expect(summaryOf(rows)!.corrections[0]).toMatchObject({ shareTenths: 19, atMeasure: false });
  });

  it('says a month without коригування has none', () => {
    const b = ledgerBuilder();
    expect(summaryOf([b.expense('2026-09-03', 'food', 5000)])!.corrections[0]).toMatchObject({ count: 0 });
  });

  it('Scenario: The спостереження are the month’s', () => {
    const b = ledgerBuilder();
    const rows: Transaction[] = monthsFrom('2026-03', '2026-08').flatMap((m) => [
      b.expense(`${m}-05`, 'food', 1000000),
      b.expense(`${m}-06`, 'other', 5000000),
    ]);
    rows.push(
      b.expense('2026-09-05', 'food', 1380000),
      b.expense('2026-09-06', 'other', 5000000),
      b.expense('2026-09-12', 'cafe', 12500, { id: 'bank', description: 'Aroma Kava' }),
      b.expense('2026-09-13', 'cafe', 12500, { id: 'hand' }),
    );
    const observations = summaryOf(rows)!.observations;
    expect(observations.map((o) => o.kind)).toEqual(['possible-duplicate', 'category-vs-typical']);
    // With its «Не дубль» answer the дубль is gone from the підсумок too.
    expect(summaryOf(rows, { answers: [{ first: 'hand', second: 'bank' }] })!.observations.map((o) => o.kind)).toEqual([
      'category-vs-typical',
    ]);
  });
});

describe('readings that must agree with Місяць', () => {
  it('names a категорія absent this month with its −100 %', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-08-03', 'travel', 600000),
      b.expense('2026-08-04', 'food', 1000),
      b.expense('2026-09-03', 'food', 1000),
    ];
    expect(summaryOf(rows)!.changed[0]!.rows).toEqual([
      {
        categoryId: 'travel',
        current: money(0, 'UAH'),
        previous: money(600000, 'UAH'),
        difference: money(-600000, 'UAH'),
        percent: -100,
        status: 'absent',
      },
    ]);
  });

  it('judges a ліміт exactly as Місяць marks it', () => {
    const b = ledgerBuilder();
    const rows = [
      b.expense('2026-09-05', 'cafe', 390000),
      b.expense('2026-09-06', 'food', 1380000),
      b.expense('2026-09-07', 'pharmacy', 50000),
      b.refund('2026-09-08', 'pharmacy', 50000),
    ];
    const limits = [
      { categoryId: 'cafe', amount: money(300000, 'UAH') },
      { categoryId: 'food', amount: money(1500000, 'UAH') },
      { categoryId: 'pharmacy', amount: money(1, 'UAH') },
    ];
    const month = monthViewModel({
      month: '2026-09',
      accounts: ACCOUNTS,
      transactions: rows,
      rates: [],
      categoryNames: new Map(CATEGORIES.map((c) => [c.id, c.name])),
      limits,
      previousTransactions: [],
      now: new Date(2026, 9, 2, 12),
    });
    const marked = new Set(month.groups.flatMap((g) => g.breakdown.filter((r) => r.overLimit).map((r) => r.categoryId)));
    for (const limit of summaryOf(rows, { limits })!.limits) {
      expect(limit.overBy !== null, limit.categoryId).toBe(marked.has(limit.categoryId));
    }
    expect([...marked]).toEqual(['cafe']);
  });
});
