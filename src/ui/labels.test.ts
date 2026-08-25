import { describe, expect, it } from 'vitest';

import { namesById } from '../domain/category';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';
import {
  categoryLabel,
  kindLabel,
  transactionTypeLabel,
  OFFERED_CURRENCIES,
} from './labels';

/** The seeded list as a screen loads it: the three reserved rows and one ordinary category. */
const CATEGORY_NAMES = namesById([
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії' },
  { id: FEES_CATEGORY_ID, name: 'Комісія' },
  { id: CORRECTION_CATEGORY_ID, name: 'Коригування' },
  { id: 'groceries', name: 'Groceries' },
]);

describe('categoryLabel', () => {
  it('"Без категорії" is the label of the reserved uncategorised category', () => {
    expect(categoryLabel(UNCATEGORISED_CATEGORY_ID, CATEGORY_NAMES)).toBe('Без категорії');
  });

  it('"Комісія" is the label of the reserved Fees category — one category, not a second one', () => {
    expect(categoryLabel(FEES_CATEGORY_ID, CATEGORY_NAMES)).toBe('Комісія');
  });

  it('An unknown category id shows itself rather than disappearing', () => {
    expect(categoryLabel('food', CATEGORY_NAMES)).toBe('food');
  });

  it('Scenario: A renamed category shows its new name', () => {
    const renamed = namesById([{ id: 'groceries', name: 'Продукти' }]);
    expect(categoryLabel('groceries', CATEGORY_NAMES)).toBe('Groceries');
    // The same stored id, resolved against the list after the rename — nothing else moved.
    expect(categoryLabel('groceries', renamed)).toBe('Продукти');
  });

  it('An archived category still shows its name wherever its history is', () => {
    // Archiving changes what a picker offers, never what a stored transaction displays, so the
    // name map a screen loads holds every row and this lookup cannot tell the two apart.
    const withArchived = namesById([{ id: 'pets', name: 'Pets' }]);
    expect(categoryLabel('pets', withArchived)).toBe('Pets');
  });
});

describe('categoryLabel — one list per namespace', () => {
  it('A category id is resolved against the categories list, and nothing else', () => {
    // `gifts` names a category *and* a source; the two tables are separate namespaces, so the
    // map a caller passes is what decides which list the id is read against.
    const sources = namesById([{ id: 'gifts', name: 'Gifts — джерело' }]);
    expect(categoryLabel('gifts', CATEGORY_NAMES)).toBe('gifts');
    expect(categoryLabel('gifts', sources)).toBe('Gifts — джерело');
  });
});

describe('transactionTypeLabel', () => {
  it('Every transaction type has the glossary word the owner reads', () => {
    expect(
      (['expense', 'income', 'transfer', 'refund', 'correction'] as const).map(
        transactionTypeLabel,
      ),
    ).toEqual(['витрата', 'дохід', 'переказ', 'повернення', 'коригування']);
  });
});

describe('kindLabel', () => {
  it('Every вид and the archive have a heading', () => {
    expect(
      (['spending', 'savings', 'investment', 'cash', 'debt', 'archived'] as const).map(kindLabel),
    ).toEqual(['Витратні', 'Накопичувальні', 'Інвестиційні', 'Готівка', 'Борги', 'Архів']);
  });
});

describe('OFFERED_CURRENCIES', () => {
  it('An account can be opened in UAH, EUR or USD', () => {
    expect([...OFFERED_CURRENCIES]).toEqual(['UAH', 'EUR', 'USD']);
  });
});

describe('categoryLabel — the correction category', () => {
  it('"Коригування" is the label of the reserved correction category', () => {
    expect(categoryLabel(CORRECTION_CATEGORY_ID, CATEGORY_NAMES)).toBe('Коригування');
  });

  it('The three reserved categories resolve to the names the seeded rows carry', () => {
    expect(
      [UNCATEGORISED_CATEGORY_ID, FEES_CATEGORY_ID, CORRECTION_CATEGORY_ID].map((id) =>
        categoryLabel(id, CATEGORY_NAMES),
      ),
    ).toEqual(['Без категорії', 'Комісія', 'Коригування']);
  });
});
