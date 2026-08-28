import { describe, expect, it } from 'vitest';

import { overLimit, overLimitCategories, type CategoryLimit } from './limits';
import { money } from './money';
import { categoryBreakdown } from './monthly-picture';
import { expenseByDefault, refund, type Transaction } from './transaction';

const groceriesLimit: CategoryLimit = {
  categoryId: 'groceries',
  amount: money(250000, 'UAH'),
};

/** The breakdown of one month, computed exactly as the Місяць screen computes it. */
function breakdownOf(month: string, transactions: readonly Transaction[]) {
  return categoryBreakdown({ month, transactions });
}

const spend = (id: string, date: string, amount: number, currency: string, categoryId: string) =>
  expenseByDefault({ id, date, accountId: 'card', amount: money(amount, currency), categoryId });

describe('overLimit', () => {
  it('Scenario: Spending above the ліміт is over', () => {
    expect(overLimit(money(250001, 'UAH'), groceriesLimit.amount)).toBe(true);
  });

  it('Scenario: Spending equal to the ліміт is not over', () => {
    expect(overLimit(money(250000, 'UAH'), groceriesLimit.amount)).toBe(false);
    expect(overLimit(money(249999, 'UAH'), groceriesLimit.amount)).toBe(false);
  });

  it('Judging one currency against another is refused, not converted', () => {
    expect(() => overLimit(money(999999, 'USD'), groceriesLimit.amount)).toThrow(/USD/);
  });
});

describe('overLimitCategories', () => {
  it('Scenario: Spending above the ліміт is over', () => {
    const august = breakdownOf('2026-08', [
      spend('e1', '2026-08-03', 250001, 'UAH', 'groceries'),
    ]);

    expect(overLimitCategories({ breakdown: august, limits: [groceriesLimit] })).toEqual(
      new Map([['groceries', 'UAH']]),
    );
  });

  it('Scenario: Spending equal to the ліміт is not over', () => {
    const august = breakdownOf('2026-08', [
      spend('e1', '2026-08-03', 250000, 'UAH', 'groceries'),
    ]);

    expect(overLimitCategories({ breakdown: august, limits: [groceriesLimit] })).toEqual(new Map());
  });

  it('Scenario: A повернення pulls the month back under', () => {
    const transactions = [
      spend('e1', '2026-08-03', 260000, 'UAH', 'groceries'),
      refund({
        id: 'r1',
        date: '2026-08-09',
        accountId: 'card',
        amount: money(20000, 'UAH'),
        categoryId: 'groceries',
      }),
    ];
    const august = breakdownOf('2026-08', transactions);

    // The month's spent in Groceries is 240000 — the same net-of-повернення number the breakdown
    // holds, which is what the ліміт is judged against.
    expect(august.get('UAH')?.get('groceries')).toEqual(money(240000, 'UAH'));
    expect(overLimitCategories({ breakdown: august, limits: [groceriesLimit] })).toEqual(new Map());
  });

  it('Scenario: Another currency’s spending never counts', () => {
    const august = breakdownOf('2026-08', [
      spend('e1', '2026-08-03', 200000, 'UAH', 'groceries'),
      spend('e2', '2026-08-04', 5000, 'USD', 'groceries'),
    ]);

    // Whatever any exchange rate says: 200000 UAH is under the ліміт and the USD never joins it.
    expect(overLimitCategories({ breakdown: august, limits: [groceriesLimit] })).toEqual(new Map());
  });

  it('Scenario: Months are judged independently', () => {
    const transactions = [
      spend('e-july', '2026-07-03', 300000, 'UAH', 'groceries'),
      spend('e-august', '2026-08-03', 100000, 'UAH', 'groceries'),
    ];

    expect(
      overLimitCategories({ breakdown: breakdownOf('2026-07', transactions), limits: [groceriesLimit] }),
    ).toEqual(new Map([['groceries', 'UAH']]));
    expect(
      overLimitCategories({ breakdown: breakdownOf('2026-08', transactions), limits: [groceriesLimit] }),
    ).toEqual(new Map());
  });

  it('Scenario: No ліміт means never over', () => {
    const august = breakdownOf('2026-08', [
      spend('e1', '2026-08-03', 99_000_000, 'UAH', 'travel'),
    ]);

    expect(overLimitCategories({ breakdown: august, limits: [] })).toEqual(new Map());
    // And a ліміт on another category leaves this one alone.
    expect(overLimitCategories({ breakdown: august, limits: [groceriesLimit] })).toEqual(new Map());
  });

  it('The currency comes back with the id, so a screen can mark the right row', () => {
    const august = breakdownOf('2026-08', [
      spend('e1', '2026-08-03', 260000, 'UAH', 'groceries'),
      spend('e2', '2026-08-04', 5000, 'USD', 'groceries'),
    ]);

    expect(overLimitCategories({ breakdown: august, limits: [groceriesLimit] }).get('groceries')).toBe(
      'UAH',
    );
  });

  it('A ліміт in a currency the category is never spent in never fires', () => {
    const august = breakdownOf('2026-08', [
      spend('e1', '2026-08-03', 99_000_000, 'UAH', 'groceries'),
    ]);

    expect(
      overLimitCategories({
        breakdown: august,
        limits: [{ categoryId: 'groceries', amount: money(100, 'USD') }],
      }),
    ).toEqual(new Map());
  });
});
