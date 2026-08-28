/**
 * The design tokens: palette A «Графіт і вохра», one warm dark theme and its light derivative.
 *
 * Names are roles, never colours — `accent`, `textDanger`, `border` — so a screen says what a
 * thing *is* and the theme decides how it looks. Nothing outside this file writes a hex value.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1915',
    background: '#F7F4EE',
    backgroundElement: '#FFFDF8',
    backgroundSelected: '#ECE5D8',
    /** Hairline inside a card. The app groups by tone, so borders live only there. */
    border: '#E2DACB',
    textSecondary: '#6B6459',
    /** Placeholder and archived text — not meant to be read, so it need not carry contrast. */
    textMuted: '#918878',
    /** The one accent: the screen's main action and the current choice. */
    accent: '#9A6A12',
    /** Text on an accent fill. Dark on ochre, never white. */
    onAccent: '#FFFDF8',
    /** Tint behind a selected chip; `accent` is what reads on it. */
    accentSurface: '#F3E7CE',
    /** The one red the app uses: a category over its ліміт, a ціль past its дата. */
    textDanger: '#B23A30',
    /** Fill behind an error banner or an over-limit bar. A fill never carries text alone. */
    dangerSurface: '#F6E2DF',
    /** Muted sage: дохід, a reached ціль. Never «all good» in general. */
    textPositive: '#4C7A44',
  },
  dark: {
    text: '#E8E1D5',
    background: '#000000',
    backgroundElement: '#1A1714',
    backgroundSelected: '#26221D',
    border: '#2B2721',
    textSecondary: '#9C948A',
    textMuted: '#6B645B',
    accent: '#D9A441',
    onAccent: '#17150F',
    accentSurface: '#2A2115',
    textDanger: '#E4695C',
    dangerSurface: '#33211F',
    textPositive: '#93B183',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Chip, button and banner, card, bottom sheet. No shadows anywhere — the tone is the layer. */
export const Radius = {
  chip: 9,
  control: 12,
  card: 14,
  sheet: 22,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** The smallest a tappable thing may be, whatever its visible size. */
export const TouchTarget = 48;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
