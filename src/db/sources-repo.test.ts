import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { activeSources } from '../domain/category';
import { money } from '../domain/money';
import { INTEREST_SOURCE_ID, UNSOURCED_SOURCE_ID, type Income } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { sourcesRepo, type SourcesRepo } from './sources-repo';
import { openTestDb, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

/** A fixed instant: storage recency is data these tests control, never the wall clock. */
const storedAt = new Date('2026-03-05T09:00:00.000Z');

const salaryIncome: Income = {
  type: 'income',
  id: 'i1',
  date: '2026-03-05',
  accountId: 'card',
  amount: money(5000000, 'UAH'),
  sourceId: 'salary',
};
const freelanceIncome: Income = {
  type: 'income',
  id: 'i2',
  date: '2026-03-07',
  accountId: 'card',
  amount: money(1200000, 'UAH'),
  sourceId: 'freelance',
};

describe('sourcesRepo', () => {
  let storage: TestStorage;
  let repo: SourcesRepo;
  let txs: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    // The дохід rows below reference a real рахунок; the sources they reference are created by
    // the repository under test, which is the point.
    accountsRepo(storage.db).save(card);
    repo = sourcesRepo(storage.db);
    txs = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  // The source half of "A created category is available".
  it('A created source is available', () => {
    const created = repo.create({ id: 'salary', name: 'Salary' });

    expect(created).toEqual({ id: 'salary', name: 'Salary', archived: false });
    expect(repo.get('salary')).toEqual(created);
    expect(activeSources(repo.list()).map((s) => s.name)).toContain('Salary');
  });

  // The source half of "A rename keeps the row's history" — for a source that history is доходи.
  it('A rename keeps the row and its дохід', () => {
    repo.create({ id: 'salary', name: 'Salary' });
    txs.save(salaryIncome, storedAt);

    repo.rename('salary', 'Зарплата');

    expect(repo.get('salary')).toEqual({ id: 'salary', name: 'Зарплата', archived: false });
    expect(repo.list()).toHaveLength(1);
    expect(txs.get('i1')).toEqual(salaryIncome);
  });

  it('Scenario: A duplicate name is rejected', () => {
    repo.create({ id: 'salary', name: 'Salary' });

    expect(() => repo.create({ id: 'salary-2', name: 'Salary' })).toThrow();
    // A name is what is left of it after trimming, so padding hides nothing.
    expect(() => repo.create({ id: 'salary-3', name: '  Salary  ' })).toThrow();

    expect(repo.get('salary-2')).toBeUndefined();
    expect(repo.get('salary-3')).toBeUndefined();
    expect(repo.list()).toHaveLength(1);
  });

  it('Scenario: An empty name is rejected', () => {
    expect(() => repo.create({ id: 'blank', name: '   ' })).toThrow();
    expect(repo.list()).toEqual([]);

    repo.create({ id: 'salary', name: 'Salary' });
    expect(() => repo.rename('salary', ' ')).toThrow();
    expect(repo.get('salary')?.name).toBe('Salary');
  });

  it('Scenario: An archived source is not offered as a джерело', () => {
    repo.create({ id: 'freelance', name: 'Freelance' });
    txs.save(freelanceIncome, storedAt);

    repo.archive('freelance');

    expect(activeSources(repo.list()).map((s) => s.id)).not.toContain('freelance');
    // Still in the management list, and the stored дохід still carries it under its name.
    expect(repo.list().map((s) => s.id)).toContain('freelance');
    expect(repo.get('freelance')).toEqual({ id: 'freelance', name: 'Freelance', archived: true });
    expect(txs.get('i2')).toEqual(freelanceIncome);
  });

  it('Scenario: An unarchived category returns to the picker — the source half', () => {
    repo.create({ id: 'freelance', name: 'Freelance' });
    repo.archive('freelance');
    expect(activeSources(repo.list()).map((s) => s.id)).not.toContain('freelance');

    repo.unarchive('freelance');

    expect(activeSources(repo.list()).map((s) => s.id)).toContain('freelance');
    expect(repo.get('freelance')?.archived).toBe(false);
  });

  it('Scenario: Unarchiving into a name collision is rejected', () => {
    repo.create({ id: 'freelance', name: 'Freelance' });
    repo.archive('freelance');
    // Allowed precisely because the old row is archived — which is what sets up the collision.
    repo.create({ id: 'freelance-new', name: 'Freelance' });

    expect(() => repo.unarchive('freelance')).toThrow();

    expect(repo.get('freelance')?.archived).toBe(true);
    expect(activeSources(repo.list()).filter((s) => s.name === 'Freelance')).toHaveLength(1);
  });
});

describe('sourcesRepo — the rename rules the sibling repo already pins', () => {
  let storage: TestStorage;
  let repo: SourcesRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = sourcesRepo(storage.db);
    repo.create({ id: 'salary', name: 'Salary' });
    repo.create({ id: 'freelance', name: 'Freelance' });
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A duplicate name is rejected — on a rename as much as on a create', () => {
    // "the same rule a rename obeys", from the archive requirement. Without it two unarchived
    // джерела named Salary sit in the picker and nothing tells them apart.
    expect(() => repo.rename('freelance', 'Salary')).toThrow('вже існує');

    expect(repo.get('freelance')?.name).toBe('Freelance');
    expect(activeSources(repo.list()).filter((s) => s.name === 'Salary')).toHaveLength(1);
  });

  it('A rename that only recases or repads its own name does not collide with itself', () => {
    // The owner reopens the rename dialog and saves without really changing anything.
    repo.rename('salary', 'Salary');
    repo.rename('salary', '  salary  ');

    expect(repo.get('salary')?.name).toBe('salary');
  });

  it('Renaming or archiving an id with no row is refused, in the owner\'s language', () => {
    for (const write of [
      () => repo.rename('nope', 'Хтозна'),
      () => repo.archive('nope'),
      () => repo.unarchive('nope'),
    ]) {
      expect(write).toThrow(/не існує/);
    }
  });

  it('Scenario: The reserved джерело may be neither renamed nor archived', () => {
    repo.create({ id: INTEREST_SOURCE_ID, name: 'Відсотки' });

    // «його», not «її» — the refusal is a sentence, and a джерело is not a категорія.
    expect(() => repo.rename(INTEREST_SOURCE_ID, 'Проценти')).toThrow(/службове джерело, його/);
    expect(() => repo.archive(INTEREST_SOURCE_ID)).toThrow(/службове джерело, його/);
    // Still offered as a джерело, which is the half that separates it from «Коригування».
    expect(activeSources(repo.list()).map((row) => row.id)).toContain(INTEREST_SOURCE_ID);
  });

  it('Scenario: Renaming a reserved row is rejected — on the джерела list too', () => {
    repo.create({ id: UNSOURCED_SOURCE_ID, name: 'Без джерела' });

    expect(() => repo.rename(UNSOURCED_SOURCE_ID, 'Невідомо звідки')).toThrow(
      /службове джерело, його/,
    );
    expect(repo.get(UNSOURCED_SOURCE_ID)?.name).toBe('Без джерела');
  });

  it('Scenario: Archiving a reserved row is rejected — on the джерела list too', () => {
    repo.create({ id: UNSOURCED_SOURCE_ID, name: 'Без джерела' });

    expect(() => repo.archive(UNSOURCED_SOURCE_ID)).toThrow(/службове джерело, його/);
    // It stays on the list an imported дохід resolves against; that it is offered in no picker
    // is `category-choices.ts`'s doing, not the repository's.
    expect(repo.get(UNSOURCED_SOURCE_ID)?.archived).toBe(false);
  });

  it('Scenario: The imported-arrival source may be neither edited nor picked', () => {
    repo.create({ id: UNSOURCED_SOURCE_ID, name: 'Без джерела' });

    expect(() => repo.rename(UNSOURCED_SOURCE_ID, 'Кешбек')).toThrow(/службове джерело, його/);
    expect(() => repo.archive(UNSOURCED_SOURCE_ID)).toThrow(/службове джерело, його/);
    // It stays on the list an imported дохід resolves against and displays its name from; that no
    // picker offers it is `category-choices.ts`'s half of the scenario.
    expect(repo.get(UNSOURCED_SOURCE_ID)).toEqual({
      id: UNSOURCED_SOURCE_ID,
      name: 'Без джерела',
      archived: false,
    });
  });

  it('Two rows sharing a name come back in a fixed order, not SQLite\'s', () => {
    repo.rename('freelance', 'Salary-b');
    repo.archive('freelance');
    repo.create({ id: 'salary-b', name: 'Salary-b' });

    const ids = () => repo.list().filter((s) => s.name === 'Salary-b').map((s) => s.id);
    expect(ids()).toEqual(['freelance', 'salary-b']);
    expect(ids()).toEqual(ids());
  });
});
