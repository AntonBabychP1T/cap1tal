/**
 * What the phone remembers about its Google Drive backup, as a value and a contract — with no
 * database in sight.
 *
 * `src/db/drive-backup-repo.ts` is the implementation over SQLite; naming the shape here rather
 * than importing that module is what lets the runs, the schedule and the section's own logic be
 * proven against a value, the way `BackupStore` does the same job for step 11.
 */

/** Everything the «Google Drive» section reads, in one value. */
export interface DriveBackupState {
  /** Which Google account holds the версії бекапу, when there is one. */
  readonly accountLabel?: string;
  /** When the owner acknowledged the код відновлення — or typed one that opened a версія. */
  readonly recoveryCodeAcknowledgedAt?: Date;
  /** The moment of the last upload that completed. A failure never clears it. */
  readonly lastSuccessAt?: Date;
  /** The бекап's integrity value as last uploaded, so an unchanged one is not sent again. */
  readonly lastUploadedChecksum?: string;
  readonly lastFailureKind?: string;
  readonly lastFailureAt?: Date;
}

/** The state of a phone that has never connected: every field absent, and not connected. */
export const NOT_CONNECTED: DriveBackupState = {};

/**
 * Whether Google Drive counts as connected: an account **and** the код відновлення dealt with.
 *
 * One definition, in one place (design D11). Both doors of design D14 set the acknowledgement — a
 * phone that minted a key sets it when the owner confirms they kept the code, and a phone that
 * joined an existing line sets it the moment the code they typed opened a версія. A phone that set
 * only the account would never count as connected, never register the background task and never
 * upload, which is the whole new-phone flow.
 */
export function isConnected(state: DriveBackupState): boolean {
  return state.accountLabel !== undefined && state.recoveryCodeAcknowledgedAt !== undefined;
}

/** Writing what the phone remembers. The SQLite one is `driveBackupRepo`. */
export interface DriveBackupStateStore {
  read(): DriveBackupState;
  /** The Google step is done. Not yet connected — the код відновлення has still to be dealt with. */
  connect(accountLabel: string): void;
  /** The код відновлення is dealt with, and the connection is complete. */
  acknowledgeRecoveryCode(now: Date): void;
  /** A бекап went up: the moment, what was in it, and the last failure cleared. */
  recordSuccess(now: Date, checksum: string): void;
  /** A бекап did not go up. The last success is deliberately untouched. */
  recordFailure(now: Date, kind: string): void;
  /**
   * Google has withdrawn the app's access. Records it *and* stops the app presenting itself as
   * connected, which the spec requires and a recorded failure alone does not do.
   *
   * The account label stays, so the section can say which account it was; the sealing key and the
   * версії бекапу in Drive are outside this store and are untouched, so connecting again continues
   * the same line.
   */
  recordWithdrawn(now: Date): void;
  /** The last failure no longer describes anything — cleared without touching the last success. */
  clearFailure(): void;
  /** This phone no longer backs up. The key and the версії in Drive both stay. */
  disconnect(): void;
}

/**
 * The state the tests use. Holds the same value the table does, and nothing else — so a run proven
 * against it is proven against the rules, and `drive-backup-repo.test.ts` is what proves the SQL.
 */
export function inMemoryDriveBackupState(
  initial: DriveBackupState = NOT_CONNECTED,
): DriveBackupStateStore {
  let held: DriveBackupState = initial;

  return {
    read: () => held,
    connect: (accountLabel: string) => {
      held = { ...held, accountLabel };
    },
    acknowledgeRecoveryCode: (now: Date) => {
      held = { ...held, recoveryCodeAcknowledgedAt: now };
    },
    recordSuccess: (now: Date, checksum: string) => {
      const { lastFailureKind: _kind, lastFailureAt: _at, ...rest } = held;
      held = { ...rest, lastSuccessAt: now, lastUploadedChecksum: checksum };
    },
    recordFailure: (now: Date, kind: string) => {
      held = { ...held, lastFailureKind: kind, lastFailureAt: now };
    },
    recordWithdrawn: (now: Date) => {
      const { recoveryCodeAcknowledgedAt: _ack, ...rest } = held;
      held = { ...rest, lastFailureKind: 'withdrawn', lastFailureAt: now };
    },
    clearFailure: () => {
      const { lastFailureKind: _kind, lastFailureAt: _at, ...rest } = held;
      held = rest;
    },
    disconnect: () => {
      held = NOT_CONNECTED;
    },
  };
}
