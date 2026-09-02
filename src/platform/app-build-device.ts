import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { BuildInfo, DeviceInfo } from '../reporting/report';

/**
 * Which build this is, and which phone it is running on — the two facts a репорт про помилку needs
 * that only the device can answer.
 *
 * A `-device.ts` with no port beside it, deliberately: there is nothing to decide here and nothing
 * to fail. Both functions are total, both return values the model already has a type for, and the
 * screens hand those values in as data — which is what keeps `src/ui/bug-report-screen.ts` free of
 * every Expo import and testable without one (design D9). Nothing under `npm run verify` loads
 * this file.
 *
 * `extra.build` is put there by `app.config.js`, which reads git when the config is resolved —
 * which is **build** time, not bundle time: expo-constants embeds the resolved config into the APK
 * and `Constants.expoConfig` reads it from there. So on a development build this names the commit
 * the APK was built at, while the JS may have come from Metro and be newer; on a release build the
 * two are one. A build made without git says `unknown`, honestly, rather than guessing.
 */

interface ConfiguredBuild {
  readonly commit?: string;
  readonly dirty?: boolean;
  readonly builtAt?: string;
}

export function buildInfo(): BuildInfo {
  const configured = (Constants.expoConfig?.extra?.build ?? {}) as ConfiguredBuild;
  return {
    version: Constants.expoConfig?.version ?? 'unknown',
    commit: configured.commit ?? 'unknown',
    dirty: configured.dirty ?? false,
    builtAt: configured.builtAt ?? 'unknown',
  };
}

export function deviceInfo(): DeviceInfo {
  return {
    platform: Platform.OS,
    systemVersion: Device.osVersion ?? String(Platform.Version),
    // `modelName` is `null` on a simulator and on a device the list does not know; the phone is
    // still worth naming as far as it can be.
    model: Device.modelName ?? 'unknown',
  };
}
