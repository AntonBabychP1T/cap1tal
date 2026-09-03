import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { contribution, sumContributions } from '../domain/goals';
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
import { reportingRepo } from './reporting-repo';
import {
  accounts,
  alerts,
  bugReportScreenshots,
  bugReports,
  categories,
  categoryLimits,
  dailyReminder,
  entryDefaults,
  fiscalReceipts,
  goalAccounts,
  goals,
  journal,
  monobankAccounts,
  monobankImportedItems,
  monobankLinks,
  monobankRates,
  monobankSyncAttempt,
  notificationDrafts,
  notificationFingerprints,
  notificationWatches,
  receiptItems,
  rules,
  saldoImport,
  sources,
  transactions,
} from './schema';
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
 * Stores a транзакція in a database staged *before* migration 0005, which is the only way to hold
 * one against the shape the owner's device actually had. Written as an explicit statement rather
 * than through the query builder because the builder names every column of the current schema —
 * `description` included — and the staged table has not got it yet. Values are bound, never
 * interpolated, and `created_at` is left to its column default exactly as the builder leaves it.
 */
function insertBeforeDescriptionColumn(db: TestStorage['db'], t: Transaction): void {
  const row = toTransactionRow(t);
  db.run(sql`
    INSERT INTO transactions
      (id, type, date, account_id, amount, currency, category_id, source_id,
       original_amount, original_currency, from_account_id, to_account_id,
       left_amount, left_currency, arrived_amount, arrived_currency)
    VALUES
      (${row.id}, ${row.type}, ${row.date}, ${row.accountId ?? null}, ${row.amount ?? null},
       ${row.currency ?? null}, ${row.categoryId ?? null}, ${row.sourceId ?? null},
       ${row.originalAmount ?? null}, ${row.originalCurrency ?? null},
       ${row.fromAccountId ?? null}, ${row.toAccountId ?? null},
       ${row.leftAmount ?? null}, ${row.leftCurrency ?? null},
       ${row.arrivedAmount ?? null}, ${row.arrivedCurrency ?? null})
  `);
}

/**
 * Stores a ціль in a database staged *before* the склад migrations, which is the only way to hold
 * one against the shape the owner's device actually had: exactly one `account_id`, and a `deadline`
 * it could not omit. Written as an explicit statement for the same reason as the транзакція above —
 * the query builder names every column of the *current* schema, and `account_id` is no longer one
 * of them. Values are bound, never interpolated.
 */
function insertOneAccountGoal(
  db: TestStorage['db'],
  goal: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    deadline: string;
    accountId: string;
  },
): void {
  db.run(sql`
    INSERT INTO goals (id, name, amount, currency, deadline, account_id)
    VALUES (${goal.id}, ${goal.name}, ${goal.amount}, ${goal.currency}, ${goal.deadline},
            ${goal.accountId})
  `);
}

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
      insertBeforeDescriptionColumn(staged.db, preCategoriesRows[0]!);
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
      for (const row of preCategoriesRows) insertBeforeDescriptionColumn(staged.db, row);

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

/**
 * The marker that says the one-time Saldo import has been committed. Its own describe, because it
 * is the only thing migration 0004 adds — and because "a device that already holds a history
 * gains it empty" is the half that matters on the owner's phone.
 */
describe('migrations — the import marker', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database from migrations alone holds the marker', () => {
    storage.db
      .insert(saldoImport)
      .values({ id: 'saldo', committedAt: new Date('2026-08-25T12:00:00.000Z') })
      .run();

    expect(storage.db.select().from(saldoImport).all()).toEqual([
      { id: 'saldo', committedAt: new Date('2026-08-25T12:00:00.000Z') },
    ]);
    // And every transaction type still stores, so the new table disturbed none of them.
    storage.db.insert(transactions).values(oneOfEachType.map(toTransactionRow)).run();
    expect(storage.db.select().from(transactions).all()).toHaveLength(oneOfEachType.length);
  });

  it('The table holds one row: a second id is refused', () => {
    storage.db.insert(saldoImport).values({ id: 'saldo', committedAt: new Date(1) }).run();

    expect(() =>
      storage.db.insert(saldoImport).values({ id: 'other', committedAt: new Date(2) }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('Scenario: Rows stored before the migration survive it', () => {
    // The migrations committed before this change: a database as the owner's device holds it.
    const staged = openTestDbMigratedTo(4);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const row of oneOfEachType) insertBeforeDescriptionColumn(staged.db, row);
      staged.db.insert(rules).values({
        id: 'rule-1',
        merchant: 'сільпо',
        categoryId: 'food',
        createdAt: new Date('2026-08-24T09:00:00.000Z'),
      }).run();

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(staged.db.select().from(rules).all()).toHaveLength(1);
      expect(staged.db.select().from(sources).all().map((row) => row.id)).toContain('salary');
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      // The device has imported nothing, so the marker arrives empty.
      expect(staged.db.select().from(saldoImport).all()).toEqual([]);
    } finally {
      staged.close();
    }
  });
});

/**
 * What monobank sync needs to survive a restart, and the one column the транзакції table gains
 * with it. Its own describe for the reason the import marker has one: the half that matters on
 * the owner's phone is that a database already full of their money comes through untouched.
 */
describe('migrations — monobank links, progress and описи', () => {
  let storage: TestStorage;

  const tableNames = (db: TestStorage['db']): string[] =>
    db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((row) => row.name);

  /**
   * Every column of every table, so "no storage location for a token" can be asserted whole.
   * Joined against `sqlite_master` rather than fed a subquery: `pragma_table_info(<scalar>)` would
   * take the first table name and quietly describe that one table alone.
   */
  const everyColumn = (db: TestStorage['db']): string[] =>
    db
      .all<{ name: string }>(
        sql`SELECT DISTINCT ti.name FROM sqlite_master m JOIN pragma_table_info(m.name) ti WHERE m.type = 'table'`,
      )
      .map((row) => row.name);

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database supports monobank metadata but not the token', () => {
    const { db } = storage;
    db.insert(monobankAccounts)
      .values({
        id: 'mono-card',
        kind: 'card',
        name: 'black ··1234',
        currency: 'UAH',
        bankBalanceAmount: 5000000,
        obtainedAt: new Date('2026-08-28T08:00:00.000Z'),
      })
      .run();
    db.insert(monobankLinks)
      .values({
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-01',
        cursorMs: new Date('2026-08-27T21:00:00.000Z'),
        lastSyncedAt: new Date('2026-09-01T06:30:00.000Z'),
      })
      .run();
    db.insert(monobankImportedItems)
      .values({ monobankAccountId: 'mono-card', itemId: 'item-1' })
      .run();
    db.insert(transactions)
      .values({
        ...toTransactionRow(
          expenseByDefault({
            id: 'imported-1',
            date: '2026-08-27',
            accountId: 'card',
            amount: money(12550, 'UAH'),
            categoryId: UNCATEGORISED_CATEGORY_ID,
            description: 'СІЛЬПО Київ',
          }),
        ),
      })
      .run();

    // Links, cursors, imported ids, bank balances, описи and the moment a sync last completed
    // all store…
    expect(db.select().from(monobankLinks).all()).toEqual([
      {
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-01',
        cursorMs: new Date('2026-08-27T21:00:00.000Z'),
        lastSyncedAt: new Date('2026-09-01T06:30:00.000Z'),
      },
    ]);
    expect(everyColumn(db)).toContain('last_synced_at');
    expect(db.select().from(monobankAccounts).get()?.bankBalanceAmount).toBe(5000000);
    expect(db.select().from(monobankImportedItems).all()).toEqual([
      { monobankAccountId: 'mono-card', itemId: 'item-1' },
    ]);
    expect(
      db.select().from(transactions).where(eq(transactions.id, 'imported-1')).get()?.description,
    ).toBe('СІЛЬПО Київ');

    // …and nothing anywhere is a place to keep the token. The helper is held to actually seeing
    // the whole schema first: a query that described one table would pass the check vacuously.
    expect(everyColumn(db)).toContain('description');
    expect(everyColumn(db)).toContain('bank_balance_amount');
    expect(everyColumn(db)).toContain('opening_amount');
    expect(tableNames(db).filter((name) => /token/i.test(name))).toEqual([]);
    expect(everyColumn(db).filter((name) => /token/i.test(name))).toEqual([]);
  });

  it('A monobank account and a рахунок each take part in at most one link', () => {
    const { db } = storage;
    db.insert(monobankAccounts)
      .values([
        {
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalanceAmount: 1,
          obtainedAt: new Date(1),
        },
        {
          id: 'mono-jar',
          kind: 'jar',
          name: 'банка',
          currency: 'UAH',
          bankBalanceAmount: 2,
          obtainedAt: new Date(1),
        },
      ])
      .run();
    db.insert(monobankLinks)
      .values({
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-01',
        cursorMs: new Date(1),
      })
      .run();

    // The same monobank account again — refused by its primary key…
    expect(() =>
      db
        .insert(monobankLinks)
        .values({
          monobankAccountId: 'mono-card',
          accountId: 'jar',
          syncStartDate: '2026-08-01',
          cursorMs: new Date(1),
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
    // …and the same рахунок again, by the unique index on the other side.
    expect(() =>
      db
        .insert(monobankLinks)
        .values({
          monobankAccountId: 'mono-jar',
          accountId: 'card',
          syncStartDate: '2026-08-01',
          cursorMs: new Date(1),
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('The migrated shape keeps a bank identity from vanishing under its own history', () => {
    const { db } = storage;
    db.insert(monobankAccounts)
      .values({
        id: 'mono-card',
        kind: 'card',
        name: 'black ··1234',
        currency: 'UAH',
        bankBalanceAmount: 1,
        obtainedAt: new Date(1),
      })
      .run();
    db.insert(monobankImportedItems)
      .values({ monobankAccountId: 'mono-card', itemId: 'item-1' })
      .run();

    // `onDelete: 'restrict'` — the seen ids reference the bank account, so it cannot be deleted
    // out from under them, and the same item can never import twice.
    expect(() =>
      db.delete(monobankAccounts).where(eq(monobankAccounts.id, 'mono-card')).run(),
    ).toThrow(/FOREIGN KEY constraint failed/);
    // A second (account, item) pair is refused by the composite primary key.
    expect(() =>
      db.insert(monobankImportedItems).values({ monobankAccountId: 'mono-card', itemId: 'item-1' }).run(),
    ).toThrow(/UNIQUE constraint failed/);
    // The migrated shape also refuses a kind the parser cannot produce and a non-calendar date.
    expect(() =>
      db
        .insert(monobankAccounts)
        .values({
          id: 'mono-x',
          kind: 'wallet',
          name: 'x',
          currency: 'UAH',
          bankBalanceAmount: 0,
          obtainedAt: new Date(1),
        })
        .run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db
        .insert(monobankLinks)
        .values({
          monobankAccountId: 'mono-card',
          accountId: 'card',
          syncStartDate: 'вчора',
          cursorMs: new Date(1),
        })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('Scenario: Existing financial data survives the migration', () => {
    // The migrations committed before this change: a database as the owner's device holds it,
    // holding every транзакція type, рахунки, list rows, rules, the Saldo marker and a rate.
    const staged = openTestDbMigratedTo(5);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const row of oneOfEachType) insertBeforeDescriptionColumn(staged.db, row);
      staged.db
        .insert(rules)
        .values({
          id: 'rule-1',
          merchant: 'сільпо',
          categoryId: 'food',
          createdAt: new Date('2026-08-24T09:00:00.000Z'),
        })
        .run();
      staged.db
        .insert(saldoImport)
        .values({ id: 'saldo', committedAt: new Date('2026-08-25T12:00:00.000Z') })
        .run();
      staged.db
        .insert(monobankRates)
        .values({ currency: 'USD', rateMillionths: 41_500_000, obtainedAt: new Date(1) })
        .run();

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(staged.db.select().from(rules).all()).toHaveLength(1);
      expect(staged.db.select().from(sources).all().map((row) => row.id)).toContain('salary');
      expect(staged.db.select().from(categories).all().map((row) => row.id)).toContain('food');
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(staged.db.select().from(saldoImport).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankRates).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      // The device has linked nothing, so the three tables arrive empty…
      expect(staged.db.select().from(monobankAccounts).all()).toEqual([]);
      expect(staged.db.select().from(monobankLinks).all()).toEqual([]);
      expect(staged.db.select().from(monobankImportedItems).all()).toEqual([]);
      // …and no monobank token exists in the database, asserted over every column of every
      // table — the helper is held to seeing them all before the absence means anything.
      expect(everyColumn(staged.db)).toContain('description');
      expect(everyColumn(staged.db)).toContain('cursor_ms');
      expect(everyColumn(staged.db).length).toBeGreaterThan(20);
      expect(tableNames(staged.db).filter((name) => /token/i.test(name))).toEqual([]);
      expect(everyColumn(staged.db).filter((name) => /token/i.test(name))).toEqual([]);
    } finally {
      staged.close();
    }
  });

  it('Scenario: An old transaction gains no invented description', () => {
    const staged = openTestDbMigratedTo(5);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const row of oneOfEachType) insertBeforeDescriptionColumn(staged.db, row);

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        // NULL in the column, and no `description` property at all on the way out — a row from
        // before the column is indistinguishable from one recorded by hand today.
        expect(row?.description).toBeNull();
        expect(toTransaction(row!)).not.toHaveProperty('description');
        expect(toTransaction(row!)).toEqual(original);
      }
    } finally {
      staged.close();
    }
  });
});

/**
 * Ліміти and цілі: the two tables migration 0006 adds. Its own describe for the reason the import
 * marker has one — the half that matters on the owner's phone is that a database already full of
 * their money comes through untouched, and that no category quietly gains a ліміт it never had.
 */
describe('migrations — ліміти and цілі', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database from migrations alone stores ліміти', () => {
    const { db } = storage;
    db.insert(categoryLimits).values({ categoryId: 'food', amount: 250000, currency: 'UAH' }).run();

    expect(db.select().from(categoryLimits).all()).toEqual([
      { categoryId: 'food', amount: 250000, currency: 'UAH' },
    ]);
    // The primary key is the "at most one ліміт per category" rule (design D1), and the CHECK is
    // "a ліміт is positive" — both of them the storage's, not only the repository's.
    expect(() =>
      db.insert(categoryLimits).values({ categoryId: 'food', amount: 300000, currency: 'UAH' }).run(),
    ).toThrow();
    expect(() =>
      db.insert(categoryLimits).values({ categoryId: 'clothes', amount: 0, currency: 'UAH' }).run(),
    ).toThrow();
    expect(() =>
      db.insert(categoryLimits).values({ categoryId: 'nope', amount: 1000, currency: 'UAH' }).run(),
    ).toThrow();
  });

  it('Scenario: A fresh database from migrations alone stores цілі', () => {
    const { db } = storage;
    db.insert(goals)
      .values({ id: 'g1', name: 'Авто', amount: 20000000, currency: 'UAH', deadline: '2026-12-31' })
      .run();
    db.insert(goalAccounts)
      .values([
        { goalId: 'g1', accountId: 'jar' },
        { goalId: 'g1', accountId: 'card' },
      ])
      .run();

    expect(db.select().from(goals).all()).toEqual([
      { id: 'g1', name: 'Авто', amount: 20000000, currency: 'UAH', deadline: '2026-12-31' },
    ]);
    // A ціль whose склад holds several рахунки — the whole point of the relation.
    expect(db.select().from(goalAccounts).orderBy(goalAccounts.accountId).all()).toEqual([
      { goalId: 'g1', accountId: 'card' },
      { goalId: 'g1', accountId: 'jar' },
    ]);

    const g = { id: 'g2', name: 'Авто', amount: 1, currency: 'UAH', deadline: '2026-12-31' };
    expect(() => db.insert(goals).values({ ...g, amount: 0 }).run()).toThrow();
    expect(() => db.insert(goals).values({ ...g, name: '   ' }).run()).toThrow();
    expect(() => db.insert(goals).values({ ...g, deadline: '31.12.2026' }).run()).toThrow();
    // The дата is nullable now, and that is the storage's answer to «this ціль has no deadline».
    db.insert(goals).values({ ...g, deadline: null }).run();
    expect(db.select().from(goals).where(eq(goals.id, 'g2')).get()?.deadline).toBeNull();
    // The composite primary key **is** «no рахунок twice», and the references are real.
    expect(() => db.insert(goalAccounts).values({ goalId: 'g1', accountId: 'jar' }).run()).toThrow();
    expect(() => db.insert(goalAccounts).values({ goalId: 'g1', accountId: 'nope' }).run()).toThrow();
    expect(() => db.insert(goalAccounts).values({ goalId: 'ghost', accountId: 'jar' }).run()).toThrow();
  });

  it('Scenario: Nothing else in the database moves', () => {
    const { db } = storage;
    db.insert(categoryLimits).values({ categoryId: 'food', amount: 250000, currency: 'UAH' }).run();
    db.insert(transactions).values(oneOfEachType.map(toTransactionRow)).run();

    // The склад of a ціль is its own table and touches nothing: no ліміт, транзакція, категорія or
    // рахунок is rewritten by the two migrations that introduced it.
    expect(db.select().from(categoryLimits).all()).toEqual([
      { categoryId: 'food', amount: 250000, currency: 'UAH' },
    ]);
    expect(db.select().from(transactions).all()).toHaveLength(oneOfEachType.length);
    expect(toAccount(db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
    expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('Removing a ціль takes its склад and nothing else', () => {
    const { db } = storage;
    db.insert(goals).values({ id: 'g1', name: 'Авто', amount: 1000, currency: 'UAH', deadline: null }).run();
    db.insert(goalAccounts).values({ goalId: 'g1', accountId: 'jar' }).run();

    db.delete(goals).where(eq(goals.id, 'g1')).run();

    // ON DELETE CASCADE on goal_id: a склад row has no meaning without its ціль.
    expect(db.select().from(goalAccounts).all()).toEqual([]);
    expect(db.select().from(accounts).all()).toHaveLength(2);
    // ON DELETE RESTRICT on account_id: a рахунок standing in a склад cannot be deleted out of it.
    db.insert(goals).values({ id: 'g2', name: 'Авто', amount: 1000, currency: 'UAH', deadline: null }).run();
    db.insert(goalAccounts).values({ goalId: 'g2', accountId: 'jar' }).run();
    expect(() => db.delete(accounts).where(eq(accounts.id, 'jar')).run()).toThrow();
  });

  it('Scenario: Rows stored before the migration survive it', () => {
    // The migrations committed before this change: a device holding рахунки, категорії, джерела,
    // правила, monobank links and one транзакція of each type.
    const staged = openTestDbMigratedTo(6);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      staged.db.insert(transactions).values(oneOfEachType.map(toTransactionRow)).run();
      staged.db
        .insert(rules)
        .values({
          id: 'rule-1',
          merchant: 'сільпо',
          categoryId: 'food',
          createdAt: new Date('2026-08-24T09:00:00.000Z'),
        })
        .run();
      staged.db
        .insert(monobankAccounts)
        .values({
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalanceAmount: 5000000,
          obtainedAt: new Date('2026-08-28T08:00:00.000Z'),
        })
        .run();
      // Raw, because the staged schema predates `last_synced_at` and Drizzle's insert names every
      // column of the table it knows — the same reason the accounts row above is raw.
      staged.db.run(
        sql`INSERT INTO monobank_links (monobank_account_id, account_id, sync_start_date, cursor_ms)
            VALUES ('mono-card', 'card', '2026-08-01', 1787864400000)`,
      );

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(staged.db.select().from(rules).all()).toHaveLength(1);
      expect(staged.db.select().from(categories).all().map((row) => row.id)).toContain('food');
      expect(staged.db.select().from(sources).all().map((row) => row.id)).toContain('salary');
      expect(staged.db.select().from(monobankLinks).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      // The two new tables arrive empty: no category gains a ліміт it was never given, and the
      // migration invents no ціль.
      expect(staged.db.select().from(categoryLimits).all()).toEqual([]);
      expect(staged.db.select().from(goals).all()).toEqual([]);
    } finally {
      staged.close();
    }
  });
});

/**
 * The склад: `goal_accounts`, and a `goals` table that has lost its one `account_id` and gained a
 * nullable дата. Two migrations, because the first rebuilds `goals` while foreign keys are on —
 * design D4 — and one hand-added data statement between them, because the pairing of a ціль with
 * its one рахунок exists only until that rebuild drops the column.
 *
 * These are the cases `.claude/rules/database.md` demands of a migration that moves data: seeded
 * with representative rows on the shape the owner's device actually had, and each of them failing
 * if the hand-added `INSERT` is removed.
 */
describe('migrations — the склад of a ціль', () => {
  /**
   * The journal length immediately **before** this change's first migration: the shape where
   * `goals` still carries one `account_id` and a NOT NULL `deadline`, and `goal_accounts` does not
   * exist. Named by index rather than by tag because other changes are in flight with migrations
   * of their own, and a tag written here would go stale the moment one of them lands.
   */
  const BEFORE_THE_COMPOSITION = 15;

  function stagedWithAccounts() {
    const staged = openTestDbMigratedTo(BEFORE_THE_COMPOSITION);
    seedReferences(staged.db, VOCABULARY);
    staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
    return staged;
  }

  it('Scenario: A stored ціль keeps every field and gains its склад', () => {
    const staged = stagedWithAccounts();
    try {
      insertOneAccountGoal(staged.db, {
        id: 'g-auto',
        name: 'Авто',
        amount: 20000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });

      staged.migrateToLatest();

      expect(staged.db.select().from(goals).all()).toEqual([
        { id: 'g-auto', name: 'Авто', amount: 20000000, currency: 'UAH', deadline: '2026-12-31' },
      ]);
      // The склад it gained: exactly the one рахунок it named, under the same ціль id.
      expect(staged.db.select().from(goalAccounts).all()).toEqual([
        { goalId: 'g-auto', accountId: 'jar' },
      ]);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    } finally {
      staged.close();
    }
  });

  it('Scenario: The migrated ціль shows the progress it showed before', () => {
    const staged = stagedWithAccounts();
    try {
      const topUp = transfer({
        id: 't-jar',
        date: '2026-08-20',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(5000000, 'UAH'),
        arrived: money(5000000, 'UAH'),
      });
      staged.db.insert(transactions).values([toTransactionRow(topUp)]).run();
      insertOneAccountGoal(staged.db, {
        id: 'g-auto',
        name: 'Авто',
        amount: 20000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });
      // What the ціль showed the day before: the linked рахунок's розрахунковий баланс.
      const before = contribution(jar, [topUp]);
      expect(before).toEqual(money(5000000, 'UAH'));

      staged.migrateToLatest();

      const composition = staged.db.select().from(goalAccounts).all().map((row) => row.accountId);
      const stored = staged.db.select().from(transactions).all().map(toTransaction);
      const after = sumContributions(
        'UAH',
        composition.map((id) => contribution(id === 'jar' ? jar : card, stored)),
      );

      expect(after).toEqual(before);
    } finally {
      staged.close();
    }
  });

  it('Scenario: Two цілі on one рахунок both keep it', () => {
    const staged = stagedWithAccounts();
    try {
      insertOneAccountGoal(staged.db, {
        id: 'g-auto',
        name: 'Авто',
        amount: 20000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });
      insertOneAccountGoal(staged.db, {
        id: 'g-holiday',
        name: 'Відпустка',
        amount: 5000000,
        currency: 'UAH',
        deadline: '2026-09-30',
        accountId: 'jar',
      });

      staged.migrateToLatest();

      expect(staged.db.select().from(goals).all()).toHaveLength(2);
      expect(staged.db.select().from(goalAccounts).orderBy(goalAccounts.goalId).all()).toEqual([
        { goalId: 'g-auto', accountId: 'jar' },
        { goalId: 'g-holiday', accountId: 'jar' },
      ]);
    } finally {
      staged.close();
    }
  });

  it('Every stored row survives the two migrations unchanged', () => {
    const staged = stagedWithAccounts();
    try {
      staged.db.insert(transactions).values(oneOfEachType.map(toTransactionRow)).run();
      staged.db
        .insert(categoryLimits)
        .values({ categoryId: 'food', amount: 250000, currency: 'UAH' })
        .run();
      insertOneAccountGoal(staged.db, {
        id: 'g-auto',
        name: 'Авто',
        amount: 20000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(staged.db.select().from(categoryLimits).all()).toEqual([
        { categoryId: 'food', amount: 250000, currency: 'UAH' },
      ]);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    } finally {
      staged.close();
    }
  });

  it('A ціль stored with a дата keeps it, and the column now admits none', () => {
    const staged = stagedWithAccounts();
    try {
      insertOneAccountGoal(staged.db, {
        id: 'g-auto',
        name: 'Авто',
        amount: 20000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });

      staged.migrateToLatest();

      expect(staged.db.select().from(goals).get()?.deadline).toBe('2026-12-31');
      staged.db
        .insert(goals)
        .values({ id: 'g-undated', name: 'Резерв', amount: 1000, currency: 'UAH', deadline: null })
        .run();
      expect(
        staged.db.select().from(goals).where(eq(goals.id, 'g-undated')).get()?.deadline,
      ).toBeNull();
    } finally {
      staged.close();
    }
  });
});

/**
 * Migration 0007: the three tables the visible half of FR-S3 needs — what is watched, what has
 * already been decided, and what still awaits the owner's word.
 *
 * They arrive empty and they arrive alone: nothing existing is rewritten, so the only two things
 * worth proving are that a device holding everything else comes through untouched, and that the
 * shapes the engine produces actually fit. No raw capture queue is among them — the waiting queue
 * lives with the capture layer, never in the owner's database.
 */
describe('migrations — notification watches, fingerprints and чернетки', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database starts empty of notification state', () => {
    const { db } = storage;

    expect(db.select().from(notificationWatches).all()).toEqual([]);
    expect(db.select().from(notificationFingerprints).all()).toEqual([]);
    expect(db.select().from(notificationDrafts).all()).toEqual([]);

    // And each can be stored: a watch onto a рахунок that exists, a fingerprint, and one чернетка
    // of every proposal the engine can build.
    db.insert(notificationWatches)
      .values({ packageName: 'ua.privatbank.ap24', accountId: 'card' })
      .run();
    db.insert(notificationFingerprints)
      .values({ fingerprint: 'ua.privatbank.ap24 1787900000000 Оплата Оплата 250.00UAH. Сільпо' })
      .run();
    db.insert(notificationDrafts)
      .values([
        {
          id: 'd-expense',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-08-26',
          text: 'Оплата 250.00UAH. Сільпо',
          kind: 'expense',
          amount: 25000,
          createdAt: new Date('2026-08-26T10:00:00.000Z'),
        },
        {
          id: 'd-raw',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-08-26',
          text: 'FOREIGN 10.00 USD',
          kind: 'raw',
          originalAmount: 1000,
          originalCurrency: 'USD',
          createdAt: new Date('2026-08-26T11:00:00.000Z'),
        },
      ])
      .run();

    expect(db.select().from(notificationWatches).all()).toHaveLength(1);
    expect(db.select().from(notificationFingerprints).all()).toHaveLength(1);
    expect(db.select().from(notificationDrafts).all()).toHaveLength(2);

    // And no raw capture queue anywhere: the waiting notifications live with the capture layer on
    // the device, never in the owner's database. Asserted rather than merely absent, so a later
    // change cannot quietly add one.
    //
    // `bug_report_capture` is named out rather than filtered out by a laxer pattern: it holds two
    // booleans — whether the gesture and the handle are on — and no notification, no payload and
    // no queue. Narrowing the regex instead would let a real `*_capture_queue` through, which is
    // the one thing this sweep exists to catch.
    expect(
      db
        .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .map((table) => table.name)
        .filter((name) => /queue|capture|notification_raw/i.test(name))
        .filter((name) => name !== 'bug_report_capture'),
    ).toEqual([]);

    // The shape is the storage's rule too, not only the repository's: one watch per app, one
    // memory per fingerprint, a рахунок that exists, a calendar date, a сума on everything that
    // is not raw and none on what is, and never an original amount without its currency.
    expect(() =>
      db.insert(notificationWatches).values({ packageName: 'ua.privatbank.ap24', accountId: 'jar' }).run(),
    ).toThrow();
    expect(() =>
      db.insert(notificationWatches).values({ packageName: 'ua.other.bank', accountId: 'nope' }).run(),
    ).toThrow();
    expect(() =>
      db.insert(notificationFingerprints)
        .values({ fingerprint: 'ua.privatbank.ap24 1787900000000 Оплата Оплата 250.00UAH. Сільпо' })
        .run(),
    ).toThrow();

    const draft = {
      id: 'd-bad',
      accountId: 'card',
      currency: 'UAH',
      date: '2026-08-26',
      text: 'щось',
      kind: 'expense',
      amount: 100,
      createdAt: new Date('2026-08-26T12:00:00.000Z'),
    };
    expect(() => db.insert(notificationDrafts).values({ ...draft, kind: 'guess' }).run()).toThrow();
    expect(() => db.insert(notificationDrafts).values({ ...draft, date: '26.08.2026' }).run()).toThrow();
    expect(() => db.insert(notificationDrafts).values({ ...draft, amount: null }).run()).toThrow();
    expect(() =>
      db.insert(notificationDrafts).values({ ...draft, kind: 'raw', amount: 100 }).run(),
    ).toThrow();
    expect(() =>
      db.insert(notificationDrafts).values({ ...draft, originalAmount: 1000 }).run(),
    ).toThrow();
    expect(() => db.insert(notificationDrafts).values({ ...draft, accountId: 'nope' }).run()).toThrow();
  });

  it('Scenario: Existing data survives the migration', () => {
    // Everything a device could be holding before this change: рахунки, категорії, джерела,
    // правила, ліміти, цілі, monobank state, the rate cache, the Saldo marker and one транзакція
    // of each type.
    const staged = openTestDbMigratedTo(7);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      staged.db.insert(transactions).values(oneOfEachType.map(toTransactionRow)).run();
      staged.db
        .insert(rules)
        .values({
          id: 'rule-1',
          merchant: 'сільпо',
          categoryId: 'food',
          createdAt: new Date('2026-08-24T09:00:00.000Z'),
        })
        .run();
      staged.db.insert(categoryLimits).values({ categoryId: 'food', amount: 250000, currency: 'UAH' }).run();
      insertOneAccountGoal(staged.db, {
        id: 'g1',
        name: 'Авто',
        amount: 20000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });
      staged.db
        .insert(monobankAccounts)
        .values({
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalanceAmount: 5000000,
          obtainedAt: new Date('2026-08-28T08:00:00.000Z'),
        })
        .run();
      // Raw, because the staged schema predates `last_synced_at` and Drizzle's insert names every
      // column of the table it knows — the same reason the accounts row above is raw.
      staged.db.run(
        sql`INSERT INTO monobank_links (monobank_account_id, account_id, sync_start_date, cursor_ms)
            VALUES ('mono-card', 'card', '2026-08-01', 1787864400000)`,
      );
      staged.db.insert(monobankImportedItems).values({ monobankAccountId: 'mono-card', itemId: 'item-1' }).run();
      staged.db
        .insert(monobankRates)
        .values({ currency: 'USD', rateMillionths: 41_500_000, obtainedAt: new Date('2026-08-28T08:00:00.000Z') })
        .run();
      staged.db.insert(saldoImport).values({ id: 'saldo', committedAt: new Date('2026-08-20T10:00:00.000Z') }).run();

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(staged.db.select().from(categories).all().map((row) => row.id)).toContain('food');
      expect(staged.db.select().from(sources).all().map((row) => row.id)).toContain('salary');
      expect(staged.db.select().from(rules).all()).toHaveLength(1);
      expect(staged.db.select().from(categoryLimits).all()).toHaveLength(1);
      expect(staged.db.select().from(goals).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankAccounts).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankLinks).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankImportedItems).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankRates).all()).toHaveLength(1);
      expect(staged.db.select().from(saldoImport).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // The three new tables arrive empty — no watch the owner never granted, and no чернетка
      // invented out of a транзакція that already exists.
      expect(staged.db.select().from(notificationWatches).all()).toEqual([]);
      expect(staged.db.select().from(notificationFingerprints).all()).toEqual([]);
      expect(staged.db.select().from(notificationDrafts).all()).toEqual([]);

      // And the storage they arrive with actually takes what the engine produces.
      staged.db.insert(notificationWatches).values({ packageName: 'ua.privatbank.ap24', accountId: 'card' }).run();
      staged.db.insert(notificationFingerprints).values({ fingerprint: 'ua.privatbank.ap24 1 Оплата текст' }).run();
      staged.db
        .insert(notificationDrafts)
        .values({
          id: 'd1',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-08-26',
          text: 'Оплата 250.00UAH. Сільпо',
          kind: 'expense',
          amount: 25000,
          createdAt: new Date('2026-08-26T10:00:00.000Z'),
        })
        .run();
      expect(staged.db.select().from(notificationDrafts).all()).toHaveLength(1);
    } finally {
      staged.close();
    }
  });
});

describe('migrations — the нагадування and the outstanding сповіщення', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database starts with nothing to announce', () => {
    const { db } = storage;

    // Never asked: no setting at all, rather than one that says «off» on the owner's behalf.
    expect(db.select().from(dailyReminder).all()).toEqual([]);
    expect(db.select().from(alerts).all()).toEqual([]);

    db.insert(dailyReminder).values({ id: 'reminder', enabled: true, hour: 9, minute: 30 }).run();
    db.insert(alerts)
      .values({ kind: 'monobank-sync', raisedAt: new Date('2026-08-28T08:00:00.000Z') })
      .run();

    expect(db.select().from(dailyReminder).all()).toEqual([
      { id: 'reminder', enabled: true, hour: 9, minute: 30 },
    ]);
    expect(db.select().from(alerts).all()).toEqual([
      { kind: 'monobank-sync', raisedAt: new Date('2026-08-28T08:00:00.000Z') },
    ]);

    // One setting, never two: the CHECK is what keeps the table to a single row, so a second
    // «reminder» is refused as a duplicate key and anything else as a value that is not one.
    expect(() =>
      db.insert(dailyReminder).values({ id: 'reminder', enabled: false, hour: 8, minute: 0 }).run(),
    ).toThrow();
    expect(() =>
      db.insert(dailyReminder).values({ id: 'other', enabled: true, hour: 8, minute: 0 }).run(),
    ).toThrow();

    // And a time that is not one on a clock is refused by storage as well as by the parse.
    db.delete(dailyReminder).run();
    for (const bad of [{ hour: 24, minute: 0 }, { hour: -1, minute: 0 }, { hour: 9, minute: 60 }]) {
      expect(() =>
        db.insert(dailyReminder).values({ id: 'reminder', enabled: true, ...bad }).run(),
      ).toThrow();
    }

    // One row per action, so «одна невдача — одне сповіщення» is the primary key and not a query.
    expect(() =>
      db.insert(alerts)
        .values({ kind: 'monobank-sync', raisedAt: new Date('2026-08-28T09:00:00.000Z') })
        .run(),
    ).toThrow();

    // A kind SQL has never heard of is taken, deliberately: the enumeration lives in
    // `src/reminders/notices.ts` and the repository refuses what is not in it, because widening a
    // CHECK later would mean rebuilding an immutable table for one string (design D7).
    db.insert(alerts).values({ kind: 'drive-backup', raisedAt: new Date('2026-08-28T10:00:00.000Z') }).run();
    expect(db.select().from(alerts).all()).toHaveLength(2);

    // Nowhere for a сума, a bank's words or a secret to sit: the action and the moment is the row.
    expect(Object.keys(db.select().from(alerts).all()[0]!)).toEqual(['kind', 'raisedAt']);
  });

  it('Scenario: Existing data survives the migration', () => {
    // A device holding every stored shape there was before this change — including what the
    // notification work of step 8 added, which is the migration immediately before this one.
    const staged = openTestDbMigratedTo(8);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const t of oneOfEachType) {
        staged.db.insert(transactions).values(toTransactionRow(t)).run();
      }
      staged.db
        .insert(rules)
        .values({ id: 'r1', merchant: 'сільпо', categoryId: 'food', createdAt: new Date('2026-08-01T00:00:00.000Z') })
        .run();
      staged.db.insert(categoryLimits).values({ categoryId: 'food', amount: 500000, currency: 'UAH' }).run();
      insertOneAccountGoal(staged.db, {
        id: 'g1',
        name: 'Відпустка',
        amount: 5000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });
      staged.db
        .insert(monobankAccounts)
        .values({
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalanceAmount: 1234500,
          obtainedAt: new Date('2026-08-28T07:00:00.000Z'),
        })
        .run();
      // Raw, because the staged schema predates `last_synced_at` and Drizzle's insert names every
      // column of the table it knows — the same reason the accounts row above is raw.
      staged.db.run(
        sql`INSERT INTO monobank_links (monobank_account_id, account_id, sync_start_date, cursor_ms)
            VALUES ('mono-card', 'card', '2026-08-01', 1787864400000)`,
      );
      staged.db.insert(monobankImportedItems).values({ monobankAccountId: 'mono-card', itemId: 'item-1' }).run();
      staged.db
        .insert(monobankRates)
        .values({ currency: 'USD', rateMillionths: 41_500_000, obtainedAt: new Date('2026-08-28T08:00:00.000Z') })
        .run();
      staged.db.insert(saldoImport).values({ id: 'saldo', committedAt: new Date('2026-08-20T10:00:00.000Z') }).run();
      staged.db.insert(notificationWatches).values({ packageName: 'ua.privatbank.ap24', accountId: 'card' }).run();
      staged.db.insert(notificationFingerprints).values({ fingerprint: 'ua.privatbank.ap24 1 Оплата текст' }).run();
      staged.db
        .insert(notificationDrafts)
        .values({
          id: 'd1',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-08-26',
          text: 'Оплата 250.00UAH. Сільпо',
          kind: 'expense',
          amount: 25000,
          createdAt: new Date('2026-08-26T10:00:00.000Z'),
        })
        .run();

      staged.migrateToLatest();

      for (const original of oneOfEachType) {
        const row = staged.db.select().from(transactions).where(eq(transactions.id, original.id)).get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!)).toEqual(card);
      expect(staged.db.select().from(categories).all().map((row) => row.id)).toContain('food');
      expect(staged.db.select().from(sources).all().map((row) => row.id)).toContain('salary');
      expect(staged.db.select().from(rules).all()).toHaveLength(1);
      expect(staged.db.select().from(categoryLimits).all()).toHaveLength(1);
      expect(staged.db.select().from(goals).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankAccounts).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankLinks).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankImportedItems).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankRates).all()).toHaveLength(1);
      expect(staged.db.select().from(saldoImport).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationWatches).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationFingerprints).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationDrafts).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // The two new tables arrive empty — no нагадування the owner never turned on, and no
      // сповіщення invented out of a failure that never happened.
      expect(staged.db.select().from(dailyReminder).all()).toEqual([]);
      expect(staged.db.select().from(alerts).all()).toEqual([]);

      // And they take what the app produces.
      staged.db.insert(dailyReminder).values({ id: 'reminder', enabled: true, hour: 21, minute: 0 }).run();
      staged.db.insert(alerts).values({ kind: 'collection', raisedAt: new Date('2026-08-28T12:00:00.000Z') }).run();
      expect(staged.db.select().from(dailyReminder).all()).toHaveLength(1);
      expect(staged.db.select().from(alerts).all()).toHaveLength(1);
    } finally {
      staged.close();
    }
  });
});

describe('migrations — the рахунок the entry form opens on', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database from migrations alone remembers a рахунок', () => {
    const { db } = storage;

    // A device that has never recorded by hand remembers none — no row, not a row saying «none».
    expect(db.select().from(entryDefaults).all()).toEqual([]);

    db.insert(entryDefaults).values({ id: 'entry', accountId: 'card' }).run();

    expect(db.select().from(entryDefaults).all()).toEqual([{ id: 'entry', accountId: 'card' }]);

    // One рахунок, never two: the CHECK keeps the table to a single row, so a second «entry» is
    // refused as a duplicate key and anything else as a value that is not one.
    expect(() =>
      db.insert(entryDefaults).values({ id: 'entry', accountId: 'jar' }).run(),
    ).toThrow();
    expect(() => db.insert(entryDefaults).values({ id: 'other', accountId: 'jar' }).run()).toThrow();

    // It must name a рахунок that exists, and it may not be left without one.
    expect(() =>
      db.insert(entryDefaults).values({ id: 'entry', accountId: 'nowhere' }).run(),
    ).toThrow();

    // Replacing it is what remembering another рахунок is.
    db.update(entryDefaults).set({ accountId: 'jar' }).where(eq(entryDefaults.id, 'entry')).run();
    expect(db.select().from(entryDefaults).all()).toEqual([{ id: 'entry', accountId: 'jar' }]);

    // A рахунок named by it cannot be deleted out from under it — рахунки archive, never vanish.
    expect(() => db.delete(accounts).where(eq(accounts.id, 'jar')).run()).toThrow();
  });

  it('Scenario: Pre-migration rows survive unchanged', () => {
    // A device holding everything there was before this change: the migration immediately before
    // this one is the нагадування and the сповіщення of step 11.
    const staged = openTestDbMigratedTo(9);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const t of oneOfEachType) {
        staged.db.insert(transactions).values(toTransactionRow(t)).run();
      }
      staged.db
        .insert(rules)
        .values({
          id: 'r1',
          merchant: 'сільпо',
          categoryId: 'food',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        })
        .run();
      staged.db
        .insert(categoryLimits)
        .values({ categoryId: 'food', amount: 500000, currency: 'UAH' })
        .run();
      insertOneAccountGoal(staged.db, {
        id: 'g1',
        name: 'Відпустка',
        amount: 5000000,
        currency: 'UAH',
        deadline: '2026-12-31',
        accountId: 'jar',
      });
      staged.db
        .insert(monobankAccounts)
        .values({
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalanceAmount: 1234500,
          obtainedAt: new Date('2026-08-28T07:00:00.000Z'),
        })
        .run();
      // Raw, because the staged schema predates `last_synced_at` and Drizzle's insert names every
      // column of the table it knows — the same reason the accounts row above is raw.
      staged.db.run(
        sql`INSERT INTO monobank_links (monobank_account_id, account_id, sync_start_date, cursor_ms)
            VALUES ('mono-card', 'card', '2026-08-01', 1787864400000)`,
      );
      staged.db
        .insert(monobankImportedItems)
        .values({ monobankAccountId: 'mono-card', itemId: 'item-1' })
        .run();
      staged.db
        .insert(monobankRates)
        .values({
          currency: 'USD',
          rateMillionths: 41_500_000,
          obtainedAt: new Date('2026-08-28T08:00:00.000Z'),
        })
        .run();
      staged.db
        .insert(saldoImport)
        .values({ id: 'saldo', committedAt: new Date('2026-08-20T10:00:00.000Z') })
        .run();
      staged.db
        .insert(notificationWatches)
        .values({ packageName: 'ua.privatbank.ap24', accountId: 'card' })
        .run();
      staged.db
        .insert(notificationFingerprints)
        .values({ fingerprint: 'ua.privatbank.ap24 1 Оплата текст' })
        .run();
      staged.db
        .insert(dailyReminder)
        .values({ id: 'reminder', enabled: true, hour: 21, minute: 0 })
        .run();
      staged.db
        .insert(alerts)
        .values({ kind: 'monobank-sync', raisedAt: new Date('2026-08-28T08:00:00.000Z') })
        .run();

      staged.migrateToLatest();

      // Every stored row unchanged — types, amounts, currencies, dates, categories and описи.
      for (const original of oneOfEachType) {
        const row = staged.db
          .select()
          .from(transactions)
          .where(eq(transactions.id, original.id))
          .get();
        expect(toTransaction(row!)).toEqual(original);
      }
      expect(
        toAccount(staged.db.select().from(accounts).where(eq(accounts.id, 'card')).get()!),
      ).toEqual(card);
      expect(staged.db.select().from(categories).all().map((row) => row.id)).toContain('food');
      expect(staged.db.select().from(sources).all().map((row) => row.id)).toContain('salary');
      expect(staged.db.select().from(rules).all()).toHaveLength(1);
      expect(staged.db.select().from(categoryLimits).all()).toHaveLength(1);
      expect(staged.db.select().from(goals).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankAccounts).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankLinks).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankImportedItems).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankRates).all()).toHaveLength(1);
      expect(staged.db.select().from(saldoImport).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationWatches).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationFingerprints).all()).toHaveLength(1);
      expect(staged.db.select().from(dailyReminder).all()).toHaveLength(1);
      expect(staged.db.select().from(alerts).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // And no рахунок is remembered: the table arrives empty, never pointed at a рахунок the
      // owner never chose.
      expect(staged.db.select().from(entryDefaults).all()).toEqual([]);

      // It takes what the app produces.
      staged.db.insert(entryDefaults).values({ id: 'entry', accountId: 'card' }).run();
      expect(staged.db.select().from(entryDefaults).all()).toEqual([
        { id: 'entry', accountId: 'card' },
      ]);
    } finally {
      staged.close();
    }
  });
});

/**
 * The moment a monobank link last completed a sync — one nullable column added to a table that
 * already holds live links on the owner's device.
 */
describe('migrations — the moment a link last completed a sync', () => {
  it('Scenario: An existing link survives gaining the moment', () => {
    // A device holding everything there was before this change: the migration immediately before
    // this one is the рахунок the entry form opens on.
    const staged = openTestDbMigratedTo(9);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      staged.db
        .insert(monobankAccounts)
        .values({
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalanceAmount: 5000000,
          obtainedAt: new Date('2026-08-28T08:00:00.000Z'),
        })
        .run();
      // Raw, because the staged schema predates `last_synced_at` and Drizzle's insert names every
      // column of the table it knows.
      staged.db.run(
        sql`INSERT INTO monobank_links (monobank_account_id, account_id, sync_start_date, cursor_ms)
            VALUES ('mono-card', 'card', '2026-08-01', 1787864400000)`,
      );
      staged.db
        .insert(monobankImportedItems)
        .values({ monobankAccountId: 'mono-card', itemId: 'item-1' })
        .run();

      staged.migrateToLatest();

      // The link loads unchanged, holding no moment — which is true of what the device can prove.
      expect(staged.db.select().from(monobankLinks).all()).toEqual([
        {
          monobankAccountId: 'mono-card',
          accountId: 'card',
          syncStartDate: '2026-08-01',
          cursorMs: new Date('2026-08-27T21:00:00.000Z'),
          lastSyncedAt: null,
        },
      ]);
      // And its imported item ids and its last known баланс банку are untouched.
      expect(staged.db.select().from(monobankImportedItems).all()).toEqual([
        { monobankAccountId: 'mono-card', itemId: 'item-1' },
      ]);
      expect(staged.db.select().from(monobankAccounts).get()?.bankBalanceAmount).toBe(5000000);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // Nothing was backfilled: a null here is the state of a link that has never synced, and it
      // is distinguishable from a moment of zero, which is 1970.
      staged.db
        .update(monobankLinks)
        .set({ lastSyncedAt: new Date(0) })
        .where(eq(monobankLinks.monobankAccountId, 'mono-card'))
        .run();
      expect(staged.db.select().from(monobankLinks).get()?.lastSyncedAt).toEqual(new Date(0));
    } finally {
      staged.close();
    }
  });
});

/**
 * The чек tables. Their own describe for the reason the import marker and the monobank links have
 * one: what matters on the owner's phone is that a database already full of their money gains two
 * empty tables and is otherwise exactly as it was.
 */
describe('migrations — фіскальні чеки', () => {
  /** Every migration but the чек one, so «before» is a real device from the previous release. */
  const BEFORE_RECEIPTS = 11;

  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => storage.close());

  const insertReceipt = (db: TestStorage['db'], over: Record<string, unknown> = {}) =>
    db
      .insert(fiscalReceipts)
      .values({
        id: 'r1',
        transactionId: 'e1',
        registrarNumber: '3000909908',
        fiscalNumber: '696582',
        issuedDate: '2026-04-29',
        issuedTime: '22:20:06',
        dialect: 'rro',
        kind: 'sale',
        totalAmount: 43740,
        totalCurrency: 'UAH',
        acquisition: 'qr_scan',
        fetchedAt: new Date('2026-04-29T19:30:00.000Z'),
        snapshot: '<RQ/>',
        ...over,
      })
      .run();

  it('Scenario: A fresh database starts empty of чеки', () => {
    expect(storage.db.select().from(fiscalReceipts).all()).toEqual([]);
    expect(storage.db.select().from(receiptItems).all()).toEqual([]);

    storage.db.insert(transactions).values(toTransactionRow(oneOfEachType[0] as Transaction)).run();
    insertReceipt(storage.db);
    storage.db
      .insert(receiptItems)
      .values({
        id: 'i1',
        receiptId: 'r1',
        line: 5,
        rawName: 'ВодаНегазованаМиргородська1,5',
        quantityThousandths: 1000,
        lineTotalAmount: 2340,
        lineTotalCurrency: 'UAH',
      })
      .run();

    expect(storage.db.select().from(fiscalReceipts).all()).toHaveLength(1);
    expect(storage.db.select().from(receiptItems).all()).toHaveLength(1);
  });

  it('Scenario: Existing data survives the migration', () => {
    const staged = openTestDbMigratedTo(BEFORE_RECEIPTS);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const t of oneOfEachType) {
        staged.db.insert(transactions).values(toTransactionRow(t)).run();
      }
      staged.db.insert(categoryLimits).values({ categoryId: 'food', amount: 250000, currency: 'UAH' }).run();
      insertOneAccountGoal(staged.db, {
        id: 'g1',
        name: 'Авто',
        amount: 500000,
        currency: 'UAH',
        deadline: '2027-01-01',
        accountId: 'jar',
      });
      staged.db.insert(saldoImport).values({ id: 'saldo', committedAt: new Date(1) }).run();
      staged.db.insert(notificationWatches).values({ packageName: 'ua.mono', accountId: 'card' }).run();
      staged.db.insert(notificationFingerprints).values({ fingerprint: 'f1' }).run();
      staged.db.insert(dailyReminder).values({ id: 'reminder', enabled: true, hour: 21, minute: 0 }).run();
      staged.db.insert(alerts).values({ kind: 'monobank-sync', raisedAt: new Date(2) }).run();
      staged.db.insert(monobankRates).values({ currency: 'USD', rateMillionths: 41_000_000, obtainedAt: new Date(3) }).run();
      const before = staged.db.select().from(transactions).all().map(toTransaction);

      staged.migrateToLatest();

      // Every existing value loads unchanged...
      expect(staged.db.select().from(transactions).all().map(toTransaction)).toEqual(before);
      expect(staged.db.select().from(accounts).all().map(toAccount)).toHaveLength(2);
      expect(staged.db.select().from(categoryLimits).all()).toHaveLength(1);
      expect(staged.db.select().from(goals).all()).toHaveLength(1);
      expect(staged.db.select().from(saldoImport).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationWatches).all()).toHaveLength(1);
      expect(staged.db.select().from(notificationFingerprints).all()).toHaveLength(1);
      expect(staged.db.select().from(dailyReminder).all()).toHaveLength(1);
      expect(staged.db.select().from(alerts).all()).toHaveLength(1);
      expect(staged.db.select().from(monobankRates).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // ...no транзакція holds a чек...
      expect(staged.db.select().from(fiscalReceipts).all()).toEqual([]);

      // ...and a чек with its позиції can be stored.
      insertReceipt(staged.db);
      staged.db
        .insert(receiptItems)
        .values({
          id: 'i1',
          receiptId: 'r1',
          line: 9,
          rawName: 'Снек Кіндер Мілк Слайс 28г',
          quantityThousandths: 2000,
          unit: 'шт',
          unitPriceAmount: 2590,
          unitPriceCurrency: 'UAH',
          lineTotalAmount: 5180,
          lineTotalCurrency: 'UAH',
          barcode: '40084725',
        })
        .run();
      expect(staged.db.select().from(receiptItems).all()).toHaveLength(1);
    } finally {
      staged.close();
    }
  });

  it('The migrated shape keeps a second чек off one транзакція, and one identity to one чек', () => {
    storage.db.insert(transactions).values(toTransactionRow(oneOfEachType[0] as Transaction)).run();
    storage.db.insert(transactions).values(toTransactionRow(oneOfEachType[1] as Transaction)).run();
    insertReceipt(storage.db);

    // A транзакція carries at most one чек — the constraint, not a rule a repository remembers.
    expect(() => insertReceipt(storage.db, { id: 'r2', fiscalNumber: '999' })).toThrow();
    // And two чеки of one identity are one чек, whatever транзакція the second names.
    expect(() =>
      insertReceipt(storage.db, { id: 'r3', transactionId: oneOfEachType[1]?.id as string }),
    ).toThrow();
  });

  it('The migrated shape keeps a чек from outliving its транзакція', () => {
    storage.db.insert(transactions).values(toTransactionRow(oneOfEachType[0] as Transaction)).run();
    insertReceipt(storage.db);
    storage.db
      .insert(receiptItems)
      .values({ id: 'i1', receiptId: 'r1', line: 1, rawName: 'Молоко', quantityThousandths: 1000, lineTotalAmount: 4720, lineTotalCurrency: 'UAH' })
      .run();

    storage.db.delete(transactions).where(eq(transactions.id, 'e1')).run();

    // Cascade both ways down: the чек goes with its транзакція, the позиції with their чек.
    expect(storage.db.select().from(fiscalReceipts).all()).toEqual([]);
    expect(storage.db.select().from(receiptItems).all()).toEqual([]);
  });

  it('The migrated shape keeps an amount from existing without its currency', () => {
    storage.db.insert(transactions).values(toTransactionRow(oneOfEachType[0] as Transaction)).run();
    insertReceipt(storage.db);
    const item = {
      id: 'i1',
      receiptId: 'r1',
      line: 1,
      rawName: 'Молоко',
      quantityThousandths: 1000,
      lineTotalAmount: 4720,
      lineTotalCurrency: 'UAH',
    };

    expect(() =>
      storage.db.insert(receiptItems).values({ ...item, unitPriceAmount: 4720 }).run(),
    ).toThrow();
    expect(() =>
      storage.db.insert(receiptItems).values({ ...item, discountCurrency: 'UAH' }).run(),
    ).toThrow();
    // Both halves together are fine, and so is neither.
    storage.db
      .insert(receiptItems)
      .values({ ...item, unitPriceAmount: 4720, unitPriceCurrency: 'UAH' })
      .run();
    expect(storage.db.select().from(receiptItems).all()).toHaveLength(1);
  });

  it('The migrated shape keeps a чек from being anything but a sale or a return', () => {
    storage.db.insert(transactions).values(toTransactionRow(oneOfEachType[0] as Transaction)).run();

    expect(() => insertReceipt(storage.db, { kind: 'shift' })).toThrow();
    expect(() => insertReceipt(storage.db, { dialect: 'edi' })).toThrow();
    expect(() => insertReceipt(storage.db, { acquisition: 'monobank_auto' })).toThrow();
    expect(() => insertReceipt(storage.db, { issuedDate: '29.04.2026' })).toThrow();
    expect(() => insertReceipt(storage.db, { issuedTime: '22:20' })).toThrow();
  });

  it('No чек reaches a транзакція: the транзакція table gains no column', () => {
    const columns = storage.db
      .all<{ name: string }>(sql`SELECT name FROM pragma_table_info('transactions')`)
      .map((row) => row.name);

    for (const name of columns) {
      expect(name).not.toContain('receipt');
      expect(name).not.toContain('fiscal');
    }
  });
});

/**
 * The журнал and the репорти про помилки: three tables that hold what the app did and what the
 * owner wrote about a bug, and no money at all.
 *
 * The device shape they arrive on is a real one — every migration before this change — so «before»
 * is a phone the owner has been using, and the three tables appear beside its data rather than
 * instead of it.
 */
describe('migrations — the журнал and the репорти про помилки', () => {
  /** Every migration but this change's, so «before» is a real device from the previous release. */
  const BEFORE_REPORTING = 12;

  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => storage.close());

  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'j1',
    at: new Date('2026-09-02T14:00:00.000Z'),
    kind: 'screen',
    name: '/(tabs)/accounts',
    detail: null,
    ...over,
  });

  const report = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    createdAt: new Date('2026-09-02T14:05:00.000Z'),
    route: '/(tabs)/accounts',
    did: 'натиснув Записати',
    happened: null,
    expected: null,
    promptingJson: null,
    buildJson: '{"version":"0.0.0","commit":"3df8103","dirty":true,"builtAt":"x"}',
    deviceJson: '{"platform":"android","systemVersion":"16","model":"Pixel 7"}',
    countsJson: '{"accounts":2,"transactions":0,"categories":5,"rules":0,"drafts":0}',
    journalJson: '[]',
    migrationsApplied: 13,
    handedOverAt: null,
    ...over,
  });

  it('A fresh install has the three tables, with the shape the design pins', () => {
    expect(storage.db.select().from(journal).all()).toEqual([]);
    expect(storage.db.select().from(bugReports).all()).toEqual([]);
    expect(storage.db.select().from(bugReportScreenshots).all()).toEqual([]);

    storage.db.insert(journal).values(entry()).run();
    storage.db
      .insert(journal)
      .values(entry({ id: 'j2', kind: 'failure', name: 'local-save', detail: 'Оберіть рахунок' }))
      .run();
    storage.db.insert(bugReports).values(report()).run();
    storage.db
      .insert(bugReportScreenshots)
      .values({ reportId: 'r1', name: 'shot-1.png', addedAt: new Date('2026-09-02T14:06:00.000Z') })
      .run();

    const stored = storage.db.select().from(journal).all();
    expect(stored).toHaveLength(2);
    // Instants come back as Dates, not numbers — `timestamp_ms` on both halves of every моment.
    expect(stored.map((row) => row.at instanceof Date)).toEqual([true, true]);
    expect(stored.map((row) => row.detail)).toEqual([null, 'Оберіть рахунок']);
    expect(storage.db.select().from(bugReports).all()[0]?.createdAt).toBeInstanceOf(Date);
    expect(storage.db.select().from(bugReportScreenshots).all()).toHaveLength(1);
    expect(storage.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('A device that predates the репорти keeps everything and gains the three tables', () => {
    const staged = openTestDbMigratedTo(BEFORE_REPORTING);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const t of oneOfEachType) {
        staged.db.insert(transactions).values(toTransactionRow(t)).run();
      }
      staged.db.insert(dailyReminder).values({ id: 'reminder', enabled: true, hour: 21, minute: 0 }).run();
      staged.db.insert(alerts).values({ kind: 'monobank-sync', raisedAt: new Date(2) }).run();
      const before = staged.db.select().from(transactions).all().map(toTransaction);

      staged.migrateToLatest();

      expect(staged.db.select().from(transactions).all().map(toTransaction)).toEqual(before);
      expect(staged.db.select().from(accounts).all()).toHaveLength(2);
      expect(staged.db.select().from(dailyReminder).all()).toHaveLength(1);
      expect(staged.db.select().from(alerts).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // ...and the three tables are there, empty, ready for the first entry.
      expect(staged.db.select().from(journal).all()).toEqual([]);
      staged.db.insert(journal).values(entry()).run();
      staged.db.insert(bugReports).values(report()).run();
      expect(staged.db.select().from(bugReports).all()).toHaveLength(1);
    } finally {
      staged.close();
    }
  });

  it('The migrated shape keeps a screenshot from outliving its репорт', () => {
    storage.db.insert(bugReports).values(report()).run();
    storage.db
      .insert(bugReportScreenshots)
      .values([
        { reportId: 'r1', name: 'shot-1.png', addedAt: new Date(1) },
        { reportId: 'r1', name: 'shot-2.png', addedAt: new Date(2) },
      ])
      .run();

    // A screenshot of a репорт that does not exist cannot be stored at all...
    expect(() =>
      storage.db
        .insert(bugReportScreenshots)
        .values({ reportId: 'nope', name: 'shot-3.png', addedAt: new Date(3) })
        .run(),
    ).toThrow();
    // ...nor can one репорт hold two files of one name...
    expect(() =>
      storage.db
        .insert(bugReportScreenshots)
        .values({ reportId: 'r1', name: 'shot-1.png', addedAt: new Date(4) })
        .run(),
    ).toThrow();

    storage.db.delete(bugReports).where(eq(bugReports.id, 'r1')).run();

    // ...and removing the репорт takes its screenshots with it, by the cascade and not by a rule
    // a repository has to remember.
    expect(storage.db.select().from(bugReportScreenshots).all()).toEqual([]);
  });

  it('The migrated shape keeps a репорт from existing without what the owner wrote', () => {
    // `did` is the one line the form requires, and storage says so too.
    expect(() =>
      storage.db.insert(bugReports).values(report({ did: null as unknown as string })).run(),
    ).toThrow();
    // The two optional lines are genuinely optional.
    storage.db.insert(bugReports).values(report({ happened: 'впав', expected: null })).run();
    expect(storage.db.select().from(bugReports).all()).toHaveLength(1);
  });

  it('No репорт reaches the owner`s money: neither table gains a money column', () => {
    for (const table of ['journal', 'bug_reports', 'bug_report_screenshots']) {
      const columns = storage.db
        .all<{ name: string }>(sql`SELECT name FROM pragma_table_info(${table})`)
        .map((row) => row.name);

      for (const name of columns) {
        expect(name).not.toContain('amount');
        expect(name).not.toContain('currency');
        expect(name).not.toContain('balance');
        expect(name).not.toContain('token');
      }
    }
  });
});

describe('migrations — the last sync attempt', () => {
  /** Every migration but this change's, so «before» is a real device from the previous release. */
  const BEFORE_ATTEMPT = 13;

  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => storage.close());

  /** A device that has synced: a bank identity, a link with a cursor and a moment, an item id. */
  function seedMonobank(db: TestStorage['db']): void {
    db.insert(monobankAccounts)
      .values({
        id: 'mono-card',
        kind: 'card',
        name: 'black ··1234',
        currency: 'UAH',
        bankBalanceAmount: 300000,
        obtainedAt: new Date('2026-09-01T06:00:00.000Z'),
      })
      .run();
    db.insert(monobankLinks)
      .values({
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-01',
        cursorMs: new Date('2026-09-01T05:00:00.000Z'),
        lastSyncedAt: new Date('2026-09-01T06:00:00.000Z'),
      })
      .run();
    db.insert(monobankImportedItems).values({ monobankAccountId: 'mono-card', itemId: 'a1' }).run();
  }

  it('Scenario: An empty database reaches the current shape', () => {
    expect(storage.db.select().from(monobankSyncAttempt).all()).toEqual([]);

    storage.db
      .insert(monobankSyncAttempt)
      .values({ id: 'attempt', attemptedAt: new Date('2026-09-02T08:15:00.000Z'), outcome: null })
      .run();

    const [row] = storage.db.select().from(monobankSyncAttempt).all();
    // `timestamp_ms` on both halves of every moment, so it comes back a Date and not a number.
    expect(row?.attemptedAt).toBeInstanceOf(Date);
    expect(row?.outcome).toBeNull();
  });

  it('Scenario: The migration adds storage and touches nothing', () => {
    const staged = openTestDbMigratedTo(BEFORE_ATTEMPT);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const t of oneOfEachType) {
        staged.db.insert(transactions).values(toTransactionRow(t)).run();
      }
      seedMonobank(staged.db);
      const before = staged.db.select().from(transactions).all().map(toTransaction);
      const linksBefore = staged.db.select().from(monobankLinks).all();

      staged.migrateToLatest();

      expect(staged.db.select().from(transactions).all().map(toTransaction)).toEqual(before);
      expect(staged.db.select().from(accounts).all()).toHaveLength(2);
      // The link keeps its cursor and the moment it last completed a sync — the attempt is a
      // different fact, about the run, and adding it may not disturb either.
      expect(staged.db.select().from(monobankLinks).all()).toEqual(linksBefore);
      expect(staged.db.select().from(monobankImportedItems).all()).toHaveLength(1);
      expect(staged.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);

      // ...and the table is there, empty, ready for the first run.
      expect(staged.db.select().from(monobankSyncAttempt).all()).toEqual([]);
      staged.db
        .insert(monobankSyncAttempt)
        .values({ id: 'attempt', attemptedAt: new Date(1), outcome: 'complete' })
        .run();
      expect(staged.db.select().from(monobankSyncAttempt).all()).toHaveLength(1);
    } finally {
      staged.close();
    }
  });

  it('The migrated shape keeps the attempt to one row', () => {
    storage.db
      .insert(monobankSyncAttempt)
      .values({ id: 'attempt', attemptedAt: new Date(1), outcome: null })
      .run();

    // The CHECK is what makes "the latest attempt" a fact of the schema rather than a habit of
    // the repository: a second row cannot be written under any other key.
    expect(() =>
      storage.db
        .insert(monobankSyncAttempt)
        .values({ id: 'attempt-2', attemptedAt: new Date(2), outcome: null })
        .run(),
    ).toThrow();
    expect(storage.db.select().from(monobankSyncAttempt).all()).toHaveLength(1);
  });

  it('No attempt reaches the owner`s money: the table gains no money column', () => {
    const columns = storage.db
      .all<{ name: string }>(sql`SELECT name FROM pragma_table_info('monobank_sync_attempt')`)
      .map((row) => row.name);

    for (const name of columns) {
      expect(name).not.toContain('amount');
      expect(name).not.toContain('currency');
      expect(name).not.toContain('balance');
      expect(name).not.toContain('token');
    }
  });
});

/**
 * Migration 0014: how a репорт was opened, why its скріншот could not be taken, and the two
 * switches that decide whether it can be filed from a screen at all.
 *
 * Two nullable columns and one one-row table — nothing is rewritten and nothing is defaulted in
 * SQL, so what a phone upgrading sees is exactly what these two scenarios assert.
 */
describe('migrations — the origin, the capture reason and the two switches', () => {
  it('Scenario: A fresh database from migrations alone holds both', () => {
    const storage = openTestDb();
    try {
      const repo = reportingRepo(storage.db);
      seedReferences(storage.db, VOCABULARY);

      repo.create({
        id: 'r1',
        createdAt: new Date('2026-09-03T09:00:00.000Z'),
        did: 'жест на Головному',
        happened: 'підсумок за місяць відʼємний',
        expected: null,
        route: '/(tabs)',
        build: { version: '0.0.0', commit: 'abc1234', dirty: false, builtAt: 'x' },
        device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
        migrationsApplied: 14,
        counts: { accounts: 1, transactions: 0, categories: 3, rules: 0, drafts: 0 },
        journal: [],
        prompting: null,
        origin: 'here',
        captureFailure: 'Система не віддала зображення екрана',
      });

      const stored = repo.get('r1');
      expect(stored?.origin).toBe('here');
      expect(stored?.captureFailure).toBe('Система не віддала зображення екрана');

      // And both switches can be set and read back, on a database built from the committed SQL
      // alone rather than from the schema.
      expect(repo.captureSettings()).toEqual({ gestureEnabled: true, handleEnabled: false });
      repo.setCaptureSettings({ gestureEnabled: false, handleEnabled: true });
      expect(repo.captureSettings()).toEqual({ gestureEnabled: false, handleEnabled: true });
    } finally {
      storage.close();
    }
  });

  it('Scenario: Pre-migration rows survive unchanged', () => {
    // Everything there was before this change: migration 0013 is the one immediately before it.
    const staged = openTestDbMigratedTo(14);
    try {
      seedReferences(staged.db, VOCABULARY);
      staged.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      for (const t of oneOfEachType) {
        staged.db.insert(transactions).values(toTransactionRow(t)).run();
      }

      // A репорт with two screenshots and a журнал of 300 entries, written by a build that had
      // never heard of an origin.
      const before = reportingRepo(staged.db);
      for (let i = 0; i < 300; i += 1) {
        before.append({
          id: `j${i}`,
          at: new Date(Date.UTC(2026, 8, 3, 9, 0, 0, i)),
          kind: 'screen',
          name: `/route/${i}`,
        });
      }
      staged.db
        .run(sql`INSERT INTO bug_reports (id, created_at, route, did, happened, expected,
                   prompting_json, build_json, device_json, counts_json, journal_json,
                   migrations_applied, handed_over_at)
                 VALUES ('old', 1756900000000, '/manage/backup', 'написав про старий репорт',
                   NULL, NULL, NULL, '{"version":"0.0.0","commit":"abc1234","dirty":false,"builtAt":"x"}',
                   '{"platform":"android","systemVersion":"16","model":"Pixel 7"}',
                   '{"accounts":1,"transactions":1,"categories":1,"rules":0,"drafts":0}', '[]',
                   13, NULL)`);
      staged.db.run(
        sql`INSERT INTO bug_report_screenshots (report_id, name, added_at)
            VALUES ('old', 'shot-1.png', 1756900000000), ('old', 'shot-2.png', 1756900000001)`,
      );

      const accountsBefore = staged.db.select().from(accounts).all();
      const transactionsBefore = staged.db.select().from(transactions).all();
      const journalBefore = before.tail();

      staged.migrateToLatest();

      const after = reportingRepo(staged.db);
      expect(staged.db.select().from(accounts).all()).toEqual(accountsBefore);
      expect(staged.db.select().from(transactions).all()).toEqual(transactionsBefore);
      expect(after.tail()).toEqual(journalBefore);
      expect(after.tail()).toHaveLength(300);

      const old = after.get('old');
      expect(old?.did).toBe('написав про старий репорт');
      expect(old?.screenshots.map((shot) => shot.name)).toEqual(['shot-1.png', 'shot-2.png']);
      // No origin and no capture reason rather than a guessed one — the whole point of the two
      // columns being nullable.
      expect(old?.origin).toBeNull();
      expect(old?.captureFailure).toBeNull();

      // And the switches arrive at their defaults on a phone that has never seen them.
      expect(after.captureSettings()).toEqual({ gestureEnabled: true, handleEnabled: false });
    } finally {
      staged.close();
    }
  });
});
