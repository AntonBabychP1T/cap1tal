import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { CaptureOutcome, ScreenCapturePort } from './screen-capture';

/**
 * The device's own camera for the app's own window: the `screen-capture` local Expo module, which
 * is where `PixelCopy` and the file in the cache actually live.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`screen-capture.ts`), and this side is typechecked here and exercised on the emulator (tasks
 * 8.2, 8.12). The module is resolved lazily inside each call rather than at import, for
 * `notification-capture-device.ts`'s reason: a build without it, a web bundle and an iOS build must
 * all keep loading this file, and only find out there is nothing behind it when they ask.
 *
 * **iOS is unimplemented and not made impossible** (vision §14.15). There is no `PixelCopy` there
 * and no module behind this port yet, so every platform but Android answers `unavailable` — an
 * honest value the sheet says in Ukrainian, not a throw and not a silent nothing. The day someone
 * writes the iOS half, it goes behind this same port and nothing above it changes.
 *
 * Failures are values, as everywhere in this directory. The two answers are kept apart on purpose:
 * `unavailable` is a platform that cannot capture at all, `failed` is a capture this platform could
 * have made and did not — and the репорт stores which, because a saved репорт is read again after
 * a restart.
 */

/** The three calls the Kotlin module exposes (`ScreenCaptureModule.kt`). */
interface NativeScreenCapture {
  capture(): Promise<{
    readonly uri: string;
    readonly mime: string;
    readonly width: number;
    readonly height: number;
  }>;
  discard(uri: string): Promise<void>;
  discardAll(): Promise<void>;
}

/**
 * The native module, or nothing at all — one definition of "this build cannot capture".
 *
 * Android only: no other platform has this module, and asking would only throw. A development
 * build made before the module existed lands in the `catch` and answers the same way.
 */
function nativeScreenCapture(): NativeScreenCapture | undefined {
  if (Platform.OS !== 'android') {
    return undefined;
  }
  try {
    return requireNativeModule<NativeScreenCapture>('ScreenCapture');
  } catch {
    return undefined;
  }
}

/** What a rejection from the module says, in words the owner will read in the sheet and the репорт. */
function reasonOf(thrown: unknown): string {
  if (thrown instanceof Error && thrown.message.trim().length > 0) {
    return thrown.message;
  }
  return 'Невідома помилка під час знімка екрана';
}

export const screenCapture: ScreenCapturePort = {
  async capture(): Promise<CaptureOutcome> {
    const native = nativeScreenCapture();
    if (!native) {
      return { kind: 'unavailable' };
    }
    try {
      const shot = await native.capture();
      return {
        kind: 'captured',
        uri: shot.uri,
        mime: shot.mime,
        width: shot.width,
        height: shot.height,
      };
    } catch (thrown) {
      // Every rejection the module can produce is a capture that did not happen on a platform that
      // could have made one — `CaptureFailed` in Kotlin — so it is `failed` and never `unavailable`.
      return { kind: 'failed', reason: reasonOf(thrown) };
    }
  },

  async discard(uri: string): Promise<void> {
    // Total, like the module's own `discard`: a file already gone is the ordinary outcome of a save
    // racing the launch sweep, and there is nothing for the caller to do about it either way.
    try {
      await nativeScreenCapture()?.discard(uri);
    } catch {
      // Nothing. A capture that could not be removed is litter in a cache the OS may clear anyway,
      // and the next launch's sweep will try again.
    }
  },

  async discardAll(): Promise<void> {
    try {
      await nativeScreenCapture()?.discardAll();
    } catch {
      // As above. This runs on the launch path, where nothing may throw.
    }
  },
};
