import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { Category, Source } from '../domain/category';
import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { emptyMessage, PAGE_SIZE, searchCriteria, showMore } from './transaction-search';

const categories: readonly Category[] = [
  { id: 'groceries', name: 'Продукти', archived: false },
  { id: 'post', name: 'Пошта', archived: false },
  { id: 'pets', name: 'Тварини', archived: true },
];

const sources: readonly Source[] = [
  { id: 'salary', name: 'Зарплата', archived: false },
  { id: 'gifts', name: 'Подарунки', archived: false },
];

describe('searchCriteria', () => {
  it('Scenario: The bank"s text finds the транзакція', () => {
    const criteria = searchCriteria('сільпо', categories, sources);

    // The text travels as typed; the repository is what folds it against each опис.
    expect(criteria?.text).toBe('сільпо');
    expect(criteria?.categoryIds).toEqual([]);
    expect(criteria?.sourceIds).toEqual([]);
  });

  it('Scenario: A категорія is found by its name', () => {
    const criteria = searchCriteria('прод', categories, sources);

    expect(criteria?.categoryIds).toEqual(['groceries']);
  });

  it('Scenario: A сума is found as typed', () => {
    // «1200» is 1200,00 in major units — 120000 minor — and names no currency.
    expect(searchCriteria('1200', categories, sources)?.amountMinor).toBe(120000);
    expect(searchCriteria('12,50', categories, sources)?.amountMinor).toBe(1250);
  });

  it('What is not a сума simply is not one', () => {
    const criteria = searchCriteria('сільпо', categories, sources);

    expect(criteria).not.toHaveProperty('amountMinor');
    // And the text still searches описи and names.
    expect(criteria?.text).toBe('сільпо');
  });

  it('Scenario: An empty search shows the history', () => {
    expect(searchCriteria('', categories, sources)).toBeUndefined();
    expect(searchCriteria('   ', categories, sources)).toBeUndefined();
  });

  it('An archived категорія is still searchable — its транзакції still carry it', () => {
    expect(searchCriteria('тварин', categories, sources)?.categoryIds).toEqual(['pets']);
  });

  it('A джерело is found by its name', () => {
    expect(searchCriteria('подар', categories, sources)?.sourceIds).toEqual(['gifts']);
  });

  it('Letter case does not matter, the way Ukrainian folds it', () => {
    expect(searchCriteria('ПОШТА', categories, sources)?.categoryIds).toEqual(['post']);
  });

  it('Scenario: A транзакція matching twice is shown once', () => {
    // The criterion names both routes; the repository returns one row, never two.
    const criteria = searchCriteria('пошта', categories, sources);

    expect(criteria?.text).toBe('пошта');
    expect(criteria?.categoryIds).toEqual(['post']);
  });

  it('The typed text is carried trimmed', () => {
    expect(searchCriteria('  сільпо  ', categories, sources)?.text).toBe('сільпо');
  });
});

describe('showMore', () => {
  const spent = (id: string): Transaction => ({
    type: 'expense',
    id,
    date: '2026-03-10',
    accountId: 'card',
    amount: money(1000, 'UAH'),
    categoryId: 'groceries',
  });
  const stored = Array.from({ length: 7 }, (_, index) => spent(`e${index}`));
  const read = (limit: number, offset: number) => stored.slice(offset, offset + limit);

  it('Scenario: The history continues past the feed"s ceiling', () => {
    const first = showMore([], read, 3);

    expect(first.transactions.map((t) => t.id)).toEqual(['e0', 'e1', 'e2']);
    expect(first.more).toBe(true);
  });

  it('Scenario: Showing more keeps what is already shown', () => {
    const first = showMore([], read, 3);
    const second = showMore(first.transactions, read, 3);

    // What was on the screen stays where it was, and the next ones follow in the same order.
    expect(second.transactions.map((t) => t.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
    expect(second.more).toBe(true);
  });

  it('Reaching the end is plain, and no more is claimed than there is', () => {
    const third = showMore(showMore(showMore([], read, 3).transactions, read, 3).transactions, read, 3);

    expect(third.transactions).toHaveLength(7);
    expect(third.more).toBe(false);
  });

  it('An exact multiple of a page does not claim there is more', () => {
    const exact = Array.from({ length: 6 }, (_, index) => spent(`x${index}`));
    const readExact = (limit: number, offset: number) => exact.slice(offset, offset + limit);

    const second = showMore(showMore([], readExact, 3).transactions, readExact, 3);

    expect(second.transactions).toHaveLength(6);
    expect(second.more).toBe(false);
  });

  it('Scenario: An empty history says so', () => {
    const empty = showMore([], () => [], 3);

    expect(empty.transactions).toEqual([]);
    expect(empty.more).toBe(false);
  });

  it('A page has a size, and it is the one the screen starts with', () => {
    let asked = 0;
    showMore([], (limit) => {
      asked = limit;
      return [];
    });

    // One beyond a page, so «є ще» is knowledge and not a guess.
    expect(asked).toBe(PAGE_SIZE + 1);
  });
});

describe('emptyMessage', () => {
  it('Scenario: An empty history says so', () => {
    expect(emptyMessage({ shown: 0, narrowed: false })).toBe('Ще нічого не записано.');
  });

  it('Scenario: Nothing found is said, not hidden', () => {
    expect(emptyMessage({ shown: 0, narrowed: true })).toContain('Нічого не знайдено');
  });

  it('A list needs no sentence in its place', () => {
    expect(emptyMessage({ shown: 3, narrowed: true })).toBeNull();
    expect(emptyMessage({ shown: 3, narrowed: false })).toBeNull();
  });
});

/**
 * The rows «Транзакції» shows are storage's, and it must ask storage again whenever it comes back
 * into focus. `verify` never runs a screen, so the assertion is structural — the idiom
 * `entry-form.test.ts` already uses on Головний.
 */
describe('the shown list follows storage', () => {
  const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');

  it('Scenario: A found транзакція is edited', () => {
    // Not a `useMemo`: with an empty query — the screen's own default — `searchCriteria('')` is
    // `undefined` on both sides of a focus reload, so a memo keeps the page it computed at mount
    // and the edited транзакція reads as it was.
    expect(screen).toContain('const [shown] = useReloadOnFocus(');
    expect(screen).not.toMatch(/const shown = useMemo\(/);
  });

  it('The рахунок, категорія and місяць it reads beside them are re-read too', () => {
    expect(screen).toMatch(/const \[stored\] = useReloadOnFocus\(/);
  });
});
