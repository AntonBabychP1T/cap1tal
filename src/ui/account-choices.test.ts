import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
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
    expect(accountChoicesFor(all, legs.destination).map((a) => a.id)).toEqual(['card', 'jar']);
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
    expect(accountChoicesFor(all, its.destination).map((a) => a.id)).toEqual([
      'card',
      'jar',
      'old-jar',
    ]);
    // Its other leg is on an active account, so the archived one is still not offered there.
    expect(accountChoicesFor(all, its.source).map((a) => a.id)).toEqual(['card', 'jar']);
  });

  it('A picker on an unarchived account offers exactly the unarchived accounts', () => {
    expect(accountChoicesFor(all, 'card').map((a) => a.id)).toEqual(['card', 'jar']);
  });

  it('An account that no longer exists adds nothing to the picker', () => {
    expect(accountChoicesFor(all, 'gone').map((a) => a.id)).toEqual(['card', 'jar']);
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
