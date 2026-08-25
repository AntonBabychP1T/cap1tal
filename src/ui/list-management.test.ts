import { describe, expect, it } from 'vitest';

import type { Category, Source } from '../domain/category';
import type { Rule } from '../domain/rules';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';
import {
  manageCategories,
  manageSources,
  ruleFromDraft,
  ruleLine,
  type ManagedRow,
} from './list-management';

const category = (id: string, name: string, archived = false): Category => ({ id, name, archived });
const source = (id: string, name: string, archived = false): Source => ({ id, name, archived });

/** The screen finds a row by id; the tests do the same, and say so when it is not there. */
function rowFor(rows: readonly ManagedRow[], id: string): ManagedRow {
  const row = rows.find((r) => r.id === id);
  if (!row) {
    throw new Error(`the list does not hold "${id}"`);
  }
  return row;
}

const RESERVED = [
  category(UNCATEGORISED_CATEGORY_ID, 'Без категорії'),
  category(FEES_CATEGORY_ID, 'Комісія'),
  category(CORRECTION_CATEGORY_ID, 'Коригування'),
];

describe('manageCategories', () => {
  it('Scenario: An archived row is set apart, not gone', () => {
    const rows = manageCategories([
      category('home', 'Home'),
      category('pets', 'Pets', true),
      category('groceries', 'Groceries'),
    ]);

    // Pets is still listed — archiving hides it from pickers, not from Налаштування — and it sits
    // after the rows still in use, flagged, offering the way back instead of the way out.
    expect(rows.map((r) => r.id)).toEqual(['groceries', 'home', 'pets']);
    expect(rowFor(rows, 'pets')).toMatchObject({
      name: 'Pets',
      archived: true,
      canUnarchive: true,
      canArchive: false,
      canRename: true,
    });
    expect(rowFor(rows, 'home')).toMatchObject({ archived: false, canUnarchive: false });
  });

  it('Scenario: A reserved row offers no editing', () => {
    const rows = manageCategories([...RESERVED, category('home', 'Home')]);

    // «Без категорії» is shown like any other row…
    expect(rowFor(rows, UNCATEGORISED_CATEGORY_ID)).toMatchObject({
      name: 'Без категорії',
      reserved: true,
      canRename: false,
      canArchive: false,
      canUnarchive: false,
    });
    // …and so are the other two the domain fixes.
    expect(rows.filter((r) => r.reserved).map((r) => r.name)).toEqual(
      expect.arrayContaining(['Без категорії', 'Комісія', 'Коригування']),
    );
    expect(rows.filter((r) => r.canRename || r.canArchive).map((r) => r.id)).toEqual(['home']);
  });

  it('Unarchived rows come first, each group by name', () => {
    const rows = manageCategories([
      category('habits', 'habits', true),
      category('transport', 'Transport'),
      category('book', 'book', true),
      category('bills', 'Bills'),
    ]);

    expect(rows.map((r) => r.name)).toEqual(['Bills', 'Transport', 'book', 'habits']);
    expect(rows.map((r) => r.archived)).toEqual([false, false, true, true]);
  });

  it('An empty list manages nothing', () => {
    expect(manageCategories([])).toEqual([]);
  });
});

describe('manageSources', () => {
  it('Every ordinary джерело can be renamed and archived', () => {
    const rows = manageSources([
      source('freelance', 'Freelance', true),
      source('salary', 'Salary'),
      source('batky', 'батьки'),
    ]);

    // The uk collation puts Ukrainian names ahead of Latin ones — the owner's own list first.
    expect(rows.map((r) => r.name)).toEqual(['батьки', 'Salary', 'Freelance']);
    expect(rows.every((r) => !r.reserved && r.canRename)).toBe(true);
    expect(rowFor(rows, 'freelance')).toMatchObject({ canArchive: false, canUnarchive: true });
    expect(rowFor(rows, 'salary')).toMatchObject({ canArchive: true, canUnarchive: false });
  });

  it('Scenario: The reserved джерело may be neither renamed nor archived', () => {
    const rows = manageSources([
      source('salary', 'Salary'),
      source(INTEREST_SOURCE_ID, 'Відсотки'),
    ]);

    // Shown like any other row — the owner records interest by hand too — and editable by none.
    expect(rowFor(rows, INTEREST_SOURCE_ID)).toMatchObject({
      name: 'Відсотки',
      archived: false,
      reserved: true,
      canRename: false,
      canArchive: false,
      canUnarchive: false,
    });
    expect(rowFor(rows, 'salary')).toMatchObject({ reserved: false, canRename: true });
  });
});

const context = { id: 'r1', createdAt: new Date('2026-08-24T09:00:00.000Z') };
const groceries = new Map([['groceries', 'Groceries']]);

describe('ruleFromDraft', () => {
  it('Scenario: A created rule appears in the list', () => {
    // The owner types "сільпо → Groceries"; the trailing space they left is not part of it.
    const rule = ruleFromDraft(
      { merchant: ' сільпо ', mcc: '', categoryId: 'groceries' },
      context,
    );

    expect(rule).toEqual({
      id: 'r1',
      merchant: 'сільпо',
      categoryId: 'groceries',
      createdAt: context.createdAt,
    });
    expect(ruleLine(rule, groceries)).toEqual({
      id: 'r1',
      criteria: 'сільпо',
      category: 'Groceries',
    });
  });

  it('Scenario: A rule with no criterion is rejected', () => {
    expect(() =>
      ruleFromDraft({ merchant: '   ', mcc: '  ', categoryId: 'groceries' }, context),
    ).toThrow('Правило потребує продавця або MCC');
  });

  it('Scenario: An MCC that is not a whole number is rejected', () => {
    // '0x15', '1e3' and '-5' are here because `Number` would take all three for whole numbers,
    // and the MCC stored would then not be the one the owner typed.
    for (const mcc of ['54.11', '5411 грн', 'MCC', '0x15', '1e3', '-5', '+5411']) {
      expect(() =>
        ruleFromDraft({ merchant: 'сільпо', mcc, categoryId: 'groceries' }, context),
      ).toThrow('MCC — це число з цифр');
    }
    // A whole number is taken as the integer it is, beside the merchant.
    expect(
      ruleFromDraft({ merchant: 'сільпо', mcc: ' 5411 ', categoryId: 'groceries' }, context),
    ).toMatchObject({ merchant: 'сільпо', mcc: 5411 });
  });

  it('A rule with no category is rejected', () => {
    expect(() => ruleFromDraft({ merchant: 'сільпо', mcc: '' }, context)).toThrow(
      'Правило потребує категорії',
    );
    expect(() => ruleFromDraft({ merchant: 'сільпо', mcc: '', categoryId: '' }, context)).toThrow(
      'Правило потребує категорії',
    );
  });

  it('An MCC alone is criterion enough', () => {
    expect(ruleFromDraft({ merchant: '', mcc: '5411', categoryId: 'groceries' }, context)).toEqual({
      id: 'r1',
      mcc: 5411,
      categoryId: 'groceries',
      createdAt: context.createdAt,
    });
  });
});

describe('ruleLine', () => {
  const rule = (of: Partial<Rule>): Rule => ({
    id: 'r1',
    categoryId: 'groceries',
    createdAt: context.createdAt,
    merchant: 'сільпо',
    ...of,
  });

  it('A rule holding both criteria shows both', () => {
    expect(ruleLine(rule({ mcc: 5411 }), groceries).criteria).toBe('сільпо · MCC 5411');
  });

  it('An MCC-only rule shows just the MCC', () => {
    expect(ruleLine(rule({ merchant: undefined, mcc: 5411 }), groceries).criteria).toBe('MCC 5411');
  });

  it('A target the loaded names miss shows its raw id', () => {
    // Only a half-loaded screen can reach this — every stored rule targets a real row — but the
    // line stays readable instead of blank.
    expect(ruleLine(rule({ categoryId: 'repair' }), groceries)).toEqual({
      id: 'r1',
      criteria: 'сільпо',
      category: 'repair',
    });
  });
});
