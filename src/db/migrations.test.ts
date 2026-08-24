import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, refund, transfer, type Transaction } from '../domain/transaction';
import { toAccountRow, toTransaction, toTransactionRow } from './mappers';
import { accounts, transactions } from './schema';
import { openTestDb, type TestStorage } from './test-db';

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });

const oneOfEachType: readonly Transaction[] = [
  expenseByDefault({
    id: 'e1',
    date: '2026-03-10',
    accountId: 'card',
    amount: money(12550, 'UAH'),
    categoryId: 'food',
  }),
  {
    type: 'income',
    id: 'i1',
    date: '2026-03-01',
    accountId: 'card',
    amount: money(5000000, 'UAH'),
    sourceId: 'salary',
  },
  transfer({
    id: 't1',
    date: '2026-03-15',
    fromAccountId: 'card',
    toAccountId: 'jar',
    left: money(200000, 'UAH'),
    arrived: money(200000, 'UAH'),
  }),
  refund({
    id: 'r1',
    date: '2026-03-18',
    accountId: 'card',
    amount: money(80000, 'UAH'),
    categoryId: 'clothes',
  }),
  { type: 'correction', id: 'c1', date: '2026-03-31', accountId: 'card', amount: money(-3000, 'UAH') },
];

describe('migrations', () => {
  let storage: TestStorage;

  /** The columns the committed migrations actually produced, straight from SQLite. */
  const migratedColumnsOf = (table: 'accounts' | 'transactions'): string[] =>
    storage.db
      .all<{ name: string }>(
        table === 'accounts'
          ? sql`PRAGMA table_info(accounts)`
          : sql`PRAGMA table_info(transactions)`,
      )
      .map((column) => column.name);

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh install starts from migrations alone', () => {
    const { db } = storage;
    db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
    db.insert(transactions).values(oneOfEachType.map(toTransactionRow)).run();

    const storedAccounts = db.select().from(accounts).all();
    expect(storedAccounts).toHaveLength(2);

    for (const original of oneOfEachType) {
      const row = db.select().from(transactions).where(eq(transactions.id, original.id)).get();
      expect(row, `transaction ${original.id} was not stored`).toBeDefined();
      expect(toTransaction(row!)).toEqual(original);
    }
    expect(new Set(oneOfEachType.map((t) => t.type))).toEqual(
      new Set(['expense', 'income', 'transfer', 'refund', 'correction']),
    );
  });

  it('The migrated shape keeps a non-calendar date out', () => {
    const { db } = storage;
    db.insert(accounts).values(toAccountRow(card)).run();
    expect(() =>
      db
        .insert(transactions)
        .values({
          ...toTransactionRow(oneOfEachType[0]!),
          id: 'bad-date',
          date: '10.03.2026',
        })
        .run(),
    ).toThrow();
  });

  it('The migrated shape keeps an amount from existing without its currency', () => {
    const { db } = storage;
    db.insert(accounts).values(toAccountRow(card)).run();
    const expense = toTransactionRow(oneOfEachType[0]!);

    expect(() =>
      db.insert(transactions).values({ ...expense, id: 'no-currency', currency: null }).run(),
    ).toThrow();
    expect(() =>
      db.insert(transactions).values({ ...expense, id: 'no-amount', amount: null }).run(),
    ).toThrow();
    expect(() =>
      db
        .insert(transactions)
        .values({ ...expense, id: 'half-original', originalAmount: 10000 })
        .run(),
    ).toThrow();
  });

  it('The migrated shape keeps a type from wearing another type\'s fields', () => {
    const { db } = storage;
    db.insert(accounts).values(toAccountRow(card)).run();
    const expense = toTransactionRow(oneOfEachType[0]!);
    const income = toTransactionRow(oneOfEachType[1]!);

    // An expense needs a category; an income needs a source and must not carry one.
    expect(() =>
      db.insert(transactions).values({ ...expense, id: 'no-category', categoryId: null }).run(),
    ).toThrow();
    expect(() =>
      db.insert(transactions).values({ ...income, id: 'no-source', sourceId: null }).run(),
    ).toThrow();
    expect(() =>
      db
        .insert(transactions)
        .values({ ...income, id: 'income-with-category', categoryId: 'food' })
        .run(),
    ).toThrow();
    // A correction's category is fixed by the domain, so no category id is stored.
    expect(() =>
      db
        .insert(transactions)
        .values({ ...toTransactionRow(oneOfEachType[4]!), id: 'correction-with-category', categoryId: 'food' })
        .run(),
    ).toThrow();
    // Only the five domain types exist.
    expect(() =>
      db.insert(transactions).values({ ...expense, id: 'payment', type: 'payment' }).run(),
    ).toThrow();
  });

  it('No balance is stored: an account keeps only its opening balance', () => {
    // Read from the migrated database, not from the schema object: a migration carrying a column
    // the schema no longer declares would slip past the latter.
    expect(migratedColumnsOf('accounts')).toEqual([
      'id',
      'name',
      'kind',
      'currency',
      'opening_amount',
    ]);
  });

  it('No exchange rate is stored: neither table holds a rate column', () => {
    const columns = [...migratedColumnsOf('accounts'), ...migratedColumnsOf('transactions')];
    expect(columns.filter((name) => name.includes('rate'))).toEqual([]);
  });

  it('The migrated shape keeps a transfer from carrying a single-account amount', () => {
    const { db } = storage;
    db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
    expect(() =>
      db
        .insert(transactions)
        .values({
          ...toTransactionRow(oneOfEachType[2]!),
          id: 'bad-transfer',
          accountId: 'card',
          amount: 1,
          currency: 'UAH',
        })
        .run(),
    ).toThrow();
  });
});
