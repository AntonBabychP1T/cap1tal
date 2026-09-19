import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { holdLock } from './hold-lock';
import { toTransactionRow } from './mappers';
import { prepareConnection } from './prepare';
import { accounts, transactions } from './schema';
import * as schema from './schema';
import { openFileDb, seedReferences, type TestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Proves the persistence spec's concurrency scenarios over a real file — the only place two
 * connections can meet (`:memory:` gives each its own database). Section 1: reproduced first,
 * against the app driver's own defaults (design D6, task 1.1's `timeout: 0`). Fails before the
 * fix; §2 prepares every opening and §3 makes every write immediate — together they make each
 * scenario pass.
 */

const card = account({
  id: 'card',
  name: 'card',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(0, 'UAH'),
});

function tempFile(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cap1tal-concurrency-'));
  return { dir, file: join(dir, 'db.sqlite') };
}

describe('concurrency', () => {
  let dir: string;
  let file: string;
  let storage: TestStorage;

  beforeEach(() => {
    ({ dir, file } = tempFile());
    storage = openFileDb(file);
    accountsRepo(storage.db).save(card);
    seedReferences(storage.db, { categories: [UNCATEGORISED_CATEGORY_ID] });
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A commit that meets a reader leaves storage readable', () => {
    const expense = expenseByDefault({
      id: 'e-reader',
      date: '2026-03-01',
      accountId: card.id,
      amount: money(1500, 'UAH'),
    });
    const reader = openFileDb(file);
    const writer = openFileDb(file);
    try {
      reader.db.transaction((tx) => {
        // Partway through a read: the SHARED lock this takes is held until the transaction ends,
        // not just for the length of this one statement.
        tx.select().from(transactions).all();
        transactionsRepo(writer.db).save(expense, new Date());
      });
    } finally {
      reader.close();
      writer.close();
    }

    const checker = openFileDb(file);
    try {
      expect(transactionsRepo(checker.db).get(expense.id)).toEqual(expense);
    } finally {
      checker.close();
    }
  });

  it('Scenario: A second writer waits and lands', async () => {
    const expense = expenseByDefault({
      id: 'e-second-writer',
      date: '2026-03-02',
      accountId: card.id,
      amount: money(2500, 'UAH'),
    });
    const holder = holdLock({ file, job: 'write', delayMs: 200 });

    transactionsRepo(storage.db).save(expense, new Date());
    await holder.finished;

    expect(transactionsRepo(storage.db).get(expense.id)).toEqual(expense);
  });

  it('Scenario: A change that reads before it stores still waits for its turn', async () => {
    const expense = expenseByDefault({
      id: 'e-read-then-store',
      date: '2026-03-03',
      accountId: card.id,
      amount: money(3500, 'UAH'),
    });
    const holder = holdLock({ file, job: 'write', delayMs: 200 });

    // Immediate (§3): the write lock is taken at `BEGIN`, where the wait applies, even though
    // this transaction reads before it stores.
    storage.db.transaction(
      (tx) => {
        tx.select().from(accounts).where(eq(accounts.id, card.id)).all();
        tx.insert(transactions)
          .values({ ...toTransactionRow(expense), createdAt: new Date() })
          .run();
      },
      { behavior: 'immediate' },
    );
    await holder.finished;

    expect(transactionsRepo(storage.db).get(expense.id)).toEqual(expense);
  });

  it('Scenario: A wait that outlasts the bound fails and changes nothing', async () => {
    const expense = expenseByDefault({
      id: 'e-outlasts-bound',
      date: '2026-03-06',
      accountId: card.id,
      amount: money(4500, 'UAH'),
    });
    const holder = holdLock({ file, job: 'write', delayMs: 200 });

    const sqlite = new Database(file);
    prepareConnection((sql) => sqlite.exec(sql), { busyTimeoutMs: 100 });
    const db = drizzle(sqlite, { schema });
    try {
      expect(() => transactionsRepo(db).save(expense, new Date())).toThrow();
    } finally {
      sqlite.close();
    }
    await holder.finished;

    expect(transactionsRepo(storage.db).get(expense.id)).toBeUndefined();
  });

  it('Scenario: References are enforced on a second opening', () => {
    const badReference = expenseByDefault({
      id: 'e-bad-reference',
      date: '2026-03-07',
      accountId: 'no-such-account',
      amount: money(999, 'UAH'),
    });
    const second = openFileDb(file);
    try {
      expect(() => transactionsRepo(second.db).save(badReference, new Date())).toThrow();
    } finally {
      second.close();
    }
    expect(transactionsRepo(storage.db).get(badReference.id)).toBeUndefined();
  });

  it('Scenario: Storage opened while another opening is busy is usable', () => {
    // A file migrated by a connection that was never prepared, so it is still in its old
    // (DELETE) journal mode — not `openFileDb`, which would prepare it.
    const { dir: otherDir, file: otherFile } = tempFile();
    const firstSqlite = new Database(otherFile);
    const firstDb = drizzle(firstSqlite, { schema });
    migrate(firstDb, { migrationsFolder: MIGRATIONS_FOLDER });
    firstSqlite.pragma('foreign_keys = ON');
    accountsRepo(firstDb).save(card);
    seedReferences(firstDb, { categories: [UNCATEGORISED_CATEGORY_ID] });

    let secondSqlite: InstanceType<typeof Database> | undefined;
    let secondDb: TestDb | undefined;
    try {
      firstDb.transaction((tx) => {
        // Partway through a read that lasts past the bound below.
        tx.select().from(accounts).all();

        secondSqlite = new Database(otherFile);
        secondDb = drizzle(secondSqlite, { schema });
        // Not `openFileDb`: its own `migrate` would itself meet the first opening's lock.
        prepareConnection((sql) => secondSqlite!.exec(sql), { busyTimeoutMs: 100 });
      });

      const expense = expenseByDefault({
        id: 'e-opened-while-busy',
        date: '2026-03-08',
        accountId: card.id,
        amount: money(555, 'UAH'),
      });
      expect(accountsRepo(secondDb!).get(card.id)).toEqual(card);
      transactionsRepo(secondDb!).save(expense, new Date());
      expect(transactionsRepo(secondDb!).get(expense.id)).toEqual(expense);
    } finally {
      secondSqlite?.close();
      firstSqlite.close();
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
