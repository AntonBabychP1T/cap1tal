import type { BackupKeyStore } from '../../platform/backup-key';
import type { DrivePort } from '../../platform/drive';
import type { GoogleAuthPort } from '../../platform/google-auth';
import type { RandomPort } from '../../platform/random';
import type { BackupStore } from '../backup';
import type { DriveBackupStateStore } from './state';

/**
 * Everything the три runs need of the world, in one value.
 *
 * Six seams and no seventh. Each is a port with an in-memory double beside it, so `run-backup.ts`,
 * `run-restore.ts` and `connection.ts` are proven end to end — a бекап made, sealed, uploaded,
 * listed, fetched back and restored — without a network, a keystore or a device.
 */
export interface DriveBackupPorts {
  /** The whole local state: what a бекап is made from, and what a відновлення replaces. */
  readonly store: BackupStore;
  /** What the phone remembers about the connection, and what the section reads. */
  readonly state: DriveBackupStateStore;
  readonly drive: DrivePort;
  readonly auth: GoogleAuthPort;
  /** The sealing key, in the device's secure storage. */
  readonly keys: BackupKeyStore;
  /** The CSPRNG behind the key and every envelope's nonce. */
  readonly random: RandomPort;
}
