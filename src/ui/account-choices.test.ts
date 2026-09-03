import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, transfer, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { accountChoicesFor, legsOf } from './account-choices';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const oldJar = account({
  id: 'old-jar',
  name: 'стара банка',
  kind: 'savings',
  currency: 'UAH',
  archived: true,
});
// Storage order, deliberately not the order a picker shows: «банка» is Cyrillic and «mono black»
// is Latin, and uk collation files Cyrillic first, so every picker below reads `jar` then `card`.
const all = [card, jar, oldJar];

const storedExpense = expenseByDefault({
  id: 'e1',
  date: '2026-08-24',
  accountId: 'card',
  amount: money(100000, 'UAH'),
  categoryId: UNCATEGORISED_CATEGORY_ID,
});

describe('accountChoicesFor', () => {
  it('Scenario: Editing pickers also offer only unarchived accounts', () => {
    // A stored витрата is retyped into a переказ while one account is archived. The destination
    // leg holds nothing yet, so the archived account is not among its choices.
    const legs = legsOf(storedExpense);
    expect(legs.destination).toBeUndefined();
    expect(accountChoicesFor(all, legs.destination).map((a) => a.id)).toEqual(['jar', 'card']);
    expect(accountChoicesFor(all, legs.destination).map((a) => a.id)).not.toContain('old-jar');

    // …though it keeps being shown on its own stored transactions: the leg that already sits on
    // the archived account still offers it, so opening that transaction cannot move it off.
    const onArchived = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'old-jar',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    const its = legsOf(onArchived);
    // The two offers in Ukrainian order, and the archived carried row after them — appended, not
    // sorted in, though «стара банка» would otherwise sort ahead of both.
    expect(accountChoicesFor(all, its.destination).map((a) => a.id)).toEqual([
      'jar',
      'card',
      'old-jar',
    ]);
    // Its other leg is on an active account, so the archived one is still not offered there.
    expect(accountChoicesFor(all, its.source).map((a) => a.id)).toEqual(['jar', 'card']);
  });

  it('A picker on an unarchived account offers exactly the unarchived accounts', () => {
    expect(accountChoicesFor(all, 'card').map((a) => a.id)).toEqual(['jar', 'card']);
  });

  it('An account that no longer exists adds nothing to the picker', () => {
    expect(accountChoicesFor(all, 'gone').map((a) => a.id)).toEqual(['jar', 'card']);
  });
});

describe('legsOf', () => {
  it('A single-account transaction has a source and no destination', () => {
    expect(legsOf(storedExpense)).toEqual({ source: 'card' });
  });

  it('A переказ has both legs', () => {
    expect(
      legsOf(
        transfer({
          id: 't1',
          date: '2026-08-24',
          fromAccountId: 'card',
          toAccountId: 'jar',
          left: money(100000, 'UAH'),
          arrived: money(100000, 'UAH'),
        }),
      ),
    ).toEqual({ source: 'card', destination: 'jar' });
  });
});

/**
 * The order a рахунок picker offers its rows in. The spec of `shortlist-pickers` says «рахунки and
 * джерела by name in Ukrainian order», and that order is also what the short list is topped up
 * from — so it is a promise about what the owner sees before they have recorded anything, not a
 * detail.
 *
 * Found on the emulator: the picker was showing SQLite's BINARY sort, which puts every Cyrillic
 * name after every Latin one, while the категорії beside it in the same form were in real uk
 * collation. Two lists on one screen ordered by two rules.
 */
describe('the order the picker offers рахунки in', () => {
  const named = (id: string, name: string): Account =>
    account({ id, name, kind: 'spending', currency: 'UAH' });

  it('Ukrainian names are ordered as Ukrainian, not after every Latin one', () => {
    // Storage hands them over in its own sort; the picker is what decides what the owner reads.
    const accounts = [
      named('a1', 'Cash'),
      named('a2', 'abank'),
      named('a3', 'Борги'),
      named('a4', 'Monobank'),
      named('a5', 'валюта моно'),
    ];

    expect(accountChoicesFor(accounts, undefined).map((a) => a.name)).toEqual([
      'Борги',
      'валюта моно',
      'abank',
      'Cash',
      'Monobank',
    ]);
  });

  it('The рахунок a stored транзакція carries is still appended, not sorted into place', () => {
    // `withCurrent`'s whole point: the carried row "is not an offer, it is what is already there",
    // so ordering the offers may not swallow it into the middle of them.
    const accounts = [
      named('a1', 'Cash'),
      named('a2', 'abank'),
      { ...named('a3', 'Борги'), archived: true },
    ];

    expect(accountChoicesFor(accounts, 'a3').map((a) => a.name)).toEqual(['abank', 'Cash', 'Борги']);
  });
});
