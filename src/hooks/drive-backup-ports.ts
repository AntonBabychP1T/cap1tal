import { backup as backupRepo, driveBackupState } from '@/db/repos';
import type { DriveBackupPorts } from '@/backup/drive/ports';
import { backupKeyStore } from '@/platform/backup-key-device';
import { drive } from '@/platform/drive-device';
import { googleAuth } from '@/platform/google-auth-device';
import { deviceRandom } from '@/platform/random-device';

/**
 * Everything a Google Drive backup run needs of this device, in one place.
 *
 * Three things start one — the daily background task, the app opening, and «Зберегти зараз» —
 * and each lives somewhere `npm run verify` cannot reach. Written out at three call sites, the
 * six lines below would be three hand-kept copies of which keystore holds the sealing key and
 * which CSPRNG makes the nonces, and one copy drifting is a бекап sealed under something else.
 *
 * It sits in `src/hooks/` for `monobank-ports.ts`'s reason rather than because it is a hook: it
 * reaches for the platform adapters, and nothing under `verify` may load those. Everything it is
 * *for* is decided in `src/backup/drive/`, which is where the rules are proven.
 */
export function driveBackupPorts(over: Partial<DriveBackupPorts> = {}): DriveBackupPorts {
  return {
    store: backupRepo,
    state: driveBackupState,
    drive,
    auth: googleAuth,
    keys: backupKeyStore,
    random: deviceRandom,
    ...over,
  };
}
