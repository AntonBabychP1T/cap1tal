import { describe, expect, it } from 'vitest';

import type { Category, Source } from '../domain/category';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Transaction,
} from '../domain/transaction';
import { money } from '../domain/money';
import {
  categoryChoicesFor,
  expenseCategoryChoices,
  recentRows,
  recentlyUsed,
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
  { id: INTEREST_SOURCE_ID, name: 'Відсотки', archived: false },
  { id: UNSOURCED_SOURCE_ID, name: 'Без джерела', archived: false },
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
    expect(ids(sourceChoices(sources))).toEqual(['batky', INTEREST_SOURCE_ID, 'salary']);
    // …while the дохід that already carries Freelance keeps showing it.
    expect(ids(sourceChoicesFor(sources, 'freelance'))).toEqual([
      'batky',
      INTEREST_SOURCE_ID,
      'salary',
      'freelance',
    ]);
  });

  it('A дохід on an unarchived джерело is offered exactly the unarchived джерела', () => {
    expect(ids(sourceChoicesFor(sources, 'salary'))).toEqual([
      'batky',
      INTEREST_SOURCE_ID,
      'salary',
    ]);
  });

  it('Scenario: An accepted відсотки proposal lands in the seeded row', () => {
    // «Відсотки» is reserved and still an ordinary choice: the owner records interest by hand as
    // well as accepting the proposal, so the picker has to hold it.
    expect(ids(sourceChoices(sources))).toContain(INTEREST_SOURCE_ID);
    expect(ids(sourceChoicesFor(sources, INTEREST_SOURCE_ID))).toContain(INTEREST_SOURCE_ID);
  });

  it('Scenario: App-only rows exist but are never pickable', () => {
    // Both are rows of the owner's lists — a stored коригування and an imported arrival resolve
    // to them and display their names…
    expect(ids(categories)).toContain(CORRECTION_CATEGORY_ID);
    expect(ids(sources)).toContain(UNSOURCED_SOURCE_ID);
    // …and neither picker offers either.
    expect(ids(expenseCategoryChoices(categories))).not.toContain(CORRECTION_CATEGORY_ID);
    expect(ids(sourceChoices(sources))).not.toContain(UNSOURCED_SOURCE_ID);
  });

  it('Scenario: An imported arrival lands in the seeded row — and stays out of the picker', () => {
    // The дохід an import stored really does carry «Без джерела», unlike a коригування, which
    // carries no category id at all. So the carried-row exception is what has to refuse it: the
    // picker opens with nothing selected, which is the question the owner has to answer.
    expect(ids(sourceChoicesFor(sources, UNSOURCED_SOURCE_ID))).not.toContain(UNSOURCED_SOURCE_ID);
    expect(ids(sourceChoicesFor(sources, UNSOURCED_SOURCE_ID))).toEqual(ids(sourceChoices(sources)));
  });
});

/** A feed as `listLatest` hands it over: newest first. */
const spent = (id: string, categoryId: string): Transaction => ({
  type: 'expense',
  id,
  date: '2026-09-01',
  accountId: 'card',
  amount: money(12000, 'UAH'),
  categoryId,
});
const earned = (id: string, sourceId: string): Transaction => ({
  type: 'income',
  id,
  date: '2026-09-01',
  accountId: 'card',
  amount: money(500000, 'UAH'),
  sourceId,
});

describe('recentlyUsed', () => {
  it('Scenario: The last used категорія is one tap away', () => {
    // Newest first: Groceries again, then Eating out, then Groceries.
    const feed = [
      spent('e3', 'groceries'),
      spent('e2', 'eating-out'),
      spent('e1', 'groceries'),
    ];

    const recent = recentlyUsed(feed, 5);

    // Each named once, most recently used first.
    expect(recent.categories).toEqual(['groceries', 'eating-out']);

    const offered = expenseCategoryChoices(categories);
    expect(recentRows(recent.categories, offered).map((c) => c.name)).toEqual([
      'Groceries',
      'Eating out',
    ]);
    // The full list is still reachable, unchanged.
    expect(offered.map((c) => c.id)).toContain('groceries');
    expect(offered.map((c) => c.id)).toContain('eating-out');
  });

  it('Scenario: An archived категорія is not resurrected by having been used', () => {
    const recent = recentlyUsed([spent('e1', 'pets')], 5);

    expect(recent.categories).toEqual(['pets']);
    // «Pets» is archived, so neither list offers it — one rule, `expenseCategoryChoices`'s.
    const offered = expenseCategoryChoices(categories);
    expect(recentRows(recent.categories, offered)).toEqual([]);
    expect(offered.map((c) => c.id)).not.toContain('pets');
  });

  it('Scenario: A fresh device offers only the full list', () => {
    const recent = recentlyUsed([], 5);

    expect(recent).toEqual({ categories: [], sources: [] });
    expect(recentRows(recent.categories, expenseCategoryChoices(categories))).toEqual([]);
  });

  it('Джерела are read the same way, off the доходи', () => {
    const feed = [earned('i2', 'batky'), earned('i1', 'salary'), spent('e1', 'groceries')];

    const recent = recentlyUsed(feed, 5);

    expect(recent.sources).toEqual(['batky', 'salary']);
    expect(recentRows(recent.sources, sourceChoices(sources)).map((s) => s.id)).toEqual([
      'batky',
      'salary',
    ]);
    // An archived джерело is out of both lists, exactly as an archived категорія is.
    expect(recentRows(['freelance'], sourceChoices(sources))).toEqual([]);
  });

  it('«Без джерела» is not offered by having been imported onto', () => {
    const recent = recentlyUsed([earned('i1', UNSOURCED_SOURCE_ID)], 5);

    expect(recent.sources).toEqual([UNSOURCED_SOURCE_ID]);
    expect(recentRows(recent.sources, sourceChoices(sources))).toEqual([]);
  });

  it('A переказ and a коригування carry neither, so they name nothing', () => {
    const feed: Transaction[] = [
      {
        type: 'transfer',
        id: 't1',
        date: '2026-09-01',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(10000, 'UAH'),
        arrived: money(10000, 'UAH'),
      },
      {
        type: 'correction',
        id: 'c1',
        date: '2026-09-01',
        accountId: 'card',
        amount: money(-2000, 'UAH'),
      },
    ];

    expect(recentlyUsed(feed, 5)).toEqual({ categories: [], sources: [] });
  });

  it('A повернення names its категорія like a витрата', () => {
    const feed: Transaction[] = [
      {
        type: 'refund',
        id: 'r1',
        date: '2026-09-01',
        accountId: 'card',
        amount: money(-5000, 'UAH'),
        categoryId: 'eating-out',
      },
    ];

    expect(recentlyUsed(feed, 5).categories).toEqual(['eating-out']);
  });

  it('The row is bounded: only the last few are a shortcut', () => {
    const feed = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => spent(`e${index}`, id));

    expect(recentlyUsed(feed, 5).categories).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
