import { describe, expect, it } from 'vitest';

import { inMemoryBackupKeyStore } from '../../platform/backup-key';
import { inMemoryDrive } from '../../platform/drive';
import { inMemoryGoogleAuth } from '../../platform/google-auth';
import { constantRandom } from '../../platform/random';
import { makeBackup, type BackupStore } from '../backup';
import type { BackupState } from '../format';
import {
  acknowledgeCode,
  adoptRecoveryCode,
  connect,
  disconnect,
  showRecoveryCode,
  startFreshLine,
} from './connection';
import { KEY_BYTES, sealEnvelope } from './envelope';
import type { DriveBackupPorts } from './ports';
import { decodeRecoveryCode, encodeRecoveryCode } from './recovery-code';
import { runBackup, versionName } from './run-backup';
import { inMemoryDriveBackupState, isConnected, type DriveBackupState } from './state';

/**
 * Connecting and disconnecting — and design D14's two doors, both of which must end **connected**.
 * A phone that joined an existing line and did not count as connected would register no background
 * task and never upload, which is the whole flow this change exists for.
 */

const NOW = new Date('2026-09-07T08:00:00.000Z');

function key(fill: number): Uint8Array {
  return new Uint8Array(KEY_BYTES).fill(fill);
}

function state(): BackupState {
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
  };
}

function storeOf(): BackupStore {
  let current = state();
  return {
    snapshot: () => current,
    replaceAll: (next: BackupState) => {
      current = next;
    },
  };
}

/** A версія бекапу already in the folder, sealed under a named key. */
function existingVersion(day: number, sealedWith: Uint8Array) {
  const madeAt = new Date(`2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`);
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

function portsWith(
  over: {
    readonly auth?: ReturnType<typeof inMemoryGoogleAuth>;
    readonly drive?: ReturnType<typeof inMemoryDrive>;
    readonly keys?: ReturnType<typeof inMemoryBackupKeyStore>;
    readonly driveState?: DriveBackupState;
  } = {},
): DriveBackupPorts & {
  readonly auth: ReturnType<typeof inMemoryGoogleAuth>;
  readonly drive: ReturnType<typeof inMemoryDrive>;
  readonly keys: ReturnType<typeof inMemoryBackupKeyStore>;
} {
  const auth =
    over.auth ??
    inMemoryGoogleAuth({ authorisation: { kind: 'ok', accountLabel: 'owner@example.com' } });
  const drive = over.drive ?? inMemoryDrive();
  const keys = over.keys ?? inMemoryBackupKeyStore();
  return {
    store: storeOf(),
    state: inMemoryDriveBackupState(over.driveState),
    drive,
    auth,
    keys,
    random: constantRandom(5),
  };
}

describe('connecting on a phone with an empty folder', () => {
  it('Scenario: The connection is not complete until the code is acknowledged', async () => {
    const ports = portsWith();

    const step = await connect(ports, NOW);

    expect(step).toMatchObject({ kind: 'show-code', accountLabel: 'owner@example.com' });
    // Scenario: The connection is not complete until the code is acknowledged.
    expect(isConnected(ports.state.read())).toBe(false);
    // And nothing is uploaded while it is incomplete.
    expect(await runBackup(ports, NOW)).toEqual({ kind: 'skipped', why: 'not-connected' });

    acknowledgeCode(ports, NOW);
    expect(isConnected(ports.state.read())).toBe(true);
  });

  it('Scenario: Leaving without acknowledging does not complete the connection', async () => {
    const ports = portsWith();
    const first = await connect(ports, NOW);
    const shown = first.kind === 'show-code' ? first.recoveryCode : '';

    // The owner walked away while the code was on screen. Nothing completes it but the
    // acknowledgement, so returning finds the app still not connected…
    expect(isConnected(ports.state.read())).toBe(false);

    // …and the section shows the код відновлення *again* for acknowledgement rather than quietly
    // completing. Completing here would leave the owner connected to copies that only a code they
    // never wrote down can ever open — the one irreversible mistake this flow could make for them.
    const again = await connect(ports, NOW);
    expect(again).toEqual({
      kind: 'show-code',
      accountLabel: 'owner@example.com',
      // The same code, because it is the same key: they are not handed a second line.
      recoveryCode: shown,
    });
    expect(isConnected(ports.state.read())).toBe(false);

    // And only the acknowledgement completes it.
    acknowledgeCode(ports, NOW);
    expect(isConnected(ports.state.read())).toBe(true);
  });

  it('abandoning the ask-code door is not an abandoned code step', async () => {
    // A keyless phone that walked away from «введіть код відновлення» has an account recorded and
    // no acknowledgement — the same shape as an abandoned show-code step. It must still be asked
    // for the line's code rather than shown one, because it has no key to show a code *for*.
    const ports = portsWith({
      drive: inMemoryDrive({ files: [existingVersion(5, key(7))] }),
    });
    await connect(ports, NOW);

    expect(await connect(ports, NOW)).toEqual({
      kind: 'ask-code',
      accountLabel: 'owner@example.com',
      versions: 1,
    });
    expect(await ports.keys.read()).toEqual({ kind: 'ok' });
  });

  it('a connect that could not reach the keystore leaves no false trail', async () => {
    // The Google step succeeded and the keystore did not, so an account is recorded with no
    // acknowledgement. Trying again must not read that as an abandoned code step — there is no key.
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ unavailable: true }) });

    expect(await connect(ports, NOW)).toEqual({ kind: 'failed', why: 'no-key' });
    expect(await connect(ports, NOW)).toEqual({ kind: 'failed', why: 'no-key' });
    expect(isConnected(ports.state.read())).toBe(false);
  });

  it('a reconnect after a disconnect is not that, and asks for nothing', async () => {
    // The row is cleared by disconnecting, so there is no abandoned attempt to resume — the owner
    // acknowledged this code already, and showing it again would be asking twice.
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7) }) });
    await connect(ports, NOW);
    acknowledgeCode(ports, NOW);
    await disconnect(ports);

    expect(await connect(ports, NOW)).toEqual({
      kind: 'connected',
      accountLabel: 'owner@example.com',
    });
  });

  it('the код відновлення it shows is the key it made', async () => {
    const ports = portsWith();

    const step = await connect(ports, NOW);

    const shown = step.kind === 'show-code' ? step.recoveryCode : '';
    const read = decodeRecoveryCode(shown);
    const kept = await ports.keys.read();
    // What the owner writes down opens what the phone will seal — the one property that makes the
    // code worth anything at all.
    expect(read.kind === 'ok' && read.key).toEqual(kept.kind === 'ok' ? kept.key : undefined);
  });

  it('Scenario: A cancelled connection leaves nothing behind', async () => {
    const ports = portsWith({ auth: inMemoryGoogleAuth() });

    expect(await connect(ports, NOW)).toEqual({ kind: 'cancelled' });

    // No account recorded, no key made, no authorisation kept, nothing uploaded.
    expect(ports.state.read()).toEqual({});
    expect(await ports.keys.read()).toEqual({ kind: 'ok' });
    expect(ports.auth.held()).toBe(false);
    expect(ports.drive.calls().upload).toBe(0);
  });

  it('a refusal and an absent network are their own answers', async () => {
    const refused = portsWith({ auth: inMemoryGoogleAuth({ authorisation: { kind: 'refused' } }) });
    expect(await connect(refused, NOW)).toEqual({ kind: 'failed', why: 'refused' });

    const offline = portsWith({
      auth: inMemoryGoogleAuth({
        authorisation: { kind: 'ok', accountLabel: 'owner@example.com' },
        offline: true,
      }),
    });
    expect(await connect(offline, NOW)).toEqual({ kind: 'failed', why: 'no-network' });
    // Neither made a key: a phone that could not connect must not be left holding one.
    expect(await refused.keys.read()).toEqual({ kind: 'ok' });
    expect(await offline.keys.read()).toEqual({ kind: 'ok' });
  });

  it('will not mint a key while the folder cannot be read', async () => {
    // Minting one here could orphan версії that are already there and cannot be seen.
    const ports = portsWith({ drive: inMemoryDrive({ failWith: { kind: 'no-network' } }) });

    expect(await connect(ports, NOW)).toEqual({ kind: 'failed', why: 'unavailable' });
    expect(await ports.keys.read()).toEqual({ kind: 'ok' });
  });
});

describe('connecting on a phone that already holds the key', () => {
  it('continues the same line with nothing to show or ask', async () => {
    // A phone that holds the key and has no abandoned attempt behind it — a reconnect after a
    // disconnect. The key stayed (design D8), so the same line continues.
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7) }) });

    expect(await connect(ports, NOW)).toEqual({
      kind: 'connected',
      accountLabel: 'owner@example.com',
    });
    expect(isConnected(ports.state.read())).toBe(true);
  });
});

describe('connecting where версії бекапу already exist — design D14', () => {
  it('Scenario: A new phone is offered the existing line', async () => {
    // A new phone, holding no key, and a folder holding the old phone's версії.
    const ports = portsWith({
      drive: inMemoryDrive({ files: [existingVersion(5, key(7)), existingVersion(6, key(7))] }),
    });

    const step = await connect(ports, NOW);

    // It asks for a код відновлення rather than showing a new one — showing one would orphan
    // everything already up.
    expect(step).toEqual({ kind: 'ask-code', accountLabel: 'owner@example.com', versions: 2 });
    expect(await ports.keys.read()).toEqual({ kind: 'ok' });
    expect(isConnected(ports.state.read())).toBe(false);
  });

  it('Scenario: A new phone continues the same backup line', async () => {
    const ports = portsWith({
      drive: inMemoryDrive({ files: [existingVersion(5, key(7)), existingVersion(6, key(7))] }),
    });
    await connect(ports, NOW);

    const adopted = await adoptRecoveryCode(ports, encodeRecoveryCode(key(7)), NOW);

    expect(adopted).toEqual({ kind: 'ok', accountLabel: 'owner@example.com' });
    // The phone adopted that key…
    expect(await ports.keys.read()).toEqual({ kind: 'ok', key: key(7) });
    // …and the next бекап it uploads joins the версії already there rather than starting a second
    // line: three files, all of one line, and nothing orphaned.
    await runBackup(ports, NOW);
    expect(ports.drive.contents()).toHaveLength(3);
  });

  it('Scenario: Connecting with the code needs no second acknowledgement', async () => {
    const ports = portsWith({ drive: inMemoryDrive({ files: [existingVersion(5, key(7))] }) });
    await connect(ports, NOW);

    await adoptRecoveryCode(ports, encodeRecoveryCode(key(7)), NOW);

    // Typing the code *is* the demonstration that the owner holds it. The connection is complete
    // from here, so the background task registers and a due бекап goes up.
    expect(isConnected(ports.state.read())).toBe(true);
    expect(await runBackup(ports, NOW)).toMatchObject({ kind: 'uploaded' });
  });

  it('A mistyped код відновлення is refused as mistyped, before anything is fetched', async () => {
    const ports = portsWith({ drive: inMemoryDrive({ files: [existingVersion(5, key(7))] }) });
    await connect(ports, NOW);
    const before = ports.drive.calls().download;

    const canonical = encodeRecoveryCode(key(7)).replace(/ /g, '');
    const mistyped = `${canonical.slice(0, 10)}${canonical[10] === 'Z' ? 'Y' : 'Z'}${canonical.slice(11)}`;

    expect(await adoptRecoveryCode(ports, mistyped, NOW)).toEqual({ kind: 'mistyped' });
    // Caught by the code's own check characters: not one byte was fetched to find out.
    expect(ports.drive.calls().download).toBe(before);
    expect(isConnected(ports.state.read())).toBe(false);
  });

  it('A well-formed code that opens nothing here belongs to another line', async () => {
    const ports = portsWith({ drive: inMemoryDrive({ files: [existingVersion(5, key(7))] }) });
    await connect(ports, NOW);

    // A perfectly correct код відновлення — for a folder somewhere else. Saying «неправильний»
    // would send the owner to check a code that is right.
    expect(await adoptRecoveryCode(ports, encodeRecoveryCode(key(9)), NOW)).toEqual({
      kind: 'another-line',
    });
    expect(await ports.keys.read()).toEqual({ kind: 'ok' });
    expect(isConnected(ports.state.read())).toBe(false);
  });

  it('Scenario: Starting afresh says what it costs first — and deletes nothing', async () => {
    const theirs = [existingVersion(4, key(9)), existingVersion(5, key(9))];
    const ports = portsWith({ drive: inMemoryDrive({ files: theirs }) });
    await connect(ports, NOW);

    const fresh = await startFreshLine(ports);

    expect(fresh).toMatchObject({ kind: 'ok' });
    // A new key, and the версії already in Drive left exactly where they are.
    expect(ports.drive.contents().map((file) => file.name)).toEqual(theirs.map((f) => f.name));
    expect(ports.drive.calls().delete).toBe(0);
    // Still not connected: this code is acknowledged the same way as any other new line.
    expect(isConnected(ports.state.read())).toBe(false);
    acknowledgeCode(ports, NOW);
    expect(isConnected(ports.state.read())).toBe(true);
  });
});

describe('disconnecting', () => {
  it('Scenario: Disconnecting removes it — and keeps the key and the версії', async () => {
    const files = [existingVersion(5, key(7))];
    const ports = portsWith({
      drive: inMemoryDrive({ files }),
      keys: inMemoryBackupKeyStore({ key: key(7) }),
    });
    await connect(ports, NOW);
    expect(isConnected(ports.state.read())).toBe(true);

    await disconnect(ports);

    // The Google authorisation is gone and no further upload is made…
    expect(ports.auth.held()).toBe(false);
    expect(isConnected(ports.state.read())).toBe(false);
    expect(await runBackup(ports, NOW)).toEqual({ kind: 'skipped', why: 'not-connected' });
    // …while the sealing key stays, so reconnecting on this phone continues the same line…
    expect(await ports.keys.read()).toEqual({ kind: 'ok', key: key(7) });
    // …and the версії бекапу already in Drive stay there, which is what the section promises.
    expect(ports.drive.contents().map((file) => file.name)).toEqual(files.map((f) => f.name));
    expect(ports.drive.calls().delete).toBe(0);
  });

  it('reconnecting afterwards asks for nothing', async () => {
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7) }) });
    await connect(ports, NOW);
    await disconnect(ports);

    expect(await connect(ports, NOW)).toEqual({
      kind: 'connected',
      accountLabel: 'owner@example.com',
    });
    expect(isConnected(ports.state.read())).toBe(true);
  });
});

describe('showing the код відновлення again while connected', () => {
  it('Scenario: The owner can ask for it again', async () => {
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7) }) });
    await connect(ports, NOW);

    const shown = await showRecoveryCode(ports);

    // The same code that opens this line — read from the keystore, written down, and handed back.
    expect(shown).toEqual({ kind: 'ok', recoveryCode: encodeRecoveryCode(key(7)) });
    // And it is the key the phone actually seals with: decoding it gives that key back.
    const read = decodeRecoveryCode(shown.kind === 'ok' ? shown.recoveryCode : '');
    expect(read.kind === 'ok' && read.key).toEqual(key(7));
  });

  it('A phone holding no key has no code of its own to show', async () => {
    const ports = portsWith();

    expect(await showRecoveryCode(ports)).toEqual({ kind: 'no-key' });
  });

  it('showing it changes nothing', async () => {
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7) }) });
    await connect(ports, NOW);

    await showRecoveryCode(ports);

    // A reading, not an act: the key, the connection and the folder are all as they were.
    expect(await ports.keys.read()).toEqual({ kind: 'ok', key: key(7) });
    expect(isConnected(ports.state.read())).toBe(true);
    expect(ports.drive.calls().delete).toBe(0);
  });
});

describe('starting a fresh line', () => {
  it('is refused outright on a phone that already holds a key', async () => {
    // The two-tap catastrophe this guard exists for: overwriting the key would make every версія
    // бекапу in Drive permanently unopenable, and the old код відновлення is gone the instant it
    // is replaced. It is not a warning to show — it is a state the app will not enter.
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ key: key(7) }) });
    await connect(ports, NOW);

    expect(await startFreshLine(ports)).toEqual({ kind: 'failed', why: 'key-already-held' });

    // The key is exactly the one it was, so every версія already up still opens.
    expect(await ports.keys.read()).toEqual({ kind: 'ok', key: key(7) });
  });

  it('is refused when the keystore cannot be reached, rather than minting into the dark', async () => {
    const ports = portsWith({ keys: inMemoryBackupKeyStore({ unavailable: true }) });

    expect(await startFreshLine(ports)).toEqual({ kind: 'failed', why: 'no-key' });
  });
});

describe('when Google withdraws the app’s access', () => {
  it('Scenario: Withdrawn access stops the claim of being connected', async () => {
    const files = [existingVersion(5, key(7))];
    const ports = portsWith({
      drive: inMemoryDrive({ files, failUploadWith: { kind: 'withdrawn' } }),
      keys: inMemoryBackupKeyStore({ key: key(7) }),
    });
    await connect(ports, NOW);
    expect(isConnected(ports.state.read())).toBe(true);

    expect(await runBackup(ports, NOW, { force: true })).toEqual({
      kind: 'failed',
      why: 'withdrawn',
    });

    // The app stops presenting itself as connected and asks to connect again…
    expect(isConnected(ports.state.read())).toBe(false);
    expect(ports.state.read().lastFailureKind).toBe('withdrawn');
    // …while nothing local is deleted and nothing in Drive is touched…
    expect(ports.drive.contents().map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(ports.drive.calls().delete).toBe(0);
    // …and the sealing key stays, so connecting again continues the very same line.
    expect(await ports.keys.read()).toEqual({ kind: 'ok', key: key(7) });
    expect(await connect(ports, NOW)).toEqual({
      kind: 'connected',
      accountLabel: 'owner@example.com',
    });
    expect(isConnected(ports.state.read())).toBe(true);
    // And the withdrawal is no longer reported: «Google більше не дозволяє доступ» beside a
    // connection that has just succeeded would be a stale sentence the owner cannot dismiss.
    expect(ports.state.read().lastFailureKind).toBeUndefined();
  });

  it('a reconnect that does not complete leaves the withdrawal explained', async () => {
    // The Google step succeeded and the keystore did not. Clearing the withdrawal here would drop
    // the section to a bare offer while nothing had completed — and leave a row the *next* connect
    // would read as an abandoned code step, asking the owner to acknowledge a code from months ago.
    const ports = portsWith({
      drive: inMemoryDrive({ failUploadWith: { kind: 'withdrawn' } }),
      keys: inMemoryBackupKeyStore({ key: key(7) }),
    });
    await connect(ports, NOW);
    await runBackup(ports, NOW, { force: true });
    expect(ports.state.read().lastFailureKind).toBe('withdrawn');

    const broken = { ...ports, keys: inMemoryBackupKeyStore({ unavailable: true }) };
    expect(await connect(broken, NOW)).toEqual({ kind: 'failed', why: 'no-key' });

    // Still explained, because nothing has actually been reconnected.
    expect(ports.state.read().lastFailureKind).toBe('withdrawn');
    // And a later connect that does complete both connects and clears it.
    expect(await connect(ports, NOW)).toEqual({
      kind: 'connected',
      accountLabel: 'owner@example.com',
    });
    expect(ports.state.read().lastFailureKind).toBeUndefined();
  });

  it('an ordinary failure does not disconnect anything', async () => {
    const ports = portsWith({
      drive: inMemoryDrive({ failUploadWith: { kind: 'no-network' } }),
      keys: inMemoryBackupKeyStore({ key: key(7) }),
    });
    await connect(ports, NOW);

    await runBackup(ports, NOW, { force: true });

    // A phone in a lift has not lost its authorisation; saying so would cost the owner a
    // connection they still have.
    expect(isConnected(ports.state.read())).toBe(true);
  });
});
