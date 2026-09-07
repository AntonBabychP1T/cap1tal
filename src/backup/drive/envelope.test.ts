import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ENVELOPE_HEAD_MAX_BYTES,
  ENVELOPE_MAGIC,
  ENVELOPE_VERSION,
  KEY_BYTES,
  NONCE_BYTES,
  isEnvelopeRefusal,
  keyId,
  openEnvelope,
  readEnvelopeHead,
  sealEnvelope,
} from './envelope';

/**
 * The envelope, proven in Node — which is the whole reason design D5 chose a pure-TypeScript
 * cipher. Every claim the spec makes about what sits in the owner's Drive is decidable here:
 * that it reveals nothing, that an altered byte anywhere makes it refuse, and that a key other
 * than the one it was sealed under opens nothing.
 */

/** A key shaped like the real one, and never one a device made. */
function key(fill: number): Uint8Array {
  return new Uint8Array(KEY_BYTES).fill(fill);
}

function nonce(fill: number): Uint8Array {
  return new Uint8Array(NONCE_BYTES).fill(fill);
}

/**
 * A бекап shaped like the real one: the text `makeBackup` produces, with a рахунок's name and a
 * сума in it — the very things the upload must not reveal.
 */
const BACKUP_TEXT = JSON.stringify({
  app: 'cap1tal',
  kind: 'backup',
  formatVersion: 2,
  schemaVersion: 19,
  createdAt: '2026-09-06T08:00:00.000Z',
  checksum: 'deadbeef',
  data: {
    accounts: [{ id: 'card', name: 'mono black', currency: 'UAH', openingBalance: 500000 }],
    transactions: [{ id: 'e1', amount: 12550, currency: 'UAH', description: 'СІЛЬПО Київ' }],
  },
});

const SEALED = {
  bytes: BACKUP_TEXT,
  schemaVersion: 19,
  createdAt: new Date('2026-09-06T08:00:00.000Z'),
};

function seal(overrides: Partial<Parameters<typeof sealEnvelope>[0]> = {}): Uint8Array {
  return sealEnvelope({ ...SEALED, key: key(7), nonce: nonce(3), ...overrides });
}

describe('what a sealed бекап gives away', () => {
  it('Scenario: The uploaded bytes reveal nothing', () => {
    const file = seal();
    const asText = new TextDecoder().decode(file);

    // Nothing of the owner's money survives into the uploaded bytes…
    for (const secret of ['mono black', 'СІЛЬПО', '12550', '500000', 'transactions', 'accounts']) {
      expect(asText).not.toContain(secret);
    }
    // …and neither does the бекап's own text, in whole or in part.
    expect(asText).not.toContain(BACKUP_TEXT.slice(0, 40));
    // What is readable is only what the head is for: what this is, and what it would restore to.
    expect(asText.startsWith(`${ENVELOPE_MAGIC}\n`)).toBe(true);
    expect(asText).toContain('"schemaVersion":19');
    // The key is not in the file it sealed — the one mistake this format could make.
    expect(asText).not.toContain(new TextDecoder().decode(key(7)));
    // Nor the бекап's own checksum: in the head it would be a 32-bit fingerprint of the owner's
    // whole state, and nothing a listing decides needs it (design D6).
    expect(asText).not.toContain('deadbeef');
  });

  it('The head is short enough to be read by a range request', () => {
    const file = seal();
    const head = readEnvelopeHead(file.subarray(0, ENVELOPE_HEAD_MAX_BYTES));

    // Listing the версії бекапу reads this prefix and nothing more, so a list of five costs a
    // few kilobytes rather than five whole бекапи.
    expect(isEnvelopeRefusal(head)).toBe(false);
    expect(head).toMatchObject({
      kind: 'ok',
      envelopeVersion: ENVELOPE_VERSION,
      schemaVersion: 19,
      // Which код відновлення opens it, readable without opening it — design D14.
      keyId: keyId(key(7)),
    });
    expect(head.kind === 'ok' && head.createdAt.toISOString()).toBe('2026-09-06T08:00:00.000Z');
  });
});

describe('what does not open', () => {
  it('Scenario: An altered upload does not open — a flipped byte of ciphertext', () => {
    const file = seal();
    const head = readEnvelopeHead(file);
    const bodyStart = (head.kind === 'ok' ? head.headLength : 0) + NONCE_BYTES;
    const altered = Uint8Array.from(file);
    altered[bodyStart] = (altered[bodyStart] ?? 0) ^ 0x01;

    expect(openEnvelope(altered, key(7))).toEqual({ kind: 'will-not-open' });
    // And the sound one still opens, so the refusal is about the alteration and nothing else.
    expect(openEnvelope(file, key(7))).toMatchObject({ kind: 'ok', bytes: BACKUP_TEXT });
  });

  it('Scenario: An altered upload does not open — a flipped byte of the head', () => {
    const file = seal();
    // The head is plaintext, so this is the edit that matters: making the app believe a бекап was
    // made at another moment, or under a schema it would accept. It is associated data, so the
    // cipher refuses rather than opening under the lie (design D6).
    const altered = Uint8Array.from(file);
    const at = new TextDecoder().decode(file).indexOf('2026-09-06');
    altered[at] = '2'.charCodeAt(0);
    altered[at + 3] = '5'.charCodeAt(0);

    // The head still reads — that is what plaintext means…
    const head = readEnvelopeHead(altered);
    expect(head.kind === 'ok' && head.createdAt.toISOString()).toBe('2025-09-06T08:00:00.000Z');
    // …and the claim is refused the moment it is checked against the cipher.
    expect(openEnvelope(altered, key(7))).toEqual({ kind: 'will-not-open' });
  });

  it('Scenario: An altered upload does not open — a flipped byte of the nonce', () => {
    const file = seal();
    const head = readEnvelopeHead(file);
    const nonceStart = head.kind === 'ok' ? head.headLength : 0;
    const altered = Uint8Array.from(file);
    altered[nonceStart] = (altered[nonceStart] ?? 0) ^ 0xff;

    expect(openEnvelope(altered, key(7))).toEqual({ kind: 'will-not-open' });
  });

  it('Scenario: The wrong key does not open it', () => {
    const file = seal();

    expect(openEnvelope(file, key(8))).toEqual({ kind: 'will-not-open' });
    // A key of the wrong length is refused as such rather than crashing the cipher.
    expect(openEnvelope(file, new Uint8Array(16).fill(7))).toEqual({ kind: 'will-not-open' });
    // Nothing about the refusal names the key it was tried with.
    expect(JSON.stringify(openEnvelope(file, key(8)))).not.toContain('7');
  });

  it('A file this app did not write is not an envelope, and a truncated one is damaged', () => {
    const encoder = new TextEncoder();

    expect(readEnvelopeHead(encoder.encode('{"some":"json"}\n'))).toEqual({
      kind: 'not-an-envelope',
    });
    expect(readEnvelopeHead(new Uint8Array(0))).toEqual({ kind: 'not-an-envelope' });
    // Ours, and cut short: the magic arrived and the head never finished.
    expect(readEnvelopeHead(encoder.encode(`${ENVELOPE_MAGIC}\n{"envelopeVer`))).toEqual({
      kind: 'damaged',
    });
    expect(readEnvelopeHead(encoder.encode(`${ENVELOPE_MAGIC}\nnot json\n`))).toEqual({
      kind: 'damaged',
    });
    // A head whose values are the wrong shape says nothing about a date it does not have.
    expect(
      readEnvelopeHead(encoder.encode(`${ENVELOPE_MAGIC}\n{"envelopeVersion":1,"createdAt":"nope"}\n`)),
    ).toEqual({ kind: 'damaged' });
    // A head of this format that names no key is damaged: D14 rests on every версія naming one.
    expect(
      readEnvelopeHead(
        encoder.encode(
          `${ENVELOPE_MAGIC}\n${JSON.stringify({
            envelopeVersion: ENVELOPE_VERSION,
            schemaVersion: 19,
            createdAt: '2026-09-06T08:00:00.000Z',
                })}\n`,
        ),
      ),
    ).toEqual({ kind: 'damaged' });
  });

  it('An envelope from a later format is refused before the key is even asked for', () => {
    // Deliberately shaped as a *future* format would be: fields this build has never heard of, and
    // none of today's beyond the version. Judging it by today's rules would call it damaged, when
    // the honest answer is that the app is behind.
    const later = new TextEncoder().encode(
      `${ENVELOPE_MAGIC}\n${JSON.stringify({
        envelopeVersion: ENVELOPE_VERSION + 1,
        somethingNewEntirely: true,
      })}\nbody`,
    );

    expect(readEnvelopeHead(later)).toEqual({
      kind: 'newer-envelope',
      envelopeVersion: ENVELOPE_VERSION + 1,
      supported: ENVELOPE_VERSION,
    });
    // And opening answers the same thing rather than a failure about the key: the owner needs to
    // update the app, not to find another код відновлення.
    expect(openEnvelope(later, key(7))).toEqual({
      kind: 'newer-envelope',
      envelopeVersion: ENVELOPE_VERSION + 1,
      supported: ENVELOPE_VERSION,
    });
  });
});

describe('which key sealed this', () => {
  it('names a key without giving it away', () => {
    const id = keyId(key(7));

    // Sixteen hex characters, the same every time — a name, not a nonce.
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(keyId(key(7))).toBe(id);
    // Two keys are two names.
    expect(keyId(key(8))).not.toBe(id);
    // And the name carries none of the key it names: no run of the key's own bytes is in it.
    expect(id).not.toContain('07070707');
    expect(Buffer.from(id, 'hex')).not.toEqual(key(7).subarray(0, 8));
  });

  it('is what tells one line of версії from another', () => {
    // The whole of design D14 rests on this being readable from the head alone: two phones that
    // never met can each see whose код відновлення a версія needs.
    const mine = readEnvelopeHead(seal({ key: key(7) }));
    const theirs = readEnvelopeHead(seal({ key: key(9) }));

    expect(mine.kind === 'ok' && theirs.kind === 'ok' && mine.keyId === theirs.keyId).toBe(false);
    expect(mine.kind === 'ok' && mine.keyId).toBe(keyId(key(7)));
  });

  it('A key of the wrong size cannot be named', () => {
    expect(() => keyId(new Uint8Array(31))).toThrow(RangeError);
  });
});

describe('the round trip', () => {
  it('A бекап sealed under a key comes back byte for byte', () => {
    const file = seal();

    expect(openEnvelope(file, key(7))).toEqual({
      kind: 'ok',
      bytes: BACKUP_TEXT,
      head: {
        envelopeVersion: ENVELOPE_VERSION,
        schemaVersion: 19,
        createdAt: new Date('2026-09-06T08:00:00.000Z'),
          keyId: keyId(key(7)),
      },
    });
  });

  it('holds over any payload, key and nonce', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.uint8Array({ minLength: KEY_BYTES, maxLength: KEY_BYTES }),
        fc.uint8Array({ minLength: NONCE_BYTES, maxLength: NONCE_BYTES }),
        fc.integer({ min: 1, max: 999 }),
        (text, k, n, schemaVersion) => {
          const file = sealEnvelope({
            bytes: text,
            schemaVersion,
            createdAt: new Date('2026-09-06T08:00:00.000Z'),
                  key: k,
            nonce: n,
          });
          const opened = openEnvelope(file, k);

          expect(opened).toMatchObject({ kind: 'ok', bytes: text });
          expect(opened.kind === 'ok' && opened.head.schemaVersion).toBe(schemaVersion);
          expect(opened.kind === 'ok' && opened.head.keyId).toBe(keyId(k));
        },
      ),
    );
  });

  it('Sealing the same бекап twice under the same key and nonce gives the same bytes', () => {
    // What makes «an unchanged бекап is not uploaded again» decidable without opening anything:
    // the envelope invents nothing of its own, no clock and no device.
    expect(seal()).toEqual(seal());
  });

  it('The reserved fingerprint nonce may never seal a бекап', () => {
    // `keyId` publishes eight bytes of keystream at this nonce, and that is safe only because no
    // envelope is ever sealed at it. A CSPRNG will not produce it; a caller with a fixed nonce
    // might, and that is a bug rather than a state.
    const reserved = new Uint8Array([
      0x63, 0x61, 0x70, 0x31, 0x74, 0x61, 0x6c, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x69, 0x64, 0x2d,
      0x76, 0x31, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    expect(() => seal({ nonce: reserved })).toThrow(RangeError);
    // Every other nonce, including one a byte away from it, seals as usual.
    const nearly = Uint8Array.from(reserved);
    nearly[23] = 1;
    expect(() => seal({ nonce: nearly })).not.toThrow();
  });

  it('A key or nonce of the wrong size is a programming error, not a refusal', () => {
    // The only throws in this module: a caller that built a key wrong has a bug, and a bug is not
    // a state to show the owner.
    expect(() => seal({ key: new Uint8Array(31) })).toThrow(RangeError);
    expect(() => seal({ nonce: new Uint8Array(12) })).toThrow(RangeError);
  });
});
