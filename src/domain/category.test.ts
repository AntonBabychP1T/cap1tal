import { describe, expect, it } from 'vitest';

import {
  activeCategories,
  activeSources,
  isReservedCategory,
  namesById,
  RESERVED_CATEGORY_IDS,
  type Category,
  type Source,
} from './category';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from './transaction';

const groceries: Category = { id: 'groceries', name: 'Groceries', archived: false };
const pets: Category = { id: 'pets', name: 'Pets', archived: true };
const salary: Source = { id: 'salary', name: 'Salary', archived: false };
const freelance: Source = { id: 'freelance', name: 'Freelance', archived: true };

describe('the editable lists', () => {
  it('The reserved ids are exactly the three the domain fixes', () => {
    expect([...RESERVED_CATEGORY_IDS].sort()).toEqual(
      [UNCATEGORISED_CATEGORY_ID, FEES_CATEGORY_ID, CORRECTION_CATEGORY_ID].sort(),
    );
    for (const id of RESERVED_CATEGORY_IDS) {
      expect(isReservedCategory(id)).toBe(true);
    }
    expect(isReservedCategory('groceries')).toBe(false);
  });

  it('Scenario: An archived category leaves the picker', () => {
    expect(activeCategories([groceries, pets])).toEqual([groceries]);
  });

  it('Scenario: An archived source is not offered as a джерело', () => {
    expect(activeSources([salary, freelance])).toEqual([salary]);
  });

  it('A name map resolves a stored id', () => {
    const names = namesById([groceries, pets]);
    expect(names.get('groceries')).toBe('Groceries');
    expect(names.get('pets')).toBe('Pets');
    expect(names.get('nope')).toBeUndefined();
  });
});
