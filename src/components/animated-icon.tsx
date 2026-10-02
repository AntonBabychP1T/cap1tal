import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/hooks/use-theme';

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
 * The launch view's one timeline, in ms. A single shared value runs linearly 0 → 1 over `TOTAL`
 * on the UI thread, and every glyph reads its own window of it — so the whole sequence costs one
 * timing and a handful of transform/opacity styles per frame, never a layout or a JS-thread tick,
 * and the app keeps mounting underneath while it plays.
 *
 * 1. Rise — the letters come up through a mask one after another, left to right, while drawing in
 *    from a slightly wider spacing (tracking in, faked with translateX so no text re-lays out).
 * 2. Sweep — «p1t» turns from the text colour to the accent, letter by letter, like light passing.
 * 3. Leave — the letters go on up out of the mask in reading order while the backdrop fades and
 *    hands over to the screen already drawn beneath it.
 */
const RISE_STAGGER = 34;
const RISE = 460;
const SWEEP_AT = 330;
const SWEEP_STAGGER = 70;
const SWEEP = 240;
const LEAVE_AT = 700;
const LEAVE_STAGGER = 16;
const LEAVE = 220;
const FADE_AT = 740;
const FADE = 260;
const TOTAL = FADE_AT + FADE;

/**
 * Px per glyph the letters start apart by, either side of the centre. Under reduced motion neither
 * this nor the rise travels: the same timeline, opacity and colour only.
 */
const SPREAD = 4;

const GLYPHS = [
  { char: 'c', accent: -1 },
  { char: 'a', accent: -1 },
  { char: 'p', accent: 0 },
  { char: '1', accent: 1 },
  { char: 't', accent: 2 },
  { char: 'a', accent: -1 },
  { char: 'l', accent: -1 },
] as const;
const CENTER = (GLYPHS.length - 1) / 2;

const FONT_SIZE = 36;
/** The mask's height and how far a glyph travels to clear it; roomy enough for the «p» descender. */
const LINE = 48;

function windowOf(ms: number, start: number, length: number) {
  'worklet';
  return Math.min(1, Math.max(0, (ms - start) / length));
}

/** Fast out, long soft landing — the arrival. */
function expoOut(x: number) {
  'worklet';
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/** Slow start, then away — the departure. */
function cubicIn(x: number) {
  'worklet';
  return x * x * x;
}

function sineInOut(x: number) {
  'worklet';
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function Glyph({
  char,
  index,
  accentIndex,
  progress,
  reduced,
  theme,
}: {
  char: string;
  index: number;
  accentIndex: number;
  progress: SharedValue<number>;
  reduced: boolean;
  theme: { text: string; accent: string };
}) {
  const travel = reduced ? 0 : LINE;
  const spread = reduced ? 0 : (index - CENTER) * SPREAD;

  const motion = useAnimatedStyle(() => {
    const ms = progress.get() * TOTAL;
    const rise = expoOut(windowOf(ms, index * RISE_STAGGER, RISE));
    const leave = cubicIn(windowOf(ms, LEAVE_AT + index * LEAVE_STAGGER, LEAVE));
    return {
      // Fully in by a third of the rise, so the mask edge never shows a half-lit letter.
      opacity: Math.min(1, rise * 3),
      transform: [
        { translateY: (1 - rise) * travel - leave * travel },
        { translateX: (1 - rise) * spread },
      ],
    };
  });

  const lit = useAnimatedStyle(() => {
    const ms = progress.get() * TOTAL;
    return { opacity: sineInOut(windowOf(ms, SWEEP_AT + accentIndex * SWEEP_STAGGER, SWEEP)) };
  });

  return (
    <View style={styles.mask}>
      <Animated.View style={motion}>
        <Text style={[styles.glyph, { color: theme.text }]}>{char}</Text>
        {accentIndex >= 0 ? (
          <Animated.Text style={[styles.glyph, styles.lit, { color: theme.accent }, lit]}>
            {char}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * The app's own name, drawn as live text: the launch view carries no other product's mark, and a
 * wordmark the platform draws needs no image asset to ship, license or keep in sync. Frame 0 is the
 * bare backdrop — every glyph still below its mask — which is exactly what the native splash shows
 * (`splash-blank.png` on the same colour), so the handover is invisible and the name is seen
 * arriving rather than popping in.
 */
export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(!playedOnce);
  const progress = useSharedValue(0);

  const backdrop = useAnimatedStyle(() => ({
    opacity: 1 - sineInOut(windowOf(progress.get() * TOTAL, FADE_AT, FADE)),
  }));

  if (!visible) return null;

  // Must match the native splash background configured for expo-splash-screen in app.json, which is
  // plain JSON and cannot import this palette. If the two drift, the handover flashes.
  return (
    <Animated.View
      onLayout={() => {
        if (playedOnce) return;
        playedOnce = true;
        SplashScreen.hideAsync().finally(() => {
          progress.set(
            withTiming(1, { duration: TOTAL, easing: Easing.linear }, (finished) => {
              'worklet';
              if (finished) scheduleOnRN(setVisible, false);
            }),
          );
        });
      }}
      style={[styles.splashOverlay, { backgroundColor: theme.background }, backdrop]}>
      <View style={styles.wordmarkRow}>
        {GLYPHS.map((glyph, index) => (
          <Glyph
            key={index}
            char={glyph.char}
            index={index}
            accentIndex={glyph.accent}
            progress={progress}
            reduced={reduced}
            theme={theme}
          />
        ))}
      </View>
    </Animated.View>
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
  },
  mask: {
    height: LINE,
    overflow: 'hidden',
    justifyContent: 'center',
    // Single-glyph Texts lose the font's tracking; this is the wordmark's -0.6 letter-spacing.
    marginHorizontal: -0.3,
  },
  glyph: {
    fontSize: FONT_SIZE,
    lineHeight: LINE,
    fontWeight: 800,
    includeFontPadding: false,
  },
  lit: {
    ...StyleSheet.absoluteFill,
  },
});
