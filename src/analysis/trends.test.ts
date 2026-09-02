import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Category } from '../domain/category';
import { money } from '../domain/money';
import {
  expenseByDefault,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { categoryReports } from './categories';
import { monthlyReports } from './monthly';
import { resolvePeriod } from './period';
import { medianOf, recurringThreshold, trendsOf } from './trends';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
];

const categories: readonly Category[] = [
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'groceries', name: 'Продукти', archived: false },
  { id: 'home', name: 'Житло', archived: false },
  { id: 'car', name: 'Авто', archived: false },
  { id: 'fun', name: 'Розваги', archived: false },
  { id: 'health', name: 'Здоров’я', archived: false },
  { id: 'travel', name: 'Подорожі', archived: false },
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false },
  { id: FEES_CATEGORY_ID, name: 'Комісія', archived: false },
];

let seq = 0;
const id = () => `t${(seq += 1)}`;

const spend = (
  date: string,
  amount: number,
  categoryId = 'cafe',
  description?: string,
): Transaction =>
  expenseByDefault({
    id: id(),
    date,
    accountId: 'card',
    amount: money(amount, 'UAH'),
    categoryId,
    ...(description ? { description } : {}),
  });

function trendsFor(
  transactions: readonly Transaction[],
  choice: Parameters<typeof resolvePeriod>[0],
  builtOn: string,
  included = { descriptions: false, transactions: false },
) {
  const period = resolvePeriod(choice, builtOn);
  const monthly = monthlyReports({ period, accounts, transactions });
  const spent = monthly.get('UAH')!.period.spent;
  const reports = categoryReports({
    period,
    currency: 'UAH',
    transactions,
    categories,
    limits: [],
    periodSpent: money(Number(spent.amount.replace('.', '')), 'UAH'),
  });
  return trendsOf({
    period,
    currency: 'UAH',
    transactions,
    categories,
    categoryReports: reports,
    included,
  });
}

describe('the notable витрати', () => {
  it('Scenario: A notable витрата carries no опис by default', () => {
    const august = [spend('2026-08-10', 2500000, 'car', 'СТО Іванов')];

    const trends = trendsFor(august, { from: '2026-08', to: '2026-08' }, '2026-09-01');

    expect(trends.notable).toEqual([
      { amount: { amount: '25000.00', currency: 'UAH' }, category: 'Авто', month: '2026-08' },
    ]);
  });

  it('carries the опис and the дата only when each is chosen', () => {
    const august = [spend('2026-08-10', 2500000, 'car', 'СТО Іванов')];

    expect(
      trendsFor(august, { from: '2026-08', to: '2026-08' }, '2026-09-01', {
        descriptions: true,
        transactions: true,
      }).notable[0],
    ).toEqual({
      amount: { amount: '25000.00', currency: 'UAH' },
      category: 'Авто',
      month: '2026-08',
      date: '2026-08-10',
      description: 'СТО Іванов',
    });
  });

  it('names at most five, largest first', () => {
    const august = [
      spend('2026-08-01', 100, 'cafe'),
      spend('2026-08-02', 600, 'car'),
      spend('2026-08-03', 500, 'fun'),
      spend('2026-08-04', 400, 'home'),
      spend('2026-08-05', 300, 'health'),
      spend('2026-08-06', 200, 'travel'),
    ];

    const trends = trendsFor(august, { from: '2026-08', to: '2026-08' }, '2026-09-01');

    expect(trends.notable.map((n) => n.amount.amount)).toEqual(['6.00', '5.00', '4.00', '3.00', '2.00']);
  });

  it('never names a коригування or a повернення', () => {
    const august: Transaction[] = [
      {
        type: 'correction',
        id: id(),
        date: '2026-08-10',
        accountId: 'card',
        amount: money(-9_000_00, 'UAH'),
      },
      {
        type: 'refund',
        id: id(),
        date: '2026-08-11',
        accountId: 'card',
        amount: money(8_000_00, 'UAH'),
        categoryId: 'cafe',
      },
      spend('2026-08-12', 100_00, 'cafe'),
    ];

    const trends = trendsFor(august, { from: '2026-08', to: '2026-08' }, '2026-09-01');

    // The коригування is the largest сума of the month and is unexplained money, not a purchase.
    expect(trends.notable).toEqual([
      { amount: { amount: '100.00', currency: 'UAH' }, category: 'Кафе', month: '2026-08' },
    ]);
  });

  it('names a комісія and a витрата «Без категорії» like any other', () => {
    const august = [
      spend('2026-08-10', 50000, FEES_CATEGORY_ID),
      spend('2026-08-11', 40000, UNCATEGORISED_CATEGORY_ID),
    ];

    expect(
      trendsFor(august, { from: '2026-08', to: '2026-08' }, '2026-09-01').notable.map((n) => n.category),
    ).toEqual(['Комісія', 'Без категорії']);
  });
});

describe('the recurring candidates', () => {
  it('Scenario: A recurring витрата candidate', () => {
    // «Житло» about 15 000.00 in each of six months, varying by a little.
    const history = [
      spend('2026-03-05', 1_500_000, 'home'),
      spend('2026-04-05', 1_520_000, 'home'),
      spend('2026-05-05', 1_480_000, 'home'),
      spend('2026-06-05', 1_500_000, 'home'),
      spend('2026-07-05', 1_510_000, 'home'),
      spend('2026-08-05', 1_490_000, 'home'),
    ];

    const trends = trendsFor(history, { from: '2026-03', to: '2026-08' }, '2026-09-01');

    expect(trends.recurring).toEqual([
      {
        category: 'Житло',
        typicalAmount: { amount: '15000.00', currency: 'UAH' },
        monthsHit: 6,
        monthsInPeriod: 6,
      },
    ]);
  });

  it('does not call a категорія of three months in six recurring', () => {
    const history = [
      spend('2026-03-05', 1_500_000, 'home'),
      spend('2026-04-05', 1_500_000, 'home'),
      spend('2026-05-05', 1_500_000, 'home'),
      spend('2026-08-05', 20_000, 'cafe'),
    ];

    // Four of six months is the threshold; three is not enough to call it a pattern.
    expect(recurringThreshold(6)).toBe(4);
    expect(trendsFor(history, { from: '2026-03', to: '2026-08' }, '2026-09-01').recurring).toEqual([]);
  });

  it('does not call сумі that scatter recurring', () => {
    const history = [
      spend('2026-03-05', 100_000, 'groceries'),
      spend('2026-04-05', 400_000, 'groceries'),
      spend('2026-05-05', 150_000, 'groceries'),
      spend('2026-06-05', 900_000, 'groceries'),
      spend('2026-07-05', 250_000, 'groceries'),
      spend('2026-08-05', 600_000, 'groceries'),
    ];

    expect(trendsFor(history, { from: '2026-03', to: '2026-08' }, '2026-09-01').recurring).toEqual([]);
  });

  it('takes the largest витрата of a month, not the month’s sum', () => {
    // A lamp under «Житло» beside the rent must not read as a rent that went up.
    const history = [
      spend('2026-03-05', 1_500_000, 'home'),
      spend('2026-04-05', 1_500_000, 'home'),
      spend('2026-04-06', 300_000, 'home'),
      spend('2026-05-05', 1_500_000, 'home'),
      spend('2026-06-05', 1_500_000, 'home'),
    ];

    expect(
      trendsFor(history, { from: '2026-03', to: '2026-06' }, '2026-09-01').recurring[0]!.typicalAmount,
    ).toEqual({ amount: '15000.00', currency: 'UAH' });
  });

  it('has no candidates in a period shorter than three months', () => {
    const history = [spend('2026-07-05', 1_500_000, 'home'), spend('2026-08-05', 1_500_000, 'home')];

    expect(trendsFor(history, { from: '2026-07', to: '2026-08' }, '2026-09-01').recurring).toEqual([]);
  });
});

describe('the largest категорії and their changes', () => {
  const history = [
    // July.
    spend('2026-07-01', 100_000, 'cafe'),
    spend('2026-07-02', 300_000, 'groceries'),
    spend('2026-07-03', 200_000, 'fun'),
    // August: Кафе doubles, Продукти falls, Авто appears.
    spend('2026-08-01', 200_000, 'cafe'),
    spend('2026-08-02', 150_000, 'groceries'),
    spend('2026-08-03', 200_000, 'fun'),
    spend('2026-08-04', 900_000, 'car'),
  ];

  it('names at most five largest категорії, largest first', () => {
    const trends = trendsFor(history, { from: '2026-07', to: '2026-08' }, '2026-09-01');

    expect(trends.largestCategories.length).toBeLessThanOrEqual(5);
    expect(trends.largestCategories[0]).toEqual({
      name: 'Авто',
      total: { amount: '9000.00', currency: 'UAH' },
      share: expect.any(Number),
    });
  });

  it('Scenario: a категорія absent from the earlier month is not ranked', () => {
    const trends = trendsFor(history, { from: '2026-07', to: '2026-08' }, '2026-09-01');

    // «Авто» is the largest change of the period by any measure — and it appeared rather than grew.
    expect(trends.largestIncreases.map((c) => c.name)).toEqual(['Кафе']);
    expect(trends.largestIncreases[0]).toEqual({
      name: 'Кафе',
      from: '2026-07',
      to: '2026-08',
      partial: false,
      before: { amount: '1000.00', currency: 'UAH' },
      after: { amount: '2000.00', currency: 'UAH' },
      change: 10000,
    });
  });

  it('ranks the falls too, and leaves an unchanged категорія out of both', () => {
    const trends = trendsFor(history, { from: '2026-07', to: '2026-08' }, '2026-09-01');

    expect(trends.largestDecreases.map((c) => [c.name, c.change])).toEqual([['Продукти', -5000]]);
    // «Розваги» is the same in both months: no rise and no fall.
    expect([...trends.largestIncreases, ...trends.largestDecreases].map((c) => c.name)).not.toContain(
      'Розваги',
    );
  });

  it('caps each list at five', () => {
    const ids = ['cafe', 'groceries', 'home', 'car', 'fun', 'health', 'travel'];
    const many = ids.flatMap((categoryId, index) => [
      spend('2026-07-01', 100_000, categoryId),
      spend('2026-08-01', 100_000 + (index + 1) * 10_000, categoryId),
    ]);

    const trends = trendsFor(many, { from: '2026-07', to: '2026-08' }, '2026-09-01');

    expect(trends.largestIncreases).toHaveLength(5);
    expect(trends.largestIncreases[0]!.name).toBe('Подорожі');
  });
});

describe('medianOf', () => {
  it('is the middle сума, and the mean of the two middle ones for an even count', () => {
    expect(medianOf([money(300, 'UAH'), money(100, 'UAH'), money(200, 'UAH')])).toEqual(
      money(200, 'UAH'),
    );
    expect(medianOf([money(100, 'UAH'), money(200, 'UAH'), money(300, 'UAH'), money(500, 'UAH')])).toEqual(
      money(250, 'UAH'),
    );
  });
});
