import { describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import {
  inMemoryMonobankTokenStore,
  MONOBANK_TOKEN_KEY,
  tokenKept,
  type MonobankTokenStore,
} from './monobank-token';

/**
 * The port's contract, against the one implementation `verify` may load. Nothing here imports
 * `expo-secure-store`: the native adapter is typechecked and exercised on a device, and every
 * rule about *what the app does with* the token is proven here and in
 * `src/monobank/connection.test.ts`.
 */

/** A value shaped like a real personal token, and never a real one. */
const TOKEN = 'uT3st_TOKEN_valueeeeeeeeeeeeeeeeeeeeeeee';

describe('the monobank token store contract', () => {
  it('A token that was kept comes back, and only through `read`', async () => {
    const store: MonobankTokenStore = inMemoryMonobankTokenStore();

    expect(await store.read()).toEqual({ kind: 'ok' });
    expect(await store.save(TOKEN)).toEqual({ kind: 'ok' });
    expect(await store.read()).toEqual({ kind: 'ok', token: TOKEN });
    // A write hands nothing back — there is no path by which the value can be shown again.
    expect(JSON.stringify(await store.save(TOKEN))).not.toContain(TOKEN);
    expect(JSON.stringify(await store.remove())).not.toContain(TOKEN);
  });

  it('Replacing a token keeps only the newer one', async () => {
    const store = inMemoryMonobankTokenStore({ token: TOKEN });

    await store.save('uT3st_REPLACEMENT_valueeeeeeeeeeeeeeeee');

    expect(await store.read()).toEqual({
      kind: 'ok',
      token: 'uT3st_REPLACEMENT_valueeeeeeeeeeeeeeeee',
    });
  });

  it('Unavailable secure storage returns no candidate value', async () => {
    const store = inMemoryMonobankTokenStore({ token: TOKEN, unavailable: true });

    // Not "no token": a device whose keystore cannot be reached says so, so the screen can offer
    // a retry instead of silently behaving as though monobank was never configured…
    expect(await store.read()).toEqual({ kind: 'unavailable' });
    // …and a write that cannot happen says so too, rather than reporting a success that did not.
    expect(await store.save('uT3st_ANOTHER_valueeeeeeeeeeeeeeeeeeeee')).toEqual({
      kind: 'unavailable',
    });
    expect(await store.remove()).toEqual({ kind: 'unavailable' });
    // Nothing it answers with carries the candidate or the stored value.
    const answers = JSON.stringify([await store.read(), await store.save(TOKEN)]);
    expect(answers).not.toContain(TOKEN);
  });

  it('Scenario: Removing the token keeps imported history', async () => {
    // The financial state the removal must not touch: a рахунок and the витрата a sync imported
    // onto it. The store knows nothing about either — which is the property being asserted.
    const card = account({
      id: 'card',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(5_000_00, 'UAH'),
    });
    const imported = expenseByDefault({
      id: 'e1',
      date: '2026-08-27',
      accountId: 'card',
      amount: money(125_50, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      description: 'СІЛЬПО Київ',
    });
    const balanceBefore = computeBalance(card, [imported]);
    const store = inMemoryMonobankTokenStore({ token: TOKEN });

    expect(await store.remove()).toEqual({ kind: 'ok' });

    // The token is gone…
    expect(await store.read()).toEqual({ kind: 'ok' });
    // …and every рахунок and транзакція remains exactly as it was.
    expect(imported).toEqual(
      expenseByDefault({
        id: 'e1',
        date: '2026-08-27',
        accountId: 'card',
        amount: money(125_50, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
        description: 'СІЛЬПО Київ',
      }),
    );
    expect(computeBalance(card, [imported])).toEqual(balanceBefore);
  });

  it('The key is versioned, so a later format cannot read this one', () => {
    expect(MONOBANK_TOKEN_KEY).toBe('cap1tal.monobank.personal-token.v1');
  });
});

describe('whether a read found a token kept', () => {
  it('A kept token counts as kept', () => {
    expect(tokenKept({ kind: 'ok', token: 'abc' })).toBe(true);
  });

  it('No token, and an empty one, count as none', () => {
    expect(tokenKept({ kind: 'ok' })).toBe(false);
    expect(tokenKept({ kind: 'ok', token: undefined })).toBe(false);
    // An empty string is not a token; `!== undefined` would have called this a connection.
    expect(tokenKept({ kind: 'ok', token: '' })).toBe(false);
  });

  it('Unreachable secure storage is not a kept token either', () => {
    expect(tokenKept({ kind: 'unavailable' })).toBe(false);
  });
});
