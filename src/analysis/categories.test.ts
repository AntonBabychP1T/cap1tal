import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Category } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { money, type Money } from '../domain/money';
import {
  expenseByDefault,
  FEES_CATEGORY_ID,
  refund,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { anchorOf, categoryReports } from './categories';
import { monthlyReports } from './monthly';
import { resolvePeriod } from './period';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
];

const categories: readonly Category[] = [
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'groceries', name: 'Продукти', archived: false },
  { id: 'old', name: 'Старе хобі', archived: true },
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false },
  { id: FEES_CATEGORY_ID, name: 'Комісія', archived: false },
];

let seq = 0;
const id = () => `t${(seq += 1)}`;

const spend = (date: string, amount: number, categoryId = 'cafe', currency = 'UAH'): Transaction =>
  expenseByDefault({ id: id(), date, accountId: 'card', amount: money(amount, currency), categoryId });

/** The категорії of one currency, over the same numbers `monthly.ts` computed for it. */
function reportsFor(
  transactions: readonly Transaction[],
  choice: Parameters<typeof resolvePeriod>[0],
  builtOn: string,
  options: { currency?: string; limits?: readonly CategoryLimit[] } = {},
) {
  const currency = options.currency ?? 'UAH';
  const period = resolvePeriod(choice, builtOn);
  const monthly = monthlyReports({ period, accounts, transactions });
  const periodSpent =
    monthly.get(currency)?.period.spent ?? { amount: '0.00', currency };
  return categoryReports({
    period,
    currency,
    transactions,
    categories,
    limits: options.limits ?? [],
    // The base of every share is the currency's own витрачено, as `monthly.ts` totalled it.
    periodSpent: money(Number(periodSpent.amount.replace('.', '')), currency),
  });
}

const named = (reports: ReturnType<typeof reportsFor>, name: string) =>
  reports.find((report) => report.name === name)!;

describe('categoryReports', () => {
  it("Scenario: A category's share and change", () => {
    const history = [
      spend('2026-07-10', 50000, 'cafe'),
      spend('2026-08-10', 100000, 'cafe'),
      spend('2026-08-11', 300000, 'groceries'),
    ];

    const cafe = named(reportsFor(history, { from: '2026-08', to: '2026-08' }, '2026-09-01'), 'Кафе');

    expect(cafe.total).toEqual({ amount: '1000.00', currency: 'UAH' });
    // 100000 of the period's 400000 витрачено.
    expect(cafe.share).toBe(2500);
    expect(cafe.changeVsPreviousMonth).toEqual({
      from: '2026-07',
      to: '2026-08',
      partial: false,
      change: 10000,
    });
  });

  it('Scenario: A period ending in the partial month is anchored to the month before it', () => {
    const history = [
      spend('2026-07-10', 50000),
      spend('2026-08-10', 100000),
      spend('2026-09-01', 1000),
    ];

    const cafe = named(reportsFor(history, { from: '2026-07', to: '2026-09' }, '2026-09-01'), 'Кафе');

    expect(cafe.changeVsPreviousMonth).toEqual({
      from: '2026-07',
      to: '2026-08',
      partial: false,
      change: 10000,
    });
    // September is in its months at 10.00 UAH and marked partial, as the scenario says.
    expect(cafe.byMonth).toEqual([
      { month: '2026-07', amount: { amount: '500.00', currency: 'UAH' }, partial: false },
      { month: '2026-08', amount: { amount: '1000.00', currency: 'UAH' }, partial: false },
      { month: '2026-09', amount: { amount: '10.00', currency: 'UAH' }, partial: true },
    ]);
  });

  it('Scenario: A period of the partial month alone is anchored to it and says so', () => {
    const history = [spend('2026-08-10', 100000), spend('2026-09-01', 50000)];

    const cafe = named(reportsFor(history, 'this-month', '2026-09-01'), 'Кафе');

    expect(cafe.changeVsPreviousMonth).toEqual({
      from: '2026-08',
      to: '2026-09',
      partial: true,
      change: -5000,
    });
  });

  it('Scenario: An uncategorised витрата is reported under «Без категорії»', () => {
    const history = [spend('2026-08-10', 30000, UNCATEGORISED_CATEGORY_ID)];

    const reports = reportsFor(history, { from: '2026-08', to: '2026-08' }, '2026-09-01');

    expect(named(reports, 'Без категорії').total).toEqual({ amount: '300.00', currency: 'UAH' });
    // Named by its seeded row like every other категорія — never by the reserved id.
    expect(JSON.stringify(reports)).not.toContain(UNCATEGORISED_CATEGORY_ID);
  });

  it('Scenario: A ліміт and its overrun', () => {
    const history = [spend('2026-08-10', 100000, 'cafe')];
    const limits = [{ categoryId: 'cafe', amount: money(80000, 'UAH') }];

    const cafe = named(
      reportsFor(history, { from: '2026-08', to: '2026-08' }, '2026-09-01', { limits }),
      'Кафе',
    );

    expect(cafe.limit).toEqual({
      amount: { amount: '800.00', currency: 'UAH' },
      exceeded: [{ month: '2026-08', by: { amount: '200.00', currency: 'UAH' } }],
    });
  });

  it('Scenario: A ліміт in another currency does not judge the category', () => {
    const history = [spend('2026-08-10', 100000, 'cafe', 'USD')];
    const limits = [{ categoryId: 'cafe', amount: money(80000, 'UAH') }];

    const cafe = named(
      reportsFor(history, { from: '2026-08', to: '2026-08' }, '2026-09-01', {
        currency: 'USD',
        limits,
      }),
      'Кафе',
    );

    expect(cafe.limit).toBeNull();
  });

  it('marks an archived категорія without touching its назва', () => {
    const history = [spend('2026-08-10', 10000, 'old')];

    const old = named(reportsFor(history, { from: '2026-08', to: '2026-08' }, '2026-09-01'), 'Старе хобі');

    expect(old.archived).toBe(true);
    expect(old.name).toBe('Старе хобі');
  });

  it('has no change where the earlier month held none of the категорія', () => {
    const cafe = named(
      reportsFor([spend('2026-08-10', 100000)], { from: '2026-08', to: '2026-08' }, '2026-09-01'),
      'Кафе',
    );

    expect(cafe.changeVsPreviousMonth.change).toBeNull();
  });

  it('averages the категорія against the same months before the period the currency uses', () => {
    const history = [
      spend('2026-05-10', 100000),
      spend('2026-06-10', 200000),
      spend('2026-08-10', 300000),
    ];

    const cafe = named(reportsFor(history, { from: '2026-07', to: '2026-08' }, '2026-09-01'), 'Кафе');

    // May and June are the baseline months that hold транзакції: (1000 + 2000) / 2.
    expect(cafe.baselineAverage).toEqual({ amount: '1500.00', currency: 'UAH' });
    // The period's own average stands on August alone — July holds nothing: 3000 vs 1500.
    expect(cafe.changeVsBaseline).toBe(10000);
  });

  it('orders the категорії by сума, largest first', () => {
    const history = [
      spend('2026-08-10', 100000, 'cafe'),
      spend('2026-08-11', 300000, 'groceries'),
      spend('2026-08-12', 10000, FEES_CATEGORY_ID),
    ];

    expect(
      reportsFor(history, { from: '2026-08', to: '2026-08' }, '2026-09-01').map((r) => r.name),
    ).toEqual(['Продукти', 'Кафе', 'Комісія']);
  });
});

describe('anchorOf', () => {
  it('is the latest finished month of the period', () => {
    expect(anchorOf(resolvePeriod({ lastMonths: 3 }, '2026-09-01'))).toEqual({
      from: '2026-07',
      to: '2026-08',
      partial: false,
    });
  });

  it('is the partial month only when the period holds no other', () => {
    expect(anchorOf(resolvePeriod('this-month', '2026-09-01'))).toEqual({
      from: '2026-08',
      to: '2026-09',
      partial: true,
    });
  });
});

describe('the категорії of a currency are its витрачено', () => {
  it('their totals sum to the period’s витрачено, per currency', () => {
    const amount = fc.integer({ min: 1, max: 500_000 });
    const day = fc.integer({ min: 1, max: 28 }).map((d) => String(d).padStart(2, '0'));
    const date = fc
      .tuple(fc.constantFrom('2026-07', '2026-08'), day)
      .map(([m, d]) => `${m}-${d}`);
    const categoryId = fc.constantFrom('cafe', 'groceries', UNCATEGORISED_CATEGORY_ID, FEES_CATEGORY_ID);

    const anyExpense = fc.oneof(
      fc.tuple(date, amount, categoryId).map(([d, a, c]) => spend(d, a, c)),
      fc
        .tuple(date, amount, categoryId)
        .map(([d, a, c]): Transaction =>
          refund({ id: id(), date: d, accountId: 'card', amount: money(a, 'UAH'), categoryId: c }),
        ),
      fc.tuple(date, amount).map(
        ([d, a]): Transaction => ({
          type: 'correction',
          id: id(),
          date: d,
          accountId: 'card',
          amount: money(-a, 'UAH'),
        }),
      ),
    );

    fc.assert(
      fc.property(fc.array(anyExpense, { minLength: 1, maxLength: 25 }), (transactions) => {
        const period = resolvePeriod({ from: '2026-07', to: '2026-08' }, '2026-09-01');
        const monthly = monthlyReports({ period, accounts, transactions });
        const spent = monthly.get('UAH');
        if (!spent) {
          return;
        }
        const periodSpent: Money = money(
          Number(spent.period.spent.amount.replace('.', '')),
          'UAH',
        );
        // «Коригування» is a seeded row like the others; it is absent from this fixture's list, so
        // it reports as unnamed — the sum is what this property is about.
        const reports = categoryReports({
          period,
          currency: 'UAH',
          transactions,
          categories,
          limits: [],
          periodSpent,
        });

        const sum = reports.reduce(
          (total, report) => total + Number(report.total.amount.replace('.', '')),
          0,
        );
        expect(sum).toBe(periodSpent.amount);
      }),
    );
  });
});
