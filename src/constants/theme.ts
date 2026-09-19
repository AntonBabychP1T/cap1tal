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
    /**
     * A surface set *into* a card: the tile behind a row's icon, the block a collapsed remainder
     * sits on. One visible step off `backgroundElement`, in whichever direction the theme has room
     * for — darker here, lighter on dark, where the card is already almost the page.
     */
    backgroundInset: '#F1ECE2',
    /** Hairline inside a card — the rule between two rows. */
    border: '#E2DACB',
    /**
     * The edge around a card. On the dark theme the page is black and a card only a few steps off
     * it, so the card needs an outline to read as an object rather than as a patch of lighter
     * paint; on the light theme the same edge is quieter than the rule inside.
     */
    cardEdge: '#E7DFD0',
    textSecondary: '#6B6459',
    /** Placeholder and archived text — not meant to be read, so it need not carry contrast. */
    textMuted: '#918878',
    /**
     * One step below `textMuted`: a chevron, a pairing arrow, a mark that only has to be *there*.
     * Nothing the owner must read is drawn in it — if it carries a word, use `textMuted`.
     */
    textFaint: '#B0A797',
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
    /**
     * A card is now nearly as dark as the page it sits on: black stays black, and what makes a
     * card an object is its edge, not a patch of lighter paint. `cardEdge` carries that weight.
     */
    backgroundElement: '#0F0D0B',
    backgroundSelected: '#26221D',
    backgroundInset: '#141210',
    border: '#1E1A15',
    cardEdge: '#221E19',
    textSecondary: '#9C948A',
    textMuted: '#6B645B',
    textFaint: '#4A443C',
    accent: '#D9A441',
    onAccent: '#17150F',
    accentSurface: '#2A2115',
    textDanger: '#E4695C',
    dangerSurface: '#33211F',
    textPositive: '#93B183',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Chip, button and banner, card, bottom sheet, and the fully round pill a count or the «+» wears.
 * No shadows anywhere — the tone and a hairline are what say which layer a surface is on.
 */
export const Radius = {
  chip: 9,
  /** The square a row's leading glyph sits in. */
  tile: 10,
  control: 12,
  /** A typed-into or tapped-through field: the search bar, a numpad key, a half-width tile. */
  field: 14,
  card: 16,
  /** The one card a screen leads with, when it leads with one. Never two on a screen. */
  hero: 18,
  sheet: 22,
  pill: 999,
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
  oneHalf: 6,
  two: 8,
  twoHalf: 12,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** The smallest a tappable thing may be, whatever its visible size. */
export const TouchTarget = 48;

export const MaxContentWidth = 800;
