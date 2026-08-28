import * as SecureStore from 'expo-secure-store';

import {
  MONOBANK_TOKEN_KEY,
  type MonobankTokenStore,
  type TokenRead,
  type TokenWrite,
} from './monobank-token';

/**
 * The device's own keystore, through `expo-secure-store` — the only place the monobank token is
 * ever written. It is not in SQLite (so no backup, export or database file carries it), not in
 * React state after the input is cleared, and not in any outcome or log.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` is what "on this phone, while it is unlocked" means: the value
 * is unreadable while the device is locked and is never migrated to another device. No
 * authentication prompt is asked for — `requireAuthentication: false` — because a manual finance
 * sync should not add a biometric gate to every run.
 *
 * Android Auto Backup is excluded by the `configureAndroidBackup` plugin option in `app.json`:
 * the encrypted preference would restore onto a device that cannot decrypt it, which is a broken
 * connection rather than a secret worth carrying over.
 *
 * The web build resolves `monobank-token-store.web.ts` instead — Metro's platform resolution, the
 * same mechanism `use-color-scheme.web.ts` uses — and that one stores nothing at all.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

/**
 * Every call is wrapped: a keystore that is missing, locked or refusing is an answer the screen
 * shows, never a crash — and the caught error is deliberately not read, so nothing it might
 * carry can reach a log.
 */
export const monobankTokenStore: MonobankTokenStore = {
  async read(): Promise<TokenRead> {
    try {
      const token = await SecureStore.getItemAsync(MONOBANK_TOKEN_KEY, OPTIONS);
      return { kind: 'ok', ...(token ? { token } : {}) };
    } catch {
      return { kind: 'unavailable' };
    }
  },

  async save(token: string): Promise<TokenWrite> {
    try {
      await SecureStore.setItemAsync(MONOBANK_TOKEN_KEY, token, OPTIONS);
      return { kind: 'ok' };
    } catch {
      return { kind: 'unavailable' };
    }
  },

  async remove(): Promise<TokenWrite> {
    try {
      await SecureStore.deleteItemAsync(MONOBANK_TOKEN_KEY, OPTIONS);
      return { kind: 'ok' };
    } catch {
      return { kind: 'unavailable' };
    }
  },
};
