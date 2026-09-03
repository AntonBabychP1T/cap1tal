import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** What fits «Налаштування» across a fifth of a phone; proven on the emulator, not by `verify`. */
const TAB_LABEL_SIZE = 11;

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    // The native tab bar offers a background, an indicator, a label colour and a template PNG —
    // nothing else. So the active tab is marked by tone rather than by the accent: `text` against
    // `textMuted`, which is also what tints the template icons.
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
      indicatorColor={colors.backgroundSelected}
      rippleColor={colors.backgroundSelected}
      labelStyle={{
        default: { color: colors.textMuted, fontSize: TAB_LABEL_SIZE },
        selected: { color: colors.text, fontSize: TAB_LABEL_SIZE },
      }}
      iconColor={colors.textMuted}
      tintColor={colors.text}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Головний</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="month">
        <NativeTabs.Trigger.Label>Місяць</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/month.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounts">
        <NativeTabs.Trigger.Label>Рахунки</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/accounts.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Label>Звіти</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/reports.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Налаштування</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/settings.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
