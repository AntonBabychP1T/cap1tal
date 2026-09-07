import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { runBackup } from '@/backup/drive/run-backup';
import { isConnected } from '@/backup/drive/state';
import { driveBackupState } from '@/db/repos';
import { driveBackupPorts } from '@/hooks/drive-backup-ports';

/**
 * The daily бекап, run without the owner asking — `expo-background-task` over WorkManager (design
 * D9). Never imported by a test: `verify` runs no native module, and everything this decides is
 * `isBackupDue`'s and `runBackup`'s, both proven there.
 *
 * The division of labour is the whole of D9. **The system decides when we are asked; the pure
 * function decides whether we act.** That is what lets the spec promise "at least once every 24
 * hours, best-effort" honestly and never state a clock time Android does not guarantee — this
 * file asks WorkManager for *approximately* daily and treats every turn it is given as an
 * opportunity, not a schedule.
 *
 * The same run is asked on the app's foreground entry (`src/app/_layout.tsx`), so a window the
 * system never granted is caught up. One rule, two triggers, no drift.
 */

/** The task's name on the device. Versioned, so a later shape cannot collide with this one. */
export const DRIVE_BACKUP_TASK = 'cap1tal.drive-backup.v1';

/**
 * How often WorkManager is asked to give the app a turn.
 *
 * Not a promise and not a clock time: Android batches these against doze, charging and network,
 * so what actually happens is "about once a day, when the phone is willing". Fifteen minutes is
 * WorkManager's own floor and a day is what the spec asks for.
 */
const INTERVAL_MINUTES = 12 * 60;

TaskManager.defineTask(DRIVE_BACKUP_TASK, async () => {
  try {
    const outcome = await runBackup(driveBackupPorts(), new Date());
    // `skipped` is a success with nothing to do — nothing was due, or the бекап is what went up
    // last. Reporting it as a failure would make WorkManager back the task off for no reason.
    return outcome.kind === 'failed'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // `runBackup` answers with values and does not throw, so this is storage or the module itself
    // refusing. Swallowed deliberately: an unhandled rejection in a background task is a crash the
    // owner never sees and cannot act on, and the failure is already recorded where they will.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the daily run, or takes it away.
 *
 * Registered **only while connected** — the spec's "no request is made to Google before
 * connecting" is not only about what the run does, but about whether it exists at all. Called on
 * every launch and after connecting or disconnecting, so the registration follows the state rather
 * than being set once and forgotten.
 */
export async function syncDriveBackupTask(): Promise<void> {
  const connected = isConnected(driveBackupState.read());
  let registered: boolean;
  try {
    registered = await TaskManager.isTaskRegisteredAsync(DRIVE_BACKUP_TASK);
  } catch {
    return;
  }

  try {
    if (connected && !registered) {
      await BackgroundTask.registerTaskAsync(DRIVE_BACKUP_TASK, {
        minimumInterval: INTERVAL_MINUTES,
      });
    } else if (!connected && registered) {
      await BackgroundTask.unregisterTaskAsync(DRIVE_BACKUP_TASK);
    }
  } catch {
    // A device that refuses background work is a phone that backs up when it is opened instead —
    // which is exactly the catch-up path, and is why that path is not an optimisation.
  }
}
