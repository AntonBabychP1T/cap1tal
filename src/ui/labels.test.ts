import { describe, expect, it } from 'vitest';

import { FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { categoryLabel, kindLabel, OFFERED_CURRENCIES } from './labels';

describe('categoryLabel', () => {
  it('"Без категорії" is the label of the reserved uncategorised category', () => {
    expect(categoryLabel(UNCATEGORISED_CATEGORY_ID)).toBe('Без категорії');
  });

  it('"Комісія" is the label of the reserved Fees category — one category, not a second one', () => {
    expect(categoryLabel(FEES_CATEGORY_ID)).toBe('Комісія');
  });

  it('An unknown category id shows itself rather than disappearing', () => {
    expect(categoryLabel('food')).toBe('food');
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
