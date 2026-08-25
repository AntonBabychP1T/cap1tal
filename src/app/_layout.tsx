import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { db } from '@/db/client';
import { seedStarterSet } from '@/db/seed';
import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // The one place migrations are applied: every committed migration, in order, before any screen
  // reads storage. See .claude/rules/database.md.
  const { success, error } = useMigrations(db, migrations);

  // Right after the migrations: the owner's starter категорії and джерела. Create-if-missing, so
  // running it on every open costs one statement and can never undo a rename or an archive — see
  // src/db/seed.ts.
  //
  // Not before the first screen read, though — `useReloadOnFocus` reads during render, and a
  // child renders before this effect runs. On a genuinely fresh install the very first paint can
  // therefore show only the three reserved rows migration 0003 inserted; the next focus has the
  // whole list. Nothing can be recorded at that moment anyway (no рахунок exists yet), so the
  // window is real but empty.
  useEffect(() => {
    if (success) {
      seedStarterSet(db);
    }
  }, [success]);

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
        // A Stack, not the tabs themselves: editing one transaction, and a category's month list,
        // are pushed on top of whichever tab opened them, so each can be left with «Назад» and
        // neither becomes a tab of its own.
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="category/[month]/[categoryId]" options={{ presentation: 'card' }} />
          {/* The Налаштування sections. `manage/` rather than `settings/` for the reason the
              category screen gives about `month/`: the tab already owns `/settings`. */}
          <Stack.Screen name="manage/categories" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/sources" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/rules" options={{ presentation: 'card' }} />
        </Stack>
      ) : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
