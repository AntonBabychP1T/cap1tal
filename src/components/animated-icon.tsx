import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/hooks/use-theme';

const DURATION = 900;

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

/**
 * The wordmark's own entrance-hold-exit. Frame 0 is exactly the plain, unanimated wordmark (scale
 * 1, opacity 1) — that plain frame is what the owner actually sees the instant the native splash
 * lifts (this animated view only mounts a beat later), so anything else at frame 0 would be a
 * visible jump, not an animation. What follows is a small pop on arrival, so the name feels alive
 * rather than merely appearing, then a hold, then a fade with a slight outward drift on the way
 * out — the same handover `SplashScreen.hideAsync` started.
 */
const wordmarkKeyframe = new Keyframe({
  0: { transform: [{ scale: 1 }], opacity: 1 },
  22: { transform: [{ scale: 1.03 }], easing: Easing.out(Easing.cubic) },
  38: { transform: [{ scale: 1 }], easing: Easing.out(Easing.quad) },
  80: { opacity: 1 },
  100: { transform: [{ scale: 1.05 }], opacity: 0, easing: Easing.in(Easing.cubic) },
});

/**
 * The «p1t» accent's own pop, timed to land just after the wordmark's own settle (see
 * `wordmarkKeyframe`) so the eye lands there second — the one flourish this launch view allows
 * itself. Frame 0 is again the plain scale: the accent colour is worn from the very first frame
 * and never animates, only the size does.
 */
const accentKeyframe = new Keyframe({
  0: { transform: [{ scale: 1 }] },
  38: { transform: [{ scale: 1 }] },
  58: { transform: [{ scale: 1.24 }], easing: Easing.out(Easing.cubic) },
  76: { transform: [{ scale: 0.97 }], easing: Easing.inOut(Easing.quad) },
  100: { transform: [{ scale: 1 }], easing: Easing.out(Easing.quad) },
});

/**
 * The app's own name, drawn as live text: the launch view carries no other product's mark, and a
 * wordmark the platform draws needs no image asset to ship, license or keep in sync. «p1t» carries
 * the one accent colour the theme has, `animated` only decides whether it also gets its own pop —
 * the static (pre-handover) render and the animated one must otherwise be pixel-identical, or the
 * swap between them flashes.
 */
function Wordmark({
  theme,
  animated,
}: {
  theme: { text: string; accent: string };
  animated: boolean;
}) {
  const accentText = (
    <Text style={[styles.wordmarkText, styles.accentText, { color: theme.accent }]}>p1t</Text>
  );
  return (
    <View style={styles.wordmarkRow}>
      <Text style={[styles.wordmarkText, { color: theme.text }]}>ca</Text>
      {animated ? (
        <Animated.View entering={accentKeyframe.duration(DURATION)}>{accentText}</Animated.View>
      ) : (
        accentText
      )}
      <Text style={[styles.wordmarkText, { color: theme.text }]}>al</Text>
    </View>
  );
}

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(!playedOnce);

  if (!visible) return null;

  // Must match the native splash background configured for expo-splash-screen in app.json, which is
  // plain JSON and cannot import this palette. If the two drift, the handover flashes.
  const overlay = [styles.splashOverlay, { backgroundColor: theme.background }];

  return animate ? (
    <Animated.View
      entering={wordmarkKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={overlay}>
      <Wordmark theme={theme} animated />
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
      <Wordmark theme={theme} animated={false} />
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
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmarkText: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 800,
    letterSpacing: -0.6,
  },
  accentText: {
    fontWeight: 800,
  },
});
