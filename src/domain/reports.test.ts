import { describe, expect, it } from 'vitest';

import { account, type Account } from './account';
import { money } from './money';
import { monthlyPicture } from './monthly-picture';
import {
  categoriesInHistory,
  categorySeries,
  historyMonths,
  historySeries,
} from './reports';
import {
  expenseByDefault,
  refund,
  transfer,
  CORRECTION_CATEGORY_ID,
  type Transaction,
} from './transaction';

const card = account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD card', kind: 'spending', currency: 'USD' });
const brokerage = account({ id: 'ib', name: 'IB', kind: 'investment', currency: 'UAH' });
const ACCOUNTS: readonly Account[] = [card, dollars, brokerage];

const CURRENT = '2026-08';

const spend = (
  id: string,
  date: string,
  amount: number,
  categoryId = 'groceries',
  currency = 'UAH',
  accountId = 'card',
) => expenseByDefault({ id, date, accountId, amount: money(amount, currency), categoryId });

describe('historyMonths', () => {
  it('Scenario: A gap month is present at zero', () => {
    const months = historyMonths({
      transactions: [spend('e1', '2026-06-10', 1000), spend('e2', '2026-08-10', 1000)],
      currentMonth: CURRENT,
    });

    expect(months).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('Scenario: The span reaches the current month', () => {
    const months = historyMonths({
      transactions: [spend('e1', '2026-06-10', 1000)],
      currentMonth: CURRENT,
    });

    expect(months).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('Scenario: A future-dated транзакція extends the span', () => {
    const months = historyMonths({
      transactions: [spend('e1', '2026-08-10', 1000), spend('e2', '2026-09-03', 1000)],
      currentMonth: CURRENT,
    });

    expect(months).toEqual(['2026-08', '2026-09']);
  });

  it('Scenario: An empty history yields an empty series', () => {
    expect(historyMonths({ transactions: [], currentMonth: CURRENT })).toEqual([]);
  });

  it('The span crosses a year end without skipping December or January', () => {
    const months = historyMonths({
      transactions: [spend('e1', '2025-11-20', 1000)],
      currentMonth: '2026-02',
    });

    expect(months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('historySeries', () => {
  it('Scenario: A gap month is present at zero', () => {
    const transactions = [spend('e1', '2026-06-10', 100000), spend('e2', '2026-08-10', 200000)];

    const uah = historySeries({ accounts: ACCOUNTS, transactions, currentMonth: CURRENT }).get('UAH');

    expect(uah).toEqual([
      { month: '2026-06', spent: money(100000, 'UAH'), income: money(0, 'UAH'), invested: money(0, 'UAH') },
      { month: '2026-07', spent: money(0, 'UAH'), income: money(0, 'UAH'), invested: money(0, 'UAH') },
      { month: '2026-08', spent: money(200000, 'UAH'), income: money(0, 'UAH'), invested: money(0, 'UAH') },
    ]);
  });

  it('Scenario: An empty history yields an empty series', () => {
    expect(historySeries({ accounts: ACCOUNTS, transactions: [], currentMonth: CURRENT })).toEqual(
      new Map(),
    );
  });

  it('Scenario: A month’s series numbers equal its monthly picture', () => {
    const transactions: Transaction[] = [
      spend('e1', '2026-08-03', 300000),
      {
        type: 'income',
        id: 'i1',
        date: '2026-08-01',
        accountId: 'card',
        amount: money(5000000, 'UAH'),
        sourceId: 'salary',
      },
      refund({
        id: 'r1',
        date: '2026-08-09',
        accountId: 'card',
        amount: money(50000, 'UAH'),
        categoryId: 'groceries',
      }),
      transfer({
        id: 't1',
        date: '2026-08-15',
        fromAccountId: 'card',
        toAccountId: 'ib',
        left: money(1000000, 'UAH'),
        arrived: money(1000000, 'UAH'),
      }),
    ];

    const august = historySeries({ accounts: ACCOUNTS, transactions, currentMonth: CURRENT })
      .get('UAH')!
      .at(-1)!;
    // Computed the other way, on the same транзакції, by the module the series is supposed to agree with.
    const picture = monthlyPicture({ month: '2026-08', accounts: ACCOUNTS, transactions }).get('UAH')!;

    expect(august.month).toBe('2026-08');
    expect(august.spent).toEqual(picture.spent);
    expect(august.income).toEqual(picture.income);
    expect(august.invested).toEqual(picture.invested);
  });

  it('Scenario: Currencies stay apart across the whole span', () => {
    const transactions = [
      spend('e1', '2026-07-10', 100000),
      spend('e2', '2026-08-10', 5000, 'groceries', 'USD', 'usd'),
    ];

    const series = historySeries({ accounts: ACCOUNTS, transactions, currentMonth: CURRENT });

    expect([...series.keys()].sort()).toEqual(['UAH', 'USD']);
    expect(series.get('UAH')).toEqual([
      { month: '2026-07', spent: money(100000, 'UAH'), income: money(0, 'UAH'), invested: money(0, 'UAH') },
      { month: '2026-08', spent: money(0, 'UAH'), income: money(0, 'UAH'), invested: money(0, 'UAH') },
    ]);
    expect(series.get('USD')).toEqual([
      { month: '2026-07', spent: money(0, 'USD'), income: money(0, 'USD'), invested: money(0, 'USD') },
      { month: '2026-08', spent: money(5000, 'USD'), income: money(0, 'USD'), invested: money(0, 'USD') },
    ]);
  });

  it('Scenario: A month of returns shows negative інвестовано', () => {
    const back = transfer({
      id: 't1',
      date: '2026-08-15',
      fromAccountId: 'ib',
      toAccountId: 'card',
      left: money(150000, 'UAH'),
      arrived: money(150000, 'UAH'),
    });

    const august = historySeries({ accounts: ACCOUNTS, transactions: [back], currentMonth: CURRENT })
      .get('UAH')!
      .at(-1)!;

    expect(august.invested).toEqual(money(-150000, 'UAH'));
  });
});

describe('categorySeries', () => {
  it('Scenario: A category’s month equals its breakdown amount', () => {
    const transactions = [
      spend('e1', '2026-08-03', 300000),
      refund({
        id: 'r1',
        date: '2026-08-09',
        accountId: 'card',
        amount: money(50000, 'UAH'),
        categoryId: 'groceries',
      }),
    ];

    const series = categorySeries({
      categoryId: 'groceries',
      transactions,
      currentMonth: CURRENT,
      currencies: ['UAH'],
    });

    expect(series.get('UAH')).toEqual([{ month: '2026-08', amount: money(250000, 'UAH') }]);
  });

  it('Scenario: A month without the category is zero', () => {
    const transactions = [spend('e1', '2026-07-03', 300000, 'travel'), spend('e2', '2026-08-03', 100000)];

    const series = categorySeries({
      categoryId: 'groceries',
      transactions,
      currentMonth: CURRENT,
      currencies: ['UAH'],
    });

    expect(series.get('UAH')).toEqual([
      { month: '2026-07', amount: money(0, 'UAH') },
      { month: '2026-08', amount: money(100000, 'UAH') },
    ]);
  });

  it('Scenario: Refunds can push a category’s month negative', () => {
    const transactions = [
      spend('e1', '2026-08-03', 40000),
      refund({
        id: 'r1',
        date: '2026-08-09',
        accountId: 'card',
        amount: money(100000, 'UAH'),
        categoryId: 'groceries',
      }),
    ];

    const series = categorySeries({
      categoryId: 'groceries',
      transactions,
      currentMonth: CURRENT,
      currencies: ['UAH'],
    });

    expect(series.get('UAH')).toEqual([{ month: '2026-08', amount: money(-60000, 'UAH') }]);
  });

  it('A currency the category was never spent in answers with zeroes, not with nothing', () => {
    const transactions = [spend('e1', '2026-08-03', 100000)];

    const series = categorySeries({
      categoryId: 'groceries',
      transactions,
      currentMonth: CURRENT,
      currencies: ['UAH', 'USD'],
    });

    expect(series.get('USD')).toEqual([{ month: '2026-08', amount: money(0, 'USD') }]);
  });
});

describe('categoriesInHistory', () => {
  it('Only the categories some stored транзакція carries', () => {
    const transactions: Transaction[] = [
      spend('e1', '2026-08-03', 100000),
      spend('e2', '2026-08-04', 500, 'fees'),
      refund({
        id: 'r1',
        date: '2026-08-09',
        accountId: 'card',
        amount: money(1000, 'UAH'),
        categoryId: 'pets',
      }),
      {
        type: 'income',
        id: 'i1',
        date: '2026-08-01',
        accountId: 'card',
        amount: money(5000000, 'UAH'),
        sourceId: 'salary',
      },
      transfer({
        id: 't1',
        date: '2026-08-15',
        fromAccountId: 'card',
        toAccountId: 'ib',
        left: money(100, 'UAH'),
        arrived: money(100, 'UAH'),
      }),
    ];

    expect(categoriesInHistory(transactions).sort()).toEqual(['fees', 'groceries', 'pets']);
    expect(categoriesInHistory([])).toEqual([]);
  });

  it('A negative коригування carries «Коригування»; a positive one carries no category', () => {
    const negative: Transaction = {
      type: 'correction',
      id: 'c1',
      date: '2026-08-31',
      accountId: 'card',
      amount: money(-3000, 'UAH'),
    };
    const positive: Transaction = { ...negative, id: 'c2', amount: money(3000, 'UAH') };

    expect(categoriesInHistory([negative])).toEqual([CORRECTION_CATEGORY_ID]);
    expect(categoriesInHistory([positive])).toEqual([]);
  });
});
