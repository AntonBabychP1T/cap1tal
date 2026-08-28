import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { inMemoryMonobankTokenStore, type MonobankTokenStore } from '../platform/monobank-token';
import type { AuthFetchLike, MonobankAccount } from './api';
import { monobankConnection, type ConnectionPorts } from './connection';

/**
 * Two made-up tokens. Half of what these tests assert is that neither of them comes back: not in
 * an outcome, not in an error, not in anything the screen could render or a log could hold.
 */
const TOKEN = 'uT3st_FIRST_tokennnnnnnnnnnnnnnnnnnnnnnn';
const REPLACEMENT = 'uT3st_SECOND_tokennnnnnnnnnnnnnnnnnnnnnn';

const CLIENT_INFO = {
  clientId: '3MSaMMtczs',
  name: 'Власник',
  accounts: [
    {
      id: 'mono-card',
      currencyCode: 980,
      balance: 500000,
      creditLimit: 200000,
      maskedPan: ['537541******1234'],
      type: 'black',
    },
  ],
  jars: [{ id: 'mono-jar', currencyCode: 840, balance: 123450, title: 'На відпустку' }],
};

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const answering =
  (status: number, body: unknown = CLIENT_INFO): AuthFetchLike =>
  () =>
    Promise.resolve(response(status, body));

const unreachable: AuthFetchLike = () => Promise.reject(new Error('offline'));

const now = new Date('2026-08-28T08:00:00.000Z');

/** A connection over the in-memory token store, recording what it was asked to cache. */
function connectionOver(
  fetchImpl: AuthFetchLike,
  tokenStore: MonobankTokenStore = inMemoryMonobankTokenStore(),
  cacheFails = false,
) {
  const cached: { accounts: readonly MonobankAccount[]; at: Date }[] = [];
  const ports: ConnectionPorts = {
    tokenStore,
    fetch: fetchImpl,
    cacheAccounts: (accounts, at) => {
      if (cacheFails) {
        throw new Error('database is busy');
      }
      cached.push({ accounts, at });
    },
    now: () => now,
  };
  return { connection: monobankConnection(ports), cached, tokenStore };
}

describe('monobankConnection — keeping a token', () => {
  it('Scenario: A valid token becomes configured without being revealed', async () => {
    const { connection, cached, tokenStore } = connectionOver(answering(200));

    const result = await connection.submit(TOKEN);

    // monobank becomes configured, and the accounts it showed are offered for linking…
    expect(result.kind).toBe('configured');
    expect(result.kind === 'configured' && result.accounts.map((a) => a.id)).toEqual([
      'mono-card',
      'mono-jar',
    ]);
    expect(await connection.state()).toEqual({ kind: 'configured' });
    // …the balances are cached in each account's own currency, at the moment they were obtained…
    expect(cached).toHaveLength(1);
    expect(cached[0]?.at).toBe(now);
    expect(cached[0]?.accounts.map((a) => a.bankBalance)).toEqual([
      money(300000, 'UAH'),
      money(123450, 'USD'),
    ]);
    // …and the value itself is nowhere in what the screen can see.
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    // It is kept, though — the next request has something to send.
    expect(await tokenStore.read()).toEqual({ kind: 'ok', token: TOKEN });
  });

  it('Scenario: An invalid replacement keeps the working token', async () => {
    const tokenStore = inMemoryMonobankTokenStore({ token: TOKEN });
    const { connection } = connectionOver(answering(401, {}), tokenStore);

    const result = await connection.submit(REPLACEMENT);

    expect(result).toEqual({ kind: 'invalid-token' });
    // The replacement is not kept and the existing token still is.
    expect(await tokenStore.read()).toEqual({ kind: 'ok', token: TOKEN });
    expect(await connection.state()).toEqual({ kind: 'configured' });
    expect(JSON.stringify(result)).not.toContain(REPLACEMENT);
  });

  it('Scenario: An unavailable first validation keeps nothing', async () => {
    const { connection, cached, tokenStore } = connectionOver(unreachable);

    const result = await connection.submit(TOKEN);

    expect(result).toEqual({ kind: 'unavailable' });
    // No token kept, nothing cached, and the candidate is not echoed back for a retry to show.
    expect(await tokenStore.read()).toEqual({ kind: 'ok' });
    expect(await connection.state()).toEqual({ kind: 'not-configured' });
    expect(cached).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('A rate-limited validation keeps nothing and says so as itself', async () => {
    const { connection, tokenStore } = connectionOver(answering(429, {}));

    expect(await connection.submit(TOKEN)).toEqual({ kind: 'rate-limited' });
    expect(await tokenStore.read()).toEqual({ kind: 'ok' });
  });

  it('An unreadable client-info answer keeps nothing', async () => {
    // A 200 whose body is not client-info: the parser refuses it whole, so nothing is adopted.
    const { connection, tokenStore, cached } = connectionOver(answering(200, { hello: 'world' }));

    expect(await connection.submit(TOKEN)).toEqual({ kind: 'unavailable' });
    expect(await tokenStore.read()).toEqual({ kind: 'ok' });
    expect(cached).toEqual([]);
  });

  it('A device that will not keep the token says so, rather than reporting success', async () => {
    const { connection, cached } = connectionOver(
      answering(200),
      inMemoryMonobankTokenStore({ unavailable: true }),
    );

    expect(await connection.submit(TOKEN)).toEqual({ kind: 'storage-unavailable' });
    // Nothing was cached either: caching follows a successful write, never precedes it.
    expect(cached).toEqual([]);
  });

  it('A cache that fails leaves the valid token kept', async () => {
    const tokenStore = inMemoryMonobankTokenStore();
    const { connection } = connectionOver(answering(200), tokenStore, true);

    const result = await connection.submit(TOKEN);

    expect(result.kind).toBe('configured');
    expect(result.kind === 'configured' && result.cached).toBe(false);
    expect(await tokenStore.read()).toEqual({ kind: 'ok', token: TOKEN });
  });
});

describe('monobankConnection — refreshing and removing', () => {
  it('Scenario: An invalid stored token asks for replacement', async () => {
    const tokenStore = inMemoryMonobankTokenStore({ token: TOKEN });
    const { connection, cached } = connectionOver(answering(403, {}), tokenStore);

    const result = await connection.refresh();

    // Identified as an invalid token rather than as an offline error…
    expect(result).toEqual({ kind: 'invalid-token' });
    expect(cached).toEqual([]);
    // …and the token is still there to be replaced, not deleted out from under the owner.
    expect(await tokenStore.read()).toEqual({ kind: 'ok', token: TOKEN });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('Refreshing without a configured token asks for one', async () => {
    const { connection } = connectionOver(answering(200));

    expect(await connection.refresh()).toEqual({ kind: 'not-configured' });
  });

  it('Refreshing with a working token updates the cached balances', async () => {
    const { connection, cached } = connectionOver(
      answering(200),
      inMemoryMonobankTokenStore({ token: TOKEN }),
    );

    const result = await connection.refresh();

    expect(result.kind).toBe('configured');
    expect(result.kind === 'configured' && result.cached).toBe(true);
    expect(cached[0]?.accounts.map((a) => a.id)).toEqual(['mono-card', 'mono-jar']);
  });

  it('Unreachable secure storage is its own state, not "no token"', async () => {
    const { connection } = connectionOver(
      answering(200),
      inMemoryMonobankTokenStore({ token: TOKEN, unavailable: true }),
    );

    expect(await connection.state()).toEqual({ kind: 'storage-unavailable' });
    expect(await connection.refresh()).toEqual({ kind: 'storage-unavailable' });
    expect(await connection.remove()).toEqual({ kind: 'storage-unavailable' });
  });

  it('Scenario: Removing the token keeps imported history', async () => {
    const tokenStore = inMemoryMonobankTokenStore({ token: TOKEN });
    // Nothing that could reach a рахунок, a транзакція, a link or an imported id is even wired in:
    // the only port this module has besides the API is `cacheAccounts`, and removal never calls it.
    const { connection, cached } = connectionOver(answering(200), tokenStore);

    expect(await connection.remove()).toEqual({ kind: 'ok' });

    // The token is gone and sync is disabled — there is nothing left to send.
    expect(await tokenStore.read()).toEqual({ kind: 'ok' });
    expect(await connection.state()).toEqual({ kind: 'not-configured' });
    expect(await connection.refresh()).toEqual({ kind: 'not-configured' });
    expect(cached).toEqual([]);
  });
});
