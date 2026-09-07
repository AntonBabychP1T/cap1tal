import { applyRestore, figuresOf, type BackupFigures } from '../backup';
import {
  ENVELOPE_HEAD_MAX_BYTES,
  isEnvelopeRefusal,
  keyId,
  readEnvelopeHead,
  type EnvelopeHead,
} from './envelope';
import type { DriveBackupPorts } from './ports';
import { decodeRecoveryCode } from './recovery-code';
import { admitVersion, isRestoreRefusal, refusalFromHead, type RestoreRefusal } from './restore';

/**
 * «Відновити»: list the версії бекапу, open the chosen one, show what it would replace, and — only
 * on the owner's word — hand it to step 11's atomic import.
 *
 * The one rule this file exists to keep: **nothing local is touched until the owner has confirmed
 * a бекап that has already opened, checksummed and parsed.** The confirmation carries the бекап
 * itself, already read, so `applyRestore` is called with exactly what the preview described and
 * the bytes are never parsed a second time — which is why this uses `applyRestore` and not
 * `restoreBackup(store, bytes)`.
 *
 * Restore never merges and never happens by itself. There is no path here that any background task
 * can reach.
 */

/** One версія as «Відновити» offers it: its date, and whether this phone can open it. */
export interface OfferedVersion {
  readonly id: string;
  readonly name: string;
  /** From the бекап's own head. Absent only for a file this app did not write. */
  readonly createdAt?: Date;
  /** What stands in the way, decided from the head alone — no key, no body, no whole download. */
  readonly refusal?: RestoreRefusal;
}

/** What listing the версії бекапу came to. */
export type VersionListing =
  | { readonly kind: 'ok'; readonly versions: readonly OfferedVersion[]; readonly needsCode: boolean }
  | { readonly kind: 'failed'; readonly why: 'no-network' | 'withdrawn' | 'unavailable' };

/** A версія opened and judged, ready to be named to the owner and then confirmed. */
export interface RestorePreview {
  readonly id: string;
  readonly createdAt: Date;
  /** What the бекап holds, and what is on the phone now — counted by one function, so they agree. */
  readonly backupFigures: BackupFigures;
  readonly phoneFigures: BackupFigures;
  /** Already read and already found sound; confirming applies exactly this. */
  readonly candidate: Extract<ReturnType<typeof admitVersion>, { kind: 'ok' }>;
}

/** What opening a chosen версія came to. */
export type OpenOutcome =
  | { readonly kind: 'ok'; readonly preview: RestorePreview }
  /** The phone holds no key and the code entered was copied down wrongly. */
  | { readonly kind: 'mistyped' }
  | { readonly kind: 'refused'; readonly why: RestoreRefusal }
  | { readonly kind: 'failed'; readonly why: 'no-network' | 'withdrawn' | 'unavailable' | 'no-key' };

/** What a confirmed restore came to. */
export type RestoreOutcome =
  | { readonly kind: 'restored'; readonly figures: BackupFigures }
  /** Step 11 refused at the last moment; the phone holds exactly what it held before. */
  | { readonly kind: 'refused'; readonly why: string }
  /** The replacement threw. The import is one SQLite transaction, so nothing landed. */
  | { readonly kind: 'failed'; readonly why: string };

/**
 * The версії бекапу in the folder, newest first, each with whatever already stands in its way.
 *
 * Only heads are fetched — 512 bytes apiece (design D6) — so offering a list of five costs a few
 * kilobytes rather than five whole бекапи. `needsCode` is how the section knows to ask for a код
 * відновлення first: this phone holds no key, so nothing here can be opened without one.
 */
export async function listVersions(ports: DriveBackupPorts): Promise<VersionListing> {
  const listed = await ports.drive.list();
  if (listed.kind !== 'ok') {
    return { kind: 'failed', why: listed.kind === 'full' ? 'unavailable' : listed.kind };
  }

  const held = await ports.keys.read();
  const key = held.kind === 'ok' ? held.key : undefined;
  const mine = key ? keyId(key) : undefined;

  const versions: OfferedVersion[] = [];
  for (const file of listed.value) {
    const fetched = await ports.drive.download(file.id, ENVELOPE_HEAD_MAX_BYTES);
    if (fetched.kind !== 'ok') {
      versions.push({ id: file.id, name: file.name });
      continue;
    }
    const head = readEnvelopeHead(fetched.value);
    if (isEnvelopeRefusal(head)) {
      versions.push({ id: file.id, name: file.name, refusal: head });
      continue;
    }
    const plain: EnvelopeHead = {
      envelopeVersion: head.envelopeVersion,
      schemaVersion: head.schemaVersion,
      createdAt: head.createdAt,
      keyId: head.keyId,
    };
    const refusal = refusalFromHead({ head: plain, keyId: mine });
    versions.push({
      id: file.id,
      name: file.name,
      createdAt: head.createdAt,
      ...(refusal ? { refusal } : {}),
    });
  }

  return {
    kind: 'ok',
    versions: versions.sort(byNewestFirst),
    needsCode: mine === undefined,
  };
}

/** Newest first, by the moment each бекап was made — never by the file name. */
function byNewestFirst(a: OfferedVersion, b: OfferedVersion): number {
  const at = a.createdAt?.getTime();
  const bt = b.createdAt?.getTime();
  if (at === undefined && bt === undefined) return 0;
  if (at === undefined) return 1;
  if (bt === undefined) return -1;
  return bt - at;
}

/**
 * The chosen версія, fetched whole and opened — with this phone's key, or with a код відновлення
 * the owner typed.
 *
 * A mistyped code is caught by its own check characters before a byte is fetched, which is the
 * spec's "refused as wrong before anything is opened".
 */
export async function openVersion(
  ports: DriveBackupPorts,
  id: string,
  options: { readonly recoveryCode?: string } = {},
): Promise<OpenOutcome> {
  let key: Uint8Array | undefined;
  if (options.recoveryCode !== undefined) {
    const read = decodeRecoveryCode(options.recoveryCode);
    if (read.kind !== 'ok') {
      return { kind: 'mistyped' };
    }
    key = read.key;
  } else {
    const held = await ports.keys.read();
    if (held.kind !== 'ok') {
      return { kind: 'failed', why: 'no-key' };
    }
    if (!held.key) {
      return { kind: 'failed', why: 'no-key' };
    }
    key = held.key;
  }

  const fetched = await ports.drive.download(id);
  if (fetched.kind !== 'ok') {
    return { kind: 'failed', why: fetched.kind === 'full' ? 'unavailable' : fetched.kind };
  }

  const admitted = admitVersion({ bytes: fetched.value, key });
  if (isRestoreRefusal(admitted)) {
    return { kind: 'refused', why: admitted };
  }

  return {
    kind: 'ok',
    preview: {
      id,
      createdAt: admitted.createdAt,
      backupFigures: admitted.backup.figures,
      // What is on the phone now, counted by the same function over the same shape — so the two
      // columns of the confirmation cannot disagree about what a рахунок is.
      phoneFigures: figuresOf(ports.store.snapshot()),
      candidate: admitted,
    },
  };
}

/**
 * The owner's word: replace everything with the версія бекапу they were just shown.
 *
 * The бекап comes from the preview and is not read again. A rejection or a throw deep in the write
 * changes nothing — the replacement is one SQLite transaction, and it is step 11's, not this
 * change's.
 */
export async function confirmRestore(
  ports: DriveBackupPorts,
  preview: RestorePreview,
): Promise<RestoreOutcome> {
  let outcome: Awaited<ReturnType<typeof applyRestore>>;
  try {
    outcome = await applyRestore(ports.store, preview.candidate.backup);
  } catch (error) {
    return { kind: 'failed', why: error instanceof Error ? error.message : String(error) };
  }
  if (outcome !== 'ok') {
    return { kind: 'refused', why: outcome.kind };
  }
  return { kind: 'restored', figures: preview.backupFigures };
}

/**
 * Adopts the key a restore was opened with, so this phone joins that line rather than starting a
 * second one (design D14).
 *
 * Called after a restore lands and not before: a restore that was refused should leave the phone
 * exactly as it was, including which key it holds.
 */
export async function adoptKeyFrom(
  ports: DriveBackupPorts,
  recoveryCode: string,
  now: Date,
): Promise<void> {
  const read = decodeRecoveryCode(recoveryCode);
  if (read.kind !== 'ok') {
    return;
  }
  const saved = await ports.keys.save(read.key);
  if (saved.kind === 'ok') {
    // The restored phone is now on this line, and it is connected: it typed the код відновлення,
    // which is the acknowledgement.
    ports.state.acknowledgeRecoveryCode(now);
  }
}
