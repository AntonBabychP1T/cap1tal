import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { categoryBreakdown } from '../domain/monthly-picture';
import { money } from '../domain/money';
import {
  expenseByDefault,
  proposeFee,
  transfer,
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Expense,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { categories, sources } from './schema';
import { seedStarterSet } from './seed';
import { openFileDb, openTestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/**
 * The names the categories spec lists, spelled out here rather than read from `starter-set.ts`:
 * the spec is the truth and the module is one representation of it, so a test that read the
 * module would prove only that the module equals itself.
 */
const SPEC_CATEGORY_NAMES = [
  'Home',
  'COFFEE ☕',
  'Groceries',
  'Entertainment',
  'Family care',
  'Transport',
  'Travel',
  'Bills',
  'Gifts',
  'Eating out',
  'Food Delivery',
  'KrayShop',
  'Digital',
  'Electronics',
  'сімейний бюджет',
  'Clothing',
  'Health',
  'book',
  'Pets',
  'Other expense',
  'Charity',
  'Education',
  'habits',
  'булка',
  'Services',
  'Без категорії',
  'Комісія',
  'Коригування',
];

const SPEC_SOURCE_NAMES = [
  'Salary',
  'salary Mono',
  'Freelance',
  'степендія',
  'батьки',
  'батьки — Андрій',
  'батьки — Лена',
  'Оліни батьки',
  'KrayShop',
  'Gifts',
  'інвестиції',
  'Other income',
];

describe('seedStarterSet', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A fresh install holds the starter set', () => {
    seedStarterSet(storage.db);

    const storedCategories = storage.db.select().from(categories).all();
    const storedSources = storage.db.select().from(sources).all();

    expect(new Set(storedCategories.map((c) => c.name))).toEqual(new Set(SPEC_CATEGORY_NAMES));
    expect(new Set(storedSources.map((s) => s.name))).toEqual(new Set(SPEC_SOURCE_NAMES));
    // The reserved rows are part of the list, under the ids the domain's transactions carry.
    for (const [id, name] of [
      [UNCATEGORISED_CATEGORY_ID, 'Без категорії'],
      [FEES_CATEGORY_ID, 'Комісія'],
      [CORRECTION_CATEGORY_ID, 'Коригування'],
    ] as const) {
      expect(storedCategories.find((c) => c.id === id)?.name).toBe(name);
    }
    // Lending is a переказ onto a рахунок-борг, so «Борг» is a category the app never has.
    expect(storedCategories.map((c) => c.name)).not.toContain('Борг');
    // Nothing arrives archived.
    expect(storedCategories.every((c) => !c.archived)).toBe(true);
    expect(storedSources.every((s) => !s.archived)).toBe(true);
  });
});

describe('seedStarterSet — across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-seed-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Opens the device database, runs the seed as the root layout does, and hands back the rows. */
  const reopen = <T>(read: (storage: TestStorage) => T): T => {
    const storage = openFileDb(join(dir, 'cap1tal.db'));
    try {
      seedStarterSet(storage.db);
      return read(storage);
    } finally {
      storage.close();
    }
  };

  it('Scenario: Reopening does not duplicate the starter set', () => {
    reopen(() => undefined);
    const rows = reopen((storage) => ({
      categories: storage.db.select().from(categories).all(),
      sources: storage.db.select().from(sources).all(),
    }));

    expect(rows.categories).toHaveLength(SPEC_CATEGORY_NAMES.length);
    expect(rows.sources).toHaveLength(SPEC_SOURCE_NAMES.length);
    expect(new Set(rows.categories.map((c) => c.id)).size).toBe(rows.categories.length);
    expect(new Set(rows.sources.map((s) => s.id)).size).toBe(rows.sources.length);
  });

  it("Scenario: The owner's rename survives reopening", () => {
    const groceries = reopen((storage) => {
      const row = storage.db.select().from(categories).where(eq(categories.name, 'Groceries')).get();
      storage.db.update(categories).set({ name: 'Продукти' }).where(eq(categories.id, row!.id)).run();
      return row!.id;
    });

    const after = reopen((storage) => storage.db.select().from(categories).all());

    expect(after.find((c) => c.id === groceries)?.name).toBe('Продукти');
    expect(after.filter((c) => c.name === 'Groceries')).toEqual([]);
    expect(after).toHaveLength(SPEC_CATEGORY_NAMES.length);
  });

  it("Scenario: The owner's archive survives reopening", () => {
    const habits = reopen((storage) => {
      const row = storage.db.select().from(categories).where(eq(categories.name, 'habits')).get();
      storage.db.update(categories).set({ archived: true }).where(eq(categories.id, row!.id)).run();
      return row!.id;
    });

    const after = reopen((storage) => storage.db.select().from(categories).all());

    expect(after.find((c) => c.id === habits)?.archived).toBe(true);
    expect(after.filter((c) => c.name === 'habits')).toHaveLength(1);
    expect(after).toHaveLength(SPEC_CATEGORY_NAMES.length);
  });
});

/**
 * The obligation domain-core recorded when it fixed the three reserved ids without a list to put
 * them in: every stored transaction that carries one resolves to a real row of the editable list.
 */
describe('The reserved category ids resolve to seeded rows', () => {
  let storage: TestStorage;
  const card = account({
    id: 'card',
    name: 'mono black',
    kind: 'spending',
    currency: 'UAH',
    openingBalance: money(100000, 'UAH'),
  });
  const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
  const storedAt = new Date('2026-08-10T09:00:00.000Z');

  /** The name the seeded list gives a category id — the resolution the screens perform. */
  const nameOf = (categoryId: string): string | undefined =>
    storage.db.select().from(categories).where(eq(categories.id, categoryId)).get()?.name;

  beforeEach(() => {
    storage = openTestDb();
    seedStarterSet(storage.db);
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(jar);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A коригування lands in the seeded correction row', () => {
    const correction: Correction = {
      type: 'correction',
      id: 'c1',
      date: '2026-08-31',
      accountId: 'card',
      amount: money(-3000, 'UAH'),
    };
    transactionsRepo(storage.db).save(correction, storedAt);

    const stored = transactionsRepo(storage.db).listMonth('2026-08');
    const breakdown = categoryBreakdown({ month: '2026-08', transactions: stored });
    const uah = breakdown.get('UAH')!;

    expect([...uah.keys()]).toEqual([CORRECTION_CATEGORY_ID]);
    expect(uah.get(CORRECTION_CATEGORY_ID)).toEqual(money(3000, 'UAH'));
    expect(nameOf(CORRECTION_CATEGORY_ID)).toBe('Коригування');
  });

  it('Scenario: A комісія lands in the seeded fees row', () => {
    // A same-currency переказ that arrived short, and the витрата it proposes — accepted.
    const short = transfer({
      id: 't1',
      date: '2026-08-15',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    const proposed = proposeFee(short)!;
    const fee: Expense = { ...proposed, id: 'fee-1' };
    transactionsRepo(storage.db).save(short, storedAt);
    transactionsRepo(storage.db).save(fee, storedAt);

    const stored = transactionsRepo(storage.db).get('fee-1');

    expect(stored).toMatchObject({ type: 'expense', categoryId: FEES_CATEGORY_ID });
    expect(nameOf(FEES_CATEGORY_ID)).toBe('Комісія');
  });

  it('Scenario: A default expense lands in the seeded uncategorised row', () => {
    // Recorded without picking a category — `expenseByDefault` is the one place that default lives.
    const spent = expenseByDefault({
      id: 'e1',
      date: '2026-08-10',
      accountId: 'card',
      amount: money(12550, 'UAH'),
    });
    transactionsRepo(storage.db).save(spent, storedAt);

    const stored = transactionsRepo(storage.db).get('e1');

    expect(stored).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
    expect(nameOf(UNCATEGORISED_CATEGORY_ID)).toBe('Без категорії');
  });
});
