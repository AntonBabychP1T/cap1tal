import { describe, expect, it } from 'vitest';

import {
  activeCategories,
  activeSources,
  isReservedCategory,
  isReservedSource,
  namesById,
  RESERVED_CATEGORY_IDS,
  RESERVED_SOURCE_IDS,
  type Category,
  type Source,
} from './category';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
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

  it('The reserved джерела are «Відсотки» and «Без джерела»', () => {
    expect([...RESERVED_SOURCE_IDS].sort()).toEqual(
      [INTEREST_SOURCE_ID, UNSOURCED_SOURCE_ID].sort(),
    );
    expect(isReservedSource('salary')).toBe(false);
    // The two lists are separate namespaces: an id reserved in one is ordinary in the other.
    expect(isReservedCategory(INTEREST_SOURCE_ID)).toBe(false);
    expect(isReservedCategory(UNSOURCED_SOURCE_ID)).toBe(false);
  });

  it('Scenario: The reserved джерело may be neither renamed nor archived', () => {
    // Reservedness is what the list repository refuses a rename and an archive on, and it is
    // exactly "the id is one of these" — `sources-repo.test.ts` proves the refusals themselves.
    expect(isReservedSource(INTEREST_SOURCE_ID)).toBe(true);
  });

  it('Scenario: The imported-arrival source may be neither edited nor picked', () => {
    // The same refusal as «Відсотки»…
    expect(isReservedSource(UNSOURCED_SOURCE_ID)).toBe(true);
    // …and, unlike it, never an offer: `category-choices.test.ts` proves the picker half.
    const unsourced: Source = { id: UNSOURCED_SOURCE_ID, name: 'Без джерела', archived: false };
    expect(activeSources([salary, unsourced])).toContain(unsourced);
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
