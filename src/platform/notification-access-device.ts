import { Linking, Platform } from 'react-native';

import { journalPermission, NOTIFICATION_ACCESS } from '../ui/device-journal';
import { notificationAccessFrom, type NotificationAccess, type NotificationAccessPort } from './notification-access';
import { nativeNotificationCapture } from './notification-capture-device';

/**
 * The device's own answer about notification access.
 *
 * The build installs a `NotificationListenerService` (`modules/notification-capture/`), so the app
 * is listed on Android's «Доступ до сповіщень» and the owner can switch it on. But the switch is
 * not the whole answer, and treating it as one is what let the app claim «Доступ до сповіщень
 * надано» on a phone that was hearing nothing: Android's list of enabled listeners reports what is
 * switched on in settings, never whether anything is *bound* to it, and an app update, a reinstall
 * or a «Force stop» reliably leaves one switched on and unbound.
 *
 * So two questions are asked, not one — is it switched on, and is it bound — and the pair is what
 * `notificationAccessFrom` turns into an answer. Nothing is remembered on our side: a grant
 * revoked while the app was closed, and a listener the system quietly let go of, are both simply
 * what the next ask reports.
 *
 * `unsupported` is what is left when there is no listener to switch on at all: the web bundle, an
 * iOS build (§14.15 keeps iOS buildable, not featureful), or a build the module did not make it
 * into. Sending the owner to a system screen the app does not appear on would be sending them to
 * look for a switch that is not listed, which is why that answer stays separate from `denied`.
 *
 * `openSettings` below was already the right screen and does not change.
 */

/**
 * How long the system is given to bind the listener after being asked to, before the app will
 * call it deaf.
 *
 * `requestRebind` returns at once and the binding lands afterwards, on the main thread, so an
 * answer given immediately would report silence for every rebind that is about to succeed — and
 * raise a сповіщення про збій about a problem already fixed. Waiting is only ever paid on the
 * path that is already broken: a listener that is bound is never asked to bind again.
 *
 * 600 ms is a system-server round trip with room to spare, and short enough not to be felt on a
 * screen that is opening. If the emulator shows it is not enough, this number moves; nothing that
 * the app promises depends on its value.
 */
const REBIND_GRACE_MS = 600;

async function state(): Promise<NotificationAccess> {
  // Journaled on the way out, once per *change*: the app asks this on every foreground and on
  // every visit to «Сповіщення банків», and «the permission was withdrawn at 14:02» is worth
  // saying once, where it is readable (design D5). The rule is `journalPermission`'s, which is
  // where it can be tested — this file is never loaded under `verify`.
  //
  // Only the settled answer reaches the журнал: a rebind that succeeds inside the grace below is
  // one `granted`, not a `not-listening` followed by a `granted` about a silence nobody had.
  return journalled(await read());
}

function journalled(answer: NotificationAccess): NotificationAccess {
  journalPermission(NOTIFICATION_ACCESS, answer);
  return answer;
}

async function read(): Promise<NotificationAccess> {
  const native = nativeNotificationCapture();
  if (!native) {
    return notificationAccessFrom(undefined);
  }

  let enabled: boolean;
  try {
    enabled = native.isAccessGranted();
  } catch {
    // A module that resolved but cannot answer is a build that cannot be granted anything: the
    // honest answer is the one that stops offering a screen with no switch on it.
    return notificationAccessFrom(undefined);
  }
  if (!enabled) {
    return notificationAccessFrom(false);
  }

  // Switched on. Whether anything is bound to that switch is the second question — the one that
  // was silently wrong — and a device that will not answer it has not answered "deaf".
  const heard = listening(native);
  if (heard !== false) {
    return notificationAccessFrom(true, heard);
  }

  // Switched on and hearing nothing. Ask the system to bind it again, which repairs the ordinary
  // case without the owner opening settings at all, and only call it deaf if it still is.
  try {
    native.requestRebind();
  } catch {
    return notificationAccessFrom(true, false);
  }
  await new Promise<void>((resolve) => setTimeout(resolve, REBIND_GRACE_MS));
  return notificationAccessFrom(true, listening(native));
}

/**
 * Whether the listener is bound, or `undefined` where the device would not say. Separate from the
 * `catch` around `isAccessGranted` on purpose: a module that answers the first question and throws
 * on the second has told us the switch is on, and that is worth keeping.
 */
function listening(native: NonNullable<ReturnType<typeof nativeNotificationCapture>>): boolean | undefined {
  try {
    return native.isListening();
  } catch {
    return undefined;
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
