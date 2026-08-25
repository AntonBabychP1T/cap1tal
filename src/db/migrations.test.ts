import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { toAccount, toAccountRow, toTransaction, toTransactionRow } from './mappers';
import { accounts, categories, monobankRates, rules, sources, transactions } from './schema';
import {
  openTestDb,
  openTestDbMigratedTo,
  seedReferences,
  type TestStorage,
} from './test-db';

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });

/** What the fixtures below point at; the reserved rows migration 0003 inserts are already there. */
const VOCABULARY = { categories: ['food', 'clothes'], sources: ['salary'] } as const;

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

/**
 * What a device from before categories-rules can actually hold. Manual entry offered no category
 * picker, so a stored витрата carries the reserved uncategorised id and an accepted комісія the
 * reserved fees id — nothing else. Migration 0003 turns `category_id` into a foreign key, so
 * these are exactly the rows that have to come through it.
 */
const preCategoriesRows: readonly Transaction[] = [
  expenseByDefault({
    id: 'old-e1',
    date: '2026-03-10',
    accountId: 'card',
    amount: money(12550, 'UAH'),
  }),
  expenseByDefault({
    id: 'old-fee',
    date: '2026-03-15',
    accountId: 'card',
    amount: money(500, 'UAH'),
    categoryId: FEES_CATEGORY_ID,
  }),
  transfer({
    id: 'old-t1',
    date: '2026-03-15',
    fromAccountId: 'card',
    toAccountId: 'jar',
    left: money(200000, 'UAH'),
    arrived: money(199500, 'UAH'),
  }),
];

describe('migrations', () => {
  let storage: TestStorage;

  /** The columns the committed migrations actually produced, straight from SQLite. */
  const migratedColumnsOf = (table: 'accounts' | 'transactions' | 'monobank_rates'): string[] => {
    // Drizzle's `sql` interpolates values, not identifiers, and PRAGMA takes a table name — so
    // the three statements are written out rather than built from the argument.
    const pragma =
      table === 'accounts'
        ? sql`PRAGMA table_info(accounts)`
        : table === 'transactions'
          ? sql`PRAGMA table_info(transactions)`
          : sql`PRAGMA table_info(monobank_rates)`;
    return storage.db.all<{ name: string }>(pragma).map((column) => column.name);
  };

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
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

  it('Scenario: A fresh database from migrations alone stores the flag', () => {
    const { db } = storage;
    const archivedJar = account({ ...jar, id: 'old-jar', archived: true });
    db.insert(accounts).values([toAccountRow(card), toAccountRow(archivedJar)]).run();

    expect(toAccount(db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(
      card,
    );
    expect(toAccount(db.select().from(accounts).where(eq(accounts.id, 'old-jar')).get()!)).toEqual(
      archivedJar,
    );
    expect(card.archived).toBe(false);
    expect(archivedJar.archived).toBe(true);
  });

  it('Scenario: A pre-migration account loads unarchived', () => {
    // A row written when only the first migration existed: no archived column to write to.
    const staged = openTestDbMigratedTo(1);
    try {
      staged.db.run(
        sql`INSERT INTO accounts (id, name, kind, currency, opening_amount)
            VALUES ('card', 'mono black', 'spending', 'UAH', 100000)`,
      );

      staged.migrateToLatest();

      const row = staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get();
      expect(toAccount(row!)).toEqual(
        account({
          id: 'card',
          name: 'mono black',
          kind: 'spending',
          currency: 'UAH',
          openingBalance: money(100000, 'UAH'),
        }),
      );
      expect(toAccount(row!).archived).toBe(false);
    } finally {
      staged.close();
    }
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
      'archived',
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

describe('migrations — the monobank rate cache', () => {
  let storage: TestStorage;

  /** The rate cache's columns as the committed migrations actually produced them. */
  const rateColumns = (): { name: string; type: string; notnull: number; pk: number }[] =>
    storage.db.all<{ name: string; type: string; notnull: number; pk: number }>(
      sql`PRAGMA table_info(monobank_rates)`,
    );

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('A fresh install has the rate cache, with the shape the design pins', () => {
    const columns = rateColumns();
    expect(columns.map((c) => c.name)).toEqual(['currency', 'rate_millionths', 'obtained_at']);
    // The currency is the key: one row per currency, so a newer rate replaces the older one.
    expect(columns.find((c) => c.name === 'currency')?.pk).toBe(1);
    expect(columns.find((c) => c.name === 'rate_millionths')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'obtained_at')?.notnull).toBe(1);
  });

  it('The rate is an integer, never a float column', () => {
    const types = rateColumns().map((c) => c.type.toUpperCase());
    expect(types).toEqual(['TEXT', 'INTEGER', 'INTEGER']);
    expect(types).not.toContain('REAL');
  });

  it('The migrated shape keeps a rate that is not above zero out', () => {
    const { db } = storage;
    db.insert(monobankRates)
      .values({ currency: 'USD', rateMillionths: 41_253_450, obtainedAt: new Date(1) })
      .run();

    for (const bad of [0, -1]) {
      expect(() =>
        db
          .insert(monobankRates)
          .values({ currency: 'EUR', rateMillionths: bad, obtainedAt: new Date(1) })
          .run(),
      ).toThrow();
    }
  });

  it('The rate cache is its own table: no rate column reaches a transaction or an account', () => {
    const columns = [
      ...storage.db.all<{ name: string }>(sql`PRAGMA table_info(accounts)`),
      ...storage.db.all<{ name: string }>(sql`PRAGMA table_info(transactions)`),
    ].map((c) => c.name);
    expect(columns.filter((name) => name.includes('rate'))).toEqual([]);
  });

  it('A database from before the rate cache gains the table empty, disturbing nothing', () => {
    // The two migrations that predate this change. An older install has no rate cache at all;
    // migrating forward must add it without disturbing the rows already there.
    const staged = openTestDbMigratedTo(2);
    try {
      staged.db.insert(accounts).values(toAccountRow(card)).run();
      // A витрата in the reserved uncategorised category — the only kind a database this old can
      // hold, and the kind migration 0003's foreign key has to accept.
      staged.db.insert(transactions).values(toTransactionRow(preCategoriesRows[0]!)).run();
      expect(() => staged.db.select().from(monobankRates).all()).toThrow();

      staged.migrateToLatest();

      expect(staged.db.select().from(monobankRates).all()).toEqual([]);
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(
        toTransaction(
          staged.db.select().from(transactions).where(eq(transactions.id, 'old-e1')).get()!,
        ),
      ).toEqual(preCategoriesRows[0]);
    } finally {
      staged.close();
    }
  });
});

describe('migrations — the editable lists', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database from migrations alone stores every list', () => {
    const { db } = storage;
    // No `seedReferences` here on purpose: the scenario is about what the committed migrations
    // alone can hold, so every row this test needs it stores itself.
    db.insert(categories).values({ id: 'groceries', name: 'Groceries' }).run();
    db.insert(sources).values({ id: 'salary', name: 'Salary' }).run();
    db.insert(rules)
      .values({
        id: 'rule-1',
        merchant: 'сільпо',
        mcc: 5411,
        categoryId: 'groceries',
        createdAt: new Date(1_700_000_000_000),
      })
      .run();
    db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();

    const everyType: readonly Transaction[] = [
      expenseByDefault({
        id: 'e1',
        date: '2026-03-10',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: 'groceries',
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
        categoryId: 'groceries',
      }),
      {
        type: 'correction',
        id: 'c1',
        date: '2026-03-31',
        accountId: 'card',
        amount: money(-3000, 'UAH'),
      },
    ];
    db.insert(transactions).values(everyType.map(toTransactionRow)).run();

    expect(db.select().from(categories).where(eq(categories.id, 'groceries')).get()).toEqual({
      id: 'groceries',
      name: 'Groceries',
      archived: false,
    });
    expect(db.select().from(sources).where(eq(sources.id, 'salary')).get()).toEqual({
      id: 'salary',
      name: 'Salary',
      archived: false,
    });
    expect(db.select().from(rules).where(eq(rules.id, 'rule-1')).get()).toEqual({
      id: 'rule-1',
      merchant: 'сільпо',
      mcc: 5411,
      categoryId: 'groceries',
      createdAt: new Date(1_700_000_000_000),
    });
    for (const original of everyType) {
      const row = db.select().from(transactions).where(eq(transactions.id, original.id)).get();
      expect(toTransaction(row!)).toEqual(original);
    }
    expect(new Set(everyType.map((t) => t.type))).toEqual(
      new Set(['expense', 'income', 'transfer', 'refund', 'correction']),
    );
  });

  it('The migrated shape keeps a transaction referencing an unknown category or source out', () => {
    const { db } = storage;
    db.insert(accounts).values(toAccountRow(card)).run();
    db.insert(sources).values({ id: 'salary', name: 'Salary' }).run();
    db.insert(categories).values({ id: 'groceries', name: 'Groceries' }).run();
    const expense = toTransactionRow(
      expenseByDefault({
        id: 'e1',
        date: '2026-03-10',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: 'groceries',
      }),
    );

    expect(() =>
      db.insert(transactions).values({ ...expense, id: 'ghost', categoryId: 'nope' }).run(),
    ).toThrow();
    expect(() =>
      db
        .insert(transactions)
        .values({
          ...expense,
          id: 'ghost-income',
          type: 'income',
          categoryId: null,
          sourceId: 'nope',
        })
        .run(),
    ).toThrow();
  });

  it('A rule cannot exist without a criterion, with a blank merchant, or without its category', () => {
    const { db } = storage;
    db.insert(categories).values({ id: 'groceries', name: 'Groceries' }).run();
    const base = {
      id: 'rule-1',
      merchant: 'сільпо' as string | null,
      mcc: 5411 as number | null,
      categoryId: 'groceries',
      createdAt: new Date(1),
    };

    expect(() =>
      db.insert(rules).values({ ...base, id: 'no-criterion', merchant: null, mcc: null }).run(),
    ).toThrow();
    expect(() =>
      db.insert(rules).values({ ...base, id: 'blank', merchant: '   ', mcc: null }).run(),
    ).toThrow();
    expect(() =>
      db.insert(rules).values({ ...base, id: 'ghost-target', categoryId: 'nope' }).run(),
    ).toThrow();
  });

  it('Scenario: Pre-migration transactions survive the migration unchanged', () => {
    // The migrations committed before this change: a database as the owner's device holds it.
    const staged = openTestDbMigratedTo(3);
    try {
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      staged.db.insert(transactions).values(preCategoriesRows.map(toTransactionRow)).run();

      staged.migrateToLatest();

      for (const original of preCategoriesRows) {
        const row = staged.db
          .select()
          .from(transactions)
          .where(eq(transactions.id, original.id))
          .get();
        expect(row, `transaction ${original.id} did not survive`).toBeDefined();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(
        card,
      );
      // The reserved ids they carry now point at real rows, so nothing is left dangling.
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      expect(
        staged.db
          .select()
          .from(categories)
          .where(eq(categories.id, UNCATEGORISED_CATEGORY_ID))
          .get()?.name,
      ).toBe('Без категорії');
      expect(
        staged.db.select().from(categories).where(eq(categories.id, FEES_CATEGORY_ID)).get()?.name,
      ).toBe('Комісія');
    } finally {
      staged.close();
    }
  });
});
