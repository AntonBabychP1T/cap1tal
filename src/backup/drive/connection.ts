import { backupKeyKept } from '../../platform/backup-key';
import { KEY_BYTES, keyId, ENVELOPE_HEAD_MAX_BYTES, isEnvelopeRefusal, readEnvelopeHead } from './envelope';
import type { DriveBackupPorts } from './ports';
import { decodeRecoveryCode, encodeRecoveryCode } from './recovery-code';

/**
 * Connecting Google Drive, and disconnecting it.
 *
 * Connecting has **two doors and both must end connected** (design D11, D14):
 *
 * - **A fresh line.** The folder holds nothing this phone recognises, so a key is made, the код
 *   відновлення is shown, and the owner acknowledges they have kept it. That acknowledgement is
 *   what completes the connection.
 * - **An existing line.** The folder already holds версії бекапу and this phone holds no key. The
 *   owner is asked for a код відновлення; the key it decodes is adopted, and *typing it is the
 *   acknowledgement* — the owner has just demonstrated they hold the code, and asking them to
 *   confirm it afterwards would be asking twice. Without this the flagship new-phone flow would
 *   connect, register no background task and never upload.
 *
 * A phone that still holds its key reconnects straight through: the key stays across a disconnect
 * exactly so that the same line continues rather than every uploaded версія being orphaned (D8).
 */

/** Where connecting stands after the Google step: what the section must ask for next. */
export type ConnectStep =
  /** A key was made. Show this код відновлення and wait for the acknowledgement. */
  | { readonly kind: 'show-code'; readonly accountLabel: string; readonly recoveryCode: string }
  /** The folder holds версії this phone cannot open. Ask for the код відновлення of a line. */
  | { readonly kind: 'ask-code'; readonly accountLabel: string; readonly versions: number }
  /** This phone already holds the key: nothing to show and nothing to ask. Connected. */
  | { readonly kind: 'connected'; readonly accountLabel: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly why: ConnectFailure };

/** Why connecting could not get as far as a код відновлення. Each is a Ukrainian sentence. */
export type ConnectFailure =
  | 'refused'
  | 'no-network'
  /** This build carries no Google OAuth client id — a tree without the owner's console setup. */
  | 'not-configured'
  /** The keystore could not be reached, so no key could be made or read. */
  | 'no-key'
  /**
   * Starting a fresh line was asked for on a phone that already holds a key. Refused rather than
   * warned about: replacing the key makes every версія бекапу in Drive unopenable for ever.
   */
  | 'key-already-held'
  /** Drive answered something this app could not use; the folder's contents are unknown. */
  | 'unavailable';

/** What entering a код відновлення came to. */
export type AdoptOutcome =
  | { readonly kind: 'ok'; readonly accountLabel: string }
  /** The code was copied down wrongly — caught by its own check characters, nothing fetched. */
  | { readonly kind: 'mistyped' }
  /** The code is well-formed and opens nothing in the folder: it belongs to another line. */
  | { readonly kind: 'another-line' }
  | { readonly kind: 'failed'; readonly why: ConnectFailure };

/**
 * The Google step, and then whichever door this phone is at.
 *
 * Nothing is written and no key is made until the owner's Google account has actually said yes:
 * a cancelled or refused authorisation leaves the phone exactly as it was.
 */
export async function connect(ports: DriveBackupPorts, now: Date): Promise<ConnectStep> {
  const authorised = await ports.auth.authorise();
  switch (authorised.kind) {
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'refused':
      return { kind: 'failed', why: 'refused' };
    case 'no-network':
      return { kind: 'failed', why: 'no-network' };
    case 'not-configured':
      return { kind: 'failed', why: 'not-configured' };
    case 'ok':
      break;
  }

  // Read *before* the Google step is recorded, so the row still says what the previous attempt
  // came to. An account with no acknowledgement is an owner who was shown a код відновлення and
  // walked away from it; a withdrawal is not that, and neither is a disconnect, which clears the
  // row entirely.
  const before = ports.state.read();
  const abandoned =
    before.accountLabel !== undefined &&
    before.recoveryCodeAcknowledgedAt === undefined &&
    before.lastFailureKind !== 'withdrawn';

  const accountLabel = authorised.accountLabel;
  ports.state.connect(accountLabel);

  /**
   * The withdrawal is over — cleared only on a path that actually got somewhere.
   *
   * Deliberately not cleared beside `state.connect` above: a connect that then fails at the
   * keystore would have erased the explanation while nothing completed, dropping the section from
   * «Google більше не дозволяє доступ… ваші дані недоторкані» to a bare offer, and leaving a row
   * that the *next* connect would read as an abandoned code step.
   */
  const settled = (): void => {
    if (before.lastFailureKind === 'withdrawn') {
      ports.state.clearFailure();
    }
  };

  const held = await ports.keys.read();
  if (held.kind !== 'ok') {
    return { kind: 'failed', why: 'no-key' };
  }

  if (backupKeyKept(held) && held.key) {
    settled();
    if (abandoned) {
      // The spec is explicit: an owner who left while the код відновлення was on screen is shown
      // it *again* for acknowledgement. Completing the connection here would leave them connected
      // to copies only a code they never wrote down can ever open — the one irreversible mistake
      // this flow can make on the owner's behalf.
      return { kind: 'show-code', accountLabel, recoveryCode: encodeRecoveryCode(held.key) };
    }
    // A reconnect after a disconnect, or after Google withdrew access. The owner acknowledged this
    // code already; the same line continues, and there is nothing to show or ask for.
    ports.state.acknowledgeRecoveryCode(now);
    return { kind: 'connected', accountLabel };
  }

  // No key. Which door depends on what is already in the folder.
  const existing = await openableVersions(ports);
  if (existing === undefined) {
    // The folder's contents are unknown. Minting a key here could orphan версії that are there.
    return { kind: 'failed', why: 'unavailable' };
  }
  if (existing > 0) {
    settled();
    return { kind: 'ask-code', accountLabel, versions: existing };
  }

  const made = ports.random.bytes(KEY_BYTES);
  const saved = await ports.keys.save(made);
  if (saved.kind !== 'ok') {
    return { kind: 'failed', why: 'no-key' };
  }
  settled();
  // Not connected yet: the acknowledgement is what completes it, and until then no бекап goes up.
  return { kind: 'show-code', accountLabel, recoveryCode: encodeRecoveryCode(made) };
}

/**
 * The owner has kept the код відновлення they were shown. The connection is complete.
 */
export function acknowledgeCode(ports: DriveBackupPorts, now: Date): void {
  ports.state.acknowledgeRecoveryCode(now);
}

/**
 * A код відновлення the owner typed: adopt the key it spells, if it opens something here.
 *
 * The order is what makes «неправильний код» and «інша копія» two different sentences. The check
 * characters are asked first, so a mistyped code is refused as mistyped without a byte being
 * fetched; then the key it spells is compared against the версії in the folder by their `keyId`,
 * which needs no decryption at all. A code that opens nothing here is a code for another line —
 * not a typo, and telling the owner otherwise would send them to check a correct code.
 */
export async function adoptRecoveryCode(
  ports: DriveBackupPorts,
  typed: string,
  now: Date,
): Promise<AdoptOutcome> {
  const read = decodeRecoveryCode(typed);
  if (read.kind !== 'ok') {
    // `malformed` and `mistyped` are one sentence for the owner: this is not the code, type it
    // again. Neither has fetched, opened or replaced anything.
    return { kind: 'mistyped' };
  }

  const lines = await lineIds(ports);
  if (lines === undefined) {
    return { kind: 'failed', why: 'unavailable' };
  }
  if (!lines.has(keyId(read.key))) {
    return { kind: 'another-line' };
  }

  const saved = await ports.keys.save(read.key);
  if (saved.kind !== 'ok') {
    return { kind: 'failed', why: 'no-key' };
  }

  const state = ports.state.read();
  const accountLabel = state.accountLabel ?? '';
  // Typing a code that opens a версія *is* the acknowledgement (design D14) — so this phone is
  // connected from here, its background task registers, and it uploads when a бекап is next due.
  ports.state.acknowledgeRecoveryCode(now);
  return { kind: 'ok', accountLabel };
}

/** What asking to see the код відновлення again came to. */
export type ShowCodeOutcome =
  | { readonly kind: 'ok'; readonly recoveryCode: string }
  /** This phone holds no key, so there is no code of its own to show. */
  | { readonly kind: 'no-key' };

/**
 * The код відновлення again, on the owner's deliberate request while connected.
 *
 * The key never leaves the keystore in any other form: this reads it, writes it down, and hands
 * back the writing. Nothing is stored and nothing is logged — the section shows it and forgets it
 * the moment the owner leaves that step.
 */
export async function showRecoveryCode(ports: DriveBackupPorts): Promise<ShowCodeOutcome> {
  const held = await ports.keys.read();
  if (!backupKeyKept(held) || held.kind !== 'ok' || !held.key) {
    return { kind: 'no-key' };
  }
  return { kind: 'ok', recoveryCode: encodeRecoveryCode(held.key) };
}

/**
 * The owner has no код відновлення and chooses to start afresh.
 *
 * A new key, and the версії already in Drive left exactly where they are — unopenable by this
 * phone and, by the rotation rule, never pruned by it either (design D14). The section says both
 * of those things before this is called.
 *
 * **It refuses outright while this phone already holds a key.** Overwriting one would make every
 * версія бекапу in Drive permanently unopenable — the sealing key is the only thing that opens
 * them, and the код відновлення for the old one is gone the instant it is replaced. That is the
 * precise loss D8 and D14 exist to prevent, so it is not a warning the screen shows but a state
 * this function will not enter: starting afresh is for a phone that holds nothing, and a phone
 * that holds a key already has the line it needs.
 */
export async function startFreshLine(
  ports: DriveBackupPorts,
): Promise<{ readonly kind: 'ok'; readonly recoveryCode: string } | { readonly kind: 'failed'; readonly why: ConnectFailure }> {
  const held = await ports.keys.read();
  if (held.kind !== 'ok') {
    return { kind: 'failed', why: 'no-key' };
  }
  if (backupKeyKept(held)) {
    return { kind: 'failed', why: 'key-already-held' };
  }

  const made = ports.random.bytes(KEY_BYTES);
  const saved = await ports.keys.save(made);
  if (saved.kind !== 'ok') {
    return { kind: 'failed', why: 'no-key' };
  }
  // Still not connected, and deliberately no moment is recorded here: the owner acknowledges this
  // code the same way as any other new line, and that acknowledgement is what completes it.
  return { kind: 'ok', recoveryCode: encodeRecoveryCode(made) };
}

/**
 * Disconnecting: the Google authorisation goes, and nothing else does.
 *
 * The sealing key stays in the keystore, deliberately (design D8) — reconnecting on this phone
 * then continues the same line instead of orphaning every версія already uploaded. And nothing in
 * Drive is touched: the версії бекапу stay there, and the код відновлення still opens them, which
 * is what the section says before asking for confirmation.
 */
export async function disconnect(ports: DriveBackupPorts): Promise<void> {
  await ports.auth.forget();
  ports.state.disconnect();
}

/** How many версії the folder holds, or `undefined` when the folder could not be read. */
async function openableVersions(ports: DriveBackupPorts): Promise<number | undefined> {
  const listed = await ports.drive.list();
  return listed.kind === 'ok' ? listed.value.length : undefined;
}

/**
 * The distinct keys the folder's версії are sealed under, read from their heads — no key needed,
 * and 512 bytes apiece rather than whole бекапи.
 */
async function lineIds(ports: DriveBackupPorts): Promise<Set<string> | undefined> {
  const listed = await ports.drive.list();
  if (listed.kind !== 'ok') {
    return undefined;
  }

  const ids = new Set<string>();
  for (const file of listed.value) {
    const head = await ports.drive.download(file.id, ENVELOPE_HEAD_MAX_BYTES);
    if (head.kind !== 'ok') {
      // A version whose head will not fetch is one this cannot judge. It is left out rather than
      // failing the whole answer: the other версії still name their lines.
      continue;
    }
    const read = readEnvelopeHead(head.value);
    if (!isEnvelopeRefusal(read)) {
      ids.add(read.keyId);
    }
  }
  return ids;
}
