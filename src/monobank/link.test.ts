import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { MonobankAccount } from './api';
import { suggestKind, unlinkedAccounts, validateLink, type MonobankLink } from './link';

const monoAccount = (over: Partial<MonobankAccount> & Pick<MonobankAccount, 'id'>): MonobankAccount => ({
  kind: 'card',
  currency: 'UAH',
  name: 'black ··1234',
  balance: money(500000, 'UAH'),
  creditLimit: money(200000, 'UAH'),
  bankBalance: money(300000, 'UAH'),
  ...over,
});

const card = monoAccount({ id: 'mono-card' });
const jar = monoAccount({
  id: 'mono-jar',
  kind: 'jar',
  name: 'На відпустку',
  balance: money(1200000, 'UAH'),
  creditLimit: money(0, 'UAH'),
  bankBalance: money(1200000, 'UAH'),
});

const uahAccount = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const usdAccount = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });

describe('validateLink', () => {
  it('Scenario: A currency mismatch is rejected', () => {
    expect(() =>
      validateLink({ monobankAccount: card, account: usdAccount, links: [] }),
    ).toThrow(/валюти різні/);
    // Same currency, nothing linked yet: accepted.
    expect(() =>
      validateLink({ monobankAccount: card, account: uahAccount, links: [] }),
    ).not.toThrow();
  });

  it('Scenario: A second link on either side is rejected', () => {
    const existing: MonobankLink[] = [{ monobankAccountId: 'mono-card', accountId: 'card' }];
    const otherAccount = account({
      id: 'other',
      name: 'ще одна',
      kind: 'spending',
      currency: 'UAH',
    });

    // The monobank side is taken…
    expect(() =>
      validateLink({ monobankAccount: card, account: otherAccount, links: existing }),
    ).toThrow(/monobank/);
    // …and so is the рахунок side.
    expect(() =>
      validateLink({ monobankAccount: jar, account: uahAccount, links: existing }),
    ).toThrow();
    // The existing link stands: nothing here mutates it.
    expect(existing).toEqual([{ monobankAccountId: 'mono-card', accountId: 'card' }]);
    // And a free pair on both sides still links.
    expect(() =>
      validateLink({ monobankAccount: jar, account: otherAccount, links: existing }),
    ).not.toThrow();
  });
});

describe('suggestKind', () => {
  it('Scenario: A банка suggests a savings рахунок', () => {
    expect(suggestKind(jar)).toBe('savings');
    expect(suggestKind(card)).toBe('spending');
  });

  it('Scenario: A банка suggests a savings рахунок — and the owner may still pick another вид', () => {
    // A suggestion, never a rule: a банка the owner treats as an investment links just as well.
    const asInvestment = account({
      id: 'bonds',
      name: 'банка на ОВДП',
      kind: 'investment',
      currency: 'UAH',
    });
    expect(suggestKind(jar)).not.toBe(asInvestment.kind);
    expect(() =>
      validateLink({ monobankAccount: jar, account: asInvestment, links: [] }),
    ).not.toThrow();
  });
});

describe('unlinkedAccounts', () => {
  it('An unlinked monobank account takes no part in sync, and is not hidden either', () => {
    // Sync runs over links; what has none is what the screen must still show, so that leaving it
    // unlinked stays the owner's visible decision rather than a silent gap.
    const links: MonobankLink[] = [{ monobankAccountId: 'mono-card', accountId: 'card' }];
    expect(unlinkedAccounts([card, jar], links).map((a) => a.id)).toEqual(['mono-jar']);
    expect(unlinkedAccounts([card, jar], [])).toHaveLength(2);
    expect(
      unlinkedAccounts([card, jar], [...links, { monobankAccountId: 'mono-jar', accountId: 'j' }]),
    ).toEqual([]);
  });
});
