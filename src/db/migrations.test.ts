import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
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
  challengeDecisions,
  counterpartIncomeAwaits,
  dailyReminder,
  earnedAchievements,
  entryDefaults,
  fiscalReceipts,
  goalAccounts,
  goals,
  investmentValues,
  journal,
  monobankAccounts,
  monobankImportedItems,
  monobankLinks,
  monobankRates,
  monobankRequestPace,
  monobankSyncAttempt,
  notificationDrafts,
  notificationFingerprints,
  notificationWatches,
  receiptItems,
  rules,
  saldoImport,
  sources,
  spendingNorms,
  transactions,
} from './schema';
import { openTestDb, openTestDbMigratedTo, seedReferences, type TestStorage } from './test-db';

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });

/** What the fixtures below point at. */
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

describe('migrations', () => {
  let storage: TestStorage;

  /** The columns the committed migration actually produces, straight from SQLite. */
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

  /** The rate cache's columns as the committed migration actually produces them. */
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
    // No `seedReferences` here on purpose: the scenario is about what the committed migration
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
      toAccountId: null,
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

  it('Scenario: A rule row with two targets is refused by storage', () => {
    const { db } = storage;
    db.insert(categories).values({ id: 'groceries', name: 'Groceries' }).run();
    db.insert(accounts).values(toAccountRow(card)).run();

    expect(() =>
      db
        .insert(rules)
        .values({
          id: 'both-targets',
          merchant: 'сільпо',
          categoryId: 'groceries',
          toAccountId: 'card',
          createdAt: new Date(1),
        })
        .run(),
    ).toThrow();
    // Neither target at all is refused the same way.
    expect(() =>
      db
        .insert(rules)
        .values({ id: 'no-target', merchant: 'сільпо', createdAt: new Date(1) })
        .run(),
    ).toThrow();
  });
});

/**
 * The marker that says the one-time Saldo import has been committed.
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
});

/**
 * What monobank sync needs to survive a restart, and the `description` column on `transactions`.
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
    // The starter set seeds this reserved category at runtime, right after the migrations — not
    // a fixture this test's own `seedReferences` call names.
    db.insert(categories).values({ id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії' }).run();
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
        lastAttemptedAt: null,
        pagingWindowToMs: null,
        pagingRequestToMs: null,
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
});

/**
 * Ліміти and цілі: the two tables that hold them.
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
    // рахунок is rewritten alongside it.
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
});

/**
 * The three tables the visible half of FR-S3 needs — what is watched, what has already been
 * decided, and what still awaits the owner's word. No raw capture queue is among them — the
 * waiting queue lives with the capture layer, never in the owner's database.
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
});

describe('migrations — фіскальні чеки', () => {
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
 */
describe('migrations — the журнал and the репорти про помилки', () => {
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
    migrationsApplied: 1,
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
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => storage.close());

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
 * How a репорт was opened, why its скріншот could not be taken, and the two switches that decide
 * whether it can be filed from a screen at all.
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
        migrationsApplied: 1,
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
});

describe('migrations — the прогрес: досягнення, виклики and норми', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
  });

  afterEach(() => storage.close());

  it('Scenario: A fresh database from migrations alone stores a досягнення', () => {
    expect(storage.db.select().from(earnedAchievements).all()).toEqual([]);

    storage.db
      .insert(earnedAchievements)
      .values({
        key: 'ledger.transactions:500',
        template: 'ledger.transactions',
        achievedOn: '2025-04-18',
        recordedAt: new Date('2026-09-02T09:00:00.000Z'),
        seenAt: null,
        evidence: '{"count":500}',
      })
      .run();
    storage.db
      .insert(challengeDecisions)
      .values({
        key: 'close-month:2026-08',
        decision: 'accepted',
        decidedAt: new Date('2026-09-02T09:01:00.000Z'),
      })
      .run();
    storage.db
      .insert(spendingNorms)
      .values({
        currency: 'UAH',
        amount: 3050000,
        confirmedAt: new Date('2026-09-02T09:02:00.000Z'),
      })
      .run();

    const earned = storage.db.select().from(earnedAchievements).all();
    expect(earned).toHaveLength(1);
    expect(earned[0]?.achievedOn).toBe('2025-04-18');
    // Instants come back as Dates, not numbers — `timestamp_ms` on every moment of the three.
    expect(earned[0]?.recordedAt).toBeInstanceOf(Date);
    expect(earned[0]?.seenAt).toBeNull();
    expect(storage.db.select().from(challengeDecisions).all()[0]?.decision).toBe('accepted');
    expect(storage.db.select().from(spendingNorms).all()[0]?.amount).toBe(3050000);
    expect(storage.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('The migrated shape refuses a досягнення whose дата is not a calendar date', () => {
    expect(() =>
      storage.db
        .insert(earnedAchievements)
        .values({
          key: 'ledger.first-transaction',
          template: 'ledger.first-transaction',
          achievedOn: '18/04/2025',
          recordedAt: new Date(0),
          evidence: '{"count":1}',
        })
        .run(),
    ).toThrow();
  });

  it('The migrated shape refuses a decision that is neither accepted nor dismissed', () => {
    expect(() =>
      storage.db
        .insert(challengeDecisions)
        .values({ key: 'close-month:2026-08', decision: 'maybe', decidedAt: new Date(0) })
        .run(),
    ).toThrow();
  });

  it('The migrated shape refuses a норма of zero, and keeps one per currency', () => {
    expect(() =>
      storage.db
        .insert(spendingNorms)
        .values({ currency: 'UAH', amount: 0, confirmedAt: new Date(0) })
        .run(),
    ).toThrow();
    expect(() =>
      storage.db
        .insert(spendingNorms)
        .values({ currency: 'UAH', amount: -1, confirmedAt: new Date(0) })
        .run(),
    ).toThrow();

    storage.db
      .insert(spendingNorms)
      .values({ currency: 'UAH', amount: 3050000, confirmedAt: new Date(0) })
      .run();
    expect(() =>
      storage.db
        .insert(spendingNorms)
        .values({ currency: 'UAH', amount: 3200000, confirmedAt: new Date(0) })
        .run(),
    ).toThrow();
  });

  it('No досягнення reaches the owner`s money: none of the three tables gains a money pair', () => {
    // The свідчення is one TEXT column read back for display; the норма's сума is the owner's own
    // confirmed number and carries its currency as the primary key. Nothing here is a баланс.
    const columns = (table: string) =>
      storage.db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`)).map((c) => c.name);

    expect(columns('earned_achievements')).toEqual([
      'key',
      'template',
      'achieved_on',
      'recorded_at',
      'seen_at',
      'evidence',
    ]);
    expect(columns('challenge_decisions')).toEqual(['key', 'decision', 'decided_at']);
    expect(columns('spending_norms')).toEqual(['currency', 'amount', 'confirmed_at']);
  });
});

/**
 * The request pace and each link's turn: one single-row table and one nullable column on
 * `monobank_links`.
 */
describe("migrations — the request pace and each link's turn", () => {
  it('Scenario: An empty database reaches the current shape', () => {
    const storage = openTestDb();
    try {
      expect(storage.db.select().from(monobankRequestPace).all()).toEqual([]);
      storage.db
        .insert(monobankRequestPace)
        .values({ id: 'pace', lastRequestAt: new Date('2026-09-04T17:34:00.000Z') })
        .run();

      const [row] = storage.db.select().from(monobankRequestPace).all();
      // `timestamp_ms`, so it comes back a Date and not a number.
      expect(row?.lastRequestAt).toBeInstanceOf(Date);

      // ...and a link's turn, the other half of what this table's migration adds, writes and reads
      // back on the same fresh database.
      seedReferences(storage.db, VOCABULARY);
      storage.db.insert(accounts).values(toAccountRow(card)).run();
      storage.db
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
      storage.db
        .insert(monobankLinks)
        .values({
          monobankAccountId: 'mono-card',
          accountId: 'card',
          syncStartDate: '2026-08-01',
          cursorMs: new Date('2026-09-01T05:00:00.000Z'),
          lastAttemptedAt: new Date('2026-09-04T17:34:00.000Z'),
        })
        .run();
      expect(storage.db.select().from(monobankLinks).get()?.lastAttemptedAt).toBeInstanceOf(Date);
    } finally {
      storage.close();
    }
  });

  it('The migrated shape keeps the pace to one row', () => {
    const storage = openTestDb();
    try {
      expect(() =>
        storage.db
          .insert(monobankRequestPace)
          .values({ id: 'not-pace', lastRequestAt: new Date(1) })
          .run(),
      ).toThrow();
    } finally {
      storage.close();
    }
  });
});

/**
 * The поточна вартість: one table, keyed by рахунок.
 */
describe('migrations — the поточна вартість of an інвестиційний рахунок', () => {
  const bonds = account({ id: 'bonds', name: 'ОВДП', kind: 'investment', currency: 'UAH' });

  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    storage.db
      .insert(accounts)
      .values([toAccountRow(card), toAccountRow(jar), toAccountRow(bonds)])
      .run();
  });

  afterEach(() => storage.close());

  it('Scenario: A fresh database holds поточні вартості', () => {
    expect(storage.db.select().from(investmentValues).all()).toEqual([]);

    storage.db
      .insert(investmentValues)
      .values({ accountId: 'bonds', amount: 560000, currency: 'UAH', asOf: '2026-08-28' })
      .run();

    expect(storage.db.select().from(investmentValues).all()).toEqual([
      { accountId: 'bonds', amount: 560000, currency: 'UAH', asOf: '2026-08-28' },
    ]);
    expect(storage.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('The migrated shape keeps one вартість per рахунок', () => {
    storage.db
      .insert(investmentValues)
      .values({ accountId: 'bonds', amount: 560000, currency: 'UAH', asOf: '2026-08-28' })
      .run();
    expect(() =>
      storage.db
        .insert(investmentValues)
        .values({ accountId: 'bonds', amount: 575000, currency: 'UAH', asOf: '2026-09-30' })
        .run(),
    ).toThrow();
  });

  it('The migrated shape refuses a negative сума and accepts zero', () => {
    expect(() =>
      storage.db
        .insert(investmentValues)
        .values({ accountId: 'bonds', amount: -100, currency: 'UAH', asOf: '2026-08-28' })
        .run(),
    ).toThrow();

    // Nothing left behind by the refusal, and zero — an інвестиція worth nothing — goes in.
    storage.db
      .insert(investmentValues)
      .values({ accountId: 'bonds', amount: 0, currency: 'UAH', asOf: '2026-08-28' })
      .run();
    expect(storage.db.select().from(investmentValues).all()[0]?.amount).toBe(0);
  });

  it('The migrated shape refuses a дата that is not a calendar date, and an unknown рахунок', () => {
    expect(() =>
      storage.db
        .insert(investmentValues)
        .values({ accountId: 'bonds', amount: 560000, currency: 'UAH', asOf: '28/08/2026' })
        .run(),
    ).toThrow();
    expect(() =>
      storage.db
        .insert(investmentValues)
        .values({ accountId: 'nowhere', amount: 560000, currency: 'UAH', asOf: '2026-08-28' })
        .run(),
    ).toThrow();
  });
});

/**
 * The three nullable columns `journal` carries so it can record the app's own work.
 */
describe('migrations — what the журнал records', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('gives `journal` its three nullable columns and leaves the four it had', () => {
    const columns = storage.db
      .all<{ name: string; notnull: number }>(sql`PRAGMA table_info(journal)`)
      .map((column) => [column.name, column.notnull] as const);

    expect(columns).toEqual([
      ['id', 1],
      ['at', 1],
      ['kind', 1],
      ['name', 1],
      ['detail', 0],
      ['run', 0],
      ['took_ms', 0],
      ['counts_json', 0],
    ]);
  });
});

/**
 * The two nullable columns on `monobank_links` that hold a window the app is half-way through
 * reading.
 */
describe('migrations — where a half-paged window got to', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('gives `monobank_links` its two nullable columns and leaves the six it had', () => {
    const columns = storage.db
      .all<{ name: string; notnull: number }>(sql`PRAGMA table_info(monobank_links)`)
      .map((column) => [column.name, column.notnull] as const);

    expect(columns).toEqual([
      ['monobank_account_id', 1],
      ['account_id', 1],
      ['sync_start_date', 1],
      ['cursor_ms', 1],
      ['last_synced_at', 0],
      ['last_attempted_at', 0],
      ['paging_window_to_ms', 0],
      ['paging_request_to_ms', 0],
    ]);
  });
});

describe('migrations — правила-перекази and awaiting перекази', () => {
  it('Scenario: Stored rules and перекази survive the migration', () => {
    const staged = openTestDbMigratedTo(1);
    try {
      const { db } = staged;
      seedReferences(db, VOCABULARY);
      db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      // Written under the old shape alone: no `to_account_id` column exists yet, so the query
      // builder — which always addresses the current schema's full column set — cannot write this
      // row; raw SQL is what a device on the old shape actually wrote.
      db.run(
        sql`INSERT INTO rules (id, merchant, category_id, created_at) VALUES ('r1', 'сільпо', 'food', 1)`,
      );
      db.insert(transactions).values(toTransactionRow(oneOfEachType[2]!)).run();

      staged.migrateToLatest();

      expect(db.select().from(rules).where(eq(rules.id, 'r1')).get()).toMatchObject({
        categoryId: 'food',
        toAccountId: null,
      });
      const migratedTransfer = db.select().from(transactions).where(eq(transactions.id, 't1')).get();
      expect(toTransaction(migratedTransfer!)).toEqual(oneOfEachType[2]);
      // Every previously stored переказ awaits nothing: no row exists for it.
      expect(db.select().from(counterpartIncomeAwaits).all()).toEqual([]);
    } finally {
      staged.close();
    }
  });

  it('Scenario: A fresh database stores a правило-переказ', () => {
    const storage = openTestDb();
    try {
      const { db } = storage;
      seedReferences(db, VOCABULARY);
      db.insert(accounts).values([toAccountRow(card), toAccountRow(jar)]).run();
      db.insert(rules)
        .values({ id: 'r1', merchant: 'округлення балансу', toAccountId: 'jar', createdAt: new Date(1) })
        .run();
      const awaiting = transfer({
        id: 't-awaiting',
        date: '2026-09-16',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(2000, 'UAH'),
        arrived: money(2000, 'UAH'),
      });
      db.insert(transactions).values(toTransactionRow(awaiting)).run();
      db.insert(counterpartIncomeAwaits).values({ transactionId: 't-awaiting' }).run();

      expect(db.select().from(rules).where(eq(rules.id, 'r1')).get()).toMatchObject({
        categoryId: null,
        toAccountId: 'jar',
      });
      expect(db.select().from(counterpartIncomeAwaits).all()).toEqual([
        { transactionId: 't-awaiting' },
      ]);
      // Cascade: removing the транзакція removes the awaiting mark with it.
      db.delete(transactions).where(eq(transactions.id, 't-awaiting')).run();
      expect(db.select().from(counterpartIncomeAwaits).all()).toEqual([]);
    } finally {
      storage.close();
    }
  });
});
