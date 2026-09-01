import type { TimeOfDay } from '../reminders/time';
import type { Notice } from '../reminders/notices';

/**
 * The seam between the app and the phone's own notification shade — the outgoing direction, and
 * the only one the app has: `notification-access.ts` and `notification-capture.ts` are about
 * *reading* what other apps post, and share nothing with this but a vocabulary.
 *
 * The port and its double only. The device adapter is `local-notifications-device.ts`, and it is
 * not imported from here: nothing under `npm run verify` may load a native module, so every rule
 * about what is arranged, posted and taken away is proven against the double.
 *
 * Failures are values, as everywhere in `src/platform`: a build that cannot post a local
 * notification answers `unsupported`, which the section shows, rather than throwing at a screen.
 */

/**
 * What the device can say about posting our own notifications.
 *
 * The same three words `NotificationAccess` uses, and deliberately a separate type: reading other
 * apps' notifications and posting our own are different grants, and one type for both would let a
 * screen report the state of the permission the owner did not ask about (design D2).
 *
 * `unsupported` is not a refusal: it is a platform or a build where local notifications cannot be
 * posted at all, so there is no system screen to offer and nothing for the owner to switch on.
 */
export type LocalNotificationPermission = 'granted' | 'denied' | 'unsupported';

/** One нагадування the system holds, as the double and the adapter both describe it. */
export interface ScheduledNotice {
  readonly id: string;
  readonly at: TimeOfDay;
}

export interface LocalNotificationsPort {
  /** What the device says right now. Asked on launch and on every return to the section. */
  permission(): Promise<LocalNotificationPermission>;
  /**
   * Asks the system for the permission and answers what it came to. Called when the owner turns
   * the нагадування on, and nowhere else — the app does not ask on first run (proposal).
   */
  ask(): Promise<LocalNotificationPermission>;
  /**
   * Opens the system screen where notifications are allowed. Called only when `permission()` has
   * answered something other than `unsupported`: there is nowhere to send them otherwise.
   */
  openSettings(): Promise<void>;
  /**
   * Arranges `notice` for `at` every day, under the notice's own stable id. The caller cancels
   * that id first, so re-asserting on every launch can never leave two (design D12).
   */
  scheduleDaily(notice: Notice, at: TimeOfDay): Promise<void>;
  /** Removes whatever is arranged under this id. Idempotent: nothing arranged is not an error. */
  cancelDaily(id: string): Promise<void>;
  /** The ids the system currently holds arranged — what the app's belief is reconciled against. */
  scheduledIds(): Promise<readonly string[]>;
  /** Posts `notice` now, replacing anything showing under the same id rather than stacking. */
  post(notice: Notice): Promise<void>;
  /** Takes the notification with this id off the phone. Idempotent, by id only (design D6). */
  clear(id: string): Promise<void>;
}

/** What the double lets a test read back. Nothing here exists on the device adapter. */
export interface LocalNotificationsDouble extends LocalNotificationsPort {
  /** Every arrangement made, in order and *not* deduplicated — so a missing cancel is visible. */
  readonly scheduled: () => readonly ScheduledNotice[];
  /** Every notice actually posted, in order. */
  readonly posted: () => readonly string[];
  /** The ids showing on the phone right now: posted, and not cleared or replaced since. */
  readonly showing: () => readonly string[];
  readonly cancelled: () => readonly string[];
  readonly cleared: () => readonly string[];
  /** How many times the system notification settings were opened. */
  readonly opened: () => number;
  /** How many times the permission was asked for — a switch turned off must not ask (spec). */
  readonly asked: () => number;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * It models the device rather than merely recording calls, which is what makes the tests mean
 * something: a phone that has not granted the permission posts nothing and arranges nothing
 * however politely it is asked, and a build that cannot notify at all has no system screen to
 * open. `answer` is what `ask()` comes to, so a test can play a granted dialog and a refused one.
 */
export function inMemoryLocalNotifications(options?: {
  /** What the device says before anything is asked. Defaults to a phone that has granted it. */
  readonly permission?: LocalNotificationPermission;
  /** What the system dialog comes to. Defaults to leaving the permission as it was. */
  readonly answer?: LocalNotificationPermission;
  /** Ids the system already holds arranged, as after a restart or a restored бекап. */
  readonly alreadyScheduled?: readonly ScheduledNotice[];
}): LocalNotificationsDouble {
  let permission: LocalNotificationPermission = options?.permission ?? 'granted';
  const answer = options?.answer;
  const scheduled: ScheduledNotice[] = [...(options?.alreadyScheduled ?? [])];
  const posted: string[] = [];
  const showing = new Set<string>();
  const cancelled: string[] = [];
  const cleared: string[] = [];
  let opened = 0;
  let asked = 0;

  return {
    permission: () => Promise.resolve(permission),
    ask: () => {
      asked += 1;
      // A build that cannot post them has no dialog to show; asking changes nothing.
      if (permission !== 'unsupported' && answer !== undefined) {
        permission = answer;
      }
      return Promise.resolve(permission);
    },
    openSettings: () => {
      // There is no screen to open where the platform has no such notifications at all, and a
      // double that counted one anyway would let a section quietly offer a dead button.
      if (permission !== 'unsupported') {
        opened += 1;
      }
      return Promise.resolve();
    },
    scheduleDaily: (notice, at) => {
      // Appended, never merged by id: two arrangements under one id is exactly the mistake the
      // "cancel before scheduling" rule exists to prevent, so the double must be able to show it.
      if (permission === 'granted') {
        scheduled.push({ id: notice.id, at });
      }
      return Promise.resolve();
    },
    cancelDaily: (id) => {
      cancelled.push(id);
      for (let index = scheduled.length - 1; index >= 0; index -= 1) {
        if (scheduled[index]!.id === id) scheduled.splice(index, 1);
      }
      return Promise.resolve();
    },
    scheduledIds: () => Promise.resolve(scheduled.map((entry) => entry.id)),
    post: (notice) => {
      // A phone that has not granted it drops what we post, and says nothing about having done so.
      if (permission === 'granted') {
        posted.push(notice.id);
        showing.add(notice.id);
      }
      return Promise.resolve();
    },
    clear: (id) => {
      cleared.push(id);
      showing.delete(id);
      return Promise.resolve();
    },
    scheduled: () => [...scheduled],
    posted: () => [...posted],
    showing: () => [...showing],
    cancelled: () => [...cancelled],
    cleared: () => [...cleared],
    opened: () => opened,
    asked: () => asked,
  };
}
