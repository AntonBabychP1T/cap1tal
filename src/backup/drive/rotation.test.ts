import { describe, expect, it } from 'vitest';

import { KEY_BYTES, keyId, sealEnvelope } from './envelope';
import { VERSIONS_KEPT, versionsOf, versionsToPrune, type KnownVersion } from './rotation';

/**
 * The rotation rule, over what a folder holds. The one thing it must never do is delete a версія
 * бекапу the phone cannot open — that is design D14's third part, and without it a replaced phone
 * would lose every версія its old код відновлення opens, within five days.
 */

function key(fill: number): Uint8Array {
  return new Uint8Array(KEY_BYTES).fill(fill);
}

const MINE = keyId(key(7));
const THEIRS = keyId(key(9));

/** A версія as the folder shows it, dated by the бекап it holds. */
function version(name: string, day: number, sealedBy = MINE): KnownVersion {
  return {
    id: name,
    name,
    keyId: sealedBy,
    createdAt: new Date(`2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`),
  };
}

describe('what may be removed once a newer version is up', () => {
  it('Scenario: Older versions are pruned only after a newer one is complete', () => {
    // The folder as it stands *after* the upload was confirmed — six версії, of which five stay.
    const versions = [1, 2, 3, 4, 5, 6].map((day) => version(`v${day}`, day));

    const pruned = versionsToPrune({ versions, keyId: MINE });

    // Only the oldest goes, and only because a newer complete one exists above it.
    expect(pruned.map((v) => v.name)).toEqual(['v1']);
    expect(VERSIONS_KEPT).toBe(5);
  });

  it('keeps everything while the folder holds no more than it keeps', () => {
    for (let count = 0; count <= VERSIONS_KEPT; count += 1) {
      const versions = Array.from({ length: count }, (_, index) => version(`v${index}`, index + 1));
      expect(versionsToPrune({ versions, keyId: MINE })).toEqual([]);
    }
  });

  it('Scenario: A failed upload leaves the folder untouched', () => {
    // A failed upload never reaches rotation at all — the run stops at the failure. Asserted from
    // this side too: with nothing newly uploaded, the folder of five is at its limit and untouched.
    const versions = [1, 2, 3, 4, 5].map((day) => version(`v${day}`, day));

    expect(versionsToPrune({ versions, keyId: MINE })).toEqual([]);
  });

  it('prunes by the date in the бекап, not by the file name', () => {
    // A file someone renamed in Drive must not change which версія is kept. The date comes from
    // the head the cipher authenticates (design D10).
    const versions = [
      version('zzz-oldest', 1),
      version('aaa-newest', 6),
      ...[2, 3, 4, 5].map((day) => version(`v${day}`, day)),
    ];

    expect(versionsToPrune({ versions, keyId: MINE }).map((v) => v.name)).toEqual(['zzz-oldest']);
  });
});

describe('a версія the phone cannot open', () => {
  it('Scenario: A версія the phone cannot open is not deleted', () => {
    // The owner lost the код відновлення and started a fresh line. Six новых версії are up, and
    // the four of the old line are still there. Pruning by age alone would delete them all.
    const oldLine = [1, 2, 3, 4].map((day) => version(`old-${day}`, day, THEIRS));
    const newLine = [10, 11, 12, 13, 14, 15].map((day) => version(`new-${day}`, day));

    const pruned = versionsToPrune({ versions: [...oldLine, ...newLine], keyId: MINE });

    // Only the new line rotates, and only its oldest.
    expect(pruned.map((v) => v.name)).toEqual(['new-10']);
    // Not one версія of the old line is a candidate, however old it is.
    expect(pruned.every((v) => v.keyId === MINE)).toBe(true);
  });

  it('never prunes a file whose head will not read', () => {
    // Something this app did not write, or wrote and something later damaged. It has no key, so it
    // is in no line, so it is never ours to delete.
    const unreadable: KnownVersion = { id: 'stranger', name: 'stranger.c1b' };
    const mine = [1, 2, 3, 4, 5, 6].map((day) => version(`v${day}`, day));

    const pruned = versionsToPrune({ versions: [unreadable, ...mine], keyId: MINE });

    expect(pruned.map((v) => v.name)).toEqual(['v1']);
  });

  it('an undated версія of this line is pruned before a dated one, and never before the newest five', () => {
    const undated: KnownVersion = { id: 'undated', name: 'undated.c1b', keyId: MINE };
    const five = [1, 2, 3, 4, 5].map((day) => version(`v${day}`, day));

    // Six of this line, one of which has no date: the five dated ones are kept.
    expect(versionsToPrune({ versions: [...five, undated], keyId: MINE }).map((v) => v.name)).toEqual(
      ['undated.c1b'],
    );
    // And with only five, nothing goes.
    expect(versionsToPrune({ versions: [...five.slice(1), undated], keyId: MINE })).toEqual([]);
  });
});

describe('reading what the folder holds', () => {
  it('reads each версія’s key and date from its head alone', () => {
    const head = sealEnvelope({
      bytes: '{"app":"cap1tal"}',
      schemaVersion: 19,
      createdAt: new Date('2026-09-06T08:00:00.000Z'),
      key: key(7),
      nonce: new Uint8Array(24).fill(1),
    });

    expect(
      versionsOf([{ id: '1', name: 'cap1tal-20260906T080000Z.c1b', head }]),
    ).toEqual([
      {
        id: '1',
        name: 'cap1tal-20260906T080000Z.c1b',
        keyId: MINE,
        createdAt: new Date('2026-09-06T08:00:00.000Z'),
      },
    ]);
  });

  it('keeps a file it cannot read in the list, with nothing claimed about it', () => {
    // Dropping it would make it invisible to the rule that must not delete it.
    expect(
      versionsOf([{ id: '1', name: 'stranger.c1b', head: new TextEncoder().encode('not ours') }]),
    ).toEqual([{ id: '1', name: 'stranger.c1b' }]);
  });
});
