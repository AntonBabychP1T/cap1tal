import type { Installment, InstallmentFacts } from '../domain/installments';
import type { LocalNotificationsPort } from '../platform/local-notifications';
import { reassertInstallmentReminders } from '../reminders/installment-schedule';
import { todayIso } from './dates';
import { reportFailure } from './journal';

/**
 * The upkeep of the розстрочки (installments design D4): link what can be linked, then make the
 * phone hold exactly the нагадування про платіж that are still wanted. One function, called from
 * every place a reader or a warning depends on it — launch, the end of a background monobank run,
 * a restore, and the screens' focus — so there are four readers to keep in step instead of every
 * write path.
 *
 * No React and no device module: the ports arrive as inputs, so `verify` proves it against the
 * in-memory notifications and a real database.
 */

/** What the upkeep needs of storage — `src/db/installments-repo.ts`. */
export interface InstallmentUpkeepStorage {
  settle(today: string): boolean;
  list(): readonly Installment[];
  facts(): InstallmentFacts;
  reminder(): { readonly enabled: boolean };
}

export interface InstallmentUpkeepPorts {
  readonly storage: InstallmentUpkeepStorage;
  readonly notifications: LocalNotificationsPort;
  readonly now: () => Date;
}

/** What the журнал calls a failed upkeep. */
export const INSTALLMENT_UPKEEP = 'installment-upkeep';

/**
 * Settles the links and re-asserts the warnings. With `only: 'if-changed'` the re-assertion runs
 * only when settling changed something — what a screen's focus wants, which has nothing to
 * re-arrange otherwise. Says whether settling changed anything.
 */
export async function settleAndReassert(
  ports: InstallmentUpkeepPorts,
  options: { readonly only?: 'if-changed' } = {},
): Promise<boolean> {
  const now = ports.now();
  const today = todayIso(now);
  const changed = ports.storage.settle(today);
  if (options.only === 'if-changed' && !changed) {
    return false;
  }
  await reassertInstallmentReminders(ports.notifications, {
    installments: ports.storage.list(),
    facts: ports.storage.facts(),
    enabled: ports.storage.reminder().enabled,
    now: { date: today, minuteOfDay: now.getHours() * 60 + now.getMinutes() },
  });
  return changed;
}

/**
 * The same, for a path nobody is watching — launch, a background run, a restore: a failure goes to
 * the журнал and is never thrown, so it can neither crash a headless task nor fail the run it rides
 * on. The next launch re-asserts anyway.
 */
export async function settleAndReassertQuietly(
  ports: InstallmentUpkeepPorts,
  options: { readonly only?: 'if-changed' } = {},
): Promise<void> {
  try {
    await settleAndReassert(ports, options);
  } catch (error) {
    reportFailure(INSTALLMENT_UPKEEP, error);
  }
}
