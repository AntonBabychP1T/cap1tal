import { Linking, Platform } from 'react-native';

import { notificationAccessFrom, type NotificationAccess, type NotificationAccessPort } from './notification-access';
import { nativeNotificationCapture } from './notification-capture-device';

/**
 * The device's own answer about notification access.
 *
 * The build now installs a `NotificationListenerService` (`modules/notification-capture/`), so
 * the app is listed on Android's «Доступ до сповіщень» and the answer is whatever the operating
 * system's own list of enabled listeners says: `granted` when the owner has switched the app on
 * there, `denied` when they have not or have switched it off. Nothing is remembered on our side —
 * a grant revoked in system settings while the app was closed is simply a `denied` on the next
 * ask.
 *
 * `unsupported` is what is left when there is no listener to switch on at all: the web bundle,
 * an iOS build (§14.15 keeps iOS buildable, not featureful), or a build the module did not make
 * it into. Sending the owner to a system screen the app does not appear on would be sending them
 * to look for a switch that is not listed, which is why that answer stays separate from `denied`.
 *
 * `openSettings` below was already the right screen and does not change, and neither does
 * anything in `src/ui/onboarding.ts` — the step already knew what to say for every answer.
 */
async function state(): Promise<NotificationAccess> {
  const native = nativeNotificationCapture();
  if (!native) {
    return notificationAccessFrom(undefined);
  }
  try {
    return notificationAccessFrom(native.isAccessGranted());
  } catch {
    // A module that resolved but cannot answer is a build that cannot be granted anything: the
    // honest answer is the one that stops offering a screen with no switch on it.
    return notificationAccessFrom(undefined);
  }
}

/**
 * Android's «Доступ до сповіщень» screen. `Linking.sendIntent` is the plain intent send that
 * needs no extra dependency; on anything but Android there is no such screen and the call is a
 * no-op, which is the honest answer for a platform where the permission does not exist.
 */
async function openSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
}

export const notificationAccess: NotificationAccessPort = { state, openSettings };
