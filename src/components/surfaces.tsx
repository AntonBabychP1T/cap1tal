import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing, TouchTarget, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The surfaces every screen is built from, so no screen repeats a radius or a hairline colour.
 * The canvas draws two card shapes and one bar:
 *
 * `Card`     — a padded block: a form, one currency's numbers, a sentence on its own.
 * `ListCard` — rows under one roof, told apart by a hairline rather than by gaps between cards.
 * `Meter`    — the one bar the app draws, for a category's share of a month.
 *
 * The rest is the frame around them — `Screen`, `ScreenHeader`, `SectionLabel` — and the two
 * marks a row can carry: a `Banner` and the «Без категорії» `Mark`.
 *
 * There are no shadows anywhere: the surface's own tone is what says which layer it is on.
 */

/**
 * Every screen's frame: the app's background, the safe area at the top, and one scrolling column
 * with the 16pt gutter the canvas draws. Taps reach a button through an open keyboard, because on
 * a form the button under the thumb is usually the next thing tapped.
 */
export function Screen({
  children,
  scrollRef,
  overlay,
  refreshControl,
}: {
  children: React.ReactNode;
  /**
   * Lent out so a screen can scroll its own column — Головний shows itself from the top when the
   * tab is opened again. `Screen` is a surface: it hands the ref over and knows nothing of
   * navigation, so exactly the screens that ask for the behaviour have it.
   */
  scrollRef?: React.RefObject<ScrollView | null>;
  /**
   * Something that stands over the column instead of scrolling with it — the «+» on Головний. A
   * sibling of the `ScrollView`, not a child of it: a control the owner must reach without
   * scrolling cannot live inside the thing being scrolled.
   */
  overlay?: React.ReactNode;
  /**
   * The pull-to-refresh of the one screen that has one — Головний, where pulling down re-reads
   * storage and asks monobank for anything new. Passed straight through to the `ScrollView`,
   * because that is where React Native wants it and it lives here rather than there: every screen
   * shares this frame, and Головний cannot reach its own scroll view any other way.
   *
   * Absent everywhere else, which leaves those screens rendering exactly as they did.
   */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          refreshControl={refreshControl}
          // A screen with something floating over its corner ends its column above it, so the
          // last row can always be read and tapped rather than sitting under the «+».
          contentContainerStyle={[styles.content, overlay ? styles.contentUnderOverlay : null]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {overlay}
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The floating «+»: the one control that stands over a screen rather than in it. Bottom-right,
 * inside the safe area and clear of the tab bar, drawn in the same accent every main action wears
 * so it reads as the screen's action and not as a second kind of button.
 */
export function Fab({ label = '+', onPress }: { label?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Записати транзакцію"
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: theme.accent,
          // The ring is the page showing through, so the «+» keeps its shape over a row it
          // happens to sit on. Nothing here is a shadow — the app draws none.
          borderColor: theme.background,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}>
      <ThemedText type="subtitle" style={[styles.fabLabel, { color: theme.onAccent }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A screen's own name, the way back off it, and whatever sits opposite it. */
export function ScreenHeader({
  title,
  subtitle,
  back,
  right,
  danger,
}: {
  title: string;
  subtitle?: string;
  /** A pushed screen is left from its own heading, not from a button at the end of its content. */
  back?: () => void;
  right?: React.ReactNode;
  /** The heading itself is the warning — a category over its ліміт names itself in red. */
  danger?: boolean;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable onPress={back} accessibilityLabel="Назад" hitSlop={Spacing.two}>
          <ThemedText type="subtitle">←</ThemedText>
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <ThemedText type="subtitle" themeColor={danger ? 'textDanger' : undefined}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/**
 * A padded block. `tone="accent"` tints it and outlines it in the accent — the one card on a
 * screen that is asking for something, never more than one at a time.
 */
/**
 * The app's name, as it is written: the «1» is the accent, the rest is the reading colour. Text
 * rather than an asset — one font, no image to ship, and it scales with the system's type size.
 */
/**
 * The way out of a section, as a pill on its heading: outlined rather than filled, so it never
 * competes with the screen's own action — the «+» — and never reads as a second one.
 */
function SectionAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.sectionAction,
        { borderColor: theme.accent },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="linkPrimary" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Wordmark() {
  return (
    <ThemedText type="subtitle">
      cap<ThemedText type="subtitle" themeColor="accent">1</ThemedText>tal
    </ThemedText>
  );
}

/**
 * The one decoration the app draws: two thin accent rings, clipped by the card they sit in, so a
 * hero figure has something behind it instead of a flat rectangle. Nothing is said by it and
 * nothing is tappable — `pointerEvents="none"` keeps the whole card one tap.
 */
export function CardGlow() {
  const theme = useTheme();
  return (
    <View style={styles.glow} pointerEvents="none">
      <View style={[styles.glowRing, styles.glowOuter, { borderColor: theme.accent }]} />
      <View style={[styles.glowRing, styles.glowInner, { borderColor: theme.accent }]} />
    </View>
  );
}

export function Card({ tone = 'plain', style, ...rest }: ViewProps & { tone?: 'plain' | 'accent' }) {
  const theme = useTheme();
  const accent = tone === 'accent';
  return (
    <ThemedView
      type={accent ? 'accentSurface' : 'backgroundElement'}
      style={[styles.card, { borderColor: accent ? theme.accent : theme.cardEdge }, style]}
      {...rest}
    />
  );
}

/** A card whose children are rows: the sides are its padding, the tops and bottoms are theirs. */
export function ListCard({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.listCard, { borderColor: theme.cardEdge }, style]}
      {...rest}
    />
  );
}

/**
 * A count or a state, small and fully round: «2», «Нове». It carries no tap of its own — whatever
 * it sits on is what is tappable.
 */
export function Pill({ children, tone = 'accent' }: { children: string; tone?: 'accent' | 'quiet' }) {
  const theme = useTheme();
  const accent = tone === 'accent';
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: accent ? theme.accent : theme.backgroundSelected },
      ]}>
      <ThemedText type="overline" themeColor={accent ? 'onAccent' : 'textSecondary'}>
        {children}
      </ThemedText>
    </View>
  );
}

/**
 * The «›» that says a row leads somewhere. Drawn rather than imported: one glyph, in the muted
 * colour, so a tappable row is told apart from a static one without an icon set.
 */
export function Chevron() {
  return (
    <ThemedText type="subtitle" themeColor="textMuted" style={styles.chevron}>
      ›
    </ThemedText>
  );
}

/** One row of a `ListCard`. The last one draws no rule — the card's edge already ends the list. */
export function ListRow({ last, style, ...rest }: ViewProps & { last?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.listRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
        style,
      ]}
      {...rest}
    />
  );
}

/**
 * Something the owner has to read before going on. Two tones only: a quiet one for a fact — the
 * bank is unreachable, what is shown is what was cached — and the danger one for a state that
 * stops something. The fill never carries the meaning alone; the text is coloured too.
 */
export function Banner({
  children,
  tone = 'quiet',
}: {
  children: string;
  tone?: 'quiet' | 'danger';
}) {
  const theme = useTheme();
  const danger = tone === 'danger';
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: danger ? theme.dangerSurface : theme.backgroundSelected },
      ]}>
      <ThemedText type="small" themeColor={danger ? 'textDanger' : 'textSecondary'}>
        {children}
      </ThemedText>
    </View>
  );
}

/**
 * The «Без категорії» mark: a dot beside the label, never a colour over the whole row — a mark
 * that repainted the сума would say something about the money instead of about the label.
 */
export function Mark() {
  const theme = useTheme();
  return <View style={[styles.mark, { backgroundColor: theme.accent }]} />;
}

/** A hairline inside a card — what separates «Залишилось» from the numbers under it. */
export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

/**
 * The heading over a group of cards — «Витратні», «Останні транзакції» — with an optional quiet
 * note on the right, which is where a currency code or a count goes.
 */
export function SectionLabel({
  children,
  note,
  action,
}: {
  children: string;
  note?: string;
  /** The way out of the section — «Усі ›». A quiet link, never a second button on the screen. */
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionLabel}>
      <ThemedText type="overline">{children}</ThemedText>
      <View style={styles.sectionRight}>
        {note ? (
          <ThemedText type="overline" themeColor="textMuted">
            {note}
          </ThemedText>
        ) : null}
        {action ? (
          <SectionAction label={action.label} onPress={action.onPress} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * A filled bar on a track. `value` is a share of the whole, clamped here so no caller can draw
 * past the end of the track — a category at 140 % of its ліміт fills the bar and says the rest in
 * words, which is what the canvas draws.
 */
export function Meter({
  value,
  color = 'textSecondary',
  track = 'backgroundSelected',
}: {
  value: number;
  color?: ThemeColor;
  track?: ThemeColor;
}) {
  const theme = useTheme();
  const filled = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[styles.meterTrack, { backgroundColor: theme[track] }]}>
      <View
        style={[styles.meterFill, { width: `${filled * 100}%`, backgroundColor: theme[color] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  contentUnderOverlay: { paddingBottom: TouchTarget + Spacing.five },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Top-aligned, so the arrow and whatever sits opposite it line up with the title rather than
    // drifting to the middle of a two-line subtitle.
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  headerText: { flex: 1, gap: Spacing.half },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three + Spacing.one,
    gap: Spacing.two,
  },
  listCard: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three + Spacing.one,
  },
  pill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  chevron: { lineHeight: 24 },
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  glowRing: { position: 'absolute', borderRadius: Radius.pill, borderWidth: 1.5 },
  // Mostly outside the card's top-right corner: what crosses it is an arc, not a circle, and it
  // stays out of the way of the figure the card exists to show.
  glowOuter: { width: 190, height: 190, top: -104, right: -84, opacity: 0.35 },
  glowInner: { width: 132, height: 132, top: -74, right: -54, opacity: 0.2 },
  listRow: { paddingVertical: Spacing.three },
  divider: { height: StyleSheet.hairlineWidth },
  mark: { width: 6, height: 6, borderRadius: 3 },
  banner: {
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  sectionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  sectionAction: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  pressed: { opacity: 0.6 },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    // Clear of the tab bar the tabs draw over the bottom of every tab screen.
    bottom: Spacing.six + Spacing.three,
    width: TouchTarget + Spacing.two,
    height: TouchTarget + Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: { lineHeight: TouchTarget, textAlign: 'center', fontWeight: 400 },
  meterTrack: { height: Spacing.one, borderRadius: Spacing.half, overflow: 'hidden' },
  meterFill: { height: '100%' },
});
