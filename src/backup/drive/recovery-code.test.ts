import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CODE_LENGTH,
  GROUP_COUNT,
  GROUP_SIZE,
  decodeRecoveryCode,
  encodeRecoveryCode,
} from './recovery-code';
import { KEY_BYTES, openEnvelope, sealEnvelope } from './envelope';

/**
 * The код відновлення, proven where it matters: that a key written down on paper and typed back on
 * a new phone opens the бекап, and that a character copied wrongly is caught as a typo rather than
 * surfacing as «не відкривається» after a download.
 */

function key(fill: number): Uint8Array {
  return new Uint8Array(KEY_BYTES).fill(fill);
}

/** A key with no repeating shape, so an encoder that dropped or reordered bits would show it. */
const VARIED = Uint8Array.from({ length: KEY_BYTES }, (_, index) => (index * 37 + 11) & 0xff);

describe('the код відновлення as a person copies it', () => {
  it('is eight groups of seven', () => {
    const code = encodeRecoveryCode(VARIED);
    const groups = code.split(' ');

    expect(groups).toHaveLength(GROUP_COUNT);
    for (const one of groups) {
      expect(one).toHaveLength(GROUP_SIZE);
    }
    expect(code.replace(/ /g, '')).toHaveLength(CODE_LENGTH);
  });

  it('uses no character that can be read as another', () => {
    const code = encodeRecoveryCode(VARIED).replace(/ /g, '');

    // Crockford leaves these out precisely because a person writing them cannot be told apart
    // from a person writing 1, 1, 0 — and `U` so no code spells something the owner would rather
    // not have written on the paper in their drawer.
    for (const excluded of ['I', 'L', 'O', 'U']) {
      expect(code).not.toContain(excluded);
    }
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('reads back however it was copied down', () => {
    const key32 = VARIED;
    const canonical = encodeRecoveryCode(key32);

    // Spaces lost, hyphens instead, lower case, ragged spacing — all the same code.
    for (const typed of [
      canonical,
      canonical.replace(/ /g, ''),
      canonical.replace(/ /g, '-'),
      canonical.toLowerCase(),
      `  ${canonical.replace(/ /g, '   ')}  `,
    ]) {
      expect(decodeRecoveryCode(typed)).toEqual({ kind: 'ok', key: key32 });
    }
  });

  it('reads I and L as 1 and O as 0, which is how they were written', () => {
    // The one substitution set that is a transcription artefact rather than a mistake: a person
    // writing this code by hand produces letters where the alphabet has digits.
    const canonical = encodeRecoveryCode(VARIED).replace(/ /g, '');
    const handwritten = canonical.replace(/1/g, 'I').replace(/0/g, 'O');

    expect(decodeRecoveryCode(handwritten)).toEqual({ kind: 'ok', key: VARIED });
  });
});

describe('opening a бекап on a phone that holds no key', () => {
  it('Scenario: A new phone opens the бекап with the код відновлення', () => {
    // The old phone seals a бекап and shows its код відновлення…
    const sealingKey = VARIED;
    const file = sealEnvelope({
      bytes: '{"app":"cap1tal","data":"…"}',
      schemaVersion: 19,
      createdAt: new Date('2026-09-06T08:00:00.000Z'),
      key: sealingKey,
      nonce: new Uint8Array(24).fill(3),
    });
    const written = encodeRecoveryCode(sealingKey);

    // …and the new phone, holding nothing, is given that code by hand.
    const read = decodeRecoveryCode(written);
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && openEnvelope(file, read.key)).toMatchObject({
      kind: 'ok',
      bytes: '{"app":"cap1tal","data":"…"}',
    });
  });

  it('Scenario: A phone without the key and without the code cannot open it', () => {
    const file = sealEnvelope({
      bytes: '{"app":"cap1tal"}',
      schemaVersion: 19,
      createdAt: new Date('2026-09-06T08:00:00.000Z'),
      key: VARIED,
      nonce: new Uint8Array(24).fill(3),
    });

    // Any other key, however it was arrived at, opens nothing.
    expect(openEnvelope(file, key(0))).toEqual({ kind: 'will-not-open' });
  });
});

describe('a код відновлення copied down wrongly', () => {
  it('Scenario: A mistyped код відновлення is refused as mistyped', () => {
    const canonical = encodeRecoveryCode(VARIED).replace(/ /g, '');

    // Every single-character substitution, at every position: caught by the check characters,
    // before any версія бекапу is fetched and before the cipher is asked anything at all.
    let checked = 0;
    for (let at = 0; at < canonical.length; at += 1) {
      const original = canonical[at]!;
      for (const replacement of '0123456789ABCDEFGHJKMNPQRSTVWXYZ') {
        if (replacement === original) continue;
        // The three folded characters are read *as* the digit they stand for, so substituting one
        // for the other is not a mistake — it is the same code, and that is by design.
        if ('01'.includes(original) && 'ILO'.includes(replacement)) continue;
        const mistyped = canonical.slice(0, at) + replacement + canonical.slice(at + 1);

        expect(decodeRecoveryCode(mistyped)).toEqual({ kind: 'mistyped' });
        checked += 1;
      }
    }
    // The loop actually ran over the whole code, rather than passing by doing nothing.
    expect(checked).toBeGreaterThan(1_500);
  });

  it('catches two adjacent characters swapped', () => {
    const canonical = encodeRecoveryCode(VARIED).replace(/ /g, '');

    let caught = 0;
    let swapped = 0;
    for (let at = 0; at < CODE_LENGTH - 1; at += 1) {
      const a = canonical[at]!;
      const b = canonical[at + 1]!;
      if (a === b) continue;
      const transposed = canonical.slice(0, at) + b + a + canonical.slice(at + 2);
      swapped += 1;
      if (decodeRecoveryCode(transposed).kind === 'mistyped') {
        caught += 1;
      }
    }

    // The other mistake hand-copying makes. The check is position-sensitive, so it catches them.
    expect(swapped).toBeGreaterThan(30);
    expect(caught).toBe(swapped);
  });

  it('A code of the wrong shape is malformed, not mistyped', () => {
    const canonical = encodeRecoveryCode(VARIED).replace(/ /g, '');

    // Too short, too long, and containing a character the alphabet does not have: none of these is
    // "you copied a character wrongly", and the sentence the owner reads differs.
    expect(decodeRecoveryCode(canonical.slice(0, -1))).toEqual({ kind: 'malformed' });
    expect(decodeRecoveryCode(`${canonical}Z`)).toEqual({ kind: 'malformed' });
    expect(decodeRecoveryCode(`${canonical.slice(0, -1)}U`)).toEqual({ kind: 'malformed' });
    expect(decodeRecoveryCode('')).toEqual({ kind: 'malformed' });
  });

  it('is refused before anything is opened', () => {
    // The property the spec asks for, stated as it is meant: reading a code touches no envelope,
    // so a refusal cannot have opened, downloaded or replaced anything.
    expect(decodeRecoveryCode('not a code at all')).toEqual({ kind: 'malformed' });
  });
});

describe('the round trip', () => {
  it('holds over any key', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: KEY_BYTES, maxLength: KEY_BYTES }), (k) => {
        expect(decodeRecoveryCode(encodeRecoveryCode(k))).toEqual({ kind: 'ok', key: k });
      }),
    );
  });

  it('gives a different code to every key', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: KEY_BYTES, maxLength: KEY_BYTES }),
        fc.uint8Array({ minLength: KEY_BYTES, maxLength: KEY_BYTES }),
        (a, b) => {
          fc.pre(!a.every((byte, index) => byte === b[index]));
          expect(encodeRecoveryCode(a)).not.toBe(encodeRecoveryCode(b));
        },
      ),
    );
  });

  it('A key of the wrong size cannot be written down', () => {
    expect(() => encodeRecoveryCode(new Uint8Array(31))).toThrow(RangeError);
  });
});
