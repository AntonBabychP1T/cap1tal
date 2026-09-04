import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TABS } from '@/ui/tabs';

/**
 * The web bar. It draws the same five вкладки as the native one, from the same list — it used to
 * write them out itself and had drifted to four, leaving «Звіти» unreachable on this platform
 * against `reports-screen`'s requirement.
 *
 * `TabTrigger`'s `name` is a trigger id rather than a route, so it takes the вкладка's `routeName`
 * simply to have one identifier instead of two; the route it actually navigates to is `href`.
 */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.routeName} name={tab.routeName} href={tab.href} asChild>
              <TabButton>{tab.label}</TabButton>
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        {/* The weight, not just the tint: app-shell requires the marked вкладка to be told apart
            without colour, and this bar marked it with two colours and nothing else.
            `text`, not `accent` — the same requirement keeps the accent out of the tab bar
            altogether, and it carries no platform qualifier. */}
        <ThemedText
          type={isFocused ? 'smallBold' : 'small'}
          themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const theme = useTheme();
  return (
    <View {...props} style={styles.tabListContainer}>
      {/* The edge, not just the fill: the bar floats on the page, and after the retone
          `backgroundElement` on `background` is #0F0D0B on #000000. `cardEdge` is what holds a
          surface against the page — the same move the cards make. */}
      <ThemedView
        type="backgroundElement"
        style={[styles.innerContainer, { borderColor: theme.cardEdge }]}>
        <ThemedText type="smallBold" style={styles.brandText}>
          cap1tal
        </ThemedText>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
