import { describe, expect, it } from 'vitest';

import type { Category, Source } from '../domain/category';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';
import {
  categoryChoicesFor,
  expenseCategoryChoices,
  sourceChoices,
  sourceChoicesFor,
} from './category-choices';

// The three reserved rows plus a slice of the starter set, deliberately unsorted so the order the
// picker shows is the module's doing and not the storage order's.
const categories: readonly Category[] = [
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false },
  { id: 'groceries', name: 'Groceries', archived: false },
  { id: CORRECTION_CATEGORY_ID, name: 'Коригування', archived: false },
  { id: 'pets', name: 'Pets', archived: true },
  { id: 'eating-out', name: 'Eating out', archived: false },
  { id: FEES_CATEGORY_ID, name: 'Комісія', archived: false },
];

const sources: readonly Source[] = [
  { id: 'salary', name: 'Salary', archived: false },
  { id: 'freelance', name: 'Freelance', archived: true },
  { id: 'batky', name: 'батьки', archived: false },
];

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('expenseCategoryChoices', () => {
  it('Scenario: Archived categories are not offered', () => {
    expect(ids(expenseCategoryChoices(categories))).not.toContain('pets');
  });

  it('Scenario: «Коригування» is not offered', () => {
    const offered = ids(expenseCategoryChoices(categories));
    expect(offered).not.toContain(CORRECTION_CATEGORY_ID);
    // …while the other two reserved rows are choices like any other.
    expect(offered).toContain(FEES_CATEGORY_ID);
    expect(offered).toContain(UNCATEGORISED_CATEGORY_ID);
  });

  it('Scenario: «Коригування» exists but is never pickable', () => {
    // It is in the list the owner keeps — it has to be, a stored коригування resolves to it —
    // and still no picker offers it.
    expect(ids(categories)).toContain(CORRECTION_CATEGORY_ID);
    expect(ids(expenseCategoryChoices(categories))).not.toContain(CORRECTION_CATEGORY_ID);
  });

  it('Scenario: An archived category leaves the picker', () => {
    const withPets = categories.map((c) => (c.id === 'pets' ? { ...c, archived: false } : c));
    expect(ids(expenseCategoryChoices(withPets))).toContain('pets');

    const archived = withPets.map((c) => (c.id === 'pets' ? { ...c, archived: true } : c));
    expect(ids(expenseCategoryChoices(archived))).not.toContain('pets');
  });

  it('Scenario: An unarchived category returns to the picker', () => {
    const unarchived = categories.map((c) => (c.id === 'pets' ? { ...c, archived: false } : c));
    expect(ids(expenseCategoryChoices(unarchived))).toEqual([
      UNCATEGORISED_CATEGORY_ID,
      FEES_CATEGORY_ID,
      'eating-out',
      'groceries',
      'pets',
    ]);
  });

  it('«Без категорії» leads the витрата list, the rest in Ukrainian order', () => {
    // Ukrainian orders Cyrillic before Latin, so «Комісія» comes ahead of the English rows —
    // and «Без категорії» ahead of everything, being what a витрата arrives carrying.
    expect(ids(expenseCategoryChoices(categories))).toEqual([
      UNCATEGORISED_CATEGORY_ID,
      FEES_CATEGORY_ID,
      'eating-out',
      'groceries',
    ]);
  });
});

describe('categoryChoicesFor', () => {
  it('A витрата stored on an archived category keeps it in its picker', () => {
    // Opening the витрата must not move it off Pets behind the owner's back…
    expect(ids(categoryChoicesFor(categories, 'pets'))).toEqual([
      UNCATEGORISED_CATEGORY_ID,
      FEES_CATEGORY_ID,
      'eating-out',
      'groceries',
      'pets',
    ]);
    // …while every other transaction's picker is still without it.
    expect(ids(categoryChoicesFor(categories, 'groceries'))).not.toContain('pets');
  });

  it('Scenario: «Коригування» exists but is never pickable — not even as a carried row', () => {
    // The carried-row exception exists for an archived категорія; «Коригування» is excluded from
    // it by name, so no argument puts it in a picker. A коригування could not ask for one anyway:
    // it stores no category id at all — the domain fixes its category — which is why the second
    // half of the scenario, that a stored коригування still resolves to and displays it, belongs
    // to `categoryLabel` (labels.test.ts) and not here.
    expect(ids(categoryChoicesFor(categories, CORRECTION_CATEGORY_ID))).not.toContain(
      CORRECTION_CATEGORY_ID,
    );
    expect(ids(categoryChoicesFor(categories, undefined))).not.toContain(CORRECTION_CATEGORY_ID);
    expect(ids(expenseCategoryChoices(categories))).not.toContain(CORRECTION_CATEGORY_ID);
    // …while it does exist in the list the picker is built from.
    expect(categories.map((c) => c.id)).toContain(CORRECTION_CATEGORY_ID);
  });

  it('A category id that no longer exists adds nothing to the picker', () => {
    expect(ids(categoryChoicesFor(categories, 'gone'))).toEqual(
      ids(expenseCategoryChoices(categories)),
    );
  });
});

describe('sourceChoices', () => {
  it('Scenario: An archived source is not offered as a джерело', () => {
    // Recording a дохід is offered the unarchived джерела, in Ukrainian order…
    expect(ids(sourceChoices(sources))).toEqual(['batky', 'salary']);
    // …while the дохід that already carries Freelance keeps showing it.
    expect(ids(sourceChoicesFor(sources, 'freelance'))).toEqual(['batky', 'salary', 'freelance']);
  });

  it('A дохід on an unarchived джерело is offered exactly the unarchived джерела', () => {
    expect(ids(sourceChoicesFor(sources, 'salary'))).toEqual(['batky', 'salary']);
  });
});
