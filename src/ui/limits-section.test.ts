import { describe, expect, it } from 'vitest';

import type { Category } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import { CORRECTION_CATEGORY_ID, FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import {
  DEFAULT_LIMIT_CURRENCY,
  LIMIT_CURRENCIES,
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
      limit: '2500,00 UAH',
      archived: false,
    });
  });

  it('Scenario: A set ліміт is carried by its category', () => {
    const limits: CategoryLimit[] = [{ categoryId: 'groceries', amount: money(250000, 'UAH') }];
    const rows = limitRows({ categories: CATEGORIES, limits });

    expect(rowFor(rows, 'groceries')?.limit).toBe('2500,00 UAH');
    // And no other category picked it up.
    expect(rowFor(rows, 'travel')?.limit).toBeNull();
  });

  it('Scenario: Setting again replaces the ліміт', () => {
    const after: CategoryLimit[] = [{ categoryId: 'groceries', amount: money(300000, 'UAH') }];

    const rows = limitRows({ categories: CATEGORIES, limits: after });

    expect(rows.filter((row) => row.categoryId === 'groceries')).toHaveLength(1);
    expect(rowFor(rows, 'groceries')?.limit).toBe('3000,00 UAH');
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

    expect(rowFor(before, 'groceries')?.limit).toBe('2500,00 UAH');
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

    expect(rowFor(rows, UNCATEGORISED_CATEGORY_ID)?.limit).toBe('1000,00 UAH');
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
