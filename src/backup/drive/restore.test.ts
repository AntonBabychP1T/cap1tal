import { describe, expect, it } from 'vitest';

import { money } from '../../domain/money';
import { makeBackup } from '../backup';
import { BACKUP_SCHEMA_VERSION, type BackupState } from '../format';
import { KEY_BYTES, keyId, sealEnvelope } from './envelope';
import { admitVersion, isRestoreRefusal, refusalFromHead } from './restore';

/**
 * Whether a версія бекапу may be restored, in the spec's own order: it opens, its integrity check
 * holds, its schema is one this app understands — and only then is it confirmable. Every refusal
 * here leaves the phone untouched, which is trivially true of a pure function and is the reason
 * the rule is one.
 */

const MADE_AT = new Date('2026-09-06T08:00:00.000Z');

function key(fill: number): Uint8Array {
  return new Uint8Array(KEY_BYTES).fill(fill);
}

/** An empty state, so each test names only what it is about. */
function state(over: Partial<BackupState> = {}): BackupState {
  return {
    accounts: [],
    categories: [],
    sources: [],
    rules: [],
    limits: [],
    goals: [],
    transactions: [],
    monobankAccounts: [],
    monobankLinks: [],
    monobankImportedItems: [],
    watches: [],
    receipts: [],
    receiptItems: [],
    achievements: [],
    challengeDecisions: [],
    norms: [],
    ...over,
  };
}

/** A real бекап, sealed — the same path a real upload takes, so nothing here is a stand-in. */
function versionOf(
  over: Partial<BackupState> = {},
  options: { readonly key?: Uint8Array; readonly schemaVersion?: number } = {},
): Uint8Array {
  const snapshot = makeBackup(state(over), MADE_AT);
  return sealEnvelope({
    bytes: snapshot.bytes,
    schemaVersion: options.schemaVersion ?? snapshot.schemaVersion,
    createdAt: snapshot.createdAt,
    key: options.key ?? key(7),
    nonce: new Uint8Array(24).fill(3),
  });
}

const CARD = {
  id: 'card',
  name: 'mono black',
  kind: 'spending' as const,
  currency: 'UAH',
  openingBalance: money(500_000, 'UAH'),
  archived: false,
};

describe('a версія бекапу this phone may restore', () => {
  it('Scenario: The version and its date are named before anything is replaced', () => {
    const admitted = admitVersion({ bytes: versionOf({ accounts: [CARD] }), key: key(7) });

    expect(isRestoreRefusal(admitted)).toBe(false);
    // The date the confirmation names comes from the бекап itself, read after the cipher proved
    // the head was not edited.
    expect(admitted.kind === 'ok' && admitted.createdAt).toEqual(MADE_AT);
    // And it carries the бекап already read, so confirming applies exactly what was described —
    // the file is never parsed a second time.
    expect(admitted.kind === 'ok' && admitted.backup.figures.accounts).toBe(1);
    expect(admitted.kind === 'ok' && admitted.backup.state.accounts[0]?.name).toBe('mono black');
  });
});

describe('a версія бекапу this phone may not restore', () => {
  it('Scenario: A бекап from a newer app version is refused', () => {
    const admitted = admitVersion({
      bytes: versionOf(),
      key: key(7),
      // A phone one schema behind the бекап it was handed.
      supportedSchema: BACKUP_SCHEMA_VERSION - 1,
    });

    expect(admitted).toEqual({
      kind: 'newer-schema',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      supported: BACKUP_SCHEMA_VERSION - 1,
    });
  });

  it('is refused from the head alone, before a код відновлення is asked for', () => {
    // The reason design D6's head is plaintext: the owner is not sent hunting for a code they may
    // not have, only to be told afterwards that the app is too old to use it.
    expect(
      refusalFromHead({
        head: {
          envelopeVersion: 1,
          schemaVersion: BACKUP_SCHEMA_VERSION + 1,
          createdAt: MADE_AT,
          keyId: keyId(key(7)),
        },
      }),
    ).toEqual({
      kind: 'newer-schema',
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      supported: BACKUP_SCHEMA_VERSION,
    });
  });

  it('Scenario: A corrupted версія бекапу is refused', () => {
    const sealed = versionOf({ accounts: [CARD] });
    const damaged = Uint8Array.from(sealed);
    damaged[damaged.length - 20] = (damaged[damaged.length - 20] ?? 0) ^ 0xff;

    // The envelope refuses first — its tag is what catches an alteration — and nothing local was
    // read or written to find that out.
    expect(admitVersion({ bytes: damaged, key: key(7) })).toEqual({ kind: 'will-not-open' });
  });

  it('refuses a бекап that opened but is damaged inside', () => {
    // The envelope is sound and the бекап within it is not: a different sentence for the owner,
    // and step 11's judgement rather than this change's.
    const snapshot = makeBackup(state({ accounts: [CARD] }), MADE_AT);
    const tampered = snapshot.bytes.replace('mono black', 'mono blaCK');
    const sealed = sealEnvelope({
      bytes: tampered,
      schemaVersion: snapshot.schemaVersion,
      createdAt: snapshot.createdAt,
      key: key(7),
      nonce: new Uint8Array(24).fill(3),
    });

    expect(admitVersion({ bytes: sealed, key: key(7) })).toEqual({
      kind: 'unreadable-backup',
      why: 'damaged',
    });
  });

  it('Scenario: A версія from another line is named as such, not as a mistyped code', () => {
    // Design D14: the folder holds версії of a line this phone did not seal. Saying «код
    // неправильний» would send the owner to check a code that is correct for a different line.
    expect(
      refusalFromHead({
        head: {
          envelopeVersion: 1,
          schemaVersion: BACKUP_SCHEMA_VERSION,
          createdAt: MADE_AT,
          keyId: keyId(key(9)),
        },
        keyId: keyId(key(7)),
      }),
    ).toEqual({ kind: 'another-line', keyId: keyId(key(9)) });
  });

  it('says nothing stands in the way when nothing does', () => {
    expect(
      refusalFromHead({
        head: {
          envelopeVersion: 1,
          schemaVersion: BACKUP_SCHEMA_VERSION,
          createdAt: MADE_AT,
          keyId: keyId(key(7)),
        },
        keyId: keyId(key(7)),
      }),
    ).toBeUndefined();
    // A phone that holds no key yet judges the schema and lets the code decide the rest.
    expect(
      refusalFromHead({
        head: {
          envelopeVersion: 1,
          schemaVersion: BACKUP_SCHEMA_VERSION,
          createdAt: MADE_AT,
          keyId: keyId(key(9)),
        },
      }),
    ).toBeUndefined();
  });

  it('Scenario: A phone without the key and without the code cannot open it', () => {
    expect(admitVersion({ bytes: versionOf(), key: key(8) })).toEqual({ kind: 'will-not-open' });
  });

  it('refuses a file that is not one of ours at all', () => {
    expect(
      admitVersion({ bytes: new TextEncoder().encode('{"some":"file"}\n'), key: key(7) }),
    ).toEqual({ kind: 'not-an-envelope' });
  });
});
