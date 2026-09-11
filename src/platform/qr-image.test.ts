import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { inMemoryQrImage } from './qr-image';

/**
 * The port only — the device adapter is never loaded here, and must never be: `verify` runs no
 * native module and no React Native.
 */

describe('the in-memory port', () => {
  it('Scenario: A picked photo with a QR is decoded', async () => {
    const port = inMemoryQrImage({ kind: 'decoded', text: 'https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168' });

    expect(port.picked()).toBe(0);
    expect(await port.pickAndDecode()).toEqual({
      kind: 'decoded',
      text: 'https://cabinet.tax.gov.ua/cashregs/check?id=45&fn=3000898168',
    });
    expect(port.picked()).toBe(1);
  });

  it('Scenario: Leaving the picker is cancelled', async () => {
    const port = inMemoryQrImage();

    expect(await port.pickAndDecode()).toEqual({ kind: 'cancelled' });
    expect(port.picked()).toBe(1);
  });

  it('Scenario: A photo with no QR code says so', async () => {
    const port = inMemoryQrImage({ kind: 'no-qr' });

    expect(await port.pickAndDecode()).toEqual({ kind: 'no-qr' });
  });

  it('Scenario: A file that cannot be read is a typed failure', async () => {
    const port = inMemoryQrImage({ kind: 'failed', reason: 'Файл не знайдено' });

    expect(await port.pickAndDecode()).toEqual({ kind: 'failed', reason: 'Файл не знайдено' });
  });

  it('counts every pick, not just the first', async () => {
    const port = inMemoryQrImage({ kind: 'cancelled' });

    await port.pickAndDecode();
    await port.pickAndDecode();
    expect(port.picked()).toBe(2);
  });
});

/**
 * The port has to stay loadable by `verify`, which runs no React Native, no Expo module and no
 * database. Asserted on the source rather than trusted, because the import that breaks it is the
 * easy one to add — and the file it would break is the one every rule about a picked photo is
 * proven against.
 */
it('The port itself pulls in no React, no Expo and no database', () => {
  const source = readFileSync(new URL('./qr-image.ts', import.meta.url), 'utf8');
  const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

  expect(imported).toEqual([]);
  for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
    expect(source).not.toContain(`'${forbidden}`);
  }
});
