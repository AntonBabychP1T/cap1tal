import { describe, expect, it } from 'vitest';

import type { Category } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import { CORRECTION_CATEGORY_ID, FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import {
  spendingFromDraft,
  spendingGoalCategoryChoices,
  spendingGoalRows,
} from './goals-section';
import {
  DEFAULT_LIMIT_CURRENCY,
  LIMIT_CURRENCIES,
  LIMIT_IS_A_SPENDING_GOAL,
  limitFromDraft,
  limitRows,
} from './limits-section';

const category = (id: string, name: string, archived = false): Category => ({ id, name, archived });

const groceries = category('groceries', 'Groceries');
const travel = category('travel', 'Travel');
const pets = category('pets', 'Pets');
const uncategorised = category(UNCATEGORISED_CATEGORY_ID, 'Без категорії');

const CATEGORIES = [groceries, travel, pets, uncategorised];

const rowFor = (rows: ReturnType<typeof limitRows>, id: string) =>
  rows.find((row) => row.categoryId === id);

describe('limitRows', () => {
  it('Scenario: A set ліміт appears with its category', () => {
    // "2500" in UAH, through the same parsing recording uses.
    const limit = limitFromDraft('groceries', { amount: '2500', currency: 'UAH' });

    expect(limit).toEqual({ categoryId: 'groceries', amount: money(250000, 'UAH') });
    expect(rowFor(limitRows({ categories: CATEGORIES, limits: [limit] }), 'groceries')).toEqual({
      categoryId: 'groceries',
      name: 'Groceries',
      limit: '2 500,00 UAH',
      archived: false,
    });
  });

  it('Scenario: A set ліміт is carried by its category', () => {
    const limits: CategoryLimit[] = [{ categoryId: 'groceries', amount: money(250000, 'UAH') }];
    const rows = limitRows({ categories: CATEGORIES, limits });

    expect(rowFor(rows, 'groceries')?.limit).toBe('2 500,00 UAH');
    // And no other category picked it up.
    expect(rowFor(rows, 'travel')?.limit).toBeNull();
  });

  it('Scenario: Setting again replaces the ліміт', () => {
    const after: CategoryLimit[] = [{ categoryId: 'groceries', amount: money(300000, 'UAH') }];

    const rows = limitRows({ categories: CATEGORIES, limits: after });

    expect(rows.filter((row) => row.categoryId === 'groceries')).toHaveLength(1);
    expect(rowFor(rows, 'groceries')?.limit).toBe('3 000,00 UAH');
  });

  it('Scenario: A cleared ліміт leaves the category listed', () => {
    const rows = limitRows({ categories: CATEGORIES, limits: [] });

    expect(rowFor(rows, 'groceries')).toEqual({
      categoryId: 'groceries',
      name: 'Groceries',
      limit: null,
      archived: false,
    });
  });

  it('Scenario: A cleared ліміт is gone', () => {
    const before = limitRows({
      categories: CATEGORIES,
      limits: [{ categoryId: 'groceries', amount: money(250000, 'UAH') }],
    });
    const after = limitRows({ categories: CATEGORIES, limits: [] });

    expect(rowFor(before, 'groceries')?.limit).toBe('2 500,00 UAH');
    expect(rowFor(after, 'groceries')?.limit).toBeNull();
  });

  it('Scenario: A ліміт can be set in another offered currency', () => {
    const limit = limitFromDraft('travel', { amount: '100', currency: 'USD' });

    expect(limit).toEqual({ categoryId: 'travel', amount: money(10000, 'USD') });
    expect(rowFor(limitRows({ categories: CATEGORIES, limits: [limit] }), 'travel')?.limit).toBe(
      '100,00 USD',
    );
    // The currency is shown next to the сума, so a ліміт in a currency the category is never spent
    // in is visible where it was set.
    expect(LIMIT_CURRENCIES).toEqual(['UAH', 'EUR', 'USD']);
    expect(DEFAULT_LIMIT_CURRENCY).toBe('UAH');
  });

  it('Scenario: A non-positive ліміт is rejected', () => {
    expect(() => limitFromDraft('groceries', { amount: '0', currency: 'UAH' })).toThrow();
    expect(() => limitFromDraft('groceries', { amount: '-100', currency: 'UAH' })).toThrow();
    expect(() => limitFromDraft('groceries', { amount: '', currency: 'UAH' })).toThrow();
    expect(() => limitFromDraft('groceries', { amount: 'дві тисячі', currency: 'UAH' })).toThrow();
    expect(() => limitFromDraft('groceries', { amount: '100', currency: 'GBP' })).toThrow();
  });

  it('Scenario: A reserved category may carry a ліміт', () => {
    const limit = limitFromDraft(UNCATEGORISED_CATEGORY_ID, { amount: '1000', currency: 'UAH' });
    const rows = limitRows({
      categories: [...CATEGORIES, category(FEES_CATEGORY_ID, 'Комісія'), category(CORRECTION_CATEGORY_ID, 'Коригування')],
      limits: [limit],
    });

    expect(rowFor(rows, UNCATEGORISED_CATEGORY_ID)?.limit).toBe('1 000,00 UAH');
    // The reserved rows are listed like any other: a ліміт is a ceiling, not an edit.
    expect(rows.map((row) => row.categoryId)).toContain(FEES_CATEGORY_ID);
    expect(rows.map((row) => row.categoryId)).toContain(CORRECTION_CATEGORY_ID);
  });

  it('Scenario: An archived category with a ліміт stays visible', () => {
    const archivedPets = category('pets', 'Pets', true);
    const archivedBooks = category('books', 'Books', true);
    const limits: CategoryLimit[] = [{ categoryId: 'pets', amount: money(50000, 'UAH') }];

    const rows = limitRows({
      categories: [groceries, archivedPets, archivedBooks],
      limits,
    });

    expect(rowFor(rows, 'pets')).toEqual({
      categoryId: 'pets',
      name: 'Pets',
      limit: '500,00 UAH',
      archived: true,
    });
    // An archived category with no ліміт is not listed at all.
    expect(rowFor(rows, 'books')).toBeUndefined();
    // And the archived one comes after the live ones, set apart by its flag.
    expect(rows.map((row) => row.categoryId)).toEqual(['groceries', 'pets']);
  });

  it('Scenario: Archiving keeps the ліміт', () => {
    const limits: CategoryLimit[] = [{ categoryId: 'pets', amount: money(50000, 'UAH') }];

    const before = limitRows({ categories: [pets], limits });
    const after = limitRows({ categories: [category('pets', 'Pets', true)], limits });

    expect(before[0]!.limit).toBe('500,00 UAH');
    expect(after[0]!.limit).toBe('500,00 UAH');
    expect(after[0]!.archived).toBe(true);
  });

  it('The live categories are listed in Ukrainian order, whatever order they arrived in', () => {
    const rows = limitRows({
      categories: [travel, uncategorised, groceries],
      limits: [],
    });

    expect(rows.map((row) => row.name)).toEqual(['Без категорії', 'Groceries', 'Travel']);
  });
});

describe('a ліміт and the ціль витрат of its категорія are one thing', () => {
  const categories: Category[] = [
    { id: 'groceries', name: 'Groceries', archived: false },
    { id: 'restaurants', name: 'Ресторани', archived: false },
  ];

  /**
   * The one stored row, as both screens see it. A `Map` and not two lists, because that is exactly
   * the claim: there is one сума per категорія and both names read it.
   */
  const stored = (entries: readonly CategoryLimit[]) => [...entries];

  it('Scenario: A ліміт set here is a ціль витрат there', () => {
    const limits = stored([limitFromDraft('groceries', { amount: '2500', currency: 'UAH' })]);

    expect(limitRows({ categories, limits })).toContainEqual({
      categoryId: 'groceries',
      name: 'Groceries',
      limit: '2 500,00 UAH',
      archived: false,
    });
    expect(spendingGoalRows({ limits, categories })).toEqual([
      {
        kind: 'spending',
        categoryId: 'groceries',
        name: 'Groceries',
        ceiling: '2 500,00 UAH',
        period: 'Календарний місяць',
        archived: false,
      },
    ]);
  });

  it('Scenario: One сума, whichever name it is set under', () => {
    // Typed in «Ліміти» and typed in «Цілі» — the same value, because it is the same function's
    // output shape reaching the same one row.
    expect(limitFromDraft('groceries', { amount: '2500', currency: 'UAH' })).toEqual(
      spendingFromDraft({ categoryId: 'groceries', amount: '2500', currency: 'UAH' }),
    );
  });

  it('Scenario: Changing under one name changes under the other', () => {
    const limits = stored([spendingFromDraft({ categoryId: 'groceries', amount: '3000', currency: 'UAH' })]);

    expect(
      limitRows({ categories, limits }).find((row) => row.categoryId === 'groceries')?.limit,
    ).toBe('3 000,00 UAH');
    expect(spendingGoalRows({ limits, categories })[0]?.ceiling).toBe('3 000,00 UAH');
  });

  it('Scenario: Clearing removes both readings', () => {
    const limits: CategoryLimit[] = [];

    // The категорія is still listed under «Ліміти», now with none…
    // In the section's own Ukrainian order, both still listed and both now carrying none.
    expect(limitRows({ categories, limits })).toEqual([
      { categoryId: 'restaurants', name: 'Ресторани', limit: null, archived: false },
      { categoryId: 'groceries', name: 'Groceries', limit: null, archived: false },
    ]);
    // …and no ціль витрат remains among the цілі.
    expect(spendingGoalRows({ limits, categories })).toEqual([]);
  });

  it('Scenario: A cleared ліміт leaves the category listed', () => {
    const before = stored([limitFromDraft('groceries', { amount: '2500', currency: 'UAH' })]);
    const after = before.filter((limit) => limit.categoryId !== 'groceries');

    expect(limitRows({ categories, limits: after }).map((row) => row.categoryId)).toContain(
      'groceries',
    );
    expect(
      limitRows({ categories, limits: after }).find((row) => row.categoryId === 'groceries')?.limit,
    ).toBeNull();
    expect(spendingGoalRows({ limits: after, categories })).toEqual([]);
  });

  it('Scenario: A категорія cannot hold two ceilings', () => {
    const limits = stored([limitFromDraft('groceries', { amount: '2500', currency: 'UAH' })]);

    // Exactly one ціль витрат for it, of exactly that сума…
    const rows = spendingGoalRows({ limits, categories });
    expect(rows.filter((row) => row.categoryId === 'groceries')).toHaveLength(1);
    // …and no way to give the ціль a different one, because the form does not offer a категорія
    // that already carries a ліміт: its ціль витрат exists and is edited where it stands.
    expect(spendingGoalCategoryChoices({ categories, limits }).map((c) => c.id)).toEqual([
      'restaurants',
    ]);
  });

  it('The section says the two are one, so the owner is not left to discover it', () => {
    expect(LIMIT_IS_A_SPENDING_GOAL).toContain('ціль витрат');
    expect(LIMIT_IS_A_SPENDING_GOAL).toContain('Цілях');
  });
});
