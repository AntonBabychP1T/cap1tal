import { backupKeyKept } from '../../platform/backup-key';
import { saveBackup } from '../backup';
import { ENVELOPE_HEAD_MAX_BYTES, NONCE_BYTES, keyId, sealEnvelope } from './envelope';
import type { DriveBackupPorts } from './ports';
import { versionsOf, versionsToPrune } from './rotation';
import { isBackupDue, shouldUpload } from './schedule';
import { isConnected } from './state';

/**
 * One backup run, from «is anything due» to «the folder is tidy» — the whole of what happens
 * without the owner asking, and the whole of what «Зберегти зараз» does when they do.
 *
 * Every step is a typed outcome and nothing throws. That matters more here than anywhere else in
 * the change: this runs in a background task the owner never sees, so a thrown error would be a
 * backup that silently stopped happening. What the owner is shown afterwards is what this recorded.
 *
 * The order is the spec's, and each step protects the one before it:
 *
 *   due? → make the бекап → unchanged? → seal → upload → **confirm** → record → prune
 *
 * Nothing older is removed until the new версія is confirmed in the folder, and nothing sealed
 * under another key is ever a candidate (design D10, D14) — so a failure at any step leaves every
 * версія бекапу that was there exactly as it was, and leaves the last success standing.
 */

/** What a run came to. `skipped` is a success with nothing to do, and is not a failure. */
export type BackupRunOutcome =
  | { readonly kind: 'uploaded'; readonly at: Date; readonly checksum: string }
  /** Nothing was due, or the бекап is what was uploaded last: the copy in Drive is current. */
  | { readonly kind: 'skipped'; readonly why: 'not-due' | 'unchanged' | 'not-connected' }
  | { readonly kind: 'failed'; readonly why: BackupFailure };

/**
 * Why a run could not put a бекап up. Each is a sentence the section shows with a next step, and
 * `src/ui/drive-backup.ts` is where each becomes Ukrainian — exhaustively, under test.
 */
export type BackupFailure =
  /** The phone has no network. Still connected; it is tried again when one is next due. */
  | 'no-network'
  /** Google has withdrawn the app's access, or the authorisation expired. Connect again. */
  | 'withdrawn'
  /** The owner's Drive has no room left. */
  | 'full'
  /** The keystore could not be reached, so the бекап could not be sealed. */
  | 'no-key'
  /** Drive answered something this app could not use. Tried again when one is next due. */
  | 'unavailable';

/**
 * Runs a backup if one is due. Asked by the background task and by the app's foreground entry with
 * the same arguments — the catch-up and the daily run are one path, not two.
 *
 * `force` is «Зберегти зараз»: it skips the "is it due" question and nothing else. An unchanged
 * бекап is still not uploaded, because sending a byte-identical copy would move the date the owner
 * reads while changing nothing about what is safe.
 */
export async function runBackup(
  ports: DriveBackupPorts,
  now: Date,
  options: { readonly force?: boolean } = {},
): Promise<BackupRunOutcome> {
  const state = ports.state.read();
  if (!isConnected(state)) {
    // The spec's "a disconnected app never uploads" — and no request is made to Google to find out.
    return { kind: 'skipped', why: 'not-connected' };
  }
  if (!options.force && !isBackupDue({ connected: true, lastSuccessAt: state.lastSuccessAt, now })) {
    return { kind: 'skipped', why: 'not-due' };
  }

  // Making a бекап is local and cheap; sending one is neither. So it is made first and its
  // checksum decides whether anything leaves the phone at all.
  const snapshot = await saveBackup(ports.store, now);
  if (!shouldUpload({ checksum: snapshot.checksum, lastUploadedChecksum: state.lastUploadedChecksum })) {
    return { kind: 'skipped', why: 'unchanged' };
  }

  const read = await ports.keys.read();
  if (!backupKeyKept(read) || read.kind !== 'ok' || !read.key) {
    // Connected but holding no key: nothing can be sealed, and uploading a бекап unsealed is the
    // one thing this whole capability exists to prevent.
    return fail(ports, now, 'no-key');
  }
  const key = read.key;

  const sealed = sealEnvelope({
    bytes: snapshot.bytes,
    schemaVersion: snapshot.schemaVersion,
    createdAt: snapshot.createdAt,
    key,
    nonce: ports.random.bytes(NONCE_BYTES),
  });

  const uploaded = await ports.drive.upload(versionName(snapshot.createdAt), sealed);
  if (uploaded.kind !== 'ok') {
    return fail(ports, now, uploaded.kind === 'unavailable' ? 'unavailable' : uploaded.kind);
  }
  if (uploaded.value.size !== sealed.length) {
    // Drive took it and says it holds a different number of bytes. Recording a success would let
    // rotation delete a good версія in favour of a truncated one.
    return fail(ports, now, 'unavailable');
  }

  // Only now: the new версія is in the folder, whole and confirmed.
  ports.state.recordSuccess(now, snapshot.checksum);

  // And only now is anything allowed to be removed. A failure here is not a failed backup — the
  // бекап is up — so it is deliberately not recorded as one.
  await prune(ports, keyId(key));

  return { kind: 'uploaded', at: now, checksum: snapshot.checksum };
}

/**
 * The file name a версія бекапу gets: `cap1tal-YYYYMMDDTHHmmssZ.c1b`.
 *
 * Sortable by name because it is sortable by instant, which is what lets a listing come back in
 * order without a metadata read (design D10). The date the owner is *shown* never comes from here
 * — it comes from the envelope's head, which the cipher authenticates.
 */
export function versionName(createdAt: Date): string {
  return `cap1tal-${createdAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}.c1b`;
}

/**
 * Records a failure and answers with it. The last success is untouched, by the repo's contract.
 *
 * `withdrawn` is the one that does more than record. The spec is explicit: when Google has taken
 * the app's access away, the app "SHALL stop presenting itself as connected and SHALL ask the
 * owner to connect again" — a recorded failure beside a section still offering «Зберегти зараз»
 * would be the app claiming a state it is not in. Nothing local is deleted and nothing in Drive is
 * touched: the sealing key stays, so connecting again continues the same line.
 */
function fail(ports: DriveBackupPorts, now: Date, why: BackupFailure): BackupRunOutcome {
  if (why === 'withdrawn') {
    ports.state.recordWithdrawn(now);
  } else {
    ports.state.recordFailure(now, why);
  }
  return { kind: 'failed', why };
}

/**
 * Removes the версії бекапу that may go, now that a newer one is confirmed.
 *
 * Reads each file's head — 512 bytes apiece, not whole бекапи — so the rule can see which line
 * each belongs to. A head that will not fetch leaves that версія unreadable and therefore
 * undeletable, which is the safe direction: the alternative is deleting something we cannot see.
 */
async function prune(ports: DriveBackupPorts, currentKeyId: string): Promise<void> {
  const listed = await ports.drive.list();
  if (listed.kind !== 'ok') {
    return;
  }

  const heads: { id: string; name: string; head: Uint8Array }[] = [];
  for (const file of listed.value) {
    const head = await ports.drive.download(file.id, ENVELOPE_HEAD_MAX_BYTES);
    heads.push({
      id: file.id,
      name: file.name,
      head: head.kind === 'ok' ? head.value : new Uint8Array(0),
    });
  }

  for (const version of versionsToPrune({ versions: versionsOf(heads), keyId: currentKeyId })) {
    // A delete that fails is left alone: the версія stays, the folder holds one more than it
    // meant to, and nothing the owner depends on is worse for it.
    await ports.drive.delete(version.id);
  }
}
