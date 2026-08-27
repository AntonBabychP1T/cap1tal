import { describe, expect, it, vi } from 'vitest';

import { money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import { OFFERED_CURRENCIES } from '../ui/labels';
import { MONOBANK_RATE_CURRENCIES } from './currency';
import {
  fetchClientInfo,
  fetchStatement,
  monobankStatementUrl,
  parseClientInfo,
  parseStatement,
  type AuthFetchLike,
  type StatementContext,
} from './api';

/**
 * The token these tests hand in. It is a made-up string, and the point of half of them is that it
 * comes back nowhere: no outcome, no URL, no parsed value.
 */
const TOKEN = 'uTOKEN-not-a-real-one-0123456789';

/** A response object shaped like the part of `Response` this module touches. */
const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const answering = (status: number, body: unknown): AuthFetchLike => () =>
  Promise.resolve(response(status, body));

/**
 * A fixed +03:00 zone, standing in for the device's. Fixed on purpose: the parser must not depend
 * on the runner's timezone, and the only way to prove that is to hand it one (design D5).
 */
const KYIV_OFFSET_SECONDS = 3 * 60 * 60;
const dateOf = (unixSeconds: number): IsoDate =>
  new Date((unixSeconds + KYIV_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);

const uahStatement: StatementContext = { currency: 'UAH', dateOf };

/** The shape monobank answers client-info with, trimmed to the fields this module reads. */
const CLIENT_INFO = {
  clientId: '3MSaMMtczs',
  name: 'Власник',
  webHookUrl: '',
  permissions: 'psfj',
  accounts: [
    {
      id: 'kKGVoZuHWzqVoZuH',
      sendId: 'uHW2zqkKG',
      currencyCode: 980,
      cashbackType: 'UAH',
      balance: 500000,
      creditLimit: 200000,
      maskedPan: ['537541******1234'],
      type: 'black',
      iban: 'UA733220010000026201234567890',
    },
  ],
  jars: [
    {
      id: 'zqkKGVoZuHW',
      sendId: 'kKGVoZ',
      title: 'На відпустку',
      description: '',
      currencyCode: 980,
      balance: 1200000,
      goal: 5000000,
    },
  ],
};

/** One well-formed statement row, as monobank sends it. */
const ITEM = {
  id: 'a1',
  // 2026-08-26 12:00 in the injected zone.
  time: Date.UTC(2026, 7, 26, 9, 0, 0) / 1000,
  description: 'СІЛЬПО',
  mcc: 5411,
  originalMcc: 5411,
  hold: false,
  amount: -12550,
  operationAmount: -12550,
  currencyCode: 980,
  commissionRate: 0,
  cashbackAmount: 250,
  balance: 10050000,
};

describe('parseClientInfo', () => {
  it("Scenario: A card's баланс банку subtracts the credit limit", () => {
    const accounts = parseClientInfo(CLIENT_INFO);
    const card = accounts?.find((a) => a.kind === 'card');
    // The credit limit is the bank's money sitting inside the reported balance.
    expect(card?.balance).toEqual(money(500000, 'UAH'));
    expect(card?.creditLimit).toEqual(money(200000, 'UAH'));
    expect(card?.bankBalance).toEqual(money(300000, 'UAH'));
  });

  it('Scenario: A card deep in its credit limit is negative', () => {
    const accounts = parseClientInfo({
      ...CLIENT_INFO,
      accounts: [{ ...CLIENT_INFO.accounts[0], balance: 150000, creditLimit: 200000 }],
    });
    expect(accounts?.[0]?.bankBalance).toEqual(money(-50000, 'UAH'));
  });

  it('Scenario: A банка arrives with its title and balance', () => {
    const jar = parseClientInfo(CLIENT_INFO)?.find((a) => a.kind === 'jar');
    expect(jar?.name).toBe('На відпустку');
    expect(jar?.bankBalance).toEqual(money(1200000, 'UAH'));
    // A банка has no credit limit, so its balance is the owner's money whole.
    expect(jar?.creditLimit).toEqual(money(0, 'UAH'));
  });

  it('Scenario: A card is named by its type and masked number', () => {
    const card = parseClientInfo(CLIENT_INFO)?.[0];
    expect(card?.name).toContain('black');
    expect(card?.name).toContain('1234');
  });

  it('A card with no number to mask is named by its type alone', () => {
    const accounts = parseClientInfo({
      ...CLIENT_INFO,
      accounts: [{ ...CLIENT_INFO.accounts[0], maskedPan: [] }],
    });
    expect(accounts?.[0]?.name).toBe('black');
  });

  it('Scenario: A currency the app does not offer is left out', () => {
    const accounts = parseClientInfo({
      ...CLIENT_INFO,
      accounts: [
        CLIENT_INFO.accounts[0],
        { ...CLIENT_INFO.accounts[0], id: 'pln', currencyCode: 985, type: 'white' },
      ],
      jars: [],
    });
    // Left out, not a failure: a PLN card is a perfectly good row the app has no рахунок for.
    expect(accounts?.map((a) => a.currency)).toEqual(['UAH']);
  });

  it('The currencies this module reads are exactly the ones a рахунок can be opened in', () => {
    // Two tables would drift; this is what keeps them one. A currency added to the app's offer
    // must arrive here too, or a monobank account in it would silently never be linkable.
    const parsed = parseClientInfo({
      accounts: [840, 978, 980, 985, 826].map((currencyCode, i) => ({
        ...CLIENT_INFO.accounts[0],
        id: `a${i}`,
        currencyCode,
      })),
    });
    expect(parsed?.map((a) => a.currency).sort()).toEqual([...OFFERED_CURRENCIES].sort());
  });

  it('And a rate can be had for every one of them that is not UAH', () => {
    // The rate whitelist next door (`currency.ts`) is the same set minus UAH, which quotes against
    // itself. Holding the two together here is what stops a currency being added to the app's
    // offer, linking fine, and then silently never having an approximate-UAH figure.
    const parsed = parseClientInfo({
      accounts: [840, 978, 980].map((currencyCode, i) => ({
        ...CLIENT_INFO.accounts[0],
        id: `a${i}`,
        currencyCode,
      })),
    });
    const linkable = (parsed ?? []).map((a) => a.currency).filter((c) => c !== 'UAH');
    expect(linkable.sort()).toEqual([...MONOBANK_RATE_CURRENCIES].sort());
  });

  it('Scenario: A hostile payload is unavailable, not a crash', () => {
    // Nothing here throws, and nothing parses to an empty list either — "not client-info" and
    // "a client with no accounts" are different answers.
    expect(parseClientInfo(null)).toBeUndefined();
    expect(parseClientInfo(42)).toBeUndefined();
    expect(parseClientInfo('accounts')).toBeUndefined();
    expect(parseClientInfo([])).toBeUndefined();
    expect(parseClientInfo({ error: 'Unknown account id' })).toBeUndefined();
    expect(parseClientInfo({ accounts: {} })).toBeUndefined();
    expect(parseClientInfo({ accounts: [], jars: 'нема' })).toBeUndefined();
    // A client with no accounts at all is readable, and empty.
    expect(parseClientInfo({ accounts: [] })).toEqual([]);
  });

  it('An unreadable row fails the whole client-info answer', () => {
    // Half a list of accounts is worse than none: the missing one would read as an account the
    // owner does not have, and a link they were never offered is a silent gap.
    for (const broken of [
      { ...CLIENT_INFO.accounts[0], id: '' },
      { ...CLIENT_INFO.accounts[0], balance: 500000.5 },
      { ...CLIENT_INFO.accounts[0], creditLimit: null },
      { ...CLIENT_INFO.accounts[0], type: 7 },
    ]) {
      expect(parseClientInfo({ ...CLIENT_INFO, accounts: [broken] })).toBeUndefined();
    }
    expect(
      parseClientInfo({ ...CLIENT_INFO, jars: [{ ...CLIENT_INFO.jars[0], title: '' }] }),
    ).toBeUndefined();
  });
});

describe('parseStatement', () => {
  it('Scenario: A statement item parses whole', () => {
    expect(parseStatement([ITEM], uahStatement)).toEqual([
      {
        id: 'a1',
        timeMs: Date.UTC(2026, 7, 26, 9, 0, 0),
        date: '2026-08-26',
        description: 'СІЛЬПО',
        mcc: 5411,
        amount: money(-12550, 'UAH'),
        hold: false,
      },
    ]);
  });

  it('Scenario: A statement item parses whole — across midnight it is the device\'s day', () => {
    // 2026-08-26 00:30 in the injected zone is still 2026-08-25 in UTC. The item belongs to the
    // day the owner spent it, which is why the converter is injected rather than assumed.
    const justAfterMidnight = { ...ITEM, time: Date.UTC(2026, 7, 25, 21, 30, 0) / 1000 };
    expect(parseStatement([justAfterMidnight], uahStatement)?.[0]?.date).toBe('2026-08-26');
    expect(new Date(justAfterMidnight.time * 1000).toISOString().slice(0, 10)).toBe('2026-08-25');
  });

  it('Scenario: A foreign purchase is the сума the bank charged, and nothing more', () => {
    // `operationAmount` is in the payload; the currency it is denominated in is not, anywhere.
    // Money without a currency is not money this app holds, so the dollars are simply not
    // recorded, and the UAH the bank charged — the сума that counts — is exact (design D12).
    const abroad = { ...ITEM, amount: -420000, operationAmount: -10000 };
    const parsed = parseStatement([abroad], uahStatement)?.[0];
    expect(parsed?.amount).toEqual(money(-420000, 'UAH'));
    expect(Object.keys(parsed ?? {})).not.toContain('originalAmount');
  });

  it("Scenario: A row of another currency is not this рахунок's statement", () => {
    // The row's `currencyCode` is the *account's* currency, so one that is not this рахунок's says
    // the caller paired a statement with the wrong рахунок — read on and every сума would be
    // relabelled. Fails the answer instead.
    const usdRow = { ...ITEM, currencyCode: 840 };
    expect(parseStatement([usdRow], uahStatement)).toBeUndefined();
    expect(parseStatement([usdRow], { currency: 'USD', dateOf })).toEqual([
      expect.objectContaining({ amount: money(-12550, 'USD') }),
    ]);
    // And a currency the app does not offer at all is unreadable just the same.
    expect(parseStatement([{ ...ITEM, currencyCode: 985 }], uahStatement)).toBeUndefined();
  });

  it('Scenario: One unreadable row fails the whole answer', () => {
    const noId = { ...ITEM, id: undefined };
    expect(parseStatement([ITEM, noId, { ...ITEM, id: 'a3' }], uahStatement)).toBeUndefined();
    // And every other field it takes to read a row.
    for (const broken of [
      { ...ITEM, time: 'зараз' },
      { ...ITEM, mcc: null },
      { ...ITEM, amount: -125.5 },
      { ...ITEM, hold: 'false' },
      { ...ITEM, description: null },
      { ...ITEM, currencyCode: undefined },
    ]) {
      expect(parseStatement([broken], uahStatement)).toBeUndefined();
    }
    expect(parseStatement({ items: [] }, uahStatement)).toBeUndefined();
    // An empty window is not a failure — most windows are empty.
    expect(parseStatement([], uahStatement)).toEqual([]);
  });
});

describe('fetch outcomes', () => {
  it('Scenario: A 429 answer is rate-limited', async () => {
    const outcome = await fetchStatement(answering(429, { errorDescription: 'Too many requests' }), TOKEN, {
      accountId: 'kKGVoZuHWzqVoZuH',
      fromMs: 0,
      toMs: 1000,
      context: uahStatement,
    });
    expect(outcome).toEqual({ kind: 'rate-limited' });
  });

  it('Scenario: A rejected token is invalid-token', async () => {
    expect(await fetchClientInfo(answering(403, { errorDescription: 'Unknown' }), TOKEN)).toEqual({
      kind: 'invalid-token',
    });
    expect(await fetchClientInfo(answering(401, {}), TOKEN)).toEqual({ kind: 'invalid-token' });
  });

  it('Scenario: A network failure is unavailable', async () => {
    const offline: AuthFetchLike = () => Promise.reject(new Error('Network request failed'));
    // Nothing thrown: the failure arrived as a value, which is the whole contract.
    await expect(fetchClientInfo(offline, TOKEN)).resolves.toEqual({ kind: 'unavailable' });
  });

  it('A 500, an unparseable body and an alien payload are all unavailable', async () => {
    expect(await fetchClientInfo(answering(500, {}), TOKEN)).toEqual({ kind: 'unavailable' });
    const notJson: AuthFetchLike = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('<html>')) });
    expect(await fetchClientInfo(notJson, TOKEN)).toEqual({ kind: 'unavailable' });
    expect(await fetchClientInfo(answering(200, { nothing: true }), TOKEN)).toEqual({
      kind: 'unavailable',
    });
  });

  it('A converter that throws is unavailable, not a crash', async () => {
    const outcome = await fetchStatement(answering(200, [ITEM]), TOKEN, {
      accountId: 'acc',
      fromMs: 0,
      toMs: 1000,
      context: {
        currency: 'UAH',
        dateOf: () => {
          throw new Error('no timezone database');
        },
      },
    });
    expect(outcome).toEqual({ kind: 'unavailable' });
  });

  it('A parsed answer is the accounts, and the token went in the header', async () => {
    const fetchImpl = vi.fn<AuthFetchLike>(() => Promise.resolve(response(200, CLIENT_INFO)));
    const outcome = await fetchClientInfo(fetchImpl, TOKEN);
    expect(outcome.kind).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.monobank.ua/personal/client-info', {
      'X-Token': TOKEN,
    });
  });

  it('Scenario: No outcome carries the token', async () => {
    const runs: AuthFetchLike[] = [
      answering(200, CLIENT_INFO),
      answering(200, { nothing: true }),
      answering(401, { errorDescription: TOKEN }),
      answering(429, {}),
      answering(500, {}),
      () => Promise.reject(new Error(`fetch failed for ${TOKEN}`)),
    ];
    for (const run of runs) {
      const outcome = await fetchClientInfo(run, TOKEN);
      expect(JSON.stringify(outcome)).not.toContain(TOKEN);
      const statement = await fetchStatement(run, TOKEN, {
        accountId: 'acc',
        fromMs: 0,
        toMs: 1000,
        context: uahStatement,
      });
      expect(JSON.stringify(statement)).not.toContain(TOKEN);
    }
  });

  it('The token is never in a URL, where every log would keep it', async () => {
    const urls: string[] = [];
    const recording: AuthFetchLike = (url) => {
      urls.push(url);
      return Promise.resolve(response(200, []));
    };
    await fetchClientInfo(recording, TOKEN);
    await fetchStatement(recording, TOKEN, {
      accountId: 'kKGVoZuHWzqVoZuH',
      fromMs: 1_756_000_000_000,
      toMs: 1_756_200_000_000,
      context: uahStatement,
    });
    expect(urls.join(' ')).not.toContain(TOKEN);
    expect(urls[1]).toBe(
      'https://api.monobank.ua/personal/statement/kKGVoZuHWzqVoZuH/1756000000/1756200000',
    );
  });

  it('A window boundary mid-second is floored, never rounded into a moment it does not cover', () => {
    expect(monobankStatementUrl('acc', 1_756_000_000_999, 1_756_200_000_999)).toBe(
      'https://api.monobank.ua/personal/statement/acc/1756000000/1756200000',
    );
  });
});
