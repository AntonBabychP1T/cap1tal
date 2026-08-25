import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { namesById } from '../domain/category';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Income,
} from '../domain/transaction';
import { accountsById, transactionLine } from './transaction-line';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const byId = accountsById([card, jar, usd]);
/** The categories list as the feed loads it — the seeded reserved rows plus one of the owner's. */
const names = namesById([
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії' },
  { id: 'groceries', name: 'Groceries' },
]);

describe('transactionLine', () => {
  it('An expense shows its amount with currency, its account and its date', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e1',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      byId,
      names,
    );
    expect(line).toEqual({
      id: 'e1',
      type: 'витрата',
      amount: '125,50 UAH',
      accounts: 'mono black',
      date: '2026-08-24',
      category: 'Без категорії',
      uncategorised: true,
    });
  });

  it('A переказ shows both accounts', () => {
    const line = transactionLine(
      transfer({
        id: 't1',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      byId,
      names,
    );
    expect(line).toMatchObject({
      type: 'переказ',
      amount: '1000,00 UAH',
      accounts: 'mono black → банка',
    });
    expect(line.category).toBeUndefined();
  });

  it('A cross-currency переказ shows both amounts in their own currencies', () => {
    const line = transactionLine(
      transfer({
        id: 't2',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'usd',
        left: money(410000, 'UAH'),
        arrived: money(10000, 'USD'),
      }),
      byId,
      names,
    );
    expect(line.amount).toBe('4100,00 UAH → 100,00 USD');
    expect(line.accounts).toBe('mono black → долари');
  });

  it('Income and correction show their own words', () => {
    const income: Income = {
      type: 'income',
      id: 'i1',
      date: '2026-08-01',
      accountId: 'card',
      amount: money(5000000, 'UAH'),
      sourceId: 'salary',
    };
    expect(transactionLine(income, byId, names)).toMatchObject({
      type: 'дохід',
      amount: '50000,00 UAH',
    });
    expect(
      transactionLine(
        { type: 'correction', id: 'c1', date: '2026-08-31', accountId: 'card', amount: money(-3000, 'UAH') },
        byId,
        names,
      ),
    ).toMatchObject({ type: 'коригування', amount: '−30,00 UAH' });
  });

  it('An unknown account shows its id rather than an empty gap', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e2',
        date: '2026-08-24',
        accountId: 'gone',
        amount: money(100, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      byId,
      names,
    );
    expect(line.accounts).toBe('gone');
  });
});

describe('«Без категорії» is highlighted and categorised in one tap — the marking half', () => {
  const at = (id: string, categoryId: string) =>
    transactionLine(
      expenseByDefault({
        id,
        date: '2026-08-24',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId,
      }),
      byId,
      names,
    );

  it('Scenario: An uncategorised expense is marked in the feed', () => {
    expect(at('e1', UNCATEGORISED_CATEGORY_ID).uncategorised).toBe(true);
    expect(at('e2', 'groceries').uncategorised).toBe(false);
  });

  it('Scenario: One tap categorises from the feed — the mark goes with the category', () => {
    // What the feed stores after the pick is the same transaction with another category id; the
    // line built from it no longer carries the mark, which is how the mark disappears.
    expect(at('e1', UNCATEGORISED_CATEGORY_ID).uncategorised).toBe(true);
    expect(at('e1', 'groceries')).toMatchObject({ category: 'Groceries', uncategorised: false });
  });

  it('A type that carries no category is never marked', () => {
    const line = transactionLine(
      transfer({
        id: 't1',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      byId,
      names,
    );
    expect(line.uncategorised).toBe(false);
    expect(line.category).toBeUndefined();
  });

  it('A повернення in «Без категорії» is marked like a витрата', () => {
    const line = transactionLine(
      refund({
        id: 'r1',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(80000, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      byId,
      names,
    );
    expect(line).toMatchObject({ type: 'повернення', uncategorised: true });
  });
});
