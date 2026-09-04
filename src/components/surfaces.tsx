import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing, TouchTarget, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type IconName } from '@/ui/icons';

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
  footer,
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
   * A block pinned under the column instead of floating over it — the «Зберегти» a form ends
   * with. Unlike `overlay` it takes its own height out of the scroll area, so nothing is ever
   * hidden beneath it and no bottom padding has to be guessed. A screen has one or the other:
   * `Fab` sits where a footer would be, and the two would land on top of each other.
   */
  footer?: React.ReactNode;
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
        {footer}
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
        {/* `screenTitle`, not `subtitle`: the header is its own role now, and `subtitle` stays
            the step a card's own heading wears. The «←» beside it keeps `subtitle` — it is a
            glyph sized to be tapped, not a word sized to be read. */}
        <ThemedText type="screenTitle" themeColor={danger ? 'textDanger' : undefined}>
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
 *
 * The two opacities are props because the artboards draw the same rings at two strengths — .35/.20
 * over the Головний hero and .30/.16 over the quieter one — and two components differing by four
 * hundredths would be two components to keep in step. The defaults are what the one caller already
 * draws, so passing nothing changes nothing.
 */
export function CardGlow({ outer = 0.35, inner = 0.2 }: { outer?: number; inner?: number } = {}) {
  const theme = useTheme();
  return (
    <View style={styles.glow} pointerEvents="none">
      <View
        style={[styles.glowRing, styles.glowOuter, { borderColor: theme.accent, opacity: outer }]}
      />
      <View
        style={[styles.glowRing, styles.glowInner, { borderColor: theme.accent, opacity: inner }]}
      />
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
 * The «›» that says a row leads somewhere.
 *
 * It used to be the character, set in `subtitle` — there was no icon set to take it from. Now
 * there is, so it is the `chevronRight` glyph, and it changed here rather than in the new rows
 * beside it: eight rows across Головний and Звіти already draw this one, and a second chevron
 * next to them would be exactly the private copy of the vocabulary this change exists to stop.
 * One edit here carries the redesign to all eight.
 *
 * `textFaint` rather than `textMuted` — the role added for precisely this. The mark only has to
 * be *there*; nothing about a chevron is read.
 */
export function Chevron() {
  return <Icon name="chevronRight" size={16} color="textFaint" />;
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
  icon,
  count,
  note,
  action,
}: {
  children: string;
  /** A glyph before the heading, in the same quiet tone the heading is set in. */
  icon?: IconName;
  /**
   * How many things are under the heading, as a pill beside it — «Ліміти 4». A number, so a
   * section with nothing in it says «0» rather than leaving the caller to decide whether the
   * count appears at all.
   */
  count?: number;
  note?: string;
  /** The way out of the section — «Усі ›». A quiet link, never a second button on the screen. */
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionLabel}>
      <View style={styles.sectionHeading}>
        {icon ? <Icon name={icon} size={14} color="textSecondary" /> : null}
        <ThemedText type="overline">{children}</ThemedText>
        {count === undefined ? null : <Pill tone="quiet">{String(count)}</Pill>}
      </View>
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
 * A share of a whole, as the two things that draw one both need it: between 0 and 1, and never
 * `NaN`. A category at 140 % of its ліміт fills the bar and says the rest in words; a ціль with no
 * amount yet must not make a ring vanish or a bar run backwards.
 *
 * One function because `Meter` and `ProgressRing` are 300 lines apart in this file and must agree:
 * a docstring saying "clamped exactly as `Meter` clamps it" is not something that holds itself.
 */
function share(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * A filled bar on a track. `value` is a share of the whole, clamped by `share` so no caller can
 * draw past the end of the track.
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
  const filled = share(value);
  return (
    <View style={[styles.meterTrack, { backgroundColor: theme[track] }]}>
      <View
        style={[styles.meterFill, { width: `${filled * 100}%`, backgroundColor: theme[color] }]}
      />
    </View>
  );
}

/** The side of a row's icon tile. `RoundIconButton` is drawn at 40 and tapped at `TouchTarget`. */
const TILE = 36;
const ROUND_BUTTON = 40;

/**
 * The square a row's glyph sits in: `Radius.tile` on `backgroundInset`, which is the one step off
 * a card the dark theme has left now that the card is nearly the page. It is a surface, not a
 * control — whatever it sits on is what is tappable.
 */
export function IconTile({
  name,
  tone = 'textSecondary',
  size = TILE,
}: {
  name: IconName;
  /** The glyph's colour. A категорія over its ліміт tiles in `textDanger`, дохід in `textPositive`. */
  tone?: ThemeColor;
  /** The tile's side. The artboards draw one size on rows and a larger one on a hero card. */
  size?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.iconTile,
        { width: size, height: size, backgroundColor: theme.backgroundInset },
      ]}>
      <Icon name={name} size={Math.round(size * 0.56)} color={tone} />
    </View>
  );
}

/**
 * The row nearly every list in the artboards is made of: a glyph in its tile, a title with an
 * optional quiet line under it, and whatever the row is worth on the right.
 *
 * `onPress` is what draws the chevron — a row that leads somewhere says so, and a row that does
 * not never wears the mark. The chevron is `textFaint`, the tone that exists for exactly this: it
 * has to be *there*, and nothing about it has to be read.
 */
export function IconRow({
  icon,
  iconTone,
  title,
  note,
  right,
  onPress,
  last,
}: {
  icon: IconName;
  iconTone?: ThemeColor;
  title: string;
  /** The second line: a date, the рахунок a транзакція was on, what is left of a ліміт. */
  note?: string;
  /** What the row is worth — usually a `ThemedText type="rowAmount"`, sometimes a `Pill`. */
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={styles.iconRow}>
      <IconTile name={icon} tone={iconTone} />
      <View style={styles.iconRowText}>
        <ThemedText type="rowTitle" numberOfLines={1}>
          {title}
        </ThemedText>
        {note ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {note}
          </ThemedText>
        ) : null}
      </View>
      {right}
      {onPress ? <Chevron /> : null}
    </View>
  );

  return (
    <ListRow last={last}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => (pressed ? styles.pressed : null)}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </ListRow>
  );
}

/**
 * A control that is one glyph: the way off a screen, the way into пошук. It names itself, because
 * a glyph on its own says nothing to a screen reader — `label` is required for that reason.
 *
 * Drawn at 40 and tapped at 48: `TouchTarget` is the smallest a tappable thing may be whatever its
 * visible size, and the hit slop is what makes the two agree.
 */
export function RoundIconButton({
  icon,
  label,
  onPress,
  tone = 'quiet',
}: {
  icon: IconName;
  /** What a screen reader says. Not drawn. */
  label: string;
  onPress: () => void;
  /** `accent` is the screen's own action; there is never more than one of those on a screen. */
  tone?: 'quiet' | 'accent';
}) {
  const theme = useTheme();
  const accent = tone === 'accent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={(TouchTarget - ROUND_BUTTON) / 2}
      style={({ pressed }) => [
        styles.roundButton,
        { backgroundColor: accent ? theme.accent : theme.backgroundInset },
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={20} color={accent ? 'onAccent' : 'textSecondary'} />
    </Pressable>
  );
}

/**
 * One cell of the figures grid: a glyph, what the figure is, and the figure. Grows to fill its
 * share of the row it is in, so a caller lays out two or three per row by putting them in a
 * `flexDirection: 'row'` with a gap and nothing else.
 */
export function StatTile({
  icon,
  label,
  value,
  tone,
  note,
}: {
  icon: IconName;
  /** What the figure is — «Витрачено», «Залишилось». Set small; the figure is what is read. */
  label: string;
  /** Already formatted. This is a surface: it never touches a сума. */
  value: string;
  /** The figure's colour — `textDanger` over a ліміт, `textPositive` for дохід. */
  tone?: ThemeColor;
  /** A third line, quieter still: a share, a count, a comparison with last month. */
  note?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.statTile, { backgroundColor: theme.backgroundInset }]}>
      <Icon name={icon} size={16} color="textSecondary" />
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="rowAmount" themeColor={tone} numberOfLines={1}>
        {value}
      </ThemedText>
      {note ? (
        <ThemedText type="caption" themeColor="textMuted" numberOfLines={1}>
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * A `ListRow` built around the one bar the app draws: what the bar is for, what it is worth, and
 * the bar. The optional second line is where the sentence goes that the bar cannot say — how much
 * of a ліміт is left, or by how much it is past.
 */
export function MeterRow({
  title,
  amount,
  value,
  color,
  note,
  noteTone = 'textSecondary',
  last,
}: {
  title: string;
  /** Already formatted, and set in `rowAmount` so it lines up with the row above it. */
  amount: string;
  /** The bar's share of the whole, clamped by `Meter` itself. */
  value: number;
  color?: ThemeColor;
  note?: string;
  noteTone?: ThemeColor;
  last?: boolean;
}) {
  return (
    <ListRow last={last} style={styles.meterRow}>
      <View style={styles.meterRowHead}>
        <ThemedText type="rowTitle" numberOfLines={1} style={styles.meterRowTitle}>
          {title}
        </ThemedText>
        <ThemedText type="rowAmount">{amount}</ThemedText>
      </View>
      <Meter value={value} color={color} />
      {note ? (
        <ThemedText type="caption" themeColor={noteTone}>
          {note}
        </ThemedText>
      ) : null}
    </ListRow>
  );
}

/**
 * A footnote: the step below `Banner`. A `Banner` is something the owner has to read before going
 * on; this is something they may want to know and can ignore — how a figure was arrived at, what a
 * screen does not count. It has one tone on purpose. Anything that has to stop the owner is a
 * `Banner tone="danger"`, and a footnote that turned red would be pretending to be one.
 */
export function NoteBlock({ children, icon }: { children: string; icon?: IconName }) {
  const theme = useTheme();
  return (
    <View style={[styles.noteBlock, { backgroundColor: theme.backgroundInset }]}>
      {icon ? <Icon name={icon} size={14} color="textMuted" /> : null}
      <ThemedText type="note" themeColor="textMuted" style={styles.noteBlockText}>
        {children}
      </ThemedText>
    </View>
  );
}

/**
 * The ring: a share drawn round instead of along a bar, with whatever the share is *about* in the
 * middle. The artboards draw it at three sizes — 64 beside a ціль, 96 on a card, 210 as a screen's
 * one figure — and this is one component, because the only thing that differs between them is the
 * number: the stroke scales with the diameter so a small ring is not a heavier ring.
 *
 * `value` goes through the same `share` as `Meter`'s — one function, so the two cannot drift. At
 * nought nothing is drawn: a round cap on an empty arc is a dot, and a dot at twelve o'clock reads
 * as progress that has not happened.
 */
export function ProgressRing({
  value,
  size = 96,
  thickness,
  color = 'accent',
  track = 'backgroundSelected',
  children,
}: {
  value: number;
  size?: number;
  /** Overrides the diameter-proportional default. Rarely wanted; it is here for the odd artboard. */
  thickness?: number;
  color?: ThemeColor;
  track?: ThemeColor;
  /** What the ring is about, centred in it — a percentage, a сума, a count. */
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const stroke = thickness ?? Math.max(4, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = share(value);
  const centre = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={theme[track]}
          strokeWidth={stroke}
          fill="none"
        />
        {filled > 0 ? (
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={theme[color]}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            strokeLinecap="round"
            // SVG starts an arc at three o'clock; a ring the owner reads starts at twelve.
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ) : null}
      </Svg>
      {children ? (
        <View style={styles.ringCentre} pointerEvents="none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The one card a screen leads with: a `Card` at `Radius.hero` with the accent rings behind it.
 * Never two on a screen — a page with two things to lead with has neither.
 *
 * It is `Card` and not a copy of it, so the fill, the edge and the padding stay one decision. What
 * it adds is the corner and the rings, and the rings' strength is passed through because the
 * artboards draw them at two.
 */
export function HeroCard({
  glow = 0.35,
  glowInner = 0.2,
  style,
  children,
  ...rest
}: ViewProps & {
  /** The outer ring's opacity — .35 over Головний, .30 over the quieter hero. */
  glow?: number;
  /** The inner ring's, which always trails the outer one. */
  glowInner?: number;
}) {
  return (
    <Card style={[styles.heroCard, style]} {...rest}>
      <CardGlow outer={glow} inner={glowInner} />
      {children}
    </Card>
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
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  glowRing: { position: 'absolute', borderRadius: Radius.pill, borderWidth: 1.5 },
  // Mostly outside the card's top-right corner: what crosses it is an arc, not a circle, and it
  // stays out of the way of the figure the card exists to show.
  glowOuter: { width: 190, height: 190, top: -104, right: -84 },
  glowInner: { width: 132, height: 132, top: -74, right: -54 },
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
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    // Tighter than the gap to the section's own action: a glyph and a count belong *to* the
    // heading, and reading as one thing is what says so.
    gap: Spacing.oneHalf,
    flexShrink: 1,
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
  iconTile: {
    borderRadius: Radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  // `minWidth: 0` so a long name shortens itself instead of pushing the сума off the row.
  iconRowText: { flex: 1, minWidth: 0, gap: Spacing.half },
  roundButton: {
    width: ROUND_BUTTON,
    height: ROUND_BUTTON,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radius.field,
    padding: Spacing.twoHalf,
    gap: Spacing.half,
  },
  meterRow: { gap: Spacing.two },
  meterRowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  meterRowTitle: { flex: 1, minWidth: 0 },
  noteBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.oneHalf,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
  },
  noteBlockText: { flex: 1, minWidth: 0 },
  ringCentre: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: { borderRadius: Radius.hero, overflow: 'hidden' },
  meterTrack: { height: Spacing.one, borderRadius: Spacing.half, overflow: 'hidden' },
  meterFill: { height: '100%' },
});
