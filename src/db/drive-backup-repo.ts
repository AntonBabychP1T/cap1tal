import { eq } from 'drizzle-orm';

import { NOT_CONNECTED, type DriveBackupState, type DriveBackupStateStore } from '../backup/drive/state';
import { driveBackup } from './schema';
import type { Storage } from './storage';

/**
 * What the phone remembers about its Google Drive backup — which account, whether the код
 * відновлення has been dealt with, when the last бекап went up, and what last went wrong.
 *
 * One row and no secrets. The Google authorisation, the sealing key and the код відновлення live
 * in the device's secure storage and in nothing this module can reach — the `monobank-repo.ts`
 * arrangement, for the same reason: a table is what a бекап and a database file carry, and none of
 * those three may be in either.
 *
 * The shape it reads and writes, and the one definition of connectedness, are
 * `src/backup/drive/state.ts` — pure, so the runs and the section's own logic can be proven
 * against a value rather than against SQLite.
 */

/** The single row's id. The CHECK in the schema is what keeps the table to one. */
const ROW = 'drive';

export function driveBackupRepo(db: Storage): DriveBackupStateStore {
  /** Reads the row, or the state of a phone that has never connected. */
  const read = (): DriveBackupState => {
    const row = db.select().from(driveBackup).where(eq(driveBackup.id, ROW)).all()[0];
    if (!row) {
      return NOT_CONNECTED;
    }
    return {
      ...(row.accountLabel ? { accountLabel: row.accountLabel } : {}),
      ...(row.recoveryCodeAcknowledgedAt
        ? { recoveryCodeAcknowledgedAt: row.recoveryCodeAcknowledgedAt }
        : {}),
      ...(row.lastSuccessAt ? { lastSuccessAt: row.lastSuccessAt } : {}),
      ...(row.lastUploadedChecksum ? { lastUploadedChecksum: row.lastUploadedChecksum } : {}),
      ...(row.lastFailureKind ? { lastFailureKind: row.lastFailureKind } : {}),
      ...(row.lastFailureAt ? { lastFailureAt: row.lastFailureAt } : {}),
    };
  };

  /**
   * Writes the named fields and leaves every other one exactly as it was.
   *
   * An upsert rather than a read-modify-write, so two of these cannot interleave into a row that
   * holds half of each — and `set` names only what the caller passed, which is what makes
   * "recording a failure does not touch the last success" a property of the SQL and not of a
   * caller remembering to read first.
   */
  const merge = (fields: Partial<Record<string, unknown>>): void => {
    db.insert(driveBackup)
      .values({ id: ROW, ...fields })
      .onConflictDoUpdate({ target: driveBackup.id, set: fields })
      .run();
  };

  return {
    read,

    /**
     * The Google step is done: this account is the one. Not yet connected — the код відновлення
     * has still to be dealt with, and `isConnected` is what says so.
     */
    connect(accountLabel: string): void {
      merge({ accountLabel });
    },

    /**
     * The код відновлення is dealt with, and the connection is complete.
     *
     * Called from both doors of design D14: the owner acknowledging the code they were shown, and
     * the owner typing a code that opened a версія бекапу. Typing it *is* the demonstration that
     * they hold it, so the second door asks for no further acknowledgement.
     */
    acknowledgeRecoveryCode(now: Date): void {
      merge({ recoveryCodeAcknowledgedAt: now });
    },

    /**
     * A бекап went up. The moment and what was in it, and the last failure cleared — the owner
     * reading «не вдалося» beside a успіх from a minute ago would be reading a stale sentence.
     */
    recordSuccess(now: Date, checksum: string): void {
      merge({
        lastSuccessAt: now,
        lastUploadedChecksum: checksum,
        lastFailureKind: null,
        lastFailureAt: null,
      });
    },

    /**
     * A бекап did not go up. The last success is deliberately not among the fields written: the
     * owner needs to know their history is still safe as of whenever it last was, and a failure
     * that erased that date would turn a bad day into a claim that nothing has ever been saved.
     */
    recordFailure(now: Date, kind: string): void {
      merge({ lastFailureKind: kind, lastFailureAt: now });
    },

    /** The last failure no longer describes anything — cleared, the last success untouched. */
    clearFailure(): void {
      merge({ lastFailureKind: null, lastFailureAt: null });
    },

    /**
     * Google withdrew the app's access: recorded, and the acknowledgement cleared so the app stops
     * presenting itself as connected — which the spec requires and which recording a failure alone
     * does not do. The account label stays so the section can name it, and neither the sealing key
     * nor anything in Drive is touched, so connecting again continues the same line.
     */
    recordWithdrawn(now: Date): void {
      merge({
        lastFailureKind: 'withdrawn',
        lastFailureAt: now,
        recoveryCodeAcknowledgedAt: null,
      });
    },

    /**
     * Google Drive is disconnected: this phone no longer backs up.
     *
     * The row goes entirely, so the section is back to its offer. What stays is outside this
     * module and deliberately so — the sealing key in the keystore (design D8) and every версія
     * бекапу already in Drive, so reconnecting on this phone continues the same line.
     */
    disconnect(): void {
      db.delete(driveBackup).where(eq(driveBackup.id, ROW)).run();
    },
  };
}
