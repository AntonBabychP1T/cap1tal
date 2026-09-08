import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { reporting as reportingRepo } from '@/db/repos';
import { bindJournal } from '@/ui/journal';

import migrations from '../../drizzle/migrations';

/**
 * What every chance the phone gives has in common: how often one is asked for, how long a run may
 * spend inside one, and the storage a chance on a dead process has to prepare for itself.
 *
 * Never imported by a test — it reaches for `react-native` and the migrator, neither of which
 * `verify` may load. Everything decided *inside* a chance is `src/ui/monobank-background.ts`'s and
 * `src/backup/drive/run-backup.ts`'s, both proven there.
 */

/**
 * How often WorkManager is asked to give the app a chance.
 *
 * One number for the whole app, because there is one worker. Every registered task shares a single
 * WorkManager request whose delay is the `minimumInterval` of whichever task registered most
 * recently, and the order tasks are restored in at launch is not something this app controls — so
 * two tasks with two intervals would put the phone on whichever cadence won the race (design D2).
 *
 * Fifteen minutes is WorkManager's own floor, and it is a *minimum delay between chances*, not a
 * schedule: Doze defers them to maintenance windows and App Standby stretches them to hours for an
 * app opened rarely. The app therefore claims no cadence anywhere the owner can read one.
 */
export const BACKGROUND_TURN_INTERVAL_MINUTES = 15;

/** WorkManager stops a worker that runs longer than ten minutes; a run gets eight of them. */
const ANDROID_BUDGET_MS = 8 * 60_000;

/**
 * How long a run started by a chance may spend, measured from the chance's start.
 *
 * Eight of WorkManager's ten minutes: the last request a budgeted run sends goes out before the
 * eighth minute and answers within the request timeout, so the worst case ends the chance with
 * about a minute to spare for the headless start itself (design D3).
 *
 * The number is Android's. An iOS build gets a far shorter grant — `BGAppRefreshTask` allows about
 * thirty seconds — and the constant sits behind `Platform.select` so that change has one place to
 * put its own value. Until then every platform gets Android's, which on iOS would simply be a run
 * the system ends mid-wait: the cursors survive that exactly as they survive a budget running out.
 */
export const BACKGROUND_TURN_BUDGET_MS: number = Platform.select({
  android: ANDROID_BUDGET_MS,
  default: ANDROID_BUDGET_MS,
});

/** The one preparation in flight or already done, so two tasks on one chance do it once. */
let prepared: Promise<void> | undefined;

/**
 * The storage a chance needs, when nothing else has set it up.
 *
 * A headless start evaluates no route: `expo-router/entry` registers the root component, and
 * `src/app/_layout.tsx` — where `useMigrations` and `bindJournal` live — runs only when that
 * component renders, which a WorkManager wake-up with no Activity never does. So a chance on a
 * dead process applies the migrations itself, through the very function `useMigrations` calls, and
 * gives the журнал its storage so a `raise` inside the chance is recorded rather than buffered
 * into a process that is about to end.
 *
 * The two callers cannot interleave (`.claude/rules/database.md`): drizzle's expo-sqlite `migrate`
 * awaits only while reading the migration files and then calls the sync dialect's `migrate`, which
 * runs every pending statement inside one transaction without yielding the JS thread. Whichever
 * gets there second reads the journal, finds nothing pending and returns.
 */
export function prepareBackgroundStorage(): Promise<void> {
  if (prepared === undefined) {
    prepared = (async () => {
      await migrate(db, migrations);
      // A no-op when the app is alive and the root layout has already bound it.
      bindJournal(reportingRepo);
    })().catch((thrown: unknown) => {
      // Not remembered as done: a chance whose migrations failed is one the next chance retries,
      // rather than a process that answers `Failed` for as long as it lives.
      prepared = undefined;
      throw thrown;
    });
  }
  return prepared;
}

/**
 * Asks the phone for chances on one task's behalf, or stops asking — re-asserted rather than
 * tracked, and the one place `BACKGROUND_TURN_INTERVAL_MINUTES` is ever passed.
 *
 * Both tasks reconcile the same way because they must: they ride one WorkManager request, so a
 * task registering with an interval of its own would put the phone on whichever cadence won the
 * race (design D2). Written once, that is not something a later task can get wrong.
 *
 * A device that refuses either call is swallowed. Registration is the app asking for a
 * convenience, and a phone that will not grant it is a phone that does the work when it is opened
 * instead — which is why that path is not an optimisation.
 */
export async function reconcileTask(name: string, wanted: boolean): Promise<void> {
  let registered: boolean;
  try {
    registered = await TaskManager.isTaskRegisteredAsync(name);
  } catch {
    return;
  }

  try {
    if (wanted && !registered) {
      await BackgroundTask.registerTaskAsync(name, {
        minimumInterval: BACKGROUND_TURN_INTERVAL_MINUTES,
      });
    } else if (!wanted && registered) {
      await BackgroundTask.unregisterTaskAsync(name);
    }
  } catch {
    // Nothing to say and nothing to retry here: the next launch and the next foreground ask again.
  }
}
