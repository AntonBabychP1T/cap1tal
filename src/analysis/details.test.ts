import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Category, Source } from '../domain/category';
import { money } from '../domain/money';
import {
  expenseByDefault,
  INTEREST_SOURCE_ID,
  refund,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { foldMerchant, merchantReports, transactionLines } from './details';
import { resolvePeriod } from './period';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'jar', name: 'Банка на авто', kind: 'savings', currency: 'UAH' }),
  account({ id: 'jar-usd', name: 'Банка USD', kind: 'savings', currency: 'USD' }),
];

const categories: readonly Category[] = [
  { id: 'groceries', name: 'Продукти', archived: false },
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'home', name: 'Житло', archived: false },
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false },
];

const sources: readonly Source[] = [
  { id: 'salary', name: 'Зарплата', archived: false },
  { id: INTEREST_SOURCE_ID, name: 'Відсотки', archived: false },
];

let seq = 0;
const id = () => `t${(seq += 1)}`;

const spend = (
  date: string,
  amount: number,
  categoryId = 'groceries',
  description?: string,
  currency = 'UAH',
): Transaction =>
  expenseByDefault({
    id: id(),
    date,
    accountId: 'card',
    amount: money(amount, currency),
    categoryId,
    ...(description ? { description } : {}),
  });

const august = resolvePeriod({ from: '2026-08', to: '2026-08' }, '2026-09-01');

describe('merchantReports', () => {
  it('Scenario: Merchants when chosen', () => {
    const history = [
      spend('2026-08-01', 100000, 'groceries', 'СІЛЬПО'),
      spend('2026-08-10', 80000, 'groceries', 'Сільпо'),
      spend('2026-08-20', 60000, 'groceries', 'сільпо  '),
    ];

    expect(
      merchantReports({ period: august, currency: 'UAH', transactions: history, categories }),
    ).toEqual([
      {
        merchant: 'сільпо',
        total: { amount: '2400.00', currency: 'UAH' },
        count: 3,
        categories: ['Продукти'],
        recurring: false,
      },
    ]);
  });

  it('is built from витрати only', () => {
    const history: Transaction[] = [
      spend('2026-08-01', 100000, 'groceries', 'СІЛЬПО'),
      refund({
        id: id(),
        date: '2026-08-05',
        accountId: 'card',
        amount: money(40000, 'UAH'),
        categoryId: 'groceries',
        description: 'СІЛЬПО',
      }),
      {
        type: 'income',
        id: id(),
        date: '2026-08-06',
        accountId: 'card',
        amount: money(500000, 'UAH'),
        sourceId: 'salary',
        description: 'Зарплата ТОВ',
      },
      {
        type: 'correction',
        id: id(),
        date: '2026-08-07',
        accountId: 'card',
        amount: money(-20000, 'UAH'),
        description: 'Перерахунок',
      },
      transfer({
        id: id(),
        date: '2026-08-08',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
        description: 'На авто',
      }),
    ];

    const merchants = merchantReports({
      period: august,
      currency: 'UAH',
      transactions: history,
      categories,
    });

    // Only the витрата forms a merchant, and the повернення does not reduce it.
    expect(merchants).toEqual([
      {
        merchant: 'сільпо',
        total: { amount: '1000.00', currency: 'UAH' },
        count: 1,
        categories: ['Продукти'],
        recurring: false,
      },
    ]);
  });

  it('names a merchant that comes back every month as recurring', () => {
    const period = resolvePeriod({ from: '2026-03', to: '2026-08' }, '2026-09-01');
    const history = ['03', '04', '05', '06', '07', '08'].map((month, index) =>
      spend(`2026-${month}-05`, 500000 + index * 1000, 'home', 'Оренда'),
    );

    const [rent] = merchantReports({ period, currency: 'UAH', transactions: history, categories });

    expect(rent!.merchant).toBe('оренда');
    expect(rent!.recurring).toBe(true);
  });

  it('keeps to one currency and to the period', () => {
    const history = [
      spend('2026-08-01', 100000, 'groceries', 'СІЛЬПО'),
      spend('2026-08-02', 5000, 'groceries', 'WHOLE FOODS', 'USD'),
      spend('2026-07-30', 900000, 'groceries', 'СІЛЬПО'),
    ];

    expect(
      merchantReports({ period: august, currency: 'UAH', transactions: history, categories }).map(
        (m) => [m.merchant, m.total.amount],
      ),
    ).toEqual([['сільпо', '1000.00']]);
  });
});

describe('transactionLines', () => {
  const included = { descriptions: false };

  it('Scenario: Transactions without описи', () => {
    const history = [
      spend('2026-08-01', 100000, 'groceries', 'СІЛЬПО'),
      {
        type: 'income',
        id: id(),
        date: '2026-08-02',
        accountId: 'card',
        amount: money(500000, 'UAH'),
        sourceId: 'salary',
        description: 'Зарплата ТОВ',
      } satisfies Transaction,
    ];

    const lines = transactionLines({
      period: august,
      transactions: history,
      accounts,
      categories,
      sources,
      included,
    });

    expect(lines).toEqual([
      {
        date: '2026-08-01',
        type: 'expense',
        amount: { amount: '1000.00', currency: 'UAH' },
        category: 'Продукти',
      },
      {
        date: '2026-08-02',
        type: 'income',
        amount: { amount: '5000.00', currency: 'UAH' },
        source: 'Зарплата',
      },
    ]);
    // No identifier of any kind, and no опис.
    expect(JSON.stringify(lines)).not.toContain('salary');
    expect(JSON.stringify(lines)).not.toContain('СІЛЬПО');
  });

  it('Scenario: A переказ names its ends by вид, not by назва', () => {
    const history = [
      transfer({
        id: id(),
        date: '2026-08-08',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
      }),
    ];

    const lines = transactionLines({
      period: august,
      transactions: history,
      accounts,
      categories,
      sources,
      included,
    });

    expect(lines).toEqual([
      {
        date: '2026-08-08',
        type: 'transfer',
        from: 'spending',
        to: 'savings',
        left: { amount: '500.00', currency: 'UAH' },
        arrived: { amount: '500.00', currency: 'UAH' },
      },
    ]);
    expect(JSON.stringify(lines)).not.toContain('mono black');
    expect(JSON.stringify(lines)).not.toContain('Банка');
  });

  it('Scenario: A cross-currency переказ counts in one currency and shows both legs', () => {
    const history = [
      transfer({
        id: id(),
        date: '2026-08-10',
        fromAccountId: 'card',
        toAccountId: 'jar-usd',
        left: money(410000, 'UAH'),
        arrived: money(10000, 'USD'),
      }),
    ];

    const [line] = transactionLines({
      period: august,
      transactions: history,
      accounts,
      categories,
      sources,
      included,
    });

    // Both legs, each in its own currency, and no rate between them.
    expect(line).toEqual({
      date: '2026-08-10',
      type: 'transfer',
      from: 'spending',
      to: 'savings',
      left: { amount: '4100.00', currency: 'UAH' },
      arrived: { amount: '100.00', currency: 'USD' },
    });
  });

  it('Scenario: Описи are absent unless chosen', () => {
    const history = [spend('2026-08-01', 100000, 'groceries', 'СІЛЬПО')];

    const without = transactionLines({
      period: august,
      transactions: history,
      accounts,
      categories,
      sources,
      included: { descriptions: false },
    });
    const with_ = transactionLines({
      period: august,
      transactions: history,
      accounts,
      categories,
      sources,
      included: { descriptions: true },
    });

    expect(without[0]).not.toHaveProperty('description');
    expect(with_[0]).toMatchObject({ description: 'СІЛЬПО' });
  });

  it('carries a коригування with no категорія and no джерело', () => {
    const history: Transaction[] = [
      {
        type: 'correction',
        id: id(),
        date: '2026-08-07',
        accountId: 'card',
        amount: money(2000, 'UAH'),
      },
    ];

    expect(
      transactionLines({
        period: august,
        transactions: history,
        accounts,
        categories,
        sources,
        included,
      }),
    ).toEqual([{ date: '2026-08-07', type: 'correction', amount: { amount: '20.00', currency: 'UAH' } }]);
  });

  it('carries no сума в оригінальній валюті', () => {
    const history: Transaction[] = [
      expenseByDefault({
        id: id(),
        date: '2026-08-10',
        accountId: 'card',
        amount: money(412534, 'UAH'),
        categoryId: 'groceries',
        originalAmount: money(10000, 'USD'),
      }),
    ];

    const lines = transactionLines({
      period: august,
      transactions: history,
      accounts,
      categories,
      sources,
      included,
    });

    expect(lines[0]).toEqual({
      date: '2026-08-10',
      type: 'expense',
      amount: { amount: '4125.34', currency: 'UAH' },
      category: 'Продукти',
    });
    expect(JSON.stringify(lines)).not.toContain('100.00');
  });

  it('keeps to the period', () => {
    const history = [spend('2026-07-30', 100000), spend('2026-08-01', 100000)];

    expect(
      transactionLines({
        period: august,
        transactions: history,
        accounts,
        categories,
        sources,
        included,
      }),
    ).toHaveLength(1);
  });
});

describe('foldMerchant', () => {
  it('folds case and whitespace, and nothing else', () => {
    expect(foldMerchant('  СІЛЬПО   №21 ')).toBe('сільпо №21');
  });

  it('folds the same way on every device, whatever locale it is in', () => {
    // The folded опис is both the key merchants are grouped by and the key they are sorted by, so
    // an `Intl`-sensitive fold would let Node under `verify` and Hermes on the phone build two
    // different пакети out of one stored state. Cyrillic has no locale tailoring, and this pins
    // that the fold does not acquire one.
    for (const text of ['СІЛЬПО', 'Aroma Kava', 'ЖИТЛО', 'İstanbul', 'ATB маркет']) {
      expect(foldMerchant(text)).toBe(text.trim().replace(/\s+/g, ' ').toLowerCase());
    }
  });
});
