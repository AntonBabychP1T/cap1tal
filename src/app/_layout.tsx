import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { db } from '@/db/client';
import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
        // A Stack, not the tabs themselves: editing one transaction, and a category's month list,
        // are pushed on top of whichever tab opened them, so each can be left with «Назад» and
        // neither becomes a tab of its own.
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="category/[month]/[categoryId]" options={{ presentation: 'card' }} />
        </Stack>
      ) : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
