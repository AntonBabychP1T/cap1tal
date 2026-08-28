import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { accountRows, groupAccountsByKind, reconcileConfirmation } from './account-groups';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const oldCard = account({
  id: 'old-card',
  name: 'стара картка',
  kind: 'spending',
  currency: 'UAH',
  archived: true,
});

describe('groupAccountsByKind', () => {
  it('Scenario: Accounts group by kind, archived apart', () => {
    expect(groupAccountsByKind([card, jar, oldCard])).toEqual([
      { kind: 'spending', accounts: [card] },
      { kind: 'savings', accounts: [jar] },
      { kind: 'archived', accounts: [oldCard] },
    ]);
  });

  it('Scenario: Archiving moves the account to the archived group', () => {
    const before = groupAccountsByKind([card, jar]);
    expect(before.map((g) => g.kind)).toEqual(['spending', 'savings']);

    const after = groupAccountsByKind([account({ ...card, archived: true }), jar]);

    expect(after.map((g) => g.kind)).toEqual(['savings', 'archived']);
    expect(after.find((g) => g.kind === 'archived')?.accounts.map((a) => a.id)).toEqual(['card']);
    // It left its вид group entirely: no empty "spending" heading stays behind.
    expect(after.find((g) => g.kind === 'spending')).toBeUndefined();
  });

  it('Scenario: The screen invites the first рахунок', () => {
    expect(groupAccountsByKind([])).toEqual([]);
  });

  it('Every вид gets its own group, in the screen order', () => {
    const all = [
      account({ id: 'd', name: 'борг', kind: 'debt', currency: 'UAH' }),
      account({ id: 'c', name: 'гаманець', kind: 'cash', currency: 'UAH' }),
      account({ id: 'i', name: 'ОВДП', kind: 'investment', currency: 'UAH' }),
      jar,
      card,
    ];
    expect(groupAccountsByKind(all).map((g) => g.kind)).toEqual([
      'spending',
      'savings',
      'investment',
      'cash',
      'debt',
    ]);
  });

  it('Accounts keep the order they were given', () => {
    const a = account({ id: 'a', name: 'а', kind: 'spending', currency: 'UAH' });
    const b = account({ id: 'b', name: 'б', kind: 'spending', currency: 'UAH' });
    expect(groupAccountsByKind([a, b])[0]?.accounts.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

/**
 * The linked half of a рахунок's row: the bank's own figure beside the computed one, and the
 * коригування «Звірити» would create for the difference.
 */
describe('accountRows', () => {
  const linked = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
  const dollars = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });

  it('Scenario: The two balances remain distinct', () => {
    const rows = accountRows(
      [linked],
      new Map([['card', money(47000, 'UAH')]]),
      new Map([['card', money(50000, 'UAH')]]),
    );

    // Both amounts, both as UAH, neither replacing the other…
    expect(rows[0]?.computed).toBe('470,00 UAH');
    expect(rows[0]?.bankBalance).toBe('500,00 UAH');
    // …and «Звірити» is worth offering, for exactly the difference between them.
    expect(rows[0]?.reconcilable).toBe(true);
    expect(rows[0]?.difference).toBe('30,00 UAH');
  });

  it('Scenario: Equal balances create no correction', () => {
    const rows = accountRows(
      [linked],
      new Map([['card', money(50000, 'UAH')]]),
      new Map([['card', money(50000, 'UAH')]]),
    );

    expect(rows[0]?.bankBalance).toBe('500,00 UAH');
    // Nothing to reconcile: a коригування of zero would be a транзакція saying nothing happened.
    expect(rows[0]?.reconcilable).toBe(false);
    expect(rows[0]).not.toHaveProperty('difference');
  });

  it('A рахунок no monobank account feeds shows only its own balance', () => {
    const rows = accountRows([linked], new Map([['card', money(47000, 'UAH')]]));

    expect(rows[0]?.computed).toBe('470,00 UAH');
    expect(rows[0]).not.toHaveProperty('bankBalance');
    expect(rows[0]?.reconcilable).toBe(false);
  });

  it('Each currency stays its own, and a foreign bank figure is not shown at all', () => {
    const rows = accountRows(
      [linked, dollars],
      new Map([
        ['card', money(47000, 'UAH')],
        ['usd', money(12345, 'USD')],
      ]),
      new Map([
        ['card', money(50000, 'UAH')],
        // A figure that could only come from a link that should not exist: ignored, never
        // converted and never shown beside a USD рахунок as though it belonged to it.
        ['usd', money(50000, 'UAH')],
      ]),
    );

    expect(rows[0]?.bankBalance).toBe('500,00 UAH');
    expect(rows[1]?.computed).toBe('123,45 USD');
    expect(rows[1]).not.toHaveProperty('bankBalance');
    expect(rows[1]?.reconcilable).toBe(false);
  });

  it('A shortfall keeps its sign, so the owner sees which way the коригування goes', () => {
    const rows = accountRows(
      [linked],
      new Map([['card', money(50000, 'UAH')]]),
      new Map([['card', money(47000, 'UAH')]]),
    );

    expect(rows[0]?.difference).toBe('−30,00 UAH');
    expect(reconcileConfirmation(rows[0]!)).toContain('−30,00 UAH');
    expect(reconcileConfirmation(rows[0]!)).toContain('mono black');
  });
});
