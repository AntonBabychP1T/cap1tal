import { Pressable, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
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
}: {
  children: React.ReactNode;
  /**
   * Lent out so a screen can scroll its own column — Головний shows itself from the top when the
   * tab is opened again. `Screen` is a surface: it hands the ref over and knows nothing of
   * navigation, so exactly the screens that ask for the behaviour have it.
   */
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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

export function Card({ style, ...rest }: ViewProps) {
  return <ThemedView type="backgroundElement" style={[styles.card, style]} {...rest} />;
}

/** A card whose children are rows: the sides are its padding, the tops and bottoms are theirs. */
export function ListCard({ style, ...rest }: ViewProps) {
  return <ThemedView type="backgroundElement" style={[styles.listCard, style]} {...rest} />;
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
export function SectionLabel({ children, note }: { children: string; note?: string }) {
  return (
    <View style={styles.sectionLabel}>
      <ThemedText type="overline">{children}</ThemedText>
      {note ? (
        <ThemedText type="overline" themeColor="textMuted">
          {note}
        </ThemedText>
      ) : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Top-aligned, so the arrow and whatever sits opposite it line up with the title rather than
    // drifting to the middle of a two-line subtitle.
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  headerText: { flex: 1, gap: Spacing.half },
  card: { borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  listCard: { borderRadius: Radius.card, paddingHorizontal: Spacing.three },
  listRow: { paddingVertical: Spacing.three - Spacing.half },
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
    paddingHorizontal: Spacing.half,
  },
  meterTrack: { height: Spacing.one, borderRadius: Spacing.half, overflow: 'hidden' },
  meterFill: { height: '100%' },
});
