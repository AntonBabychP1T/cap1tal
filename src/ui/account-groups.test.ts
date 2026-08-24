import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { groupAccountsByKind } from './account-groups';

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
