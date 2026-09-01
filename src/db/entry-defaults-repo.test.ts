import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { entryDefaultsRepo } from './entry-defaults-repo';
import { toAccountRow } from './mappers';
import { accounts } from './schema';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const wallet = account({ id: 'wallet', name: 'гаманець', kind: 'cash', currency: 'UAH' });
const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

function seedAccounts(storage: TestStorage): void {
  seedReferences(storage.db, { categories: ['food'] });
  storage.db.insert(accounts).values([toAccountRow(wallet), toAccountRow(card)]).run();
}

describe('the рахунок the entry form opens on', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedAccounts(storage);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh database remembers none', () => {
    expect(entryDefaultsRepo(storage.db).remembered()).toBeUndefined();
  });

  it('Scenario: Only the latest one is kept', () => {
    const repo = entryDefaultsRepo(storage.db);

    repo.remember('wallet');
    repo.remember('card');

    expect(repo.remembered()).toBe('card');
  });

  it('Scenario: Storing a транзакція remembers nothing by itself', () => {
    const repo = entryDefaultsRepo(storage.db);

    transactionsRepo(storage.db).save(
      expenseByDefault({
        id: 'e1',
        date: '2026-09-01',
        accountId: 'card',
        amount: money(12000, 'UAH'),
        categoryId: 'food',
      }),
      new Date('2026-09-01T10:00:00.000Z'),
    );

    // An import, a sync and a confirmed чернетка all store транзакції this way and none of them
    // may move the memory: only Головний's hand-entry path calls `remember`.
    expect(repo.remembered()).toBeUndefined();
  });

  it('An archived рахунок stays remembered — the screen decides what to offer, not storage', () => {
    const repo = entryDefaultsRepo(storage.db);
    repo.remember('wallet');

    // Archiving is a save, not a delete: the row stays and so does the memory.
    storage.db
      .update(accounts)
      .set({ archived: true })
      .where(eq(accounts.id, 'wallet'))
      .run();

    expect(repo.remembered()).toBe('wallet');
  });

  it('A рахунок that was never stored cannot be remembered', () => {
    expect(() => entryDefaultsRepo(storage.db).remember('nowhere')).toThrow();
  });
});

describe('the remembered рахунок, across a restart', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-entry-defaults-'));
    path = join(dir, 'cap1tal.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: The remembered рахунок comes back', () => {
    const first = openFileDb(path);
    seedAccounts(first);
    entryDefaultsRepo(first.db).remember('wallet');
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(entryDefaultsRepo(reopened.db).remembered()).toBe('wallet');
    } finally {
      reopened.close();
    }
  });
});
