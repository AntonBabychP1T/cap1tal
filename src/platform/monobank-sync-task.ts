import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { monobank as monobankRepo } from '@/db/repos';
import { syncPorts } from '@/hooks/monobank-ports';
import { evaluateProgress } from '@/hooks/progress-ports';
import { ALERT_PORTS } from '@/hooks/use-alerting';
import {
  BACKGROUND_TURN_BUDGET_MS,
  prepareBackgroundStorage,
  reconcileTask,
} from '@/platform/background-turn';
import { backgroundTurnsWanted, runBackgroundTurn } from '@/ui/monobank-background';

/**
 * The monobank sync on the chances the phone gives — `expo-background-task` over WorkManager
 * (design D7, D9). Never imported by a test: `verify` runs no native module, and everything this
 * decides is `runBackgroundTurn`'s, proven there against a scripted bank and a real database.
 *
 * The division of labour is the same one the бекап's task keeps. **The system decides when we are
 * asked; the pure function decides whether we act, for how long, and what the owner hears.** What
 * is left here is four device facts — the ports, the budget, the clock and whether the app is in
 * front of the owner — and turning one typed outcome into WorkManager's two.
 *
 * Defined at module scope and reached from the bundle's entry (`index.ts`), not from a screen: a
 * WorkManager wake-up with no Activity renders no route, so a definition that lived in
 * `_layout.tsx` would not exist when the task manager delivered the event, and the task would be
 * unregistered as undefined.
 */

/** The task's name on the device. Versioned, so a later shape cannot collide with this one. */
export const MONOBANK_SYNC_TASK = 'cap1tal.monobank-sync.v1';

TaskManager.defineTask(MONOBANK_SYNC_TASK, async () => {
  try {
    // A chance can land on a dead process, which has run no migrations and bound no журнал.
    await prepareBackgroundStorage();
    const turn = await runBackgroundTurn({
      // The device's own ports, with `wait` and `postponed` replaced inside `runBackgroundTurn`
      // from the budget below — never here, so there is one place a background run's budget is
      // applied and no way to forget it.
      sync: syncPorts(),
      storage: monobankRepo,
      alerts: ALERT_PORTS,
      // The worker starts a chance only while the app is in the background, but the owner may
      // open it inside the budget, and a failure whose screen is in front of them raises no
      // сповіщення. Read when the run ends, which is when the question is asked.
      attended: () => AppState.currentState === 'active',
      nowMs: () => Date.now(),
      budgetMs: BACKGROUND_TURN_BUDGET_MS,
    });
    if (turn.kind === 'ran' && turn.imported > 0) {
      // A chance that committed транзакції moved the history; one that committed nothing leaves
      // the зведення as it was and this evaluation writes nothing.
      evaluateProgress();
    }
    // Only storage that would not answer is a failure. `not-due`, `already-running`,
    // `not-configured`, `no-links` and every outcome a run can end with are successes with
    // nothing to do — reporting them as failures would make WorkManager back the whole worker
    // off, and with it the бекап that rides the same request.
    return turn.kind === 'storage-unavailable'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // `runBackgroundTurn` answers with values and does not throw, so this is the migrations,
    // storage or the module itself refusing. Swallowed deliberately: an unhandled rejection in a
    // background task is a crash the owner never sees and cannot act on.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Asks the phone for chances, or stops asking — re-asserted rather than tracked.
 *
 * The rule is `backgroundTurnsWanted`'s and it is one line: while a рахунок is linked there is
 * something for a background run to do, and while none is there is not. Called after the
 * migrations on launch, on every return to the foreground, and from the monobank screen whenever
 * the number of links changes, so a registration the system dropped comes back and one that
 * outlived the last link goes away. A device that refuses either is a phone that syncs when it is
 * opened instead, which is why that path is not an optimisation.
 */
export function syncMonobankSyncTask(): Promise<void> {
  // A registration that outlives the last link by one foreground costs one chance that finds
  // nothing linked and sends nothing; that is why re-asserting is cheaper than tracking.
  return reconcileTask(MONOBANK_SYNC_TASK, backgroundTurnsWanted({ links: monobankRepo.listLinks() }));
}
