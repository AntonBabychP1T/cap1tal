import * as SecureStore from 'expo-secure-store';

import {
  BACKUP_KEY_KEY,
  type BackupKeyRead,
  type BackupKeyStore,
  type BackupKeyWrite,
} from './backup-key';

/**
 * The device's own keystore, through `expo-secure-store` — the only place the sealing key of the
 * версії бекапу is ever written. It is not in SQLite (so no бекап, export or database file carries
 * it), not in React state, and not in any outcome or log. The one other form it takes is the код
 * відновлення the owner is shown once and keeps themselves.
 *
 * `monobank-token-store.ts`'s options verbatim, and for the same reasons:
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` means "on this phone, while it is unlocked" — unreadable while
 * the device is locked and never migrated to another device, which is precisely what makes the
 * код відновлення necessary rather than decorative (design D8). `requireAuthentication: false`
 * because a daily background backup cannot wait on a biometric prompt.
 *
 * Android Auto Backup is excluded by the `configureAndroidBackup` plugin option in `app.json`:
 * an encrypted preference restored onto a device that cannot decrypt it is worse than nothing here
 * — it would look like a phone that holds the key while opening nothing.
 *
 * Secure storage holds strings, so the key travels as hex. That is an encoding and not a second
 * format: it is written here and read here, and no other module sees it.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

function toHex(key: Uint8Array): string {
  return Array.from(key, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hex back to bytes, or nothing at all — a stored value that is not hex is not a key. */
function fromHex(text: string): Uint8Array | undefined {
  if (text.length === 0 || text.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(text)) {
    return undefined;
  }
  const bytes = new Uint8Array(text.length / 2);
  for (let at = 0; at < bytes.length; at += 1) {
    bytes[at] = Number.parseInt(text.slice(at * 2, at * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Every call is wrapped: a keystore that is missing, locked or refusing is an answer the section
 * shows, never a crash — and the caught error is deliberately not read, so nothing it might carry
 * can reach a log.
 */
export const backupKeyStore: BackupKeyStore = {
  async read(): Promise<BackupKeyRead> {
    try {
      const stored = await SecureStore.getItemAsync(BACKUP_KEY_KEY, OPTIONS);
      if (!stored) {
        return { kind: 'ok' };
      }
      const key = fromHex(stored);
      // A stored value that will not decode is not "no key": destroying it or treating this phone
      // as keyless would start a fresh line and orphan every версія бекапу already uploaded. It is
      // the same answer as a keystore that cannot be reached — say so, change nothing.
      return key ? { kind: 'ok', key } : { kind: 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  },

  async save(key: Uint8Array): Promise<BackupKeyWrite> {
    try {
      await SecureStore.setItemAsync(BACKUP_KEY_KEY, toHex(key), OPTIONS);
      return { kind: 'ok' };
    } catch {
      return { kind: 'unavailable' };
    }
  },

  async remove(): Promise<BackupKeyWrite> {
    try {
      await SecureStore.deleteItemAsync(BACKUP_KEY_KEY, OPTIONS);
      return { kind: 'ok' };
    } catch {
      return { kind: 'unavailable' };
    }
  },
};
