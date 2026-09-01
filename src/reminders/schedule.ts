import type { LocalNotificationPermission } from '../platform/local-notifications';
import { REMINDER_NOTICE } from './notices';
import { DEFAULT_REMINDER_TIME, type TimeOfDay } from './time';

/**
 * What the phone should be holding, given what the owner asked for and what the system says —
 * the one path that covers a restart, a reboot, a revoked permission, a restored бекап and a
 * flight to another time zone (design D12).
 *
 * It re-asserts rather than checks. `schedule` is answered whenever the нагадування is on and the
 * permission is granted, *even when the system already holds one*: a daily trigger is turned into
 * an alarm at the moment it is scheduled, so a phone carried into another zone would keep firing
 * at the old wall-clock hour until something re-computed it, and the next launch is the first
 * moment this app can act anyway. One unconditional re-schedule per launch costs one call and
 * removes the whole class of drift.
 */

/** Whether the owner turned the нагадування on, and the time they chose for it. */
export interface ReminderPreference {
  readonly enabled: boolean;
  /**
   * Absent on a device that was never asked. The section shows `DEFAULT_REMINDER_TIME` until the
   * owner sets one, and storage stays empty meanwhile — nothing claims 21:00 was their answer.
   */
  readonly time?: TimeOfDay;
}

/** A device that was never asked: off, and with no time the owner chose. */
export const NO_REMINDER: ReminderPreference = { enabled: false };

/** What to do with the system's own list of arrangements. */
export type Reconciliation =
  | { readonly act: 'schedule'; readonly at: TimeOfDay }
  | { readonly act: 'cancel' }
  | { readonly act: 'nothing' };

export interface ReconcileInput {
  readonly preference: ReminderPreference;
  readonly permission: LocalNotificationPermission;
  /** The ids the system holds arranged right now — the port's `scheduledIds()`. */
  readonly scheduled: readonly string[];
}

/**
 * The нагадування the app arranges. One id, so «exactly one нагадування at a time» is a property
 * of the identifier and not of a query.
 */
export const REMINDER_ID = REMINDER_NOTICE.id;

/**
 * What the app should do about the нагадування right now.
 *
 * `nothing` is the narrow case: the owner has it off and the phone holds nothing, which is a
 * fresh install and every launch after they turned it off. Everything else that must not be
 * arranged answers `cancel` — a permission revoked while the app was closed, an owner who turned
 * it off on another device and restored the бекап here — and `cancel` is idempotent, so
 * re-asserting «there must be none» costs one call whether or not there was one.
 */
export function reconcile(input: ReconcileInput): Reconciliation {
  if (input.preference.enabled && input.permission === 'granted') {
    // A preference that is on always carries the time the owner chose; the default stands in only
    // for a row storage could not have written, and never silently becomes their answer.
    return { act: 'schedule', at: input.preference.time ?? DEFAULT_REMINDER_TIME };
  }
  if (!input.preference.enabled && !input.scheduled.includes(REMINDER_ID)) {
    return { act: 'nothing' };
  }
  return { act: 'cancel' };
}

/**
 * Whether the section may say a нагадування will arrive. On *and* granted, and nothing else — a
 * preference that survived a revoked permission is still the owner's answer, and is still not an
 * arrangement (spec: nothing claims that a нагадування will arrive).
 */
export function isArranged(
  preference: ReminderPreference,
  permission: LocalNotificationPermission,
): boolean {
  return preference.enabled && permission === 'granted';
}
