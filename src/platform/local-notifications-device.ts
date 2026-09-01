import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { REMINDER_NOTICE, noticeData, routeOf, type Notice, type NoticeRoute } from '../reminders/notices';
import type { TimeOfDay } from '../reminders/time';
import type {
  LocalNotificationPermission,
  LocalNotificationsPort,
} from './local-notifications';

/**
 * The device's own side of what the app posts: Android's runtime permission, the daily trigger the
 * system holds and re-arms after a reboot, the two channels, and the tap.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`local-notifications.ts`), and this side is typechecked here and proven on the emulator. Same
 * arrangement as `backup-file-device.ts` and `notification-capture-device.ts`, same reason: one
 * native module in the test run brings the whole suite down.
 *
 * Everything here answers a value. A permission the platform does not have, a module that refuses
 * to answer and a scheduling call that throws all end as `unsupported` or as nothing happening —
 * never as an error on the owner's screen (spec: a device that cannot post notifications answers
 * with values, never a crash).
 */

/** «Нагадування» — the daily invitation, so it can be silenced without silencing the failures. */
const REMINDER_CHANNEL = 'reminders';
/** «Збої» — the сповіщення про збій, which the owner will want louder than the нагадування. */
const ALERT_CHANNEL = 'failures';

/**
 * Shown while the app itself is open, because that is exactly when a сповіщення про збій is
 * needed: the drain runs unattended *while* the app is in the foreground (design D5), and without
 * a handler expo-notifications drops a foreground notification rather than presenting it.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Local notifications exist on the phones this app is built for, and not in the web bundle. */
function supported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

let channelsReady: Promise<void> | undefined;

/**
 * The two channels, created once per launch on first use. Both are private on the lock screen:
 * belt and braces behind design D4, which is the actual guarantee — there is no сума in these
 * words to hide. Channels are Android's; elsewhere this is a no-op.
 */
function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return Promise.resolve();
  }
  channelsReady ??= (async () => {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Нагадування',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Збої',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  })().catch(() => {
    // A build whose channels could not be created still posts, on the platform default; and the
    // next call tries again rather than remembering the failure forever.
    channelsReady = undefined;
  });
  return channelsReady;
}

function channelOf(notice: Notice): string {
  return notice.id === REMINDER_NOTICE.id ? REMINDER_CHANNEL : ALERT_CHANNEL;
}

/** The content of a notice, identically on both paths: its own words, and its route as data. */
function contentOf(notice: Notice): Notifications.NotificationContentInput {
  return {
    title: notice.title,
    body: notice.body,
    data: noticeData(notice),
  };
}

function answerOf(status: Notifications.NotificationPermissionsStatus): LocalNotificationPermission {
  return status.granted ? 'granted' : 'denied';
}

/**
 * Android's own notification settings for this app, which is where a refused permission is
 * granted. The direct screen when the package name is known, the app's settings page otherwise —
 * one tap further, and never a dead end.
 */
async function openSettings(): Promise<void> {
  const packageName = Constants.expoConfig?.android?.package;
  if (Platform.OS === 'android' && packageName) {
    try {
      await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: packageName },
      ]);
      return;
    } catch {
      // Fall through: some builds have no such activity, and the app's own page still gets there.
    }
  }
  await Linking.openSettings();
}

export const localNotifications: LocalNotificationsPort = {
  async permission(): Promise<LocalNotificationPermission> {
    if (!supported()) {
      return 'unsupported';
    }
    try {
      return answerOf(await Notifications.getPermissionsAsync());
    } catch {
      // A module that resolved but cannot answer is a build that cannot post: the honest answer
      // is the one that stops the section offering a switch that could never work.
      return 'unsupported';
    }
  },

  async ask(): Promise<LocalNotificationPermission> {
    if (!supported()) {
      return 'unsupported';
    }
    try {
      return answerOf(await Notifications.requestPermissionsAsync());
    } catch {
      return 'unsupported';
    }
  },

  async openSettings(): Promise<void> {
    if (!supported()) {
      return;
    }
    try {
      await openSettings();
    } catch {
      // Nowhere to send them is not something to crash over.
    }
  },

  /**
   * The daily trigger the system owns, under the notice's own stable identifier. The system
   * computes the alarm and re-arms it after a reboot, which is the whole reason this module was
   * chosen (design D1); the app re-asserts it on every launch and otherwise does not think about
   * time (design D12).
   */
  async scheduleDaily(notice: Notice, at: TimeOfDay): Promise<void> {
    if (!supported()) {
      return;
    }
    await ensureChannels();
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: notice.id,
        content: contentOf(notice),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: channelOf(notice),
          hour: at.hour,
          minute: at.minute,
        },
      });
    } catch {
      // Nothing is arranged, and the section already reports what the permission actually says.
    }
  },

  async cancelDaily(id: string): Promise<void> {
    if (!supported()) {
      return;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Nothing arranged under that id is the outcome asked for, not a failure.
    }
  },

  async scheduledIds(): Promise<readonly string[]> {
    if (!supported()) {
      return [];
    }
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      return scheduled.map((request) => request.identifier);
    } catch {
      // "The phone holds nothing" is the answer that makes the launch path re-arrange it, which
      // is the safe direction: the worst case is one redundant re-schedule.
      return [];
    }
  },

  /**
   * Now, with no trigger. The identifier is the notice's own, so posting the same сповіщення again
   * replaces what is showing rather than stacking a second copy (design D9).
   */
  async post(notice: Notice): Promise<void> {
    if (!supported()) {
      return;
    }
    await ensureChannels();
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: notice.id,
        content: { ...contentOf(notice), ...(Platform.OS === 'android' ? { channelId: channelOf(notice) } : {}) },
        trigger: null,
      });
    } catch {
      // The failure is still recorded as outstanding by the caller; only the posting is lost.
    }
  },

  async clear(id: string): Promise<void> {
    if (!supported()) {
      return;
    }
    try {
      await Notifications.dismissNotificationAsync(id);
    } catch {
      // Nothing showing under that id is exactly what clearing wanted.
    }
  },
};

/**
 * The tap, in the two ways it reaches a running process — and deliberately not part of the port.
 *
 * The port is what `verify` proves against a double; these two are the device's own event stream,
 * with nothing in them to decide: both funnel through `routeOf`, so «the app opens only a screen
 * it defines» holds in one place and is proven in `notices.test.ts` (design D10).
 */

/**
 * The route of a notification tapped while the app was not running, if there was one.
 *
 * The response is cleared as it is read: it outlives the launch it belongs to, and a later,
 * ordinary open must not be pushed to the screen of a сповіщення the owner answered days ago.
 */
export function tappedOnColdStart(): NoticeRoute | undefined {
  try {
    const response = Notifications.getLastNotificationResponse();
    if (!response) {
      return undefined;
    }
    Notifications.clearLastNotificationResponse();
    return routeOf(response.notification.request.content.data);
  } catch {
    // A build that cannot answer opens where it always opens.
    return undefined;
  }
}

/** Taps while the app is running. Returns the unsubscribe an effect cleans up with. */
export function onNotificationTapped(act: (route: NoticeRoute) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    act(routeOf(response.notification.request.content.data));
  });
  return () => subscription.remove();
}
