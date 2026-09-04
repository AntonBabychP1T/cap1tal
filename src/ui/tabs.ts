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
