import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { activeCategories, namesById } from '../domain/category';
import { money } from '../domain/money';
import {
  expenseByDefault,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Expense,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { categoriesRepo, type CategoriesRepo } from './categories-repo';
import { openTestDb, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

/**
 * A fresh database is not an empty list: migration 0003 already carries «Без категорії»,
 * «Комісія» and «Коригування» (design decision 4), which is what makes the reserved-row tests
 * below able to reach a real row without seeding anything.
 */
const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

/** A fixed instant: storage recency is data these tests control, never the wall clock. */
const storedAt = new Date('2026-03-10T09:00:00.000Z');

describe('categoriesRepo', () => {
  let storage: TestStorage;
  let repo: CategoriesRepo;
  let txs: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = categoriesRepo(storage.db);
    txs = transactionsRepo(storage.db);
    // The витрати below need an account to come out of; the category is what they are about.
    accountsRepo(storage.db).save(card);
  });

  afterEach(() => {
    storage.close();
  });

  /** A витрата of 125.50 in `categoryId`, so a rename or an archive has history to keep. */
  function spend(id: string, categoryId: string): void {
    txs.save(
      expenseByDefault({
        id,
        date: '2026-03-10',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId,
      }),
      storedAt,
    );
  }

  function storedExpense(id: string): Expense {
    const stored = txs.get(id);
    if (stored?.type !== 'expense') {
      throw new Error(`transaction ${id} is not a витрата`);
    }
    return stored;
  }

  it('Scenario: A created category is available', () => {
    repo.create({ id: 'repairs', name: 'Ремонт' });

    expect(repo.get('repairs')).toEqual({ id: 'repairs', name: 'Ремонт', archived: false });
    expect(activeCategories(repo.list()).map((c) => c.name)).toContain('Ремонт');
  });

  it("Scenario: A rename keeps the row's history", () => {
    repo.create({ id: 'groceries', name: 'Groceries' });
    spend('e1', 'groceries');

    repo.rename('groceries', 'Продукти');

    expect(repo.get('groceries')).toEqual({ id: 'groceries', name: 'Продукти', archived: false });
    expect(storedExpense('e1').categoryId).toBe('groceries');
    expect(namesById(repo.list()).get('groceries')).toBe('Продукти');
  });

  it('Scenario: An empty name is rejected', () => {
    expect(() => repo.create({ id: 'blank', name: '   ' })).toThrow(/порожньою/);

    expect(repo.get('blank')).toBeUndefined();
  });

  it('Scenario: A duplicate name is rejected', () => {
    repo.create({ id: 'pets', name: 'Pets' });

    // Trimmed before it is compared, so the padding does not buy a second row either.
    expect(() => repo.create({ id: 'pets-2', name: ' Pets ' })).toThrow(/вже існує/);
    expect(repo.get('pets-2')).toBeUndefined();
  });

  it('Scenario: An archived category leaves the picker', () => {
    repo.create({ id: 'pets', name: 'Pets' });

    repo.archive('pets');

    expect(activeCategories(repo.list()).map((c) => c.id)).not.toContain('pets');
    expect(repo.list().map((c) => c.id)).toContain('pets');
  });

  it('Scenario: An archived category keeps its history', () => {
    repo.create({ id: 'pets', name: 'Pets' });
    spend('e1', 'pets');

    repo.archive('pets');

    expect(storedExpense('e1').categoryId).toBe('pets');
    expect(namesById(repo.list()).get('pets')).toBe('Pets');
    expect(repo.get('pets')?.archived).toBe(true);
  });

  it('Scenario: An unarchived category returns to the picker', () => {
    repo.create({ id: 'pets', name: 'Pets' });
    repo.archive('pets');

    repo.unarchive('pets');

    expect(activeCategories(repo.list()).map((c) => c.id)).toContain('pets');
  });

  it('Scenario: Unarchiving into a name collision is rejected', () => {
    repo.create({ id: 'pets', name: 'Pets' });
    repo.archive('pets');
    repo.create({ id: 'pets-2', name: 'Pets' });

    expect(() => repo.unarchive('pets')).toThrow(/вже існує/);
    expect(repo.get('pets')?.archived).toBe(true);
  });

  it('Scenario: Renaming a reserved row is rejected', () => {
    expect(() => repo.rename(UNCATEGORISED_CATEGORY_ID, 'Інше')).toThrow(/службова/);

    expect(repo.get(UNCATEGORISED_CATEGORY_ID)?.name).toBe('Без категорії');
  });

  it('Scenario: Archiving a reserved row is rejected', () => {
    expect(() => repo.archive(FEES_CATEGORY_ID)).toThrow(/службова/);

    expect(activeCategories(repo.list()).map((c) => c.id)).toContain(FEES_CATEGORY_ID);
  });

  it('A name an archived row carries is free to take — the rule is "another unarchived row"', () => {
    repo.create({ id: 'pets', name: 'Pets' });
    repo.archive('pets');

    expect(repo.create({ id: 'pets-2', name: 'Pets' })).toEqual({
      id: 'pets-2',
      name: 'Pets',
      archived: false,
    });
  });

  it('A rename that only recases its own name does not collide with itself', () => {
    repo.create({ id: 'pets', name: 'Pets' });

    repo.rename('pets', ' PETS ');

    expect(repo.get('pets')?.name).toBe('PETS');
  });

  it('A rename onto another unarchived name is rejected', () => {
    repo.create({ id: 'pets', name: 'Pets' });
    repo.create({ id: 'health', name: 'Health' });

    expect(() => repo.rename('health', 'Pets')).toThrow(/вже існує/);
    expect(repo.get('health')?.name).toBe('Health');
  });

  it('Operating on a category that has no row is rejected', () => {
    expect(() => repo.rename('ghost', 'Привид')).toThrow(/не існує/);
    expect(() => repo.archive('ghost')).toThrow(/не існує/);
    expect(() => repo.unarchive('ghost')).toThrow(/не існує/);
    expect(repo.get('ghost')).toBeUndefined();
  });

  it('Both listings come back ordered by name', () => {
    repo.create({ id: 'bills', name: 'Bills' });
    repo.create({ id: 'auto', name: 'Auto' });

    const all = repo.list().map((c) => c.name);
    expect(all).toEqual([...all].sort());
    expect(all.indexOf('Auto')).toBeLessThan(all.indexOf('Bills'));

    const active = activeCategories(repo.list()).map((c) => c.name);
    expect(active).toEqual([...active].sort());
  });
});

describe('categoriesRepo — what the mutation tests found missing', () => {
  let storage: TestStorage;
  let repo: CategoriesRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = categoriesRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A name an archived row carries is free to take, and the new row is really stored', () => {
    // The rule is "another *unarchived* row", so this is the branch that makes archiving useful:
    // the owner puts Pets away and starts a new one under the same name. Read the row back out of
    // storage — `create` returns a value it built from its own arguments, which proves nothing.
    repo.create({ id: 'pets', name: 'Pets' });
    repo.archive('pets');

    repo.create({ id: 'pets-2', name: 'Pets' });

    expect(repo.get('pets-2')).toEqual({ id: 'pets-2', name: 'Pets', archived: false });
    expect(repo.get('pets')).toEqual({ id: 'pets', name: 'Pets', archived: true });
    expect(activeCategories(repo.list()).map((c) => c.id)).toContain('pets-2');
    expect(activeCategories(repo.list()).map((c) => c.id)).not.toContain('pets');
  });

  it('Scenario: An empty name is rejected — on a rename as much as on a create', () => {
    // The rule is about stored names, not about one entry point: a rename to spaces would empty
    // the row's name and leave the management list showing a gap.
    repo.create({ id: 'pets', name: 'Pets' });

    expect(() => repo.rename('pets', '   ')).toThrow('порожньою');

    expect(repo.get('pets')?.name).toBe('Pets');
  });

  it('Two rows sharing a name come back in a fixed order, not SQLite\'s', () => {
    repo.create({ id: 'pets-b', name: 'Pets' });
    repo.archive('pets-b');
    repo.create({ id: 'pets-a', name: 'Pets' });

    const twice = [repo.list(), repo.list()].map((rows) =>
      rows.filter((c) => c.name === 'Pets').map((c) => c.id),
    );
    expect(twice[0]).toEqual(['pets-a', 'pets-b']);
    expect(twice[1]).toEqual(twice[0]);
  });
});
