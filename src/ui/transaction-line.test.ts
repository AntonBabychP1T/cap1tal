import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Income,
} from '../domain/transaction';
import { accountsById, transactionLine } from './transaction-line';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const byId = accountsById([card, jar, usd]);

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
    );
    expect(line).toEqual({
      id: 'e1',
      type: 'витрата',
      amount: '125,50 UAH',
      accounts: 'mono black',
      date: '2026-08-24',
      category: 'Без категорії',
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
    expect(transactionLine(income, byId)).toMatchObject({
      type: 'дохід',
      amount: '50000,00 UAH',
    });
    expect(
      transactionLine(
        { type: 'correction', id: 'c1', date: '2026-08-31', accountId: 'card', amount: money(-3000, 'UAH') },
        byId,
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
    );
    expect(line.accounts).toBe('gone');
  });
});
