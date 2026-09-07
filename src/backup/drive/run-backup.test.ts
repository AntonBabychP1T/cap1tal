import { describe, expect, it } from 'vitest';

import { inMemoryBackupKeyStore } from '../../platform/backup-key';
import { inMemoryDrive } from '../../platform/drive';
import { inMemoryGoogleAuth } from '../../platform/google-auth';
import { constantRandom, fixedRandom } from '../../platform/random';
import { money } from '../../domain/money';
import { makeBackup, type BackupStore } from '../backup';
import type { BackupState } from '../format';
import { KEY_BYTES, keyId, readEnvelopeHead, sealEnvelope } from './envelope';
import type { DriveBackupPorts } from './ports';
import { runBackup, versionName } from './run-backup';
import { inMemoryDriveBackupState, type DriveBackupState } from './state';

/**
 * The backup run over the ports' doubles: a бекап made, sealed, uploaded, confirmed, recorded and
 * the folder tidied — end to end, without a network or a device.
 *
 * The properties that matter most are the negative ones. A failure at any step must leave the last
 * success standing and every версія бекапу in the folder untouched, because the alternative is an
 * app that quietly trades a good backup for a bad one.
 */

const CONNECTED_AT = new Date('2026-09-01T08:00:00.000Z');
const YESTERDAY = new Date('2026-09-06T08:00:00.000Z');
const TODAY = new Date('2026-09-07T08:00:00.000Z');

function key(fill: number): Uint8Array {
  return new Uint8Array(KEY_BYTES).fill(fill);
}

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

const CARD = {
  id: 'card',
  name: 'mono black',
  kind: 'spending' as const,
  currency: 'UAH',
  openingBalance: money(500_000, 'UAH'),
  archived: false,
};

/** A store over a fixed state — what a бекап is made from, with no database. */
function storeOf(held: BackupState): BackupStore {
  let current = held;
  return {
    snapshot: () => current,
    replaceAll: (next: BackupState) => {
      current = next;
    },
  };
}

/** A connected phone that has never uploaded. */
const CONNECTED: DriveBackupState = {
  accountLabel: 'owner@example.com',
  recoveryCodeAcknowledgedAt: CONNECTED_AT,
};

function portsWith(
  over: {
    readonly backupState?: BackupState;
    readonly driveState?: DriveBackupState;
    readonly drive?: ReturnType<typeof inMemoryDrive>;
    readonly keys?: ReturnType<typeof inMemoryBackupKeyStore>;
  } = {},
): DriveBackupPorts & { readonly drive: ReturnType<typeof inMemoryDrive> } {
  const drive = over.drive ?? inMemoryDrive();
  return {
    store: storeOf(over.backupState ?? state({ accounts: [CARD] })),
    state: inMemoryDriveBackupState(over.driveState ?? CONNECTED),
    drive,
    auth: inMemoryGoogleAuth({ authorisation: { kind: 'ok', accountLabel: 'owner@example.com' } }),
    keys: over.keys ?? inMemoryBackupKeyStore({ key: key(7) }),
    random: constantRandom(3),
  };
}

/** A версія бекапу already in the folder, sealed under `key(7)` — this phone's own line. */
function existingVersion(day: number, sealedWith = key(7), month = '09') {
  const madeAt = new Date(`2026-${month}-${String(day).padStart(2, '0')}T08:00:00.000Z`);
  const snapshot = makeBackup(state(), madeAt);
  return {
    name: versionName(madeAt),
    bytes: sealEnvelope({
      bytes: snapshot.bytes,
      schemaVersion: snapshot.schemaVersion,
      createdAt: madeAt,
      key: sealedWith,
      nonce: new Uint8Array(24).fill(1),
    }),
  };
}

describe('a бекап that goes up', () => {
  it('Scenario: A due backup runs in the background', async () => {
    const ports = portsWith();

    const outcome = await runBackup(ports, TODAY);

    expect(outcome).toMatchObject({ kind: 'uploaded', at: TODAY });
    // One версія in the folder, named by the moment the бекап was made.
    expect(ports.drive.contents().map((file) => file.name)).toEqual([
      'cap1tal-20260907T080000Z.c1b',
    ]);
    // And the last successful upload is now this one.
    expect(ports.state.read().lastSuccessAt).toEqual(TODAY);
  });

  it('what it uploads is sealed, and reveals nothing', async () => {
    const ports = portsWith();

    await runBackup(ports, TODAY);

    const uploaded = ports.drive.contents()[0]!;
    const asText = new TextDecoder().decode(uploaded.bytes);
    expect(asText).not.toContain('mono black');
    expect(asText).not.toContain('500000');
    // The head names this phone's line, so «Відновити» can tell which код відновлення opens it.
    const head = readEnvelopeHead(uploaded.bytes);
    expect(head.kind === 'ok' && head.keyId).toBe(keyId(key(7)));
  });

  it('Scenario: Nothing leaves the phone before connecting', async () => {
    const ports = portsWith({ driveState: {} });

    expect(await runBackup(ports, TODAY)).toEqual({ kind: 'skipped', why: 'not-connected' });
    // And the spec's stronger claim: no request was made to Google at all.
    expect(ports.drive.calls()).toEqual({ list: 0, upload: 0, download: 0, delete: 0 });
  });

  it('does not upload before it is due', async () => {
    const ports = portsWith({
      driveState: { ...CONNECTED, lastSuccessAt: new Date(TODAY.getTime() - 60_000) },
    });

    expect(await runBackup(ports, TODAY)).toEqual({ kind: 'skipped', why: 'not-due' });
    expect(ports.drive.calls().upload).toBe(0);
  });

  it('Scenario: An unchanged бекап is not uploaded again', async () => {
    const held = state({ accounts: [CARD] });
    const unchanged = makeBackup(held, YESTERDAY).checksum;
    const ports = portsWith({
      backupState: held,
      driveState: { ...CONNECTED, lastSuccessAt: YESTERDAY, lastUploadedChecksum: unchanged },
    });

    const outcome = await runBackup(ports, TODAY);

    expect(outcome).toEqual({ kind: 'skipped', why: 'unchanged' });
    // Nothing was uploaded, and the last successful upload's date is unchanged.
    expect(ports.drive.calls().upload).toBe(0);
    expect(ports.state.read().lastSuccessAt).toEqual(YESTERDAY);
  });

  it('Scenario: A manual backup updates the last success', async () => {
    const held = state({ accounts: [CARD] });
    const ports = portsWith({ backupState: held, driveState: { ...CONNECTED } });

    expect(await runBackup(ports, TODAY, { force: true })).toMatchObject({ kind: 'uploaded' });

    // Asked again a minute later with nothing changed: forcing skips the schedule and nothing else.
    const again = await runBackup(ports, TODAY, { force: true });
    expect(again).toEqual({ kind: 'skipped', why: 'unchanged' });
    expect(ports.drive.contents()).toHaveLength(1);
  });
});

describe('a бекап that does not go up', () => {
  it('Scenario: A new upload never destroys the last good one', async () => {
    const drive = inMemoryDrive({
      files: [existingVersion(5), existingVersion(6)],
      failUploadWith: { kind: 'no-network' },
    });
    const ports = portsWith({
      drive,
      driveState: { ...CONNECTED, lastSuccessAt: YESTERDAY, lastUploadedChecksum: 'old' },
    });

    expect(await runBackup(ports, TODAY)).toEqual({ kind: 'failed', why: 'no-network' });

    // Every версія бекапу already in the folder is exactly as it was…
    expect(drive.contents().map((file) => file.name)).toEqual([
      versionName(new Date('2026-09-05T08:00:00.000Z')),
      versionName(new Date('2026-09-06T08:00:00.000Z')),
    ]);
    // …and nothing was deleted on the way.
    expect(drive.calls().delete).toBe(0);
  });

  it.each([
    ['no-network' as const, { kind: 'no-network' } as const],
    ['withdrawn' as const, { kind: 'withdrawn' } as const],
    ['full' as const, { kind: 'full' } as const],
    ['unavailable' as const, { kind: 'unavailable' } as const],
  ])('%s leaves the last success standing', async (why, failure) => {
    const ports = portsWith({
      drive: inMemoryDrive({ failUploadWith: failure }),
      driveState: { ...CONNECTED, lastSuccessAt: YESTERDAY, lastUploadedChecksum: 'old' },
    });

    expect(await runBackup(ports, TODAY)).toEqual({ kind: 'failed', why });

    const after = ports.state.read();
    // Yesterday's success still stands beside today's failure — the owner needs to know their
    // history is safe as of yesterday.
    expect(after.lastSuccessAt).toEqual(YESTERDAY);
    expect(after.lastUploadedChecksum).toBe('old');
    expect(after.lastFailureKind).toBe(why);
    expect(after.lastFailureAt).toEqual(TODAY);
  });

  it('a phone that cannot reach its keystore uploads nothing', async () => {
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7), unavailable: true }) });

    expect(await runBackup(ports, TODAY)).toEqual({ kind: 'failed', why: 'no-key' });
    // Uploading a бекап unsealed is the one thing this capability exists to prevent.
    expect(ports.drive.calls().upload).toBe(0);
  });

  it('an upload Drive says arrived a different size is not a success', async () => {
    const drive = inMemoryDrive();
    const truncating: typeof drive = {
      ...drive,
      upload: async (name, bytes) => {
        const answer = await drive.upload(name, bytes);
        // Drive took it and reports fewer bytes than were sent: recording a success would let
        // rotation later delete a good версія in favour of a truncated one.
        return answer.kind === 'ok'
          ? { kind: 'ok', value: { ...answer.value, size: answer.value.size - 1 } }
          : answer;
      },
    };
    const ports = { ...portsWith(), drive: truncating } as DriveBackupPorts;

    expect(await runBackup(ports, TODAY)).toEqual({ kind: 'failed', why: 'unavailable' });
    expect(ports.state.read().lastSuccessAt).toBeUndefined();
  });
});

describe('the folder afterwards', () => {
  it('Scenario: Older versions are pruned only after a newer one is complete', async () => {
    // Five версії already up, and this run makes a sixth.
    const drive = inMemoryDrive({ files: [1, 2, 3, 4, 5].map((day) => existingVersion(day)) });
    const ports = portsWith({ drive });

    await runBackup(ports, TODAY);

    const names = drive.contents().map((file) => file.name);
    expect(names).toHaveLength(5);
    // The oldest went, and only after the new one was confirmed in the folder.
    expect(names).not.toContain(versionName(new Date('2026-09-01T08:00:00.000Z')));
    expect(names).toContain(versionName(TODAY));
  });

  it('Scenario: A версія the phone cannot open is not deleted', async () => {
    // A line this phone did not seal — the owner's previous phone, whose код відновлення they no
    // longer have, made in August. Pruning by age alone would delete all four, oldest first.
    const theirs = [1, 2, 3, 4].map((day) => existingVersion(day, key(9), '08'));
    const mine = [1, 2, 3, 4, 5].map((day) => existingVersion(day));
    const drive = inMemoryDrive({ files: [...theirs, ...mine] });
    const ports = portsWith({ drive });

    await runBackup(ports, TODAY);

    const names = drive.contents().map((file) => file.name);
    // Every версія of the other line is still there…
    for (const file of theirs) {
      expect(names).toContain(file.name);
    }
    // …and only this phone's own line rotated: its newest five stay and its oldest went.
    expect(names).toContain(versionName(TODAY));
    expect(names).not.toContain(versionName(new Date('2026-09-01T08:00:00.000Z')));
    expect(names).toHaveLength(9);
  });

  it('a nonce is drawn afresh for every upload', async () => {
    const ports = { ...portsWith(), random: fixedRandom() } as DriveBackupPorts;

    await runBackup(ports, YESTERDAY, { force: true });
    // Changing the state so the second бекап is not skipped as unchanged.
    ports.store.replaceAll(state({ accounts: [CARD, { ...CARD, id: 'jar', name: 'банка' }] }));
    await runBackup(ports, TODAY, { force: true });

    const [first, second] = (ports as unknown as { drive: ReturnType<typeof inMemoryDrive> })
      .drive.contents();
    // Two envelopes under one key must never share a nonce — the one mistake XChaCha20-Poly1305
    // does not survive.
    const nonceOf = (bytes: Uint8Array) => {
      const head = readEnvelopeHead(bytes);
      return head.kind === 'ok' ? bytes.subarray(head.headLength, head.headLength + 24) : bytes;
    };
    expect(nonceOf(first!.bytes)).not.toEqual(nonceOf(second!.bytes));
  });
});

describe('what a версія бекапу is called', () => {
  it('is sortable by name because it is sortable by instant', () => {
    expect(versionName(new Date('2026-09-07T08:00:00.000Z'))).toBe('cap1tal-20260907T080000Z.c1b');
    expect(versionName(new Date('2026-09-06T08:00:00.000Z')) < versionName(TODAY)).toBe(true);
  });
});
