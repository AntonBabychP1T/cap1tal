import { canonicalJson, crc32 } from './canonical';
import {
  BACKUP_APP,
  BACKUP_FORMAT_VERSION,
  BACKUP_KIND,
  BACKUP_SCHEMA_VERSION,
  BackupProblem,
  checkConsistent,
  parseState,
  type BackupEnvelope,
  type BackupState,
} from './format';
import { monthOf, type Month } from '../domain/transaction';

/**
 * Making a бекап and reading one — the whole of what a бекап means, as pure functions over values.
 *
 * `makeBackup` takes the state and returns the file; `readBackup` takes a file and returns either
 * what it holds or a named refusal. Neither touches storage, a clock or a device: the moment is
 * passed in, and the state comes from `src/db/backup-repo.ts`. That is what makes it possible to
 * show the owner what a restore would do *before* anything local is touched (design D6) — the
 * check and the writing are two different acts, and only the second one can change anything.
 */

/**
 * The whole stored state, and the means to put one back — the only thing making or restoring a
 * бекап needs of storage. `src/db/backup-repo.ts` is the implementation; naming it here rather
 * than importing that module is what keeps this one pure and testable against a value.
 */
export interface BackupStore {
  snapshot(): BackupState;
  replaceAll(state: BackupState): void;
}

/** A бекап as the caller holds it: the file's text, and what the envelope says about it. */
export interface BackupSnapshot {
  /** The whole file as UTF-8 text — one string, read and written whole (design D10). */
  readonly bytes: string;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly createdAt: Date;
  readonly checksum: string;
  /**
   * What the file holds, counted from the very state it was made from — so a screen saying what
   * was saved cannot re-read storage and report a number the file does not carry.
   */
  readonly figures: BackupFigures;
}

/**
 * Why a бекап may not be restored. Every one of them leaves local data untouched, and every one is
 * an answer the screen shows in the owner's own words — never an exception to catch.
 */
export type BackupRefusal =
  | { readonly kind: 'not-a-backup' }
  | { readonly kind: 'damaged' }
  | { readonly kind: 'newer-format'; readonly formatVersion: number; readonly supported: number }
  | { readonly kind: 'newer-schema'; readonly schemaVersion: number; readonly supported: number }
  | { readonly kind: 'inconsistent'; readonly problem: string };

/**
 * How big a state is, in the terms a restore is decided in. The same shape is produced for the
 * бекап and for what is on the phone, from the same function, so the two columns of the preview
 * are counted the same way and cannot disagree by construction (design D11).
 */
export interface BackupFigures {
  readonly accounts: number;
  readonly transactions: number;
  /** The first and last month its транзакції fall in; absent when it holds none. */
  readonly firstMonth?: Month;
  readonly lastMonth?: Month;
}

/** What a бекап says about itself once it has been read and found sound. */
export interface BackupHeader {
  readonly kind: 'ok';
  readonly createdAt: Date;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly figures: BackupFigures;
  /** The contents, already parsed — so restoring never has to trust the text a second time. */
  readonly state: BackupState;
}

/**
 * What a state amounts to: how many рахунки and транзакції, and the span of months they fall in.
 * The months come from the транзакції' own дати — calendar dates, so no device timezone moves them.
 */
export function figuresOf(state: BackupState): BackupFigures {
  const months = state.transactions.map((entry) => monthOf(entry.transaction.date)).sort();
  const first = months[0];
  const last = months[months.length - 1];
  return {
    accounts: state.accounts.length,
    transactions: state.transactions.length,
    ...(first ? { firstMonth: first } : {}),
    ...(last ? { lastMonth: last } : {}),
  };
}

/** Whether reading a file produced a бекап or a reason it is not one. */
export function isRefusal(read: BackupHeader | BackupRefusal): read is BackupRefusal {
  return read.kind !== 'ok';
}

/**
 * One state as one бекап, made at `now`.
 *
 * The envelope's marker and versions are written before its contents, deliberately: a half-written
 * file keeps its head, which is what lets `readBackup` tell a truncated бекап from a file that was
 * never one.
 */
export function makeBackup(state: BackupState, now: Date): BackupSnapshot {
  // Over the canonical serialisation of the body, never over the file's own bytes — so the value
  // can be recomputed from the parsed бекап and survives re-indentation (design D4).
  const checksum = crc32(canonicalJson(state));
  const envelope: BackupEnvelope = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    checksum,
    data: state,
  };
  return {
    bytes: JSON.stringify(envelope),
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: now,
    checksum,
    figures: figuresOf(state),
  };
}

/**
 * How far into a file the marker is looked for. The envelope writes `app` first, so a бекап says
 * what it is in its first bytes; anything further in belongs to a file that merely mentions us.
 */
const MARKER = /"app"\s*:\s*"cap1tal"/;
const MARKER_WINDOW = 200;

/**
 * A file as what it holds, or as the reason it holds nothing usable.
 *
 * The order of the checks is the order of what can be known. What the file *is* comes first, then
 * the versions — a бекап from a newer app may compute its checksum by a rule this build does not
 * have, so «made by a newer version» is the honest answer rather than «damaged» — then integrity,
 * and only then what the contents say about each other.
 */
export function readBackup(bytes: string): BackupHeader | BackupRefusal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    // A file that begins as a бекап and does not parse is one that was cut short or corrupted; a
    // file that never said it was a бекап — a Saldo CSV, a photo — simply is not one.
    return { kind: MARKER.test(bytes.slice(0, MARKER_WINDOW)) ? 'damaged' : 'not-a-backup' };
  }

  const envelope = asEnvelope(parsed);
  if (!envelope) {
    return { kind: 'not-a-backup' };
  }
  if (envelope.formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      kind: 'newer-format',
      formatVersion: envelope.formatVersion,
      supported: BACKUP_FORMAT_VERSION,
    };
  }
  if (envelope.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      kind: 'newer-schema',
      schemaVersion: envelope.schemaVersion,
      supported: BACKUP_SCHEMA_VERSION,
    };
  }
  if (crc32(canonicalJson(envelope.data)) !== envelope.checksum) {
    return { kind: 'damaged' };
  }

  // Last, and still before anything local is read or written: an intact бекап can still hold a
  // транзакція on a рахунок it does not carry, and that is a different sentence for the owner.
  let state: BackupState;
  try {
    state = parseState(envelope.data);
    checkConsistent(state);
  } catch (error) {
    if (error instanceof BackupProblem) {
      return { kind: 'inconsistent', problem: error.message };
    }
    throw error;
  }

  return {
    kind: 'ok',
    createdAt: new Date(envelope.createdAt),
    formatVersion: envelope.formatVersion,
    schemaVersion: envelope.schemaVersion,
    figures: figuresOf(state),
    state,
  };
}

/**
 * A string naming an instant — checked here rather than left to `new Date`, which answers every
 * unparseable string with an `Invalid Date` that spreads instead of stopping. The checksum covers
 * the body and not the envelope (design D4), so nothing downstream would catch a moment that is
 * not one, and the preview reads it: a бекап that cannot say when it was made is not one.
 */
function namesAnInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

/**
 * The envelope of a parsed file, or nothing when what was parsed is not one. Only the envelope is
 * judged here: its contents are the body's business, and a body that is wrong is a different
 * refusal from a file that is not a бекап.
 */
function asEnvelope(
  parsed: unknown,
): { readonly formatVersion: number; readonly schemaVersion: number; readonly createdAt: string; readonly checksum: string; readonly data: unknown } | undefined {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const row = parsed as Record<string, unknown>;
  if (row.app !== BACKUP_APP || row.kind !== BACKUP_KIND) {
    return undefined;
  }
  if (
    !Number.isSafeInteger(row.formatVersion) ||
    !Number.isSafeInteger(row.schemaVersion) ||
    !namesAnInstant(row.createdAt) ||
    typeof row.checksum !== 'string' ||
    row.data === null ||
    typeof row.data !== 'object'
  ) {
    return undefined;
  }
  return {
    formatVersion: row.formatVersion as number,
    schemaVersion: row.schemaVersion as number,
    createdAt: row.createdAt,
    checksum: row.checksum,
    data: row.data,
  };
}

/**
 * The бекап of everything on this phone right now — the one call the screen makes to save.
 *
 * Asynchronous because that is the shape the rest of the app and step 12's design both expect of
 * it; the reading itself is synchronous SQLite, and the making of the file is pure.
 */
export async function saveBackup(store: BackupStore, now: Date): Promise<BackupSnapshot> {
  return makeBackup(store.snapshot(), now);
}

/**
 * A file, restored — or the reason it was not, with nothing on the phone touched.
 *
 * Every refusal comes from `readBackup`, before storage is reached at all, and is passed through
 * untouched: this function adds no judgement of its own, so what the screen shows is exactly what
 * the format decided.
 */
export async function restoreBackup(
  store: BackupStore,
  bytes: string,
): Promise<'ok' | BackupRefusal> {
  const read = readBackup(bytes);
  if (isRefusal(read)) {
    return read;
  }
  return applyRestore(store, read);
}

/**
 * The replacement itself, over a бекап already read and already shown to the owner — so the
 * screen's «Відновити» does not read the file a second time and cannot restore something other
 * than what the preview described.
 */
export async function applyRestore(
  store: BackupStore,
  header: BackupHeader,
): Promise<'ok' | BackupRefusal> {
  store.replaceAll(header.state);
  return 'ok';
}
