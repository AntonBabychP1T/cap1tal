import { describe, expect, it } from 'vitest';

import { namesById } from '../domain/category';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';
import {
  accountCount,
  categoryCount,
  categoryLabel,
  kindLabel,
  sourceCount,
  transactionCount,
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

describe('the counts the owner reads', () => {
  /**
   * app-shell «A count the owner reads carries the Ukrainian form its number asks for». The rule
   * itself is `plural`; these are the four nouns built on it, together, because a fifth noun added
   * without its forms is exactly the bug this requirement was written for.
   */
  const FORMS = [1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 25, 0] as const;

  it('1 and anything ending in 1 take the singular, 2–4 the few form, the rest the many form', () => {
    expect(FORMS.map(transactionCount)).toEqual([
      '1 транзакція',
      '2 транзакції',
      '3 транзакції',
      '4 транзакції',
      '5 транзакцій',
      '11 транзакцій',
      '12 транзакцій',
      '14 транзакцій',
      '21 транзакція',
      '22 транзакції',
      '25 транзакцій',
      '0 транзакцій',
    ]);
  });

  it('«рахунок» takes the same three forms', () => {
    expect(FORMS.map(accountCount)).toEqual([
      '1 рахунок',
      '2 рахунки',
      '3 рахунки',
      '4 рахунки',
      '5 рахунків',
      '11 рахунків',
      '12 рахунків',
      '14 рахунків',
      '21 рахунок',
      '22 рахунки',
      '25 рахунків',
      '0 рахунків',
    ]);
  });

  it('«категорія» takes the same three forms', () => {
    expect(FORMS.map(categoryCount)).toEqual([
      '1 категорія',
      '2 категорії',
      '3 категорії',
      '4 категорії',
      '5 категорій',
      '11 категорій',
      '12 категорій',
      '14 категорій',
      '21 категорія',
      '22 категорії',
      '25 категорій',
      '0 категорій',
    ]);
  });

  it('«джерело» takes the same three forms', () => {
    expect(FORMS.map(sourceCount)).toEqual([
      '1 джерело',
      '2 джерела',
      '3 джерела',
      '4 джерела',
      '5 джерел',
      '11 джерел',
      '12 джерел',
      '14 джерел',
      '21 джерело',
      '22 джерела',
      '25 джерел',
      '0 джерел',
    ]);
  });
});
