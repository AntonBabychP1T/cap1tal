import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { limitsRepo, type LimitsRepo } from './limits-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const VOCABULARY = { categories: ['food', 'clothes'] } as const;

describe('limitsRepo', () => {
  let storage: TestStorage;
  let repo: LimitsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    repo = limitsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A category that was never given a ліміт reads back as nothing, not an error', () => {
    expect(repo.get('food')).toBeUndefined();
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: Storing again replaces, clearing removes', () => {
    repo.set({ categoryId: 'food', amount: money(250000, 'UAH') });
    expect(repo.get('food')).toEqual({ categoryId: 'food', amount: money(250000, 'UAH') });

    repo.set({ categoryId: 'food', amount: money(300000, 'UAH') });
    expect(repo.get('food')).toEqual({ categoryId: 'food', amount: money(300000, 'UAH') });
    // One ліміт at a time: the replaced one leaves no second row behind.
    expect(repo.list()).toHaveLength(1);

    repo.clear('food');
    expect(repo.get('food')).toBeUndefined();
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: An unknown category id is rejected', () => {
    expect(() => repo.set({ categoryId: 'ghost', amount: money(250000, 'UAH') })).toThrow();
    expect(repo.list()).toEqual([]);
  });

  it('A ліміт that is not positive is refused by storage', () => {
    expect(() => repo.set({ categoryId: 'food', amount: money(0, 'UAH') })).toThrow();
    expect(() => repo.set({ categoryId: 'food', amount: money(-1, 'UAH') })).toThrow();
    expect(repo.list()).toEqual([]);
  });

  it('A second category carries its own ліміт, in its own currency', () => {
    repo.set({ categoryId: 'food', amount: money(250000, 'UAH') });
    repo.set({ categoryId: 'clothes', amount: money(10000, 'USD') });

    expect(repo.list()).toEqual([
      { categoryId: 'clothes', amount: money(10000, 'USD') },
      { categoryId: 'food', amount: money(250000, 'UAH') },
    ]);
    // Clearing one leaves the other exactly as it was.
    repo.clear('food');
    expect(repo.list()).toEqual([{ categoryId: 'clothes', amount: money(10000, 'USD') }]);
  });

  it('Scenario: Recording into an over-limit category still stores', () => {
    const card = account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' });
    accountsRepo(storage.db).save(card);
    const transactions = transactionsRepo(storage.db);
    const storedAt = new Date('2026-08-24T10:00:00.000Z');
    const spend = (id: string) =>
      expenseByDefault({
        id,
        date: '2026-08-24',
        accountId: 'card',
        amount: money(300000, 'UAH'),
        categoryId: 'food',
      });

    // Without a ліміт …
    transactions.save(spend('before'), storedAt);
    // … and with one the month has already blown past.
    repo.set({ categoryId: 'food', amount: money(250000, 'UAH') });
    transactions.save(spend('after'), storedAt);

    const withoutLimit = transactions.get('before')!;
    const withLimit = transactions.get('after')!;
    // The same транзакція, down to every field but its id: a ліміт colours, it never blocks.
    expect({ ...withLimit, id: 'before' }).toEqual(withoutLimit);
    expect(repo.get('food')).toEqual({ categoryId: 'food', amount: money(250000, 'UAH') });
  });

  it('Clearing a category that carries no ліміт changes nothing', () => {
    repo.set({ categoryId: 'food', amount: money(250000, 'UAH') });
    repo.clear('clothes');
    expect(repo.list()).toEqual([{ categoryId: 'food', amount: money(250000, 'UAH') }]);
  });
});

describe('limitsRepo across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-limits-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A stored ліміт is still there after a restart', () => {
    const path = join(dir, 'cap1tal.db');

    const first = openFileDb(path);
    try {
      seedReferences(first.db, VOCABULARY);
      limitsRepo(first.db).set({ categoryId: 'food', amount: money(250000, 'UAH') });
    } finally {
      first.close();
    }

    // A new connection to the same file — the closest a test gets to launching the app again.
    const second = openFileDb(path);
    try {
      expect(limitsRepo(second.db).get('food')).toEqual({
        categoryId: 'food',
        amount: money(250000, 'UAH'),
      });
    } finally {
      second.close();
    }
  });

  it('Scenario: Storing again replaces, clearing removes — across a restart too', () => {
    const path = join(dir, 'cap1tal.db');

    const first = openFileDb(path);
    try {
      seedReferences(first.db, VOCABULARY);
      limitsRepo(first.db).set({ categoryId: 'food', amount: money(250000, 'UAH') });
    } finally {
      first.close();
    }

    const second = openFileDb(path);
    try {
      limitsRepo(second.db).set({ categoryId: 'food', amount: money(300000, 'UAH') });
      expect(limitsRepo(second.db).get('food')).toEqual({
        categoryId: 'food',
        amount: money(300000, 'UAH'),
      });
    } finally {
      second.close();
    }

    const third = openFileDb(path);
    try {
      expect(limitsRepo(third.db).get('food')).toEqual({
        categoryId: 'food',
        amount: money(300000, 'UAH'),
      });
      limitsRepo(third.db).clear('food');
    } finally {
      third.close();
    }

    const fourth = openFileDb(path);
    try {
      expect(limitsRepo(fourth.db).get('food')).toBeUndefined();
    } finally {
      fourth.close();
    }
  });
});
