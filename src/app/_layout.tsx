import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { db } from '@/db/client';
import {
  notifications as notificationsRepo,
  reminders as remindersRepo,
  rules as rulesRepo,
} from '@/db/repos';
import { seedStarterSet } from '@/db/seed';
import { useOnForeground } from '@/hooks/use-on-foreground';
import {
  localNotifications,
  onNotificationTapped,
  tappedOnColdStart,
} from '@/platform/local-notifications-device';
import { notificationAccess } from '@/platform/notification-access-device';
import { notificationCapture } from '@/platform/notification-capture-device';
import { reportCollection } from '@/ui/alerting';
import { dateOfEpochMs } from '@/ui/dates';
import { newId } from '@/ui/id';
import { drainCaptures } from '@/ui/notification-drain';
import { reconcileOnLaunch } from '@/ui/reminder-schedule';
import migrations from '../../drizzle/migrations';

/**
 * The navigator's own palette. React Navigation paints the surface a pushed screen slides over
 * and the space around it; left on its defaults it would flash white under the warm light theme
 * and a different black under the dark one. Same tokens, so there is one palette in the app.
 */
const navigationTheme = {
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: Colors.dark.background,
      card: Colors.dark.backgroundElement,
      text: Colors.dark.text,
      border: Colors.dark.border,
      primary: Colors.dark.accent,
    },
  },
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: Colors.light.background,
      card: Colors.light.backgroundElement,
      text: Colors.light.text,
      border: Colors.light.border,
      primary: Colors.light.accent,
    },
  },
};

SplashScreen.preventAutoHideAsync();

/**
 * The two singletons the app's own notifications work over: the phone's shade, and the storage
 * that remembers what is outstanding and when the нагадування is set for.
 */
const NOTIFY = { notifications: localNotifications, storage: remindersRepo, now: () => new Date() };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
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

  // The waiting captured notifications, collected when the app opens and again every time it comes
  // back to the foreground — which is also how granting access refreshes: the system «Доступ до
  // сповіщень» screen is another app, so returning from it is a foreground transition.
  //
  // Everything this does is `drainCaptures`, which `verify` proves against the in-memory capture
  // port and a real database. Here there is only the trigger and the one condition: no access, no
  // collection. Storage waits for the migrations, like every other read in this file.
  //
  // One drain at a time: opening and a foreground event can land together, and two loops over one
  // collection would each acknowledge a prefix — safe for the money (the fingerprint leads every
  // commit) but able to forget a record captured between the two. A ref rather than a local,
  // because the two triggers are two different effects over the same one queue.
  const draining = useRef(false);
  const collect = useCallback(async () => {
    // Claimed before the first await, or two calls started in one tick would both get past it.
    if (!success || draining.current) {
      return;
    }
    draining.current = true;
    try {
      // Whether the транзакції the owner expects are still arriving — the one question every
      // branch below answers, and `reportCollection` is what turns each answer into a сповіщення
      // or into silence. Unattended throughout: this runs precisely while the app is open, and
      // nothing on screen says a word about it either way (design D5, D5a).
      const access = await notificationAccess.state();
      const watched = notificationsRepo.watches().length > 0;
      if (access !== 'granted') {
        await reportCollection({ access, watched, failed: false }, NOTIFY);
        return;
      }
      const report = await drainCaptures({
        capture: notificationCapture,
        storage: notificationsRepo,
        rules: () => rulesRepo.list(),
        newId,
        dateOf: dateOfEpochMs,
        now: () => new Date(),
      });
      await reportCollection({ access, watched, failed: report.failure !== undefined }, NOTIFY);
    } finally {
      draining.current = false;
    }
  }, [success]);

  /** Opening the app: whatever waited while it was not running. */
  useEffect(() => {
    void collect();
  }, [collect]);

  /** And every return to it, which is the other half of the requirement's WHEN. */
  useOnForeground(
    useCallback(() => {
      void collect();
    }, [collect]),
  );

  /**
   * The нагадування, re-asserted rather than checked, once the migrations have run — the storage
   * this reads is the same one they prepare.
   *
   * A reboot the system did not survive, a permission revoked while the app was closed, a
   * restored бекап whose setting arrived with nothing arranged and a phone carried into another
   * time zone are not four cases here: they are one `reconcile`, applied (design D12).
   */
  useEffect(() => {
    if (success) {
      void reconcileOnLaunch(NOTIFY);
    }
  }, [success]);

  /**
   * A tapped notification, in the two ways it arrives: the response waiting from a launch the app
   * was not running for, read once and cleared, and the subscription for taps while it is. Both
   * after the migrations, because every screen a tap can land on reads storage.
   *
   * The route is `routeOf`'s and no one else's — the app opens only a screen it defines, and
   * anything else opens Головний (design D10).
   */
  useEffect(() => {
    if (!success) {
      return;
    }
    const cold = tappedOnColdStart();
    if (cold) {
      router.push(cold);
    }
    return onNotificationTapped((route) => router.push(route));
  }, [router, success]);

  // One root in every branch: AnimatedSplashOverlay is the only caller of SplashScreen.hideAsync,
  // so it must render even when migrations fail — otherwise the native splash never lifts and the
  // error below stays invisible. Keeping the tree shape stable also stops the splash replaying
  // when migrations finish.
  return (
    <ThemeProvider value={colorScheme === 'dark' ? navigationTheme.dark : navigationTheme.light}>
      <AnimatedSplashOverlay />
      {error ? (
        <View
          style={[
            styles.failure,
            { backgroundColor: Colors[colorScheme === 'dark' ? 'dark' : 'light'].background },
          ]}>
          <Text
            style={{ color: Colors[colorScheme === 'dark' ? 'dark' : 'light'].textDanger }}>
            Не вдалося підготувати сховище: {error.message}
          </Text>
        </View>
      ) : success ? (
        // A Stack, not the tabs themselves: editing one transaction, and a category's month list,
        // are pushed on top of whichever tab opened them, so each can be left with «Назад» and
        // neither becomes a tab of its own.
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="category/[month]/[categoryId]" options={{ presentation: 'card' }} />
          {/* Рухи рахунку: where a tap on a рахунок lands, and where that рахунок's own actions
              live. `account/` and not `accounts/` — the tab already owns `/accounts`. */}
          <Stack.Screen name="account/[id]" options={{ presentation: 'card' }} />
          {/* «Транзакції»: the whole history with its search, reached from the стрічка on
              Головний. Pushed over the tabs and not a sixth tab of its own (design D14). */}
          <Stack.Screen name="transactions" options={{ presentation: 'card' }} />
          {/* The Налаштування sections. `manage/` rather than `settings/` for the reason the
              category screen gives about `month/`: the tab already owns `/settings`. */}
          <Stack.Screen name="manage/categories" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/sources" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/rules" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/monobank" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/notifications" options={{ presentation: 'card' }} />
          {/* «Перші кроки»: pushed like the management screens, and where a device holding
              nothing at all lands from Головний. */}
          <Stack.Screen name="onboarding" options={{ presentation: 'card' }} />
        </Stack>
      ) : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
