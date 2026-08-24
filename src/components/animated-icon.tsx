import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from './themed-text';

import { useTheme } from '@/hooks/use-theme';

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

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
