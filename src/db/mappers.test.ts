import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { toAccount, toAccountRow, toTransaction, toTransactionRow } from './mappers';
import type { AccountRow, TransactionRow } from './schema';

/** The row a SELECT would return: every column present, unused ones NULL. */
const asStoredRow = (t: Transaction): TransactionRow =>
  ({
    accountId: null,
    amount: null,
    currency: null,
    categoryId: null,
    sourceId: null,
    originalAmount: null,
    originalCurrency: null,
    fromAccountId: null,
    toAccountId: null,
    leftAmount: null,
    leftCurrency: null,
    arrivedAmount: null,
    arrivedCurrency: null,
    ...toTransactionRow(t),
  }) as TransactionRow;

const currency = fc.constantFrom('UAH', 'USD', 'EUR');
const minorUnits = fc.integer({ min: 1, max: 100_000_000 });
const id = fc.string({ minLength: 1, maxLength: 12 }).map((s) => `id-${s}`);
const pad = (n: number, width: number) => String(n).padStart(width, '0');
/** Built from parts, never from a Date: the domain's IsoDate is a string, not an instant. */
const date = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`);

const anyTransaction: fc.Arbitrary<Transaction> = fc.oneof(
  fc.record({
    type: fc.constant('expense' as const),
    id,
    date,
    accountId: id,
    amount: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
    categoryId: id,
  }),
  fc.record({
    type: fc.constant('expense' as const),
    id,
    date,
    accountId: id,
    amount: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
    categoryId: id,
    originalAmount: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
  }),
  fc.record({
    type: fc.constant('income' as const),
    id,
    date,
    accountId: id,
    amount: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
    sourceId: id,
  }),
  fc.record({
    type: fc.constant('refund' as const),
    id,
    date,
    accountId: id,
    amount: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
    categoryId: id,
  }),
  fc.record({
    type: fc.constant('correction' as const),
    id,
    date,
    accountId: id,
    amount: fc
      .tuple(fc.integer({ min: -100_000_000, max: 100_000_000 }), currency)
      .map(([a, c]) => money(a, c)),
  }),
  fc.record({
    type: fc.constant('transfer' as const),
    id,
    date,
    fromAccountId: id.map((s) => `${s}-from`),
    toAccountId: id.map((s) => `${s}-to`),
    left: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
    arrived: fc.tuple(minorUnits, currency).map(([a, c]) => money(a, c)),
  }),
);

describe('mappers', () => {
  it('Every transaction type round-trips through a row unchanged', () => {
    fc.assert(
      fc.property(anyTransaction, (t) => {
        expect(toTransaction(asStoredRow(t))).toEqual(t);
      }),
    );
  });

  it('An account round-trips through a row unchanged', () => {
    const opened = account({
      id: 'card',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(-12345, 'UAH'),
    });
    expect(toAccount(toAccountRow(opened) as AccountRow)).toEqual(opened);
  });

  it('A stored account kind outside the domain is rejected', () => {
    const row = { ...toAccountRow(account({ id: 'x', name: 'x', kind: 'cash', currency: 'UAH' })) };
    expect(() => toAccount({ ...row, kind: 'wallet' } as AccountRow)).toThrow();
  });

  it('A stored transaction type outside the domain is rejected', () => {
    const row = asStoredRow({
      type: 'correction',
      id: 'c1',
      date: '2026-03-31',
      accountId: 'card',
      amount: money(-3000, 'UAH'),
    });
    expect(() => toTransaction({ ...row, type: 'payment' })).toThrow();
  });
});
