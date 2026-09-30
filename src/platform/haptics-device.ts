import {
  AndroidHaptics,
  NotificationFeedbackType,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

import { HAPTIC_EFFECTS } from '@/ui/haptics';

import type { HapticEffect, HapticsPort } from './haptics';

/**
 * The phone's haptics behind `HapticsPort` (app-motion-pass design D13). Every choice is the table
 * in `src/ui/haptics.ts`; this only looks it up. Fire-and-forget: a screen never waits on it, and
 * no failure ever reaches the owner — a phone that cannot play an effect plays a nearby one, or
 * nothing.
 */

/**
 * Android: the view's own haptic feedback — no permission (`VIBRATE` is blocked in `app.json`), and
 * silent while the phone's touch feedback is off. A constant the API level does not know is retried
 * once with one every level has.
 */
function playAndroid(effect: HapticEffect): void {
  const { android, androidFallback } = HAPTIC_EFFECTS[effect];
  performAndroidHapticsAsync(AndroidHaptics[android])
    .catch(() => performAndroidHapticsAsync(AndroidHaptics[androidFallback]))
    .catch(() => undefined);
}

/** iOS: the Taptic Engine's notification and selection feedback, which need no permission. */
function playIos(effect: HapticEffect): void {
  const { ios } = HAPTIC_EFFECTS[effect];
  const played =
    ios.call === 'selectionAsync'
      ? selectionAsync()
      : notificationAsync(NotificationFeedbackType[ios.type]);
  played.catch(() => undefined);
}

export const deviceHaptics: HapticsPort = {
  play(effect) {
    if (Platform.OS === 'android') playAndroid(effect);
    else if (Platform.OS === 'ios') playIos(effect);
  },
};
