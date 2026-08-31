import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { Goal } from '../domain/goals';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { goalsRepo, type GoalsRepo } from './goals-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const jar = account({ id: 'jar', name: 'Подушка', kind: 'savings', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD банка', kind: 'savings', currency: 'USD' });

const car: Goal = {
  id: 'g-car',
  name: 'Авто',
  target: money(20000000, 'UAH'),
  deadline: '2026-12-31',
  accountId: 'jar',
};

describe('goalsRepo', () => {
  let storage: TestStorage;
  let repo: GoalsRepo;

  beforeEach(() => {
    storage = openTestDb();
    accountsRepo(storage.db).save(jar);
    accountsRepo(storage.db).save(dollars);
    repo = goalsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A ціль that was never stored reads back as nothing, not an error', () => {
    expect(repo.get('g-car')).toBeUndefined();
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: A replaced ціль keeps its id and new values', () => {
    repo.save(car);
    repo.save({ ...car, target: money(25000000, 'UAH') });

    expect(repo.get('g-car')).toEqual({ ...car, target: money(25000000, 'UAH') });
    expect(repo.list()).toHaveLength(1);
  });

  it('Scenario: A removed ціль is gone and nothing else is', () => {
    seedReferences(storage.db, { categories: ['food'] });
    transactionsRepo(storage.db).save(
      expenseByDefault({
        id: 'e1',
        date: '2026-08-10',
        accountId: 'jar',
        amount: money(12550, 'UAH'),
        categoryId: 'food',
      }),
      new Date('2026-08-10T09:00:00.000Z'),
    );
    const holiday: Goal = {
      id: 'g-holiday',
      name: 'Відпустка',
      target: money(5000000, 'UAH'),
      deadline: '2026-09-30',
      accountId: 'jar',
    };
    repo.save(car);
    repo.save(holiday);

    repo.remove('g-car');

    expect(repo.list()).toEqual([holiday]);
    // The рахунок and its транзакції are untouched: a ціль reads money, it never owns any.
    expect(accountsRepo(storage.db).get('jar')).toEqual(jar);
    expect(transactionsRepo(storage.db).listAll()).toHaveLength(1);
  });

  it('Scenario: An unknown рахунок id is rejected', () => {
    expect(() => repo.save({ ...car, accountId: 'ghost' })).toThrow(
      'рахунку «ghost» не існує',
    );
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: A currency mismatching the рахунок is rejected', () => {
    expect(() => repo.save({ ...car, target: money(500000, 'USD') })).toThrow(
      'рахунок «Подушка» — у UAH, тож ціль у USD на ньому стояти не може',
    );
    expect(repo.list()).toEqual([]);

    // And on the way through an edit too: the check is in the one write path, not only on create.
    repo.save(car);
    expect(() => repo.save({ ...car, accountId: 'usd' })).toThrow();
    expect(repo.get('g-car')).toEqual(car);
  });

  it('Scenario: Two цілі may share one рахунок', () => {
    const holiday: Goal = {
      id: 'g-holiday',
      name: 'Відпустка',
      target: money(5000000, 'UAH'),
      deadline: '2026-09-30',
      accountId: 'jar',
    };
    repo.save(car);
    repo.save(holiday);

    // The nearest дата first.
    expect(repo.list()).toEqual([holiday, car]);
  });

  it('A ціль that is not a calendar date, is blank or targets nothing is refused', () => {
    expect(() => repo.save({ ...car, deadline: '2026-02-31' })).toThrow();
    expect(() => repo.save({ ...car, deadline: '31.12.2026' })).toThrow();
    expect(() => repo.save({ ...car, name: '   ' })).toThrow();
    expect(() => repo.save({ ...car, target: money(0, 'UAH') })).toThrow();
    expect(repo.list()).toEqual([]);
  });

  it('A ціль moved onto another рахунок of the same currency keeps its target', () => {
    const otherJar = account({ id: 'jar2', name: 'Друга банка', kind: 'savings', currency: 'UAH' });
    accountsRepo(storage.db).save(otherJar);
    repo.save(car);

    repo.save({ ...car, accountId: 'jar2' });

    expect(repo.get('g-car')).toEqual({ ...car, accountId: 'jar2' });
  });
});

describe('goalsRepo across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-goals-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A stored ціль round-trips', () => {
    const path = join(dir, 'cap1tal.db');

    const first = openFileDb(path);
    try {
      accountsRepo(first.db).save(jar);
      goalsRepo(first.db).save(car);
    } finally {
      first.close();
    }

    // A new connection to the same file — the closest a test gets to launching the app again.
    const second = openFileDb(path);
    try {
      expect(goalsRepo(second.db).get('g-car')).toEqual(car);
    } finally {
      second.close();
    }
  });
});
