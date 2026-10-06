import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  inMemoryNotificationAccess,
  notificationAccessFrom,
  type NotificationAccess,
} from './notification-access';

/**
 * The port only — the device adapter is never loaded here, and must never be: `verify` runs no
 * native module and no React Native.
 */

describe('the notification access double', () => {
  it('Answers every state the device can give', async () => {
    const answers: NotificationAccess[] = ['granted', 'denied', 'unsupported', 'not-listening'];
    for (const answer of answers) {
      await expect(inMemoryNotificationAccess(answer).state()).resolves.toBe(answer);
    }
  });

  it('Records that the settings screen was opened, so silence can be proven', async () => {
    const port = inMemoryNotificationAccess('denied');
    expect(port.opened()).toBe(0);
    await port.openSettings();
    expect(port.opened()).toBe(1);
  });
});

describe('the answer a platform gives', () => {
  it('Scenario: A platform without the permission says so', () => {
    // Nothing to switch on — no listener in this build (web, an iOS build, a build the module did
    // not make it into) — is `unsupported`, and it is a different answer from a listener the owner
    // has switched off. This is the mapping `notification-access-device.ts` applies; `verify` can
    // never load that file, so the mapping lives here where it can be asserted.
    expect(notificationAccessFrom(undefined)).toBe('unsupported');
    expect(notificationAccessFrom(false)).toBe('denied');
    expect(notificationAccessFrom(undefined)).not.toBe(notificationAccessFrom(false));
  });

  it('Scenario: Granting flips the answer to granted', () => {
    // The device adapter asks the module and maps its answer through here; the grant itself is
    // Android's own switch, proven on the emulator (tasks.md 5.1).
    expect(notificationAccessFrom(true)).toBe('granted');
  });

  it('Scenario: Revoking flips the answer back to denied', () => {
    // Nothing is remembered on our side, so a grant withdrawn while the app was closed is simply
    // the next `false` the operating system reports.
    expect(notificationAccessFrom(false)).toBe('denied');
  });

  it('Scenario: A switched-on capture layer that hears nothing is not reported as granted', () => {
    // The defect this whole mapping exists for. Android's list of enabled listeners says the
    // owner switched the app on; it says nothing about whether the listener is bound, and an
    // update, a reinstall or a «Force stop» leaves one enabled and deaf. Two different states,
    // and the app must never draw them as one.
    expect(notificationAccessFrom(true, false)).toBe('not-listening');
    expect(notificationAccessFrom(true, false)).not.toBe(notificationAccessFrom(true, true));
    // And it is not «denied» either: the switch is on, so the section keeps the watched apps and
    // the wording has to say something else entirely.
    expect(notificationAccessFrom(true, false)).not.toBe(notificationAccessFrom(false, false));
  });

  it('Scenario: A reconnected capture layer reads as granted', () => {
    // What the rebind buys: the same enabled listener, now bound, is simply granted again. There
    // is nothing to un-remember, because nothing was remembered.
    expect(notificationAccessFrom(true, true)).toBe('granted');
  });

  it('Scenario: A device that cannot say is not reported as silent', () => {
    // A module that resolved but threw, or a platform that has no such question, has not answered
    // "deaf". Reading it as one would announce a сповіщення про збій on every open of a build
    // that works — the same rule `installedAmong` keeps with `'unknown'`.
    expect(notificationAccessFrom(true, undefined)).toBe('granted');
    expect(notificationAccessFrom(true)).toBe('granted');
    // And the listening fact cannot rescue a switch that is off, or invent a listener to bind.
    expect(notificationAccessFrom(false, true)).toBe('denied');
    expect(notificationAccessFrom(undefined, true)).toBe('unsupported');
  });
});

/**
 * The device adapter's own order, held by reading it rather than by running it.
 *
 * One rule in this feature is neither pure nor visible on a screen: on the path where the
 * listener is switched on and not hearing, the adapter asks the system to bind it again, waits,
 * and asks a second time before it answers. Without that second ask every rebind that is about to
 * succeed would be reported as silence and raise a сповіщення про збій that clears itself moments
 * later — noise about a problem already fixed.
 *
 * Reading the file as text is not loading it: no native module resolves here and `verify` stays
 * Node-only. It is the same technique `notifications-screen.test.ts` uses on the collect gate,
 * and for the same reason — the alternative is a device.
 */
describe('the device adapter asks again before it reports silence', () => {
  const adapter = readFileSync(new URL('./notification-access-device.ts', import.meta.url), 'utf8');

  it('Scenario: A switched-on capture layer that hears nothing is not reported as granted', () => {
    // The order is the rule, so the order is what is asserted. It asks for the rebind…
    const asked = adapter.indexOf('native.requestRebind()');
    expect(asked).toBeGreaterThan(-1);
    // …then waits a bounded moment for the system to do it…
    const waited = adapter.indexOf('setTimeout(resolve, REBIND_GRACE_MS)');
    expect(waited).toBeGreaterThan(asked);
    // …and only then reads the listening fact again. That second read is the whole difference
    // between reporting a state and reporting the instant the app happened to ask in.
    expect(adapter.slice(waited)).toMatch(/listening\(native\)/);
    // And the wait is bounded by a named constant, never an open-ended retry on a screen that is
    // opening.
    expect(adapter).toMatch(/const REBIND_GRACE_MS = \d+;/);
  });

  it('Scenario: A reconnected capture layer reads as granted', () => {
    // A listener that is already bound is never told to bind again: the wait of the previous test
    // is paid only on the path that is already broken, so an ordinary open answers at once. The
    // early return is what guarantees it, and it hands the listening fact straight to the mapping
    // rather than deciding anything here.
    expect(adapter).toMatch(
      /if \(heard !== false\) \{\s*return notificationAccessFrom\(true, heard\);\s*\}/,
    );
    // And that early return stands before the rebind is ever asked for.
    expect(adapter.indexOf('if (heard !== false)')).toBeLessThan(
      adapter.indexOf('native.requestRebind()'),
    );
  });

  it('decides nothing itself — the answer is the pure mapping', () => {
    // Every answer this file gives goes through `notificationAccessFrom`, so the four states are
    // decided in the one place `verify` can execute. A literal state here would be a fifth rule
    // living where nothing can test it.
    expect(adapter).toContain('notificationAccessFrom(');
    for (const state of ["'granted'", "'denied'", "'unsupported'", "'not-listening'"]) {
      expect(adapter, `${state} is decided in notification-access.ts, not here`).not.toContain(
        `return ${state}`,
      );
    }
  });
});

/**
 * The port has to stay loadable by `verify`, which runs no React Native, no Expo module and no
 * database. Asserted on the source rather than trusted, because the import that breaks it is the
 * easy one to add — and the file it would break is the one every rule about the permission is
 * proven against.
 */
it('The port itself pulls in no React, no Expo and no database', () => {
  const source = readFileSync(new URL('./notification-access.ts', import.meta.url), 'utf8');
  const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

  expect(imported).toEqual([]);
  for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
    expect(source).not.toContain(`'${forbidden}`);
  }
});
