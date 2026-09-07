import { describe, expect, it } from 'vitest';

import { money } from '../../domain/money';
import { expenseByDefault, UNCATEGORISED_CATEGORY_ID } from '../../domain/transaction';
import { inMemoryBackupKeyStore } from '../../platform/backup-key';
import { inMemoryDrive } from '../../platform/drive';
import { inMemoryGoogleAuth } from '../../platform/google-auth';
import { constantRandom } from '../../platform/random';
import { makeBackup, type BackupStore } from '../backup';
import { BACKUP_SCHEMA_VERSION, type BackupState } from '../format';
import { KEY_BYTES, sealEnvelope } from './envelope';
import type { DriveBackupPorts } from './ports';
import { encodeRecoveryCode } from './recovery-code';
import { adoptKeyFrom, confirmRestore, listVersions, openVersion } from './run-restore';
import { runBackup, versionName } from './run-backup';
import { inMemoryDriveBackupState, isConnected, type DriveBackupState } from './state';

/**
 * «Відновити», over the ports' doubles. The property every test here circles is the same one: the
 * phone holds exactly what it held until the owner has confirmed a бекап that already opened.
 */

const NOW = new Date('2026-09-07T08:00:00.000Z');
const CONNECTED: DriveBackupState = {
  accountLabel: 'owner@example.com',
  recoveryCodeAcknowledgedAt: new Date('2026-09-01T08:00:00.000Z'),
};

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
    investmentValues: [],
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

const CATEGORY = { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false };

function storedExpense(id: string, date: string) {
  return {
    transaction: expenseByDefault({
      id,
      date,
      accountId: 'card',
      amount: money(125_50, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    }),
    storedAtMs: 1_700_000_000_000,
  };
}

function storeOf(held: BackupState): BackupStore {
  let current = held;
  return {
    snapshot: () => current,
    replaceAll: (next: BackupState) => {
      current = next;
    },
  };
}

/** A версія бекапу in the folder, holding a named state and sealed under a named key. */
function versionIn(day: number, held: BackupState, sealedWith: Uint8Array, schemaVersion?: number) {
  const madeAt = new Date(`2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`);
  const snapshot = makeBackup(held, madeAt);
  return {
    name: versionName(madeAt),
    bytes: sealEnvelope({
      bytes: snapshot.bytes,
      schemaVersion: schemaVersion ?? snapshot.schemaVersion,
      createdAt: madeAt,
      key: sealedWith,
      nonce: new Uint8Array(24).fill(1),
    }),
  };
}

function portsWith(over: {
  readonly held?: BackupState;
  readonly files?: readonly { readonly name: string; readonly bytes: Uint8Array }[];
  readonly keys?: ReturnType<typeof inMemoryBackupKeyStore>;
}): DriveBackupPorts & {
  readonly drive: ReturnType<typeof inMemoryDrive>;
  readonly keys: ReturnType<typeof inMemoryBackupKeyStore>;
} {
  const drive = inMemoryDrive({ files: over.files ?? [] });
  const keys = over.keys ?? inMemoryBackupKeyStore({ key: key(7) });
  return {
    store: storeOf(over.held ?? state()),
    state: inMemoryDriveBackupState(CONNECTED),
    drive,
    auth: inMemoryGoogleAuth({ authorisation: { kind: 'ok', accountLabel: 'owner@example.com' } }),
    keys,
    random: constantRandom(5),
  };
}

describe('the версії бекапу on offer', () => {
  it('Scenario: The list is offered by date', async () => {
    const ports = portsWith({
      files: [
        versionIn(4, state(), key(7)),
        versionIn(6, state(), key(7)),
        versionIn(5, state(), key(7)),
      ],
    });

    const listed = await listVersions(ports);

    expect(listed.kind).toBe('ok');
    expect(
      listed.kind === 'ok' && listed.versions.map((v) => v.createdAt?.toISOString()),
    ).toEqual([
      '2026-09-06T08:00:00.000Z',
      '2026-09-05T08:00:00.000Z',
      '2026-09-04T08:00:00.000Z',
    ]);
    // This phone holds the key, so no код відновлення is asked for.
    expect(listed.kind === 'ok' && listed.needsCode).toBe(false);
  });

  it('fetches heads, not whole бекапи', async () => {
    const ports = portsWith({ files: [versionIn(5, state({ accounts: [CARD] }), key(7))] });

    await listVersions(ports);

    // One range read per версія: offering a list of five costs a few kilobytes, not five бекапи.
    expect(ports.drive.calls().download).toBe(1);
  });

  it('Scenario: A phone without the key is asked for the код відновлення', async () => {
    const ports = portsWith({
      files: [versionIn(5, state(), key(7))],
      keys: inMemoryBackupKeyStore(),
    });

    const listed = await listVersions(ports);

    expect(listed.kind === 'ok' && listed.needsCode).toBe(true);
    // The dates are still offered: the head is plaintext precisely so a keyless phone can choose.
    expect(listed.kind === 'ok' && listed.versions[0]?.createdAt).toEqual(
      new Date('2026-09-05T08:00:00.000Z'),
    );
  });

  it('Scenario: A версія from another line is named as such, not as a mistyped code', async () => {
    const ports = portsWith({
      files: [versionIn(5, state(), key(9)), versionIn(6, state(), key(7))],
    });

    const listed = await listVersions(ports);

    const offered = listed.kind === 'ok' ? listed.versions : [];
    // The one this phone's key opens carries no refusal…
    expect(offered[0]?.refusal).toBeUndefined();
    // …and the other says which line it belongs to, rather than looking like a bad code.
    expect(offered[1]?.refusal?.kind).toBe('another-line');
  });

  it('Scenario: A бекап from a newer app version is refused — before a code is asked for', async () => {
    const ports = portsWith({
      files: [versionIn(5, state(), key(7), BACKUP_SCHEMA_VERSION + 1)],
      keys: inMemoryBackupKeyStore(),
    });

    const listed = await listVersions(ports);

    expect(listed.kind === 'ok' && listed.versions[0]?.refusal).toEqual({
      kind: 'newer-schema',
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      supported: BACKUP_SCHEMA_VERSION,
    });
  });

  it('reports a folder it could not read rather than an empty one', async () => {
    const ports = portsWith({});
    const offline = { ...ports, drive: inMemoryDrive({ failWith: { kind: 'no-network' } }) };

    expect(await listVersions(offline)).toEqual({ kind: 'failed', why: 'no-network' });
  });
});

describe('opening the chosen версія', () => {
  it('Scenario: Confirmation is required and names what is replaced', async () => {
    const backed = state({
      accounts: [CARD],
      categories: [CATEGORY],
      transactions: [storedExpense('e1', '2026-09-01')],
    });
    const onThePhone = state({
      accounts: [CARD],
      categories: [CATEGORY],
      transactions: [storedExpense('e1', '2026-09-01'), storedExpense('e2', '2026-09-07')],
    });
    const ports = portsWith({ held: onThePhone, files: [versionIn(5, backed, key(7))] });
    const listed = await listVersions(ports);
    const id = listed.kind === 'ok' ? listed.versions[0]!.id : '';

    const opened = await openVersion(ports, id);

    expect(opened.kind).toBe('ok');
    const preview = opened.kind === 'ok' ? opened.preview : undefined;
    // The date and both columns are named…
    expect(preview?.createdAt).toEqual(new Date('2026-09-05T08:00:00.000Z'));
    expect(preview?.backupFigures.transactions).toBe(1);
    expect(preview?.phoneFigures.transactions).toBe(2);
    // …and nothing is replaced until the owner confirms.
    expect(ports.store.snapshot().transactions).toHaveLength(2);
  });

  it('Scenario: A mistyped код відновлення is refused as mistyped', async () => {
    const ports = portsWith({
      files: [versionIn(5, state(), key(7))],
      keys: inMemoryBackupKeyStore(),
    });
    const listed = await listVersions(ports);
    const id = listed.kind === 'ok' ? listed.versions[0]!.id : '';
    const before = ports.drive.calls().download;

    const canonical = encodeRecoveryCode(key(7)).replace(/ /g, '');
    const mistyped = `${canonical.slice(0, 5)}${canonical[5] === 'Z' ? 'Y' : 'Z'}${canonical.slice(6)}`;

    expect(await openVersion(ports, id, { recoveryCode: mistyped })).toEqual({ kind: 'mistyped' });
    // Refused before any версія бекапу is fetched, let alone opened or replaced.
    expect(ports.drive.calls().download).toBe(before);
  });

  it('Scenario: A phone without the key and without the code cannot open it', async () => {
    const ports = portsWith({
      files: [versionIn(5, state(), key(7))],
      keys: inMemoryBackupKeyStore(),
    });
    const listed = await listVersions(ports);
    const id = listed.kind === 'ok' ? listed.versions[0]!.id : '';

    expect(await openVersion(ports, id)).toEqual({ kind: 'failed', why: 'no-key' });
  });

  it('Scenario: A corrupted версія бекапу is refused', async () => {
    const sound = versionIn(5, state({ accounts: [CARD] }), key(7));
    const damaged = Uint8Array.from(sound.bytes);
    damaged[damaged.length - 10] = (damaged[damaged.length - 10] ?? 0) ^ 0xff;
    const ports = portsWith({
      held: state({ accounts: [CARD] }),
      files: [{ name: sound.name, bytes: damaged }],
    });
    const listed = await listVersions(ports);
    const id = listed.kind === 'ok' ? listed.versions[0]!.id : '';

    const opened = await openVersion(ports, id);

    expect(opened).toEqual({ kind: 'refused', why: { kind: 'will-not-open' } });
    // Nothing on the phone changed.
    expect(ports.store.snapshot().accounts).toHaveLength(1);
  });
});

describe('the restore itself', () => {
  it('Scenario: Restore replaces, it does not merge', async () => {
    const backed = state({
      accounts: [CARD],
      categories: [CATEGORY],
      transactions: [storedExpense('e1', '2026-09-01')],
    });
    // The owner recorded a транзакція after that бекап was made.
    const onThePhone = state({
      accounts: [CARD],
      categories: [CATEGORY],
      transactions: [storedExpense('e1', '2026-09-01'), storedExpense('e2', '2026-09-07')],
    });
    const ports = portsWith({ held: onThePhone, files: [versionIn(5, backed, key(7))] });
    const listed = await listVersions(ports);
    const opened = await openVersion(ports, listed.kind === 'ok' ? listed.versions[0]!.id : '');

    const restored = await confirmRestore(
      ports,
      opened.kind === 'ok' ? opened.preview : (undefined as never),
    );

    expect(restored).toMatchObject({ kind: 'restored' });
    // The phone holds exactly what that версія held, and the транзакція recorded after it is gone.
    const after = ports.store.snapshot();
    expect(after.transactions.map((t) => t.transaction.id)).toEqual(['e1']);
  });

  it('Scenario: A restore that fails part-way leaves the phone as it was', async () => {
    const backed = state({ accounts: [CARD], categories: [CATEGORY] });
    const onThePhone = state({
      accounts: [CARD],
      categories: [CATEGORY],
      transactions: [storedExpense('e2', '2026-09-07')],
    });
    const throwing: BackupStore = {
      snapshot: () => onThePhone,
      replaceAll: () => {
        // The import is one SQLite transaction; a throw inside it lands nothing.
        throw new Error('the replacement failed part-way');
      },
    };
    const ports = { ...portsWith({ files: [versionIn(5, backed, key(7))] }), store: throwing };
    const listed = await listVersions(ports);
    const opened = await openVersion(ports, listed.kind === 'ok' ? listed.versions[0]!.id : '');

    const restored = await confirmRestore(
      ports,
      opened.kind === 'ok' ? opened.preview : (undefined as never),
    );

    expect(restored).toMatchObject({ kind: 'failed' });
    // The phone holds exactly what it held before the restore began.
    expect(ports.store.snapshot().transactions).toHaveLength(1);
  });

  it('Scenario: Restoring with the код відновлення joins that line too', async () => {
    // A new phone: no key, and a folder holding the old phone's версії.
    const backed = state({ accounts: [CARD], categories: [CATEGORY] });
    const ports = portsWith({
      files: [versionIn(5, backed, key(7))],
      keys: inMemoryBackupKeyStore(),
    });
    const listed = await listVersions(ports);
    const id = listed.kind === 'ok' ? listed.versions[0]!.id : '';
    const code = encodeRecoveryCode(key(7));

    const opened = await openVersion(ports, id, { recoveryCode: code });
    await confirmRestore(ports, opened.kind === 'ok' ? opened.preview : (undefined as never));
    await adoptKeyFrom(ports, code, NOW);

    // The phone adopted that key, so it is on that line…
    expect(await ports.keys.read()).toEqual({ kind: 'ok', key: key(7) });
    // …and it is connected, because typing the code was the acknowledgement (design D14)…
    expect(isConnected(ports.state.read())).toBe(true);
    // …so its next бекап joins the версії already there rather than starting a second line.
    await runBackup(ports, NOW);
    expect(ports.drive.contents()).toHaveLength(2);
  });

  it('a restore that was refused adopts nothing', async () => {
    const ports = portsWith({
      files: [versionIn(5, state(), key(7))],
      keys: inMemoryBackupKeyStore(),
    });

    // A code that was never accepted must leave the phone's key exactly as it was — which, here,
    // is none at all.
    await adoptKeyFrom(ports, 'not a code', NOW);

    expect(await ports.keys.read()).toEqual({ kind: 'ok' });
    // And it recorded no acknowledgement of its own: the moment is still the one it started with.
    expect(ports.state.read().recoveryCodeAcknowledgedAt).toEqual(
      CONNECTED.recoveryCodeAcknowledgedAt,
    );
  });
});
