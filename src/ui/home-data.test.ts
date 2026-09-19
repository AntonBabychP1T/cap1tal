import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { IsoDate } from '../domain/transaction';
import { hasDateRolledOver, makeCancelToken } from './home-data';

describe('hasDateRolledOver', () => {
  const SEP_30 = '2026-09-30' as IsoDate;

  it('Scenario: Rollover updates the month — local October 1 arrives while it remains open', () => {
    expect(hasDateRolledOver(SEP_30, new Date(2026, 9, 1, 0, 1))).toBe(true);
  });

  it('a later moment on the same recorded day is not a rollover', () => {
    expect(hasDateRolledOver(SEP_30, new Date(2026, 8, 30, 23, 59))).toBe(false);
  });

  it('a year boundary is a rollover exactly like any other day', () => {
    expect(hasDateRolledOver('2025-12-31' as IsoDate, new Date(2026, 0, 1, 0, 0))).toBe(true);
  });

  it('the app resuming days later is still a rollover, not just the next day', () => {
    expect(hasDateRolledOver(SEP_30, new Date(2026, 9, 8, 12, 0))).toBe(true);
  });
});

describe('makeCancelToken', () => {
  it('Scenario: old result cannot overwrite new — an uncancelled token still reports live', () => {
    const { token } = makeCancelToken();
    expect(token.cancelled()).toBe(false);
  });

  it('Scenario: old result cannot overwrite new — cancelling is what a superseded read checks', () => {
    const { token, cancel } = makeCancelToken();
    cancel();
    expect(token.cancelled()).toBe(true);
  });

  it('cancelling twice — the double-invoke React development renders — reports the same thing', () => {
    const { token, cancel } = makeCancelToken();
    cancel();
    cancel();
    expect(token.cancelled()).toBe(true);
  });

  it('two tokens from two reads never share state', () => {
    const first = makeCancelToken();
    const second = makeCancelToken();
    first.cancel();
    expect(first.token.cancelled()).toBe(true);
    expect(second.token.cancelled()).toBe(false);
  });
});

/**
 * The tab itself is JSX `verify` never runs, so the data lifecycle it wires — which event reloads
 * what, and which state changes must not — is held structurally: the pattern `reports-screen.test.ts`
 * and `progress-screen.test.ts` already use for a screen's own wiring.
 */
const screen = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');

describe('every named trigger reaches reload()', () => {
  it('Scenario: focus — mutation, restore, valuation and opening-balance edit all return by navigating back', () => {
    // None of these four has an event of its own on this screen: each happens on a screen reached
    // by leaving Головний (transaction/[id], backup-file, account/[id], manage/…), so returning to
    // Головний is a navigation focus, and `useReloadOnFocus` is what answers it.
    expect(screen).toContain('useReloadOnFocus(');
  });

  it('Scenario: sync — a committed run reloads whether it was asked for or arrived on its own', () => {
    const from = screen.indexOf('onSyncState(');
    expect(from).toBeGreaterThan(-1);
    const block = screen.slice(from, screen.indexOf('[reload]);', from));
    expect(block).toContain('reload()');
  });

  it('Scenario: capture — a чернетка stored while the tab already has focus still reaches the screen', () => {
    expect(screen).toContain('onCapturesStored(reload)');
  });

  it('Scenario: date rollover — checked both on resume and while the screen never left the foreground', () => {
    expect(screen).toContain("AppState.addEventListener('change'");
    expect(screen).toContain('setInterval(rolledOver');
    expect(screen).toContain('hasDateRolledOver(stored.today, new Date())');
    // Both paths call the one function every other trigger calls — no separate, second-class reload.
    const rollover = screen.slice(
      screen.indexOf('const rolledOver ='),
      screen.indexOf('const interval ='),
    );
    expect(rollover).toContain('reload()');
  });
});

describe('old result cannot overwrite new', () => {
  it('Scenario: the monobank token read cannot apply once its own effect has been cleaned up', () => {
    const from = screen.indexOf('makeCancelToken()');
    expect(from).toBeGreaterThan(-1);
    const block = screen.slice(from, screen.indexOf('}, []),', from));
    expect(block).toContain('token.cancelled()');
    // The cleanup itself trips the token — not a hand-rolled flag reinvented beside it.
    expect(block).toContain('return cancel;');
  });
});

describe('status-only rerender does not rescan history', () => {
  it('Scenario: «Топ категорій» is not recomputed by a change to sync/monobank status', () => {
    const from = screen.indexOf('const categories = useMemo(');
    const to = screen.indexOf(');', from);
    const block = screen.slice(from, to);
    for (const status of ['configured', 'syncing', 'coverage', 'drafts', 'pulling']) {
      expect(block, `categories recomputes on ${status}`).not.toContain(status);
    }
  });

  it('Scenario: «Статок» is not recomputed by a change to sync/monobank status', () => {
    const from = screen.indexOf('const netWorth = useMemo(');
    const to = screen.indexOf('  );', from);
    const block = screen.slice(from, to);
    for (const status of ['configured', 'syncing', 'coverage', 'drafts', 'pulling']) {
      expect(block, `netWorth recomputes on ${status}`).not.toContain(status);
    }
  });
});

describe('currency selection sends no requests', () => {
  it('Scenario: picking a currency on either widget is a plain state update, nothing else', () => {
    // Wired straight to `useState`'s own setter — no wrapping function that could reach a repo, a
    // reload or a network call between the tap and the state it changes.
    expect(screen).toContain('onSelectCurrency={setRequestedCategoryCurrency}');
    expect(screen).toContain('onSelectHistoryCurrency={setRequestedHistoryCurrency}');
  });
});
