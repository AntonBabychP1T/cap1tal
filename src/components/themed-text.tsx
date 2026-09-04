import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'default'
  | 'title'
  | 'hero'
  | 'screenTitle'
  | 'rowTitle'
  | 'rowAmount'
  | 'small'
  | 'smallBold'
  | 'subtitle'
  | 'overline'
  | 'caption'
  | 'captionBold'
  | 'note'
  | 'link'
  | 'linkPrimary'
  | 'code';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
  /**
   * Tabular figures. Every сума gets them, so amounts in a column line up digit under digit —
   * the whole reason the стрічка and the Місяць card can be read at a glance.
   */
  tabular?: boolean;
};

/**
 * The colour a type carries when the caller names none. `overline` is a quiet heading and
 * `linkPrimary` is the accent; everything else is the reading colour. A `themeColor` prop still
 * wins — an amount over its ліміт is `textDanger` whatever type draws it.
 */
const DEFAULT_COLOR: Partial<Record<ThemedTextType, ThemeColor>> = {
  overline: 'textSecondary',
  linkPrimary: 'accent',
};

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  tabular,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'hero' && styles.hero,
        type === 'screenTitle' && styles.screenTitle,
        type === 'rowTitle' && styles.rowTitle,
        type === 'rowAmount' && styles.rowAmount,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'overline' && styles.overline,
        type === 'caption' && styles.caption,
        type === 'captionBold' && styles.captionBold,
        type === 'note' && styles.note,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        { color: theme[themeColor ?? DEFAULT_COLOR[type] ?? 'text'] },
        tabular && styles.tabular,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 500,
  },
  /** The one number a screen leads with — «Залишилось». Always tabular, never a label. */
  title: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: 700,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  /**
   * The number a screen leads with when the screen also has to say something else — «усього
   * грошей» over a list of рахунки. One step under `title`, and tabular for the same reason.
   */
  hero: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 700,
    letterSpacing: -1.1,
    fontVariant: ['tabular-nums'],
  },
  /** A screen's own name in its header. */
  screenTitle: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: 700,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 600,
    letterSpacing: -0.3,
  },
  /**
   * A row in a list: its name on the left, its сума on the right. Smaller and heavier than
   * `default`, so a column of сумі reads as one block rather than as a stack of sentences.
   */
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
  rowAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  /** Group heading, field label, currency code — the role `smallBold` used to blur into sums. */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  /**
   * The line *under* a value: a mini-label in a grid cell, «понад ліміт на 170,00» beneath a bar.
   *
   * Deliberately the same 11/14 as `overline` and deliberately nothing else like it. `overline` is
   * a heading — bold, tracked, uppercased — and shouts across a gap; `caption` is a quiet
   * continuation of the thing above it and must not. The canvas draws the two side by side, one
   * naming a section and the other qualifying a сума, so one role could not serve both.
   */
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 500,
  },
  /** A caption carrying a number rather than a word — a count, a share. */
  captionBold: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
  },
  /** A status sentence or a footnote: one step under `small`, still meant to be read. */
  note: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  link: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  linkPrimary: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
    lineHeight: 18,
  },
  tabular: { fontVariant: ['tabular-nums'] },
});
