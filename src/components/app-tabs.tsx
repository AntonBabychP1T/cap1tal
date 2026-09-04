import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme, type ImageSourcePropType } from 'react-native';

import { Colors } from '@/constants/theme';
import { TABS, type TabIconKey } from '@/ui/tabs';

/**
 * What fits «Налаштування» across a fifth of a phone; proven on the emulator, not by `verify`.
 *
 * 10, the size the canvas draws. It was 11, and at 11 «Налаштування» — the longest of the five —
 * ran the full width of its fifth and touched the screen's edge. The tab's name is
 * `settings-screen`'s and is not shortened to fit; the label is.
 */
const TAB_LABEL_SIZE = 10;

/**
 * The artwork, keyed the way `tabs.ts` names it.
 *
 * This map cannot move into `tabs.ts` with the rest of the вкладка: Metro resolves `require()` at
 * build time and refuses a variable, so every path has to be written out literally somewhere that
 * bundles. Here is that somewhere.
 */
const ICONS: Record<TabIconKey, ImageSourcePropType> = {
  home: require('@/assets/images/tabIcons/home.png'),
  month: require('@/assets/images/tabIcons/month.png'),
  accounts: require('@/assets/images/tabIcons/accounts.png'),
  reports: require('@/assets/images/tabIcons/reports.png'),
  settings: require('@/assets/images/tabIcons/settings.png'),
};

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    // The вкладка being read is marked by **tone** — `text` against `textMuted`, on both the icon
    // and the label — and by the label's weight.
    //
    // The canvas marks it with the accent, and this bar did for a while. It does not any more:
    // `app-shell` says the accent shall not appear in the tab bar, because it is the app's «this
    // is the action» colour and spending it on navigation would leave it meaning nothing. That
    // requirement is the owner's and it wins over the artboard. The redesign's other two moves
    // stay — the indicator pill is gone and the label is 10.
    //
    // On the non-colour signal `app-shell` requires, and what actually carries it here — checked
    // on the emulator, because this is not visible from the source:
    //
    // Android draws the label of the **open tab only**; the other four are icons alone. So the
    // signal that survives an owner who cannot separate two greys is that exactly one tab has a
    // word under it at all — presence, not colour. That is the platform's behaviour, not this
    // file's doing, and it held before this change too. Dropping the indicator pill therefore did
    // not leave the mark colour-only.
    //
    // The w700 below is real but does nothing *here*: two labels are never on screen at once, so
    // there is nothing to be heavier than. It earns its place on `app-tabs.web.tsx`, which draws
    // all five labels, and on any profile that labels all five. Keep it — do not "simplify" it
    // away on the grounds that this bar looks the same without it.
    //
    // `labelStyle` is written in its `{ default, selected }` form on purpose: expo-router treats
    // any object carrying a `selected` key as that form, so a colour set beside `selected` at the
    // top level reaches nothing and the unselected labels fall back to the platform's own.
    //
    // The size is one step under the platform's 12: «Налаштування» is the longest of the five
    // names and does not fit a fifth of a phone at 12, and it was arriving as «Налаштуван…».
    // The tab's name is `settings-screen`'s and is not shortened to fit — the label is.
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor="transparent"
      rippleColor={colors.backgroundSelected}
      labelStyle={{
        default: { color: colors.textMuted, fontSize: TAB_LABEL_SIZE, fontWeight: '600' },
        selected: { color: colors.text, fontSize: TAB_LABEL_SIZE, fontWeight: '700' },
      }}
      iconColor={colors.textMuted}
      tintColor={colors.text}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.routeName} name={tab.routeName}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICONS[tab.iconKey]} renderingMode="template" />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
