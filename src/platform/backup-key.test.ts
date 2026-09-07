import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { KEY_BYTES, keyId, openEnvelope, sealEnvelope } from '../backup/drive/envelope';
import {
  BACKUP_KEY_KEY,
  backupKeyKept,
  inMemoryBackupKeyStore,
  type BackupKeyStore,
} from './backup-key';
import { constantRandom, fixedRandom } from './random';

/**
 * The two secret-shaped ports, against the only implementations `verify` may load. Nothing here
 * imports `expo-secure-store` or `expo-crypto`: the native adapters are typechecked and exercised
 * on a device, and every rule about *what the app does with* the key is proven here and in
 * `src/backup/drive/connection.test.ts`.
 */

/** A key shaped like a real one, and never one a device made. */
const KEY = Uint8Array.from({ length: KEY_BYTES }, (_, index) => (index * 13 + 5) & 0xff);

describe('the sealing key store contract', () => {
  it('A key that was kept comes back, and only through `read`', async () => {
    const store: BackupKeyStore = inMemoryBackupKeyStore();

    expect(await store.read()).toEqual({ kind: 'ok' });
    expect(await store.save(KEY)).toEqual({ kind: 'ok' });
    expect(await store.read()).toEqual({ kind: 'ok', key: KEY });
    // A write hands nothing back — there is no path by which the key can be shown again except
    // through the код відновлення, which is made above this port and never stored here.
    expect(JSON.stringify(await store.save(KEY))).not.toContain(keyId(KEY));
    expect(JSON.stringify(await store.remove())).not.toContain(keyId(KEY));
  });

  it('holds bytes, not a reference a caller can go on editing', async () => {
    const mutable = Uint8Array.from(KEY);
    const store = inMemoryBackupKeyStore();
    await store.save(mutable);

    mutable.fill(0);

    // A real keystore writes the bytes it was given. A double that shared the array would let a
    // caller silently change the key that seals every future бекап.
    expect(await store.read()).toEqual({ kind: 'ok', key: KEY });
  });

  it('Unavailable secure storage is an answer, and never destroys a kept key', async () => {
    const store = inMemoryBackupKeyStore({ key: KEY, unavailable: true });

    // Not "no key": a phone whose keystore cannot be reached says so, so the section can offer a
    // retry instead of behaving as though Google Drive was never connected…
    expect(await store.read()).toEqual({ kind: 'unavailable' });
    // …and a write that cannot happen says so, rather than reporting a success that did not.
    expect(await store.save(new Uint8Array(KEY_BYTES).fill(9))).toEqual({ kind: 'unavailable' });
    // The one that matters most: a removal that cannot happen must not be reported as done, or
    // the app would start a fresh line while the old key is still on the phone.
    expect(await store.remove()).toEqual({ kind: 'unavailable' });

    // And when the keystore comes back, the key is exactly the one that was there.
    const recovered = inMemoryBackupKeyStore({ key: KEY });
    expect(await recovered.read()).toEqual({ kind: 'ok', key: KEY });
  });

  it('Scenario: Disconnecting removes it — but the sealing key is what stays', async () => {
    // Design D8: disconnecting forgets the Google authorisation and keeps the key, so reconnecting
    // on this phone continues the same line rather than orphaning every версія already uploaded.
    // The port makes that a decision a caller has to take, not something that happens by itself.
    const store = inMemoryBackupKeyStore({ key: KEY });
    const file = sealEnvelope({
      bytes: '{"app":"cap1tal"}',
      schemaVersion: 19,
      createdAt: new Date('2026-09-06T08:00:00.000Z'),
      key: KEY,
      nonce: new Uint8Array(24).fill(1),
    });

    // Nothing in this file is called by disconnecting…
    const stillThere = await store.read();
    expect(backupKeyKept(stillThere)).toBe(true);
    // …so a версія uploaded before it still opens afterwards.
    expect(stillThere.kind === 'ok' && openEnvelope(file, stillThere.key!)).toMatchObject({
      kind: 'ok',
    });

    // Removing is the deliberate act of starting a fresh line, and only then.
    expect(await store.remove()).toEqual({ kind: 'ok' });
    expect(backupKeyKept(await store.read())).toBe(false);
    // And it deleted nothing in Drive: the файл is still openable by whoever holds the код.
    expect(openEnvelope(file, KEY)).toMatchObject({ kind: 'ok' });
  });

  it('The key is versioned, so a later format cannot read this one', () => {
    expect(BACKUP_KEY_KEY).toBe('cap1tal.drive.backup-key.v1');
  });
});

describe('whether a read found a key kept', () => {
  it('A kept key counts as kept', () => {
    expect(backupKeyKept({ kind: 'ok', key: KEY })).toBe(true);
  });

  it('No key, and an empty one, count as none', () => {
    expect(backupKeyKept({ kind: 'ok' })).toBe(false);
    expect(backupKeyKept({ kind: 'ok', key: undefined })).toBe(false);
    // Zero bytes is not a key; `!== undefined` would have called this a connection.
    expect(backupKeyKept({ kind: 'ok', key: new Uint8Array(0) })).toBe(false);
  });

  it('Unreachable secure storage is not a kept key either', () => {
    expect(backupKeyKept({ kind: 'unavailable' })).toBe(false);
  });
});

describe('the randomness port', () => {
  it('hands out the number of bytes asked for', () => {
    expect(fixedRandom().bytes(KEY_BYTES)).toHaveLength(KEY_BYTES);
    expect(fixedRandom().bytes(24)).toHaveLength(24);
    expect(constantRandom(7).bytes(4)).toEqual(new Uint8Array([7, 7, 7, 7]));
  });

  it('gives a different draw each time, so two nonces are two nonces', () => {
    const random = fixedRandom();

    // The property the envelope depends on: a nonce reused across two uploads under one key is the
    // one mistake XChaCha20-Poly1305 does not survive.
    expect(random.bytes(24)).not.toEqual(random.bytes(24));
  });

  it('is predictable, which is what makes a sealed бекап assertable', () => {
    // Deliberately not a generator. A test says which key and which nonce it is working with, and
    // the real CSPRNG stays in `random-device.ts` where `verify` cannot reach it.
    expect(fixedRandom({ from: 3 }).bytes(4)).toEqual(new Uint8Array([3, 4, 5, 6]));
  });
});

describe('what `verify` may load', () => {
  it('The ports themselves pull in no React, no Expo and no database', () => {
    for (const name of ['./backup-key.ts', './random.ts']) {
      const source = readFileSync(new URL(name, import.meta.url), 'utf8');
      const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

      // The key store names its adapter in prose only, and the randomness port imports nothing.
      expect(imported).toEqual([]);
      for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
        expect(source).not.toContain(`'${forbidden}`);
      }
    }
  });

  it('is the only pair under src/platform that a test imports', () => {
    // The device adapters are proven on the emulator, not here. A test that imported one would
    // bring a native module into `verify` and the whole suite down with it.
    const here = fileURLToPath(new URL('.', import.meta.url));
    const tests = readdirSync(here).filter((name) => name.endsWith('.test.ts'));

    for (const test of tests) {
      const source = readFileSync(new URL(test, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from '\.\/[a-z-]*-device'/);
    }
  });
});
