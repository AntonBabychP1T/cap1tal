import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'default'
  | 'title'
  | 'small'
  | 'smallBold'
  | 'subtitle'
  | 'overline'
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
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'overline' && styles.overline,
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
    fontSize: 40,
    lineHeight: 44,
    fontWeight: 700,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 600,
    letterSpacing: -0.3,
  },
  /** Group heading, field label, currency code — the role `smallBold` used to blur into sums. */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
