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
    const answers: NotificationAccess[] = ['granted', 'denied', 'unsupported'];
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
