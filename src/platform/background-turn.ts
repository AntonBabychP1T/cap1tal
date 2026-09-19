import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { applyMigrations } from '@/db/apply-migrations';
import { db } from '@/db/client';
import { reporting as reportingRepo } from '@/db/repos';
import { bindJournal } from '@/ui/journal';
import { journalRegistration, type TaskRegistration } from '@/ui/monobank-background';

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

/*
 * There is no budget here any more, and that is the point. A run on a chance sends what the bank's
 * minute already allows and ends — it never waits, so there is no length to bound and no timer to
 * be stopped along with the Activity. It fits inside WorkManager's ten minutes by construction,
 * and inside iOS's far shorter `BGAppRefreshTask` grant for the same reason, which is why no
 * `Platform.select` stands here either.
 */

/** The one preparation in flight or already done, so two tasks on one chance do it once. */
let prepared: Promise<void> | undefined;

/**
 * The storage a chance needs, when nothing else has set it up.
 *
 * A headless start evaluates no route: `expo-router/entry` registers the root component, and
 * `src/app/_layout.tsx` — where `useStorageMigrations` and `bindJournal` live — runs only when
 * that component renders, which a WorkManager wake-up with no Activity never does. So a chance on
 * a dead process applies the migrations itself, through `applyMigrations` — the same function
 * `useStorageMigrations` calls — and gives the журнал its storage so a `raise` inside the chance is
 * recorded rather than buffered into a process that is about to end.
 *
 * The two callers *can* run at the same time (`.claude/rules/database.md`): this runs in its own
 * JS runtime, on its own thread, against a connection of its own, so nothing at the JS level keeps
 * it apart from the root layout's own call. What makes it safe: drizzle's migrator wraps every
 * pending migration in one write transaction, so the prepared connection's busy timeout makes the
 * loser's `BEGIN` wait for the winner's `COMMIT` rather than fail at once, and `applyMigrations`'s
 * retry then re-reads the migration table — by then already updated — and finds nothing pending.
 */
export function prepareBackgroundStorage(): Promise<void> {
  if (prepared === undefined) {
    prepared = (async () => {
      await applyMigrations(() => migrate(db, migrations));
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
  // Journaled, and only ever journaled: what is worth an entry is `journalRegistration`'s decision
  // and not this file's, because `verify` never loads this file (design D5).
  journalRegistration(await reconcile(name, wanted));
}

/** What the phone answered. Every path is a value, since a phone that refuses is not an error. */
async function reconcile(name: string, wanted: boolean): Promise<TaskRegistration> {
  let registered: boolean;
  try {
    registered = await TaskManager.isTaskRegisteredAsync(name);
  } catch {
    return 'refused';
  }

  try {
    if (wanted && !registered) {
      await BackgroundTask.registerTaskAsync(name, {
        minimumInterval: BACKGROUND_TURN_INTERVAL_MINUTES,
      });
      return 'registered';
    }
    if (!wanted && registered) {
      await BackgroundTask.unregisterTaskAsync(name);
      return 'unregistered';
    }
    return 'unchanged';
  } catch {
    // Nothing to retry here: the next launch and the next foreground ask again. It is worth
    // saying, though — a phone that will not grant chances is why a sync only happens on opening.
    return 'refused';
  }
}
