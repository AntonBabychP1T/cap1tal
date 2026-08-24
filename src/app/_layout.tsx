import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { db } from '@/db/client';
import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // The one place migrations are applied: every committed migration, in order, before any screen
  // reads storage. See .claude/rules/database.md.
  const { success, error } = useMigrations(db, migrations);

  // One root in every branch: AnimatedSplashOverlay is the only caller of SplashScreen.hideAsync,
  // so it must render even when migrations fail — otherwise the native splash never lifts and the
  // error below stays invisible. Keeping the tree shape stable also stops the splash replaying
  // when migrations finish.
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {error ? (
        <View style={styles.failure}>
          <Text>Не вдалося підготувати сховище: {error.message}</Text>
        </View>
      ) : success ? (
        <AppTabs />
      ) : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
