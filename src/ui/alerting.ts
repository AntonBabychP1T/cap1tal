import type { LocalNotificationsPort } from '../platform/local-notifications';
import type { NotificationAccess } from '../platform/notification-access';
import { decideAlert, decideClear } from '../reminders/alerts';
import type { AlertKind } from '../reminders/notices';

/**
 * Raising and clearing a сповіщення про збій: the effectful half of `src/reminders/alerts.ts`.
 *
 * It lives in `src/ui/` with no React import for the reason `notification-drain.ts` does — the
 * order things happen in is the whole of the rule, and that has to be provable under `npm run
 * verify` rather than on a device. The five call sites are one line each; nothing about *whether*
 * to announce is decided at any of them except the one thing only they know: whether the screen
 * that explains this failure is in front of the owner (design D5).
 *
 * Storage is written before anything is posted. A сповіщення that was remembered but not shown is
 * a phone that will not announce the same failure twice and will clear it when the work succeeds;
 * one that was shown but not remembered would announce itself again on every retry. The port never
 * throws — a device that cannot post answers with values — so this order costs nothing.
 */

/** What raising and clearing need of storage. The real one is `src/db/reminders-repo.ts`. */
export interface AlertStorage {
  outstandingKinds(): readonly AlertKind[];
  raise(kind: AlertKind, raisedAt: Date): void;
  clear(kind: AlertKind): void;
}

export interface AlertPorts {
  readonly notifications: LocalNotificationsPort;
  readonly storage: AlertStorage;
  /** When the failure happened — passed in, as every instant in this app is. */
  readonly now: () => Date;
}

/**
 * Announces that one action failed, unless the owner is already reading about it or the same
 * action is already outstanding.
 *
 * `attended` is the caller's own answer. A screen passes whether the app is in front of the
 * owner; unattended work — the drain, which runs precisely while the app is open — passes `false`
 * unconditionally, because nothing on screen says a word about it either way.
 */
export async function raise(
  kind: AlertKind,
  options: { readonly attended: boolean },
  ports: AlertPorts,
): Promise<void> {
  const decision = decideAlert({
    kind,
    outstanding: ports.storage.outstandingKinds(),
    attended: options.attended,
  });
  if (decision === 'attended' || decision === 'already-outstanding') {
    return;
  }
  ports.storage.raise(kind, ports.now());
  await ports.notifications.post(decision.post);
}

/**
 * Takes one action's сповіщення back, by kind only and idempotently. Called from two places that
 * neither know nor care whether anything was outstanding: the work of that kind succeeding, and
 * the owner opening the screen it leads to (design D6).
 */
export async function clear(kind: AlertKind, ports: AlertPorts): Promise<void> {
  const decision = decideClear({ kind, outstanding: ports.storage.outstandingKinds() });
  if (decision === 'nothing-outstanding') {
    return;
  }
  ports.storage.clear(kind);
  await ports.notifications.clear(decision.dismiss.id);
}

/**
 * What one pass of the notification drain comes to, announced.
 *
 * Access withdrawn while відстежувані застосунки remain is the same fact as a failed collection
 * from where the owner stands — the транзакції stopped arriving either way — so it raises the same
 * сповіщення to the same screen rather than a sixth kind of its own (design D5a). No watches means
 * nothing was expected, so nothing is announced; and a collection that ran and stored everything
 * clears whatever stood.
 */
export async function reportCollection(
  outcome: {
    readonly access: NotificationAccess;
    /** Whether any відстежуваний застосунок is still watched. */
    readonly watched: boolean;
    /** Whether the drain that ran ended in a storage failure. */
    readonly failed: boolean;
  },
  ports: AlertPorts,
): Promise<void> {
  if (outcome.access !== 'granted') {
    if (outcome.watched) {
      await raise('collection', { attended: false }, ports);
    }
    return;
  }
  if (outcome.failed) {
    await raise('collection', { attended: false }, ports);
    return;
  }
  await clear('collection', ports);
}
