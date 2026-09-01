import type {
  LocalNotificationPermission,
  LocalNotificationsPort,
} from '../platform/local-notifications';
import { REMINDER_NOTICE } from '../reminders/notices';
import {
  isArranged,
  reconcile,
  REMINDER_ID,
  type Reconciliation,
  type ReminderPreference,
} from '../reminders/schedule';
import { DEFAULT_REMINDER_TIME, type TimeOfDay } from '../reminders/time';

/**
 * Turning `src/reminders/schedule.ts`'s answer into calls on the phone — the effectful half, and
 * the only place the нагадування is arranged or taken away.
 *
 * Four ways in, and all four end in the same two lines: the launch path re-asserting what should
 * be arranged, the switch going on, the switch going off, and the time changing. That is design
 * D12's point — a reboot, a revoked permission, a restored бекап and a flight to another zone are
 * not four special cases, they are one reconciliation the app runs anyway.
 *
 * No React import, so `verify` proves all of it against `inMemoryLocalNotifications()`; and no
 * network call anywhere on any path, because there is none to make (vision §14.14).
 */

/** What arranging the нагадування needs of storage. The real one is `src/db/reminders-repo.ts`. */
export interface ReminderStorage {
  preference(): ReminderPreference;
  setPreference(preference: { readonly enabled: boolean; readonly time: TimeOfDay }): void;
}

export interface ReminderPorts {
  readonly notifications: LocalNotificationsPort;
  readonly storage: ReminderStorage;
}

/** What the section shows after any of the four paths below. */
export interface ReminderState {
  readonly permission: LocalNotificationPermission;
  readonly preference: ReminderPreference;
  /** Whether a нагадування will actually arrive: on *and* allowed, never one without the other. */
  readonly arranged: boolean;
}

/**
 * One reconciliation, applied. The stable id is cancelled before anything is scheduled, so
 * re-asserting on every launch can never leave two нагадування standing (design D12).
 */
async function apply(answer: Reconciliation, ports: ReminderPorts): Promise<void> {
  if (answer.act === 'nothing') {
    return;
  }
  await ports.notifications.cancelDaily(REMINDER_ID);
  if (answer.act === 'schedule') {
    await ports.notifications.scheduleDaily(REMINDER_NOTICE, answer.at);
  }
}

/** The state a preference and a permission come to, once whatever had to happen has happened. */
async function settle(
  preference: ReminderPreference,
  permission: LocalNotificationPermission,
  ports: ReminderPorts,
): Promise<ReminderState> {
  const scheduled = await ports.notifications.scheduledIds();
  await apply(reconcile({ preference, permission, scheduled }), ports);
  return { permission, preference, arranged: isArranged(preference, permission) };
}

/**
 * What the app does about the нагадування every time it opens: read what the owner asked for, ask
 * the phone what it allows and what it holds, and make the two agree. It asks the owner nothing —
 * a permission revoked while the app was closed is reported, never re-requested behind a launch.
 */
export async function reconcileOnLaunch(ports: ReminderPorts): Promise<ReminderState> {
  const preference = ports.storage.preference();
  const permission = await ports.notifications.permission();
  return settle(preference, permission, ports);
}

/**
 * The switch going on, for a time the owner has chosen.
 *
 * This is the one moment the app asks for the permission — not on first run, because the app must
 * be worth reminding about before it asks. A refusal leaves the нагадування off and stores
 * nothing: the switch does not lie about being on, and the section reports the refusal with where
 * it is granted.
 */
export async function turnOn(time: TimeOfDay, ports: ReminderPorts): Promise<ReminderState> {
  let permission = await ports.notifications.permission();
  if (permission !== 'granted') {
    permission = await ports.notifications.ask();
  }
  if (permission !== 'granted') {
    return settle(ports.storage.preference(), permission, ports);
  }
  const preference: ReminderPreference = { enabled: true, time };
  ports.storage.setPreference({ enabled: true, time });
  return settle(preference, permission, ports);
}

/**
 * The switch going off. Immediate, and asking nothing: there is no permission needed to stop
 * posting. The time is kept, so turning it back on later offers the hour the owner chose.
 */
export async function turnOff(ports: ReminderPorts): Promise<ReminderState> {
  const time = ports.storage.preference().time ?? DEFAULT_REMINDER_TIME;
  ports.storage.setPreference({ enabled: false, time });
  return settle({ enabled: false, time }, await ports.notifications.permission(), ports);
}

/**
 * A new time. It moves the one нагадування rather than adding a second, and it is stored whether
 * or not the нагадування is on — an owner who sets the time first and the switch second finds
 * their hour waiting.
 */
export async function setTime(time: TimeOfDay, ports: ReminderPorts): Promise<ReminderState> {
  const enabled = ports.storage.preference().enabled;
  ports.storage.setPreference({ enabled, time });
  return settle({ enabled, time }, await ports.notifications.permission(), ports);
}
