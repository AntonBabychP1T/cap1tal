import { Linking, Platform } from 'react-native';

import type { NotificationAccess, NotificationAccessPort } from './notification-access';

/**
 * The device's own answer about notification access.
 *
 * It is `unsupported` on every device today, and the reason is one fact: this build installs no
 * `NotificationListenerService`, so the app does not appear on Android's notification-access
 * screen. Sending the owner there would be sending them to look for a switch that is not listed —
 * worse than saying the reading of bank notifications is not available yet.
 *
 * WHAT CHANGES WHEN THE LISTENER LANDS (`bank-notifications-screen`): this function starts asking
 * the listener module whether the app is among the enabled listeners and answers `granted` or
 * `denied`. `openSettings` below is already the right screen and does not change, and neither
 * does anything in `src/ui/onboarding.ts` — the step already knows what to say for both answers.
 */
async function state(): Promise<NotificationAccess> {
  return 'unsupported';
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
