/**
 * Every movement the app draws itself (motion capability; app-motion-pass design D1–D12). The only
 * file that imports a Reanimated animation factory: the screens and surfaces render these wrappers
 * and never time anything, so `Motion` in `src/constants/theme.ts` is the one place to tune, and
 * `src/ui/motion-usage.test.ts` can prove that nothing else loops, delays or outlasts the ceiling.
 *
 * The decisions — which transition, where a fill starts, what reduced motion turns a movement into,
 * the sheet's phases — are pure and live in `src/ui/motion.ts`. This file only draws them.
 *
 * Reduced motion: Reanimated's `ReduceMotion.System` would skip a movement outright, but the spec
 * wants some of them to become a plain fast cross-fade instead. So every factory comes in two sets,
 * and `useMotion()` picks one by `useReducedMotion()` (`movementUnderReducedMotion` decides which
 * movement becomes which). The reduced set is `ReduceMotion.Never` — it already is the reduced form.
 */
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type FlatListProps,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Circle, G, Path, Svg, type CircleProps } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText, type ThemedTextProps } from './themed-text';

import { Motion } from '@/constants/theme';
import {
  donutMorph,
  donutSectorPath,
  lineAt,
  lineMorph,
  linePath,
  sectorAt,
  type DonutGeometry,
  type DonutRing,
  type HistoryGeometry,
  type LineMorph,
  type SectorMorph,
} from '@/ui/dashboard-charts';
import { useTheme } from '@/hooks/use-theme';
import {
  fillStart,
  movementUnderReducedMotion,
  routeTransition,
  SHEET_CLOSED,
  sheetInteractive,
  sheetStep,
  sheetVisible,
  type MovementKind,
  type RouteAnimation,
  type SheetEvent,
  type SheetPhase,
  type SheetState,
} from '@/ui/motion';

// ─── Easings (design D1) ────────────────────────────────────────────────────────────────────────

/** Things entering decelerate into place. */
export const enterEasing = Easing.bezier(...Motion.enter);
/** Things leaving accelerate away. */
export const exitEasing = Easing.bezier(...Motion.exit);

/** The one spring, for a press-in and its return. */
const PRESS_SPRING = { ...Motion.press, reduceMotion: ReduceMotion.System };

// ─── Prebuilt layout animations (design D4) ─────────────────────────────────────────────────────

/** A figure rising into place from `Motion.shift` below while it fades in (design D6). */
const riseInMoving: EntryExitAnimationFunction = () => {
  'worklet';
  const timing = { duration: Motion.fast, easing: enterEasing, reduceMotion: ReduceMotion.System };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: Motion.shift }] },
    animations: {
      opacity: withTiming(1, timing),
      transform: [{ translateY: withTiming(0, timing) }],
    },
  };
};

/** The figure it replaces, rising away and fading out on the same beat. */
const riseOutMoving: EntryExitAnimationFunction = () => {
  'worklet';
  const timing = { duration: Motion.fast, easing: exitEasing, reduceMotion: ReduceMotion.System };
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, timing),
      transform: [{ translateY: withTiming(-Motion.shift, timing) }],
    },
  };
};

/** New content entering from the side of a step, `Motion.shift` away — not a full-width slide. */
function stepInMoving(direction: 'from-left' | 'from-right'): EntryExitAnimationFunction {
  const from = direction === 'from-left' ? -Motion.shift : Motion.shift;
  return () => {
    'worklet';
    const timing = {
      duration: Motion.standard,
      easing: enterEasing,
      reduceMotion: ReduceMotion.System,
    };
    return {
      initialValues: { opacity: 0, transform: [{ translateX: from }] },
      animations: {
        opacity: withTiming(1, timing),
        transform: [{ translateX: withTiming(0, timing) }],
      },
    };
  };
}

const STEP_IN = {
  'from-left': stepInMoving('from-left'),
  'from-right': stepInMoving('from-right'),
};

/**
 * The plain fast cross-fade every movement that must still say "changed" becomes when reduced. A
 * chart that cannot morph cross-fades even under reduced motion: it is replaced, not moved.
 */
const fadeInFast = FadeIn.duration(Motion.fast).easing(enterEasing).reduceMotion(ReduceMotion.Never);
const fadeOutFast = FadeOut.duration(Motion.fast).easing(exitEasing).reduceMotion(ReduceMotion.Never);

type Entering = React.ComponentProps<typeof Animated.View>['entering'];
type Exiting = React.ComponentProps<typeof Animated.View>['exiting'];

interface MotionFactories {
  /** A section or a row appearing. */
  readonly enterFade: Entering;
  /** A section or a row leaving. */
  readonly exitFade: Exiting;
  /** A chart re-keyed because its shapes cannot be matched (design D7, D12). */
  readonly crossFade: Entering;
  /** The siblings of what opened or left, moving to their new place. */
  readonly reflow: LinearTransition | undefined;
  /** A changed figure rising into place, and the one it replaces rising away (design D6). */
  readonly riseIn: Entering;
  readonly riseOut: Exiting;
  /** A stepped month's content entering from the side of the step (design D7). */
  readonly stepIn: (direction: 'from-left' | 'from-right') => Entering;
}

const MOVING: MotionFactories = {
  enterFade: FadeIn.duration(Motion.standard).easing(enterEasing).reduceMotion(ReduceMotion.System),
  exitFade: FadeOut.duration(Motion.fast).easing(exitEasing).reduceMotion(ReduceMotion.System),
  crossFade: FadeIn.duration(Motion.fast).easing(enterEasing).reduceMotion(ReduceMotion.System),
  reflow: LinearTransition.duration(Motion.standard)
    .easing(enterEasing)
    .reduceMotion(ReduceMotion.System),
  riseIn: riseInMoving,
  riseOut: riseOutMoving,
  stepIn: (direction) => STEP_IN[direction],
};

/** A movement under reduced motion: the fast cross-fade, or nothing, per `movementUnderReducedMotion`. */
function whenReduced<F>(kind: MovementKind, fade: F): F | undefined {
  return movementUnderReducedMotion(kind) === 'fade-fast' ? fade : undefined;
}

const REDUCED: MotionFactories = {
  enterFade: whenReduced('open', fadeInFast),
  exitFade: whenReduced('leave', fadeOutFast),
  crossFade: fadeInFast,
  reflow: whenReduced('reflow', undefined),
  riseIn: whenReduced('rise', fadeInFast),
  riseOut: whenReduced('rise', fadeOutFast),
  stepIn: () => whenReduced('step', fadeInFast),
};

export type MotionSet = MotionFactories & { readonly reduced: boolean };

/**
 * The prebuilt layout animations for this phone's setting: the moving set, or the reduced one. The
 * setting is read by Reanimated once at launch, so a change applies from the next launch (motion,
 * "Reduced motion turns movement into instant change").
 */
export function useMotion(): MotionSet {
  const reduced = useReducedMotion();
  return { ...(reduced ? REDUCED : MOVING), reduced };
}

// ─── Opening, closing, leaving (design D4) ──────────────────────────────────────────────────────

/**
 * A section or a service row that comes and goes: it fades in when it appears, fades out when it
 * leaves, and moves to its new place with its neighbours (motion, "What opens, closes or leaves
 * moves its neighbours smoothly").
 */
export function Appear({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  return (
    <Animated.View
      entering={motion.enterFade}
      exiting={motion.exitFade}
      layout={motion.reflow}
      style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * A neighbour of something that opens or leaves: it does not appear or leave itself, it only moves
 * to its new place over `Motion.standard` instead of jumping.
 */
export function Reflow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  return (
    <Animated.View layout={motion.reflow} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * What is on a screen when it is first drawn is simply there: nothing inside fades in on the first
 * mount, and only what appears after it does.
 */
export function SettleFirst({ children }: { children: React.ReactNode }) {
  return <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>;
}

/**
 * One row of a list. It never animates in — a list's rows, a «Показати ще» page and a newly arrived
 * row are all shown at once — but a row that leaves fades out while the rows after it close the gap
 * (motion, "A removed транзакція's row closes the gap"). In a `MotionList` the list moves the rows
 * itself; in a plain `ListCard` the row moves with `reflow`.
 */
export function ListItem({ children, reflow = false }: { children: React.ReactNode; reflow?: boolean }) {
  const motion = useMotion();
  return (
    <Animated.View exiting={motion.exitFade} layout={reflow ? motion.reflow : undefined}>
      {children}
    </Animated.View>
  );
}

/**
 * The long lists' `FlatList` (app-speed-pass design D7), with the rows after a leaving one moving up
 * to close the gap over `Motion.standard` (`itemLayoutAnimation`). Rows never get `entering`.
 */
export function MotionList<T>(props: Omit<FlatListProps<T>, 'CellRendererComponent'>) {
  const motion = useMotion();
  return (
    <SettleFirst>
      <Animated.FlatList {...props} itemLayoutAnimation={motion.reflow} />
    </SettleFirst>
  );
}

// ─── Changing figures (design D6) ───────────────────────────────────────────────────────────────

/**
 * One currency's сума that may change while in sight: the old figure rises away and fades while the
 * new one rises into place (motion, "A changing сума never shows an amount that is not real"). The
 * figure is keyed by its own text, so only two real strings are ever drawn and nothing counts
 * through the amounts between them; a line of several currencies draws one of these per currency,
 * so a сума that did not change does not move (`changedFigures`). The first draw is simply there.
 *
 * On the New Architecture a view leaving with `exiting` is no longer in the layout, so the outgoing
 * figure is drawn where it was without pushing the incoming one aside. One line always: a сума is
 * never split (app-shell).
 */
export function ChangingFigure({
  children,
  boxStyle,
  ...text
}: Omit<ThemedTextProps, 'children'> & {
  children: string;
  /** The figure's place in its row — what would otherwise be the text's own flex style. */
  boxStyle?: StyleProp<ViewStyle>;
}) {
  const motion = useMotion();
  return (
    <SettleFirst>
      <Animated.View key={children} entering={motion.riseIn} exiting={motion.riseOut} style={boxStyle}>
        <ThemedText numberOfLines={1} {...text}>
          {children}
        </ThemedText>
      </Animated.View>
    </SettleFirst>
  );
}

// ─── Filling progress (design D5) ───────────────────────────────────────────────────────────────

/**
 * Whether the meters and rings mounting now stand for something the owner switched to — another
 * місяць — rather than for a screen drawn for the first time. Місяць provides `true` once the owner
 * has stepped (design D7), so a stepped month's meters appear at their values under the slide.
 */
export const DrawAtValue = createContext(false);

const FILL_TIMING = { duration: Motion.emphasis, easing: enterEasing, reduceMotion: ReduceMotion.System };

/**
 * The share a meter or a ring shows, moving from where it was to `value` (motion, "Progress fills
 * from where it was"): once from empty on its first draw, from its previous value on a change, and
 * at the value when it was switched to, when nothing changed, or under reduced motion
 * (`fillStart`). A change during a fill continues from what is on screen.
 */
function useFill(value: number, switched?: boolean) {
  const reduced = useReducedMotion();
  const drawAtValue = useContext(DrawAtValue);
  const mountedBySwitch = switched ?? drawAtValue;
  const first = fillStart({
    prev: 0,
    next: value,
    firstDraw: true,
    switched: mountedBySwitch,
    reduced,
  });
  // Only the first render's argument is used: the share the very first frame shows.
  const shown = useSharedValue(first ?? value);
  /** The value last targeted; `null` until the first effect. */
  const last = useRef<number | null>(null);
  useEffect(() => {
    const firstDraw = last.current === null;
    const start = fillStart({
      prev: last.current ?? 0,
      next: value,
      firstDraw,
      // A switch only ever explains a mount; a later change of the same meter fills.
      switched: firstDraw && mountedBySwitch,
      reduced,
    });
    last.current = value;
    shown.set(start === null ? value : withTiming(value, FILL_TIMING));
  }, [mountedBySwitch, reduced, shown, value]);
  return shown;
}

/**
 * A bar filled to `value` (0–1) on its track (design D5): the fill is as wide as the track and
 * slides in from the left under the track's clip, so only a transform moves and the fill's rounded
 * leading edge stays round.
 */
export function FillBar({
  value,
  trackStyle,
  fillStyle,
  switched,
}: {
  value: number;
  trackStyle: StyleProp<ViewStyle>;
  fillStyle: StyleProp<ViewStyle>;
  switched?: boolean;
}) {
  const shown = useFill(value, switched);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: `${(shown.get() - 1) * 100}%` }],
  }));
  return (
    <View style={[trackStyle, styles.clip]}>
      <Animated.View style={[styles.fullFill, fillStyle, slide]} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A ring's arc filled to `value` (0–1): the one animated prop is `strokeDashoffset` (design D5).
 */
export function FillRing({
  value,
  circumference,
  switched,
  ...circle
}: Omit<CircleProps, 'strokeDasharray' | 'strokeDashoffset'> & {
  value: number;
  circumference: number;
  switched?: boolean;
}) {
  const shown = useFill(value, switched);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - shown.get()) }));
  return <AnimatedCircle {...circle} strokeDasharray={circumference} animatedProps={arc} />;
}

// ─── Charts that morph (design D12) ─────────────────────────────────────────────────────────────

/**
 * What stands in one place and is replaced rather than moved: a chart giving way to a message, or
 * a message to a chart. The arriving one cross-fades in over `Motion.fast` (motion, "A chart moves
 * from its old shape to its new one").
 */
export function Swap({
  children,
  style,
  still = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Nothing was replaced: the first drawing of what stands here, which is simply there. */
  still?: boolean;
}) {
  const motion = useMotion();
  return (
    <Animated.View
      entering={still ? undefined : motion.crossFade}
      exiting={still ? undefined : motion.exitFade}
      style={style}>
      {children}
    </Animated.View>
  );
}

const MORPH_TIMING = { duration: Motion.emphasis, easing: enterEasing, reduceMotion: ReduceMotion.System };

type LineShape = Extract<LineMorph, { kind: 'morph' }>;

/** A line that stands still at `geometry`: from and to the same heights. */
function stillLine(geometry: Pick<HistoryGeometry, 'segments'>): LineShape {
  const ys = geometry.segments.map((run) => run.map((p) => p.y));
  return { kind: 'morph', xs: geometry.segments.map((run) => run.map((p) => p.x)), from: ys, to: ys };
}

function sameLine(a: Pick<HistoryGeometry, 'segments'>, b: Pick<HistoryGeometry, 'segments'>): boolean {
  return (
    a.segments.length === b.segments.length &&
    a.segments.every(
      (run, r) =>
        run.length === b.segments[r]!.length &&
        run.every((p, i) => {
          const q = b.segments[r]![i]!;
          return p.seriesIndex === q.seriesIndex && p.x === q.x && p.y === q.y;
        }),
    )
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * One morph of the line, from its mount: its own progress from 0, so it starts exactly at the shape
 * that was on screen. A new target mounts a new one.
 */
function MorphingLine({
  shape,
  moving,
  width,
  height,
  color,
  strokeWidth,
  onProgress,
}: {
  shape: LineShape;
  moving: boolean;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  onProgress: (progress: SharedValue<number>) => void;
}) {
  const progress = useSharedValue(moving ? 0 : 1);
  useEffect(() => {
    onProgress(progress);
    if (moving) progress.set(withTiming(1, MORPH_TIMING));
    // Once, on mount: a new target is a new instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const line = useAnimatedProps(() => ({
    d: linePath(lineAt(shape, progress.get()), width, height),
  }));
  return <AnimatedPath animatedProps={line} fill="none" stroke={color} strokeWidth={strokeWidth} />;
}

/**
 * The історія статку, travelling from its old shape to its new one over `Motion.emphasis` when its
 * data or its currency changes (`lineMorph`), and cross-fading when the two cannot be matched. The
 * first drawing is simply there; only `d` moves, and nothing is animated once the morph has ended.
 */
export function MorphLine({
  geometry,
  width,
  height,
  color,
  strokeWidth,
}: {
  geometry: HistoryGeometry;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
}) {
  const motion = useMotion();
  const [state, setState] = useState(() => ({
    target: geometry as Pick<HistoryGeometry, 'segments'>,
    shape: stillLine(geometry),
    moves: 0,
    fades: 0,
  }));
  const progress = useRef<SharedValue<number> | null>(null);
  const onProgress = useCallback((value: SharedValue<number>) => {
    progress.current = value;
  }, []);

  useEffect(() => {
    if (sameLine(state.target, geometry)) return;
    // The shape on screen right now, which is where the next morph starts.
    const t = progress.current?.get() ?? 1;
    const drawn = lineAt(state.shape, t);
    const onScreen = {
      segments: state.target.segments.map((run, r) => run.map((p, i) => ({ ...p, y: drawn[r]![i]!.y }))),
    };
    const next = motion.reduced ? ({ kind: 'fade' } as const) : lineMorph(onScreen, geometry);
    setState((was) =>
      next.kind === 'morph'
        ? { target: geometry, shape: next, moves: was.moves + 1, fades: was.fades }
        : { target: geometry, shape: stillLine(geometry), moves: was.moves + 1, fades: was.fades + 1 },
    );
  }, [geometry, motion.reduced, state]);

  const moving = state.moves > 0 && state.shape.from !== state.shape.to;
  return (
    <Animated.View
      key={state.fades}
      entering={state.fades > 0 ? motion.crossFade : undefined}
      exiting={state.fades > 0 ? motion.exitFade : undefined}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <MorphingLine
          key={state.moves}
          shape={state.shape}
          moving={moving}
          width={width}
          height={height}
          color={color}
          strokeWidth={strokeWidth}
          onProgress={onProgress}
        />
      </Svg>
    </Animated.View>
  );
}

/** A donut that stands still at `geometry`. */
function stillDonut(geometry: DonutGeometry): SectorMorph[] {
  return geometry.kind === 'positive'
    ? geometry.sectors.map((s) => ({
        key: s.categoryId,
        from: [s.startAngle, s.endAngle],
        to: [s.startAngle, s.endAngle],
      }))
    : [];
}

function sameDonut(a: DonutGeometry, b: DonutGeometry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'neutral' || b.kind === 'neutral') return true;
  return (
    a.sectors.length === b.sectors.length &&
    a.sectors.every((s, i) => {
      const t = b.sectors[i]!;
      return s.categoryId === t.categoryId && s.startAngle === t.startAngle && s.endAngle === t.endAngle;
    })
  );
}

function MorphingSector({
  sector,
  ring,
  progress,
  fill,
  fillOpacity,
}: {
  sector: SectorMorph;
  ring: DonutRing;
  progress: SharedValue<number>;
  fill: string;
  fillOpacity: number;
}) {
  const path = useAnimatedProps(() => {
    const [start, end] = sectorAt(sector, progress.get());
    return { d: donutSectorPath(start, end, ring) };
  });
  return <AnimatedPath animatedProps={path} fill={fill} fillOpacity={fillOpacity} />;
}

/** One morph of the donut's sectors, sharing one progress from 0 on its mount. */
function MorphingSectors({
  sectors,
  moving,
  ring,
  fill,
  opacityOf,
  onProgress,
}: {
  sectors: readonly SectorMorph[];
  moving: boolean;
  ring: DonutRing;
  fill: string;
  opacityOf: (key: string) => number;
  onProgress: (progress: SharedValue<number>) => void;
}) {
  const progress = useSharedValue(moving ? 0 : 1);
  useEffect(() => {
    onProgress(progress);
    if (moving) progress.set(withTiming(1, MORPH_TIMING));
    // Once, on mount: a new target is a new instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <G>
      {sectors.map((sector) => (
        <MorphingSector
          key={sector.key}
          sector={sector}
          ring={ring}
          progress={progress}
          fill={fill}
          fillOpacity={opacityOf(sector.key)}
        />
      ))}
    </G>
  );
}

/**
 * The категорії donut, each sector growing or shrinking to its new share keyed by its категорія
 * (`donutMorph`): an arriving one grows from nothing where it will sit, a leaving one shrinks to
 * nothing where it was. A neutral ring, or sectors that would change order, cross-fade instead.
 * `neutral` draws the full ring in `neutralFill`.
 */
export function MorphDonut({
  geometry,
  ring,
  size,
  fill,
  neutralFill,
  opacityOf,
}: {
  geometry: DonutGeometry;
  ring: DonutRing;
  size: number;
  fill: string;
  neutralFill: string;
  /** A sector's opacity by its key — the accent graduated by rank. */
  opacityOf: (key: string) => number;
}) {
  const motion = useMotion();
  const [state, setState] = useState(() => ({
    target: geometry,
    sectors: stillDonut(geometry),
    moves: 0,
    fades: 0,
  }));
  const progress = useRef<SharedValue<number> | null>(null);
  const onProgress = useCallback((value: SharedValue<number>) => {
    progress.current = value;
  }, []);

  useEffect(() => {
    if (sameDonut(state.target, geometry)) return;
    const t = progress.current?.get() ?? 1;
    // The ring on screen right now, as a geometry the next morph can start from. Leaving sectors
    // drawn at zero sweep are not on screen any more.
    const onScreen: DonutGeometry =
      state.target.kind === 'positive'
        ? {
            kind: 'positive',
            sectors: state.sectors
              .map((sector) => {
                const [startAngle, endAngle] = sectorAt(sector, t);
                return { categoryId: sector.key, startAngle, endAngle, fraction: (endAngle - startAngle) / 360 };
              })
              .filter((sector) => sector.endAngle > sector.startAngle),
          }
        : state.target;
    const next = motion.reduced ? ({ kind: 'fade' } as const) : donutMorph(onScreen, geometry);
    setState((was) =>
      next.kind === 'morph'
        ? { target: geometry, sectors: [...next.sectors], moves: was.moves + 1, fades: was.fades }
        : { target: geometry, sectors: stillDonut(geometry), moves: was.moves + 1, fades: was.fades + 1 },
    );
  }, [geometry, motion.reduced, state]);

  return (
    <Animated.View
      key={state.fades}
      entering={state.fades > 0 ? motion.crossFade : undefined}
      exiting={state.fades > 0 ? motion.exitFade : undefined}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {state.target.kind === 'positive' ? (
          <MorphingSectors
            key={state.moves}
            sectors={state.sectors}
            moving={state.moves > 0}
            ring={ring}
            fill={fill}
            opacityOf={opacityOf}
            onProgress={onProgress}
          />
        ) : (
          // Neutral ring: no proportional sectors at all (main-screen, "Signed or empty breakdowns
          // never claim false shares").
          <Path d={donutSectorPath(0, 360, ring)} fill={neutralFill} />
        )}
      </Svg>
    </Animated.View>
  );
}

/**
 * One Звіти bar (design D5, D12): a full-height bar under its half's clip, slid from the baseline so
 * only a transform moves — up out of the baseline for a positive number, down for a negative one.
 * It mounts at `from` (0 on the screen's first drawing and for an arriving column, the old size
 * after a switch that re-laid the chart out) and moves to `size`; a later change moves it from where
 * it is. Reduced motion draws it at its size.
 */
export function FillColumn({
  size,
  from,
  negative,
  style,
}: {
  size: number;
  from: number;
  negative: boolean;
  style: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [mountedAt] = useState(from);
  const shown = useSharedValue(reduced ? size : mountedAt);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const start = last.current ?? mountedAt;
    last.current = size;
    shown.set(reduced || start === size ? size : withTiming(size, FILL_TIMING));
  }, [mountedAt, reduced, shown, size]);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: `${(negative ? -1 : 1) * (1 - shown.get()) * 100}%` }],
  }));
  return <Animated.View style={[styles.fullFill, style, slide]} />;
}

// ─── Switching what is shown (design D7) ────────────────────────────────────────────────────────

/**
 * A body that is replaced when the owner steps to another місяць: the new one enters from the side
 * of the step (`stepDirection`) by `Motion.shift` while the old one fades out, and the meters inside
 * draw at their values, since they stand for new content (motion, "Switching what is shown says how
 * it changed"). Before the first step it is simply there.
 */
export function SteppedBody({
  stepKey,
  direction,
  stepped,
  style,
  children,
}: {
  stepKey: string;
  direction: 'from-left' | 'from-right';
  /** Whether the owner has stepped at least once; until then the body is the screen's first draw. */
  stepped: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const motion = useMotion();
  return (
    <DrawAtValue value={stepped}>
      <Animated.View
        key={stepKey}
        entering={stepped ? motion.stepIn(direction) : undefined}
        exiting={stepped ? motion.exitFade : undefined}
        style={style}>
        {children}
      </Animated.View>
    </DrawAtValue>
  );
}

// ─── The bottom sheet (design D9) ───────────────────────────────────────────────────────────────

/** A view whose style may carry an animated style — what `sheet.tsx` draws the scrim and panel with. */
export const MotionView = Animated.View;

/**
 * The bottom sheet's movement, driven by the phase machine in `src/ui/motion.ts`: the scrim fades
 * in while the panel rises over `Motion.standard`, and both leave in reverse over `Motion.fast`
 * (motion, "A bottom sheet rises over a fading scrim"). Under reduced motion the panel does not
 * rise; it fades in place with the scrim.
 *
 * `dismiss` is for a close the sheet itself starts — the scrim, the back gesture: `onDismiss` fires
 * once as it begins. The parent's `open` turning false closes it the same way and reports nothing.
 * Either way `onExited` runs once the panel has left.
 */
export function useSheetMotion({
  open,
  onDismiss,
  onExited,
}: {
  open: boolean;
  onDismiss: () => void;
  onExited?: () => void;
}) {
  const reduced = useReducedMotion();
  const [state, setState] = useState<SheetState>(SHEET_CLOSED);
  /** The machine's state for handlers and animation ends, which must not wait for a render. */
  const machine = useRef<SheetState>(SHEET_CLOSED);
  const callbacks = useRef({ onDismiss, onExited });
  useEffect(() => {
    callbacks.current = { onDismiss, onExited };
  }, [onDismiss, onExited]);

  const scrim = useSharedValue(0);
  /** 1 while the panel is below the screen's edge, 0 in place. */
  const lowered = useSharedValue(1);
  const panelOpacity = useSharedValue(reduced ? 0 : 1);

  /**
   * Where an animation's end lands: the machine as it is then. Read through a ref because the
   * worklet that reports the end is created before the dispatcher it reports to.
   */
  const dispatchRef = useRef<(event: SheetEvent) => void>(() => {});
  const settle = useCallback((event: SheetEvent) => dispatchRef.current(event), []);

  const move = useCallback(
    (phase: SheetPhase) => {
      if (phase !== 'opening' && phase !== 'closing') return;
      const opening = phase === 'opening';
      const timing = opening
        ? { duration: Motion.standard, easing: enterEasing, reduceMotion: ReduceMotion.Never }
        : { duration: Motion.fast, easing: exitEasing, reduceMotion: ReduceMotion.Never };
      const done: SheetEvent = opening ? 'shown' : 'hidden';
      const finish = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(settle, done);
      };
      scrim.set(withTiming(opening ? 1 : 0, timing));
      if (reduced) {
        // Nothing rises under reduced motion: the panel is in place and fades with the scrim.
        lowered.set(0);
        panelOpacity.set(withTiming(opening ? 1 : 0, { ...timing, duration: Motion.fast }, finish));
      } else {
        lowered.set(withTiming(opening ? 0 : 1, timing, finish));
      }
    },
    [lowered, panelOpacity, reduced, scrim, settle],
  );

  const dispatch = useCallback(
    (event: SheetEvent) => {
      const before = machine.current.phase;
      const step = sheetStep(machine.current, event);
      machine.current = step.state;
      setState(step.state);
      if (step.state.phase !== before) move(step.state.phase);
      for (const effect of step.effects) {
        if (effect === 'dismissed') callbacks.current.onDismiss();
        else callbacks.current.onExited?.();
      }
    },
    [move],
  );
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    dispatch(open ? 'show' : 'hide');
  }, [dispatch, open]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.get(),
    transform: [{ translateY: `${lowered.get() * 100}%` }],
  }));

  return {
    visible: sheetVisible(state),
    interactive: sheetInteractive(state),
    dismiss: () => dispatch('dismiss'),
    scrimStyle,
    panelStyle,
  };
}

// ─── Screen transitions (design D2) ─────────────────────────────────────────────────────────────

/**
 * The native stack's transition for a route, on this phone's reduced-motion setting. Read once by
 * the root layout; a change of the setting applies from the next launch.
 */
export function useRouteAnimation(): (route: string) => RouteAnimation {
  const reduced = useReducedMotion();
  return (route) => routeTransition(route, reduced, Platform.OS);
}

// ─── Tab cross-fade (design D8) ─────────────────────────────────────────────────────────────────

/** Each tab's opacity, so the tab being left can be hidden for its own next arrival. */
const TAB_OPACITY = new Map<string, SharedValue<number>>();
/** The tab focused last, whichever one it was; `null` until the launch tab's first focus. */
let lastTab: string | null = null;

/**
 * A tab's content fading in within `Motion.fast` when the owner switches to it from another tab
 * (motion, "Screens enter from where they come from"). Every tab starts transparent and the one
 * being left is set back to transparent as another arrives, so a tab is never shown for a frame at
 * full strength before it fades. A tab focused again because a pushed screen was popped is the tab
 * focused last, and shows at once under the stack's own transition; so does the tab the app
 * launches onto.
 */
export function TabFade({ tab, children }: { tab: string; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  useFocusEffect(
    useCallback(() => {
      TAB_OPACITY.set(tab, opacity);
      if (lastTab === null || lastTab === tab) {
        opacity.set(1);
      } else {
        TAB_OPACITY.get(lastTab)?.set(0);
        opacity.set(withTiming(1, { duration: Motion.fast, easing: enterEasing }));
      }
      lastTab = tab;
    }, [opacity, tab]),
  );
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

// ─── Press feedback (design D3) ─────────────────────────────────────────────────────────────────

type TapStyle = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

export type TapProps = Omit<PressableProps, 'style' | 'children' | 'android_ripple'> & {
  style?: TapStyle;
  children?: React.ReactNode;
  /**
   * The primary buttons and the add button also press in slightly and spring back (motion, "Every
   * tap is acknowledged at once"). Everything else only shows the ripple or the pressed tone.
   */
  emphasis?: boolean;
};

/**
 * Everything the owner can tap. One feedback everywhere: Android's own ripple from the touch point
 * (native, costs nothing), and one pressed tone where the platform draws no ripple. A disabled
 * element — or one with nothing to do on a press — shows no press at all.
 */
export function Tap({ emphasis, ...props }: TapProps) {
  return emphasis ? <PressInTap {...props} /> : <PlainTap {...props} />;
}

function inertOf(props: TapProps): boolean {
  return Boolean(props.disabled) || (!props.onPress && !props.onLongPress);
}

/**
 * The caller's style, plus the clip that keeps a ripple inside rounded corners and the pressed tone
 * off Android.
 */
function tapStyle(style: TapStyle | undefined, pressed: boolean, inert: boolean) {
  const own = typeof style === 'function' ? style({ pressed }) : style;
  const radius = StyleSheet.flatten(own)?.borderRadius;
  return [
    own,
    radius ? styles.clip : null,
    pressed && !inert && Platform.OS !== 'android' ? styles.pressedTone : null,
  ];
}

function PlainTap({ style, children, ...rest }: TapProps) {
  const theme = useTheme();
  const inert = inertOf(rest);
  return (
    <Pressable
      {...rest}
      android_ripple={inert ? undefined : { color: theme.ripple, foreground: true }}
      style={({ pressed }) => tapStyle(style, pressed, inert)}>
      {children}
    </Pressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PressInTap({ style, children, onPressIn, onPressOut, ...rest }: TapProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const inert = inertOf(rest);
  const scale = useSharedValue(1);
  // Tracked here rather than taken from Pressable's style callback: an animated Pressable takes
  // its style as a value, so the pressed tone has to be decided before it is handed over.
  const [pressed, setPressed] = useState(false);
  const pressIn = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      android_ripple={inert ? undefined : { color: theme.ripple, foreground: true }}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        // Off under reduced motion: a press-in is movement (`movementUnderReducedMotion('press')`).
        if (!inert && !reduced) scale.set(withSpring(Motion.pressedScale, PRESS_SPRING));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        if (!inert && !reduced) scale.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(event);
      }}
      style={[tapStyle(style, pressed, inert), pressIn]}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fullFill: { width: '100%', height: '100%' },
  clip: { overflow: 'hidden' },
  pressedTone: { opacity: Motion.pressedOpacity },
});
