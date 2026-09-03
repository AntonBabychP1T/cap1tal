import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { goalsRepo, type GoalsRepo } from './goals-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const jar = account({ id: 'jar', name: 'Подушка', kind: 'savings', currency: 'UAH' });
const cash = account({ id: 'cash', name: 'Готівка', kind: 'cash', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD банка', kind: 'savings', currency: 'USD' });
const euros = account({ id: 'eur', name: 'EUR банка', kind: 'savings', currency: 'EUR' });

const car: AccumulationGoal = {
  id: 'g-car',
  name: 'Авто',
  target: money(20000000, 'UAH'),
  deadline: '2026-12-31',
  accountIds: ['jar'],
};

describe('goalsRepo', () => {
  let storage: TestStorage;
  let repo: GoalsRepo;

  beforeEach(() => {
    storage = openTestDb();
    for (const a of [jar, cash, dollars, euros]) {
      accountsRepo(storage.db).save(a);
    }
    repo = goalsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A ціль that was never stored reads back as nothing, not an error', () => {
    expect(repo.get('g-car')).toBeUndefined();
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: A stored ціль round-trips', () => {
    const machine: AccumulationGoal = {
      id: 'g-machine',
      name: 'Машина',
      target: money(70000000, 'UAH'),
      deadline: '2027-06-30',
      accountIds: ['jar', 'cash', 'usd'],
    };
    repo.save(machine);

    expect(repo.get('g-machine')).toEqual({ ...machine, accountIds: ['cash', 'jar', 'usd'] });
  });

  it('Scenario: A ціль without a дата round-trips without one', () => {
    const reserve: AccumulationGoal = {
      id: 'g-reserve',
      name: 'Резерв',
      target: money(30000000, 'UAH'),
      accountIds: ['jar'],
    };
    repo.save(reserve);

    const back = repo.get('g-reserve')!;
    // Not today's date and not an empty string: the дата is simply absent.
    expect(back.deadline).toBeUndefined();
    expect('deadline' in back).toBe(false);
    expect(back).toEqual(reserve);
  });

  it('Scenario: A replaced ціль keeps its id and new values, and Scenario: An edited target persists', () => {
    repo.save({ ...car, accountIds: ['jar', 'cash', 'usd'] });

    repo.save({ ...car, target: money(25000000, 'UAH'), accountIds: ['jar', 'cash'] });

    expect(repo.get('g-car')).toEqual({
      ...car,
      target: money(25000000, 'UAH'),
      accountIds: ['cash', 'jar'],
    });
    expect(repo.list()).toHaveLength(1);
  });

  it('A дата can be cleared and given again under the same id', () => {
    repo.save(car);
    repo.save({ id: car.id, name: car.name, target: car.target, accountIds: car.accountIds });
    expect(repo.get('g-car')?.deadline).toBeUndefined();

    repo.save({ ...car, deadline: '2028-01-31' });
    expect(repo.get('g-car')?.deadline).toBe('2028-01-31');
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
    const holiday: AccumulationGoal = {
      id: 'g-holiday',
      name: 'Відпустка',
      target: money(5000000, 'UAH'),
      deadline: '2026-09-30',
      accountIds: ['jar', 'cash'],
    };
    repo.save(car);
    repo.save(holiday);

    repo.remove('g-car');

    // Only the other remains, with its own склад intact.
    expect(repo.list()).toEqual([{ ...holiday, accountIds: ['cash', 'jar'] }]);
    // The рахунок and its транзакції are untouched: a ціль reads money, it never owns any.
    expect(accountsRepo(storage.db).get('jar')).toEqual(jar);
    expect(transactionsRepo(storage.db).listAll()).toHaveLength(1);
  });

  it('Scenario: An unknown рахунок id is rejected', () => {
    expect(() => repo.save({ ...car, accountIds: ['jar', 'ghost'] })).toThrow(
      'рахунку «ghost» не існує',
    );
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: An empty склад is rejected', () => {
    expect(() => repo.save({ ...car, accountIds: [] })).toThrow(/жодного рахунку/);
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: The same рахунок twice is rejected', () => {
    // The caller deduplicates before it asks; a склад naming a рахунок twice is a mistake, not a set.
    expect(() => repo.save({ ...car, accountIds: ['jar', 'jar'] })).toThrow(/двічі/);
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: A currency mismatching the рахунок is rejected', () => {
    expect(() => repo.save({ ...car, target: money(500000, 'USD'), accountIds: ['jar'] })).toThrow(
      /у UAH/,
    );
    expect(repo.list()).toEqual([]);

    // A склад mixing currencies outside UAH is refused by its own sentence.
    expect(() =>
      repo.save({ ...car, target: money(500000, 'USD'), accountIds: ['usd', 'jar'] }),
    ).toThrow(/тільки в UAH/);

    // A UAH ціль over a single USD рахунок is *not* a mismatch: UAH is what the app converts into,
    // and such a progress is simply приблизний.
    repo.save({ ...car, accountIds: ['usd'] });
    expect(repo.get('g-car')?.accountIds).toEqual(['usd']);

    // And on the way through an edit too: the check is in the one write path, not only on create.
    const trip: AccumulationGoal = {
      id: 'g-trip',
      name: 'Подорож',
      target: money(500000, 'USD'),
      accountIds: ['usd'],
    };
    repo.save(trip);
    expect(() => repo.save({ ...trip, accountIds: ['usd', 'jar'] })).toThrow(/тільки в UAH/);
    expect(repo.get('g-trip')).toEqual(trip);
  });

  it('Scenario: A UAH ціль over рахунки of several currencies is stored', () => {
    const machine: AccumulationGoal = {
      ...car,
      target: money(70000000, 'UAH'),
      accountIds: ['jar', 'usd', 'eur'],
    };
    repo.save(machine);

    expect(repo.get('g-car')).toEqual({ ...machine, accountIds: ['eur', 'jar', 'usd'] });
  });

  it('Scenario: A ціль in its склад’s one currency is stored', () => {
    const dollars2 = account({ id: 'usd2', name: 'IBKR', kind: 'investment', currency: 'USD' });
    accountsRepo(storage.db).save(dollars2);
    const trip: AccumulationGoal = {
      id: 'g-trip',
      name: 'Подорож',
      target: money(500000, 'USD'),
      accountIds: ['usd', 'usd2'],
    };
    repo.save(trip);

    expect(repo.get('g-trip')).toEqual({ ...trip, accountIds: ['usd', 'usd2'] });
  });

  it('Scenario: One рахунок may feed two цілі', () => {
    const holiday: AccumulationGoal = {
      id: 'g-holiday',
      name: 'Відпустка',
      target: money(5000000, 'UAH'),
      deadline: '2026-09-30',
      accountIds: ['jar'],
    };
    repo.save(car);
    repo.save(holiday);

    // The nearest дата first.
    expect(repo.list()).toEqual([holiday, car]);
  });

  it('A ціль with no дата is listed after the dated ones', () => {
    const reserve: AccumulationGoal = {
      id: 'g-reserve',
      name: 'Резерв',
      target: money(1000000, 'UAH'),
      accountIds: ['jar'],
    };
    repo.save(reserve);
    repo.save(car);

    expect(repo.list().map((goal) => goal.id)).toEqual(['g-car', 'g-reserve']);
  });

  it('A ціль that is not a calendar date, is blank or targets nothing is refused', () => {
    expect(() => repo.save({ ...car, deadline: '2026-02-31' })).toThrow();
    expect(() => repo.save({ ...car, deadline: '31.12.2026' })).toThrow();
    expect(() => repo.save({ ...car, name: '   ' })).toThrow();
    expect(() => repo.save({ ...car, target: money(0, 'UAH') })).toThrow();
    expect(repo.list()).toEqual([]);
  });

  it('A рахунок added to a склад starts counting and one removed stops, with no other trace', () => {
    repo.save(car);

    repo.save({ ...car, accountIds: ['jar', 'cash'] });
    expect(repo.get('g-car')?.accountIds).toEqual(['cash', 'jar']);

    repo.save({ ...car, accountIds: ['cash'] });
    expect(repo.get('g-car')?.accountIds).toEqual(['cash']);
    // Removing a рахунок from a склад touches no money.
    expect(accountsRepo(storage.db).get('jar')).toEqual(jar);
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
    const machine: AccumulationGoal = {
      id: 'g-machine',
      name: 'Машина',
      target: money(70000000, 'UAH'),
      deadline: '2027-06-30',
      accountIds: ['jar', 'cash', 'usd'],
    };

    const first = openFileDb(path);
    try {
      for (const a of [jar, cash, dollars]) {
        accountsRepo(first.db).save(a);
      }
      goalsRepo(first.db).save(machine);
    } finally {
      first.close();
    }

    // A new connection to the same file — the closest a test gets to launching the app again.
    const second = openFileDb(path);
    try {
      expect(goalsRepo(second.db).get('g-machine')).toEqual({
        ...machine,
        accountIds: ['cash', 'jar', 'usd'],
      });
    } finally {
      second.close();
    }
  });

  it('Scenario: A ціль without a дата round-trips without one', () => {
    const path = join(dir, 'cap1tal.db');

    const first = openFileDb(path);
    try {
      accountsRepo(first.db).save(jar);
      goalsRepo(first.db).save({
        id: 'g-reserve',
        name: 'Резерв',
        target: money(30000000, 'UAH'),
        accountIds: ['jar'],
      });
    } finally {
      first.close();
    }

    const second = openFileDb(path);
    try {
      expect(goalsRepo(second.db).get('g-reserve')?.deadline).toBeUndefined();
    } finally {
      second.close();
    }
  });
});
