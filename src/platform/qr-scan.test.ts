import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { cameraPermissionFrom, inMemoryQrScan, type CameraPermission } from './qr-scan';

/**
 * The port only — the device adapter is never loaded here, and must never be: `verify` runs no
 * native module and no React Native.
 */

describe('what the device says about the camera', () => {
  it('reads a granted permission as granted', () => {
    expect(
      cameraPermissionFrom({ granted: true, canAskAgain: true, status: 'granted' }),
    ).toBe('granted');
    // Granted wins whatever else the answer says — a granted permission needs nothing asked.
    expect(
      cameraPermissionFrom({ granted: true, canAskAgain: false, status: 'granted' }),
    ).toBe('granted');
  });

  it('A first scan asks: an ungranted permission the system will ask for is deniable', () => {
    expect(
      cameraPermissionFrom({ granted: false, canAskAgain: true, status: 'undetermined' }),
    ).toBe('deniable');
    expect(cameraPermissionFrom({ granted: false, canAskAgain: true, status: 'denied' })).toBe(
      'deniable',
    );
  });

  it('A blocked permission offers the settings: one the system will not ask for is blocked', () => {
    expect(
      cameraPermissionFrom({ granted: false, canAskAgain: false, status: 'denied' }),
    ).toBe('blocked');
    expect(
      cameraPermissionFrom({ granted: false, canAskAgain: true, status: 'denied-forever' }),
    ).toBe('blocked');
  });

  it('A build without a camera says so', () => {
    // Distinct from blocked: there is no dialog to show and no settings screen to send anyone to.
    expect(cameraPermissionFrom(undefined)).toBe('unsupported');
  });

  it('answers one of exactly four states, whatever it is given', () => {
    const states: CameraPermission[] = ['granted', 'deniable', 'blocked', 'unsupported'];

    for (const granted of [true, false]) {
      for (const canAskAgain of [true, false]) {
        for (const status of ['granted', 'denied', 'undetermined', 'denied-forever', '']) {
          expect(states).toContain(cameraPermissionFrom({ granted, canAskAgain, status }));
        }
      }
    }
  });
});

describe('the in-memory port', () => {
  it('asks the system only when asked to, and reports what came back', async () => {
    const port = inMemoryQrScan('deniable', 'granted');

    expect(await port.state()).toBe('deniable');
    // Nothing was asked merely by looking.
    expect(port.requested()).toBe(0);

    expect(await port.request()).toBe('granted');
    expect(port.requested()).toBe(1);
    expect(await port.state()).toBe('granted');
  });

  it('carries a refusal through to blocked', async () => {
    const port = inMemoryQrScan('deniable', 'deniable', 'blocked');

    expect(await port.request()).toBe('deniable');
    expect(await port.request()).toBe('blocked');
    expect(await port.state()).toBe('blocked');
  });

  it('stays where it is when only one answer was given', async () => {
    const port = inMemoryQrScan('unsupported');

    expect(await port.state()).toBe('unsupported');
    expect(await port.request()).toBe('unsupported');
    expect(await port.state()).toBe('unsupported');
  });

  it('records the settings screen being opened', async () => {
    const port = inMemoryQrScan('blocked');

    expect(port.opened()).toBe(0);
    await port.openSettings();
    expect(port.opened()).toBe(1);
  });
});

/**
 * The port has to stay loadable by `verify`, which runs no React Native, no Expo module and no
 * database. Asserted on the source rather than trusted, because the import that breaks it is the
 * easy one to add — and the file it would break is the one every rule about the permission is
 * proven against.
 */
it('The port itself pulls in no React, no Expo and no database', () => {
  const source = readFileSync(new URL('./qr-scan.ts', import.meta.url), 'utf8');
  const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

  expect(imported).toEqual([]);
  for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
    expect(source).not.toContain(`'${forbidden}`);
  }
});
