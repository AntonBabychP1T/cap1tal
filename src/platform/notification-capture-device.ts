import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { CapturedNotification } from '../notifications/capture';
import {
  monobankPackagesIn,
  type NotificationCapturePort,
  type WatchedSetOutcome,
} from './notification-capture';

/**
 * The device's own capture layer: the `notification-capture` local Expo module, which is where
 * Android's `NotificationListenerService` and the queue on disk actually live.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`notification-capture.ts`), and this side is typechecked here and exercised on a device. The
 * module is resolved lazily inside each call rather than at import: a build without it, a web
 * bundle and an iOS build must all keep loading this file, and only find out there is nothing
 * behind it when they ask.
 *
 * Failures are values. Every answer here is one the caller can act on — nothing waiting, or a
 * typed "capture cannot work here" — because a screen that offers to watch an app must be able to
 * say so honestly rather than crash on a phone whose listener is missing.
 */

/** The four calls the Kotlin module exposes (`NotificationCaptureModule.kt`). */
interface NativeNotificationCapture {
  isAccessGranted(): boolean;
  setWatchedPackages(packages: string[]): void;
  collect(): CapturedNotification[];
  acknowledge(count: number): void;
}

/**
 * The native module, or nothing at all — one definition of "this build cannot capture", shared
 * with `notification-access-device.ts` so the permission and the capture cannot disagree about
 * whether the listener exists. Android only: no other platform has a notification listener to
 * install, and asking would only throw.
 */
export function nativeNotificationCapture(): NativeNotificationCapture | undefined {
  if (Platform.OS !== 'android') {
    return undefined;
  }
  try {
    return requireNativeModule<NativeNotificationCapture>('NotificationCapture');
  } catch {
    return undefined;
  }
}

export const notificationCapture: NotificationCapturePort = {
  async setWatched(packages: readonly string[]): Promise<WatchedSetOutcome> {
    // The refusal is a rule about what may ever be watched, so it answers before the question of
    // whether this build could watch anything — and before the packages leave TypeScript at all.
    const refused = monobankPackagesIn(packages);
    if (refused.length > 0) {
      return { kind: 'refused', packages: refused };
    }
    const native = nativeNotificationCapture();
    if (!native) {
      return { kind: 'unavailable' };
    }
    try {
      native.setWatchedPackages([...packages]);
      return { kind: 'ok' };
    } catch {
      return { kind: 'unavailable' };
    }
  },

  async collect(): Promise<readonly CapturedNotification[]> {
    const native = nativeNotificationCapture();
    if (!native) {
      return [];
    }
    try {
      return native.collect();
    } catch {
      // A queue that cannot be read is a queue with nothing in it as far as the app is concerned;
      // the records stay on the device and the next collection tries again.
      return [];
    }
  },

  async acknowledge(count: number): Promise<void> {
    const native = nativeNotificationCapture();
    if (!native) {
      return;
    }
    try {
      native.acknowledge(count);
    } catch {
      // Nothing to tell the caller: what was not forgotten is handed over again next time, and
      // the engine's fingerprint dedup turns the redelivery into nothing.
      return;
    }
  },
};
