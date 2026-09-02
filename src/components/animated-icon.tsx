import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from './themed-text';

import { useTheme } from '@/hooks/use-theme';

const DURATION = 600;

/**
 * Whether the launch view has already played in this process.
 *
 * The root layout remounts whole when the crash fallback returns the owner to the app — `retry`
 * re-renders `RootLayout`, this overlay included, and its `visible` would otherwise start `true`
 * again and replay the launch view over the return, which the app-shell requirement forbids
 * («returning from the fallback SHALL NOT show the launch view again»). Module-level rather than a
 * ref, because the whole tree is what remounts; set once the native splash has actually been
 * handed over, which happens exactly once per launch.
 */
let playedOnce = false;

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(!playedOnce);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  // The app's own name, drawn as live text: the launch view carries no other product's mark, and a
  // wordmark the platform draws needs no image asset to ship, license or keep in sync.
  const wordmark = <ThemedText type="subtitle">cap1tal</ThemedText>;

  // Must match the native splash background configured for expo-splash-screen in app.json, which is
  // plain JSON and cannot import this palette. If the two drift, the handover flashes.
  const overlay = [styles.splashOverlay, { backgroundColor: theme.background }];

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={overlay}>
      {wordmark}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        playedOnce = true;
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={overlay}>
      {wordmark}
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
