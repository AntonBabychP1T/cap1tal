import { describe, expect, it } from 'vitest';

import { account } from './account';
import { money } from './money';
import { monthlyPicture } from './monthly-picture';
import {
  expenseByDefault,
  FEES_CATEGORY_ID,
  isoDate,
  monthOf,
  proposeFee,
  refund,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Income,
  type Expense,
} from './transaction';

describe('transaction', () => {
  it('An untyped transaction is an expense', () => {
    const t = expenseByDefault({
      id: 't1',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: 'food',
    });
    expect(t.type).toBe('expense');
    expect(t.categoryId).toBe('food');
  });

  it('An unrecognised import is an expense', () => {
    const t = expenseByDefault({
      id: 't2',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(12550, 'UAH'),
    });
    expect(t.type).toBe('expense');
    expect(t.categoryId).toBe(UNCATEGORISED_CATEGORY_ID);
  });

  it('Income with a source', () => {
    const t: Income = {
      type: 'income',
      id: 't3',
      date: '2026-03-05',
      accountId: 'card',
      amount: money(5000000, 'UAH'),
      sourceId: 'salary',
    };
    expect(t.type).toBe('income');
    expect(t.amount).toEqual(money(5000000, 'UAH'));
    expect(t.sourceId).toBe('salary');
  });

  it('Card to jar', () => {
    const t = transfer({
      id: 't4',
      date: '2026-03-10',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    expect(t.fromAccountId).toBe('card');
    expect(t.toAccountId).toBe('jar');

    const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
    const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
    const picture = monthlyPicture({ month: '2026-03', accounts: [card, jar], transactions: [t] });
    expect(picture.get('UAH')?.spent).toEqual(money(0, 'UAH'));

    expect(() =>
      transfer({
        id: 't5',
        date: '2026-03-10',
        fromAccountId: 'card',
        toAccountId: 'card',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
    ).toThrow();
  });

  it('Transfer amounts are positive', () => {
    const legs = {
      id: 't13',
      date: '2026-03-10',
      fromAccountId: 'card',
      toAccountId: 'jar',
    };
    expect(() => transfer({ ...legs, left: money(0, 'UAH'), arrived: money(100, 'UAH') })).toThrow();
    expect(() => transfer({ ...legs, left: money(100, 'UAH'), arrived: money(-100, 'UAH') })).toThrow();
  });

  it('UAH card to USD account', () => {
    const t = transfer({
      id: 't6',
      date: '2026-03-10',
      fromAccountId: 'card',
      toAccountId: 'usd-account',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    expect(t.left).toEqual(money(410000, 'UAH'));
    expect(t.arrived).toEqual(money(10000, 'USD'));
    expect('rate' in t).toBe(false);
  });

  it('USD purchase from a UAH card', () => {
    const t: Expense = expenseByDefault({
      id: 't7',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(420000, 'UAH'),
      categoryId: 'travel',
      originalAmount: money(10000, 'USD'),
    });
    expect(t.amount).toEqual(money(420000, 'UAH'));
    expect(t.originalAmount).toEqual(money(10000, 'USD'));
  });

  it('Transfer with a shortfall', () => {
    const t = transfer({
      id: 't10',
      date: '2026-03-10',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    expect(proposeFee(t)).toEqual({
      type: 'expense',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(500, 'UAH'),
      categoryId: FEES_CATEGORY_ID,
    });
  });

  it('Transfer without a shortfall', () => {
    const even = transfer({
      id: 't11',
      date: '2026-03-10',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    expect(proposeFee(even)).toBeNull();

    const crossCurrency = transfer({
      id: 't12',
      date: '2026-03-10',
      fromAccountId: 'card',
      toAccountId: 'usd-account',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    expect(proposeFee(crossCurrency)).toBeNull();
  });

  it('A refund amount is positive (design D2)', () => {
    const t = refund({
      id: 't8',
      date: '2026-04-02',
      accountId: 'card',
      amount: money(80000, 'UAH'),
      categoryId: 'clothes',
    });
    expect(t.type).toBe('refund');
    expect(() =>
      refund({
        id: 't9',
        date: '2026-04-02',
        accountId: 'card',
        amount: money(-80000, 'UAH'),
        categoryId: 'clothes',
      }),
    ).toThrow();
  });

  it('Dates are calendar dates and months are their prefixes (design D4)', () => {
    expect(isoDate('2026-02-28')).toBe('2026-02-28');
    expect(isoDate('2024-02-29')).toBe('2024-02-29');
    expect(() => isoDate('2026-02-30')).toThrow();
    expect(() => isoDate('2026-13-01')).toThrow();
    expect(() => isoDate('10.03.2026')).toThrow();
    expect(monthOf('2026-03-31')).toBe('2026-03');
  });
});
