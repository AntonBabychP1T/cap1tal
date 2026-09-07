/**
 * The seam between the app and wherever the sealing key of the версії бекапу actually lives. The
 * port and its test double only — the platform adapter is `backup-key-device.ts` (native, backed
 * by `expo-secure-store`), and it is not imported from here.
 *
 * This is `monobank-token.ts`'s shape verbatim, and deliberately so: the two secrets have the same
 * lifecycle, the same «a keystore that cannot be reached is an answer, not a catastrophe» rule, and
 * the same absolute prohibition on the value appearing in an outcome, an error or a log. Nothing
 * under `npm run verify` may load a native module, so the port lives in a file no platform code
 * touches and every rule about the key is proven against `inMemoryBackupKeyStore`.
 *
 * One difference from the token, and it is the important one: **an unreachable keystore must never
 * cost the owner the key.** A token can be re-entered from the monobank app in a minute; a sealing
 * key that is gone is a Drive folder full of версії nobody can ever open again. So `unavailable` is
 * an answer for every call here, and `remove` — the only path that destroys anything — is called
 * from nowhere at all (see its own comment below).
 *
 * The key is bytes, not text. It is never written down here — `src/backup/drive/recovery-code.ts`
 * is what turns it into the код відновлення the owner keeps, and that happens above this port.
 */

/** One versioned key on the device. Versioned so a later format change cannot read this one. */
export const BACKUP_KEY_KEY = 'cap1tal.drive.backup-key.v1';

/**
 * What a read of the store can say. `key` absent means this phone holds none — not a failure, and
 * the ordinary state of a phone that has never connected Google Drive or has just been reset.
 */
export type BackupKeyRead =
  | { readonly kind: 'ok'; readonly key?: Uint8Array }
  | { readonly kind: 'unavailable' };

/**
 * Whether a read found a key kept. One definition, because two drift: a zero-length array is not a
 * key, and a caller that reimplements the check is one `!== undefined` away from sealing a бекап
 * under nothing.
 */
export function backupKeyKept(read: BackupKeyRead): boolean {
  return read.kind === 'ok' && read.key !== undefined && read.key.length > 0;
}

/** What a write or a removal can say. Neither ever hands the value back. */
export type BackupKeyWrite = { readonly kind: 'ok' } | { readonly kind: 'unavailable' };

export interface BackupKeyStore {
  /** The stored key, if this phone holds one and secure storage could be reached. */
  read(): Promise<BackupKeyRead>;
  /**
   * Keeps a key. Called when Google Drive is first connected on a phone that holds none, and when
   * a код відновлення is accepted on a new phone — design D14's "the line continues" is this call.
   */
  save(key: Uint8Array): Promise<BackupKeyWrite>;
  /**
   * Removes the key and nothing else: no рахунок, транзакція, or версія бекапу in Drive.
   *
   * **Nothing in the app calls this, and that is the design and not an omission.** Disconnecting
   * keeps the key (design D8) so reconnecting continues the same line; starting a fresh line
   * refuses outright while a key is held (design D14, `connection.ts`), because replacing one
   * makes every версія бекапу in Drive permanently unopenable. The method exists because the
   * keystore seam has it and a future change may need it under an explicit decision — a caller
   * added here is a caller that has to argue for itself.
   */
  remove(): Promise<BackupKeyWrite>;
}

/**
 * The store the tests use, and the only implementation `verify` ever loads. `unavailable` makes
 * every call answer as a device whose secure storage cannot be reached would — the state that must
 * leave a working key alone rather than destroy it.
 */
export function inMemoryBackupKeyStore(
  options: { readonly key?: Uint8Array; readonly unavailable?: boolean } = {},
): BackupKeyStore {
  // Copied in, so a caller mutating the array it passed cannot change what the store holds — a
  // real keystore writes bytes, and a double that shared a reference would hide that difference.
  let kept: Uint8Array | undefined = options.key ? Uint8Array.from(options.key) : undefined;
  const unavailable = options.unavailable ?? false;

  return {
    read: async () =>
      unavailable
        ? { kind: 'unavailable' }
        : { kind: 'ok', ...(kept ? { key: Uint8Array.from(kept) } : {}) },

    save: async (key: Uint8Array) => {
      if (unavailable) {
        return { kind: 'unavailable' };
      }
      kept = Uint8Array.from(key);
      return { kind: 'ok' };
    },

    remove: async () => {
      if (unavailable) {
        return { kind: 'unavailable' };
      }
      kept = undefined;
      return { kind: 'ok' };
    },
  };
}
