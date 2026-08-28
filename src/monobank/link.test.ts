import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { MonobankAccount } from './api';
import {
  suggestKind,
  suggestLinks,
  unlinkedAccounts,
  validateLink,
  type MonobankLink,
} from './link';

const monoAccount = (
  over: Partial<MonobankAccount> & Pick<MonobankAccount, 'id'>,
): MonobankAccount => ({
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
    expect(() => validateLink({ monobankAccount: card, account: usdAccount, links: [] })).toThrow(
      /валюти різні/,
    );
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

describe('suggestLinks', () => {
  const black = monoAccount({ id: 'mono-black', name: 'black ··4321' });
  const white = monoAccount({ id: 'mono-white', name: 'white ··9999' });
  const usdJar = monoAccount({ id: 'mono-jar-usd', kind: 'jar', name: 'Подорож', currency: 'USD' });

  const monoBlack = account({
    id: 'a-black',
    name: 'Monobank Black',
    kind: 'spending',
    currency: 'UAH',
  });

  it('Scenario: A matching рахунок is proposed by name', () => {
    expect(suggestLinks({ monobankAccounts: [black], accounts: [monoBlack], links: [] })).toEqual([
      { kind: 'existing', monobankAccountId: 'mono-black', accountId: 'a-black', evidence: 'word' },
    ]);
  });

  it('Scenario: Two equally matching рахунки propose nothing', () => {
    const second = account({
      id: 'a-black-2',
      name: 'Monobank Black стара',
      kind: 'spending',
      currency: 'UAH',
    });
    // Naming one of two equally likely рахунки is how a card's history lands in the wrong place.
    expect(
      suggestLinks({ monobankAccounts: [black], accounts: [monoBlack, second], links: [] }),
    ).toEqual([
      {
        kind: 'ambiguous',
        monobankAccountId: 'mono-black',
        candidateIds: ['a-black', 'a-black-2'],
      },
    ]);
  });

  it('Scenario: An unrecognised account proposes a new рахунок', () => {
    expect(suggestLinks({ monobankAccounts: [usdJar], accounts: [monoBlack], links: [] })).toEqual([
      { kind: 'new', monobankAccountId: 'mono-jar-usd' },
    ]);
  });

  it('Scenario: One рахунок is never proposed twice', () => {
    const alsoBlack = monoAccount({ id: 'mono-black-2', name: 'black ··8888' });
    const proposals = suggestLinks({
      monobankAccounts: [black, alsoBlack],
      accounts: [monoBlack],
      links: [],
    });
    const onto = proposals.filter((p) => p.kind === 'existing').map((p) => p.accountId);
    expect(onto).toEqual(['a-black']);
    expect(proposals.filter((p) => p.kind === 'new')).toHaveLength(1);
  });

  it('Scenario: A different-currency рахунок is not a link choice', () => {
    const usdBlack = account({
      id: 'a-usd',
      name: 'Подорож',
      kind: 'savings',
      currency: 'USD',
    });
    // Same name, right currency — proposed; same name, wrong currency — never.
    expect(suggestLinks({ monobankAccounts: [usdJar], accounts: [usdBlack], links: [] })).toEqual([
      {
        kind: 'existing',
        monobankAccountId: 'mono-jar-usd',
        accountId: 'a-usd',
        evidence: 'same-name',
      },
    ]);
    const uahNamesake = account({
      id: 'a-uah',
      name: 'Подорож',
      kind: 'savings',
      currency: 'UAH',
    });
    expect(
      suggestLinks({ monobankAccounts: [usdJar], accounts: [uahNamesake], links: [] }),
    ).toEqual([{ kind: 'new', monobankAccountId: 'mono-jar-usd' }]);
  });

  it('Archived and already-linked рахунки are never candidates, nor are linked accounts proposed', () => {
    const archived = account({
      id: 'a-old',
      name: 'Monobank Black',
      kind: 'spending',
      currency: 'UAH',
      archived: true,
    });
    expect(suggestLinks({ monobankAccounts: [black], accounts: [archived], links: [] })).toEqual([
      { kind: 'new', monobankAccountId: 'mono-black' },
    ]);

    const links: MonobankLink[] = [{ monobankAccountId: 'mono-white', accountId: 'a-black' }];
    // The рахунок is spoken for by an existing link, and the linked monobank account is not
    // proposed for at all.
    expect(
      suggestLinks({ monobankAccounts: [black, white], accounts: [monoBlack], links }),
    ).toEqual([{ kind: 'new', monobankAccountId: 'mono-black' }]);
  });

  it('Is deterministic, and balances change nothing', () => {
    const input = { monobankAccounts: [black, white, usdJar], accounts: [monoBlack], links: [] };
    expect(suggestLinks(input)).toEqual(suggestLinks(input));

    const richer = monoAccount({
      id: 'mono-black',
      name: 'black ··4321',
      balance: money(99_999_00, 'UAH'),
      bankBalance: money(99_999_00, 'UAH'),
    });
    expect(suggestLinks({ ...input, monobankAccounts: [richer, white, usdJar] })).toEqual(
      suggestLinks(input),
    );
  });
});
