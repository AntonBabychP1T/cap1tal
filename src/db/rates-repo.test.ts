import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { transfer } from '../domain/transaction';
import { toAccountRow } from './mappers';
import { ratesRepo, type RatesRepo } from './rates-repo';
import { accounts } from './schema';
import { openFileDb, openTestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/** Rates and the moments they were obtained are data these tests control, never the wall clock. */
const usd = { currency: 'USD', rateMillionths: 41_253_450 } as const;
const eur = { currency: 'EUR', rateMillionths: 51_880_000 } as const;
const yesterdayEvening = new Date('2026-08-23T19:12:00.000Z');
const thisMorning = new Date('2026-08-24T08:40:00.000Z');

describe('ratesRepo', () => {
  let storage: TestStorage;
  let repo: RatesRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = ratesRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A rate that was never obtained reads back as nothing, not an error', () => {
    expect(repo.get('USD')).toBeUndefined();
    expect(repo.all()).toEqual([]);
  });

  it('Scenario: A newer rate replaces the older one', () => {
    repo.upsert(usd, yesterdayEvening);
    repo.upsert({ currency: 'USD', rateMillionths: 44_430_000 }, thisMorning);

    expect(repo.get('USD')).toEqual({
      currency: 'USD',
      rateMillionths: 44_430_000,
      obtainedAt: thisMorning,
    });
    // Only the newer rate: this is a cache, and it keeps no history.
    expect(repo.all()).toEqual([
      { currency: 'USD', rateMillionths: 44_430_000, obtainedAt: thisMorning },
    ]);
  });

  it('Each currency keeps its own rate and its own moment', () => {
    repo.upsert(usd, yesterdayEvening);
    repo.upsert(eur, thisMorning);

    expect(repo.all()).toEqual([
      { currency: 'EUR', rateMillionths: 51_880_000, obtainedAt: thisMorning },
      { currency: 'USD', rateMillionths: 41_253_450, obtainedAt: yesterdayEvening },
    ]);
    expect(repo.get('EUR')?.obtainedAt).toEqual(thisMorning);
    expect(repo.get('USD')?.obtainedAt).toEqual(yesterdayEvening);
  });

  it('The rate is stored as the integer millionths it was parsed into', () => {
    repo.upsert(usd, thisMorning);

    const stored = repo.get('USD');
    expect(stored?.rateMillionths).toBe(41_253_450);
    expect(Number.isInteger(stored?.rateMillionths)).toBe(true);
  });

  it('Scenario: A cached monobank rate reaches no transaction', () => {
    const { db } = storage;
    db.insert(accounts)
      .values([
        toAccountRow(account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' })),
        toAccountRow(account({ id: 'usd', name: 'usd', kind: 'savings', currency: 'USD' })),
      ])
      .run();
    const txs = transactionsRepo(db);
    const crossCurrency = transfer({
      id: 't1',
      date: '2026-08-10',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    txs.save(crossCurrency, thisMorning);

    repo.upsert(usd, thisMorning);

    // The transfer still holds only its two legs. A rate exists in storage, and it belongs to no
    // transaction: nothing about this one changed because of it.
    expect(txs.get('t1')).toEqual(crossCurrency);
  });

  it('A rate that is not above zero is refused by storage', () => {
    expect(() => repo.upsert({ currency: 'USD', rateMillionths: 0 }, thisMorning)).toThrow();
    expect(() => repo.upsert({ currency: 'USD', rateMillionths: -1 }, thisMorning)).toThrow();
    expect(repo.all()).toEqual([]);
  });
});

describe('ratesRepo across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-rates-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A stored rate is still there after a restart', () => {
    const path = join(dir, 'cap1tal.db');

    const first = openFileDb(path);
    try {
      ratesRepo(first.db).upsert(usd, yesterdayEvening);
    } finally {
      first.close();
    }

    // A new connection to the same file — the closest a test gets to launching the app again.
    const second = openFileDb(path);
    try {
      expect(ratesRepo(second.db).get('USD')).toEqual({
        currency: 'USD',
        rateMillionths: 41_253_450,
        obtainedAt: yesterdayEvening,
      });
    } finally {
      second.close();
    }
  });

  it('Scenario: A newer rate replaces the older one — across a restart too', () => {
    const path = join(dir, 'cap1tal.db');

    const first = openFileDb(path);
    try {
      ratesRepo(first.db).upsert(usd, yesterdayEvening);
    } finally {
      first.close();
    }

    const second = openFileDb(path);
    try {
      ratesRepo(second.db).upsert({ currency: 'USD', rateMillionths: 44_430_000 }, thisMorning);
    } finally {
      second.close();
    }

    const third = openFileDb(path);
    try {
      expect(ratesRepo(third.db).all()).toEqual([
        { currency: 'USD', rateMillionths: 44_430_000, obtainedAt: thisMorning },
      ]);
    } finally {
      third.close();
    }
  });
});
