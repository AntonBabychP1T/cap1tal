/**
 * The five вкладки the shell offers, as one list.
 *
 * This exists because the set used to be written twice — once per platform bar, in two `.tsx`
 * files `verify` never loads — and the two drifted apart without anything noticing. The order here
 * is not a preference: `settings-screen` puts «Налаштування» last after Головний, Місяць, Рахунки
 * and Звіти, and `reports-screen` puts «Звіти» between «Рахунки» and «Налаштування».
 *
 * Pure data on purpose: no React, no `require`, nothing platform-shaped, so `tabs.test.ts` can
 * hold it. The one thing that cannot live here is the icon artwork — Metro resolves `require()` at
 * build time and refuses a variable, so each bar keeps its own static map from `iconKey` to a file.
 */

/** The name a вкладка's artwork is filed under, in whichever form a bar needs it. */
export type TabIconKey = 'home' | 'month' | 'accounts' | 'reports' | 'settings';

export type Tab = {
  /** The expo-router file name the native bar addresses the screen by. */
  routeName: string;
  /** The path the web bar addresses the same screen by. The two genuinely differ for Головний. */
  href: string;
  /** What the owner reads under the icon. */
  label: string;
  iconKey: TabIconKey;
};

export const TABS: readonly Tab[] = [
  { routeName: 'index', href: '/', label: 'Головний', iconKey: 'home' },
  { routeName: 'month', href: '/month', label: 'Місяць', iconKey: 'month' },
  { routeName: 'accounts', href: '/accounts', label: 'Рахунки', iconKey: 'accounts' },
  { routeName: 'reports', href: '/reports', label: 'Звіти', iconKey: 'reports' },
  { routeName: 'settings', href: '/settings', label: 'Налаштування', iconKey: 'settings' },
] as const;

/**
 * The size, in the platform's scaled units, a вкладка's label is handed so that at any system font
 * scale it still fits the fifth of the bar it sits in — the whole word, never «Головн…».
 *
 * Android's bar takes the label size in sp and multiplies it by the system font scale itself; at
 * 2× «Головний» became 20dp across a fifth of a phone and was cut. A label is allowed to grow with
 * the scale for as long as it has room: `base` is what fits «Налаштування», the longest of the
 * five, so a label of n letters has `base × longest ÷ n` to spend. Past that it stops growing —
 * the number returned is divided back by the scale the platform is about to multiply it by.
 *
 * At a scale of 1 or less every label is `base`, exactly as before, so nothing changes for the
 * owner's default font. Letter count stands in for width — rough, but the five words share one
 * alphabet and one weight, and the longest is the widest.
 */
export function fittedTabLabelSize(label: string, base: number, fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 0 || label.length === 0) {
    return base;
  }
  const longest = Math.max(...TABS.map((tab) => tab.label.length));
  const room = Math.max(base, (base * longest) / label.length);
  const drawn = Math.min(base * fontScale, room);
  return drawn / fontScale;
}
