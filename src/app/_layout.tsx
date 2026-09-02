import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { db } from '@/db/client';
import {
  notifications as notificationsRepo,
  reminders as remindersRepo,
  reporting as reportingRepo,
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
import { CrashFallback } from '@/components/crash-fallback';
import { reportCollection } from '@/ui/alerting';
import { dateOfEpochMs } from '@/ui/dates';
import { newId } from '@/ui/id';
import { bindJournal, journal } from '@/ui/journal';
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
 * The two crashes React cannot catch, remembered on their way past.
 *
 * Installed here, at module scope, because this file is the first the router loads — earlier than
 * any effect and earlier than the migrations, so a crash during launch is journaled too (it goes
 * to `journal`'s pre-bind buffer and is written the moment storage arrives). Neither handler
 * catches anything: the spec says these errors are *remembered, not caught*, and a fatal error in
 * release has no tree left to draw a fallback in anyway.
 *
 * The `ErrorUtils` handler chains to the previous one, so the red box in development and the exit
 * in release are exactly what they were.
 */
const previousGlobalHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
  const thrown = error instanceof Error ? error : new Error(String(error));
  journal.record('crash', 'async', `${thrown.message}\n${thrown.stack ?? ''}`);
  previousGlobalHandler(error, isFatal);
});

/**
 * And unanswered promise rejections, through Hermes's own tracker.
 *
 * Under `__DEV__` only, and delegating to React Native's own options object — which is exactly
 * when and how `Libraries/Core/polyfillPromise.js` installs them. Delegation rather than a warning
 * of our own: RN's `onUnhandled` is `ExceptionsManager.handleException(…, isFatal: false)`, a
 * LogBox error, and only `onHandled` warns — so re-emitting a `console.warn` would quietly
 * downgrade development reporting, and installing anything in release would add reporting the
 * platform does not do today. Journal always, then hand over to whatever the platform had.
 */
interface RejectionTrackingOptions {
  allRejections?: boolean;
  onUnhandled?: (id: number, rejection: unknown) => void;
  onHandled?: (id: number) => void;
}

if (__DEV__) {
  // `require`, not `import`: React Native's own options object is a development-only internal, and
  // an `import` would pull it — and `ExceptionsManager` behind it — into the release bundle where
  // nothing ever installs the tracker. This is the one place in the app that reaches for one.
  const platformOptions = (
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    require('react-native/Libraries/promiseRejectionTrackingOptions') as {
      default: RejectionTrackingOptions;
    }
  ).default;
  // Off `globalThis` behind a cast: `HermesInternal` exists only on Hermes, and a bare global
  // reference would be a `ReferenceError` anywhere else.
  const hermes = (
    globalThis as {
      HermesInternal?: {
        enablePromiseRejectionTracker?: (options: RejectionTrackingOptions) => void;
      };
    }
  ).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    ...platformOptions,
    onUnhandled: (id: number, rejection: unknown) => {
      const thrown = rejection instanceof Error ? rejection : new Error(String(rejection));
      journal.record('crash', 'rejection', `${thrown.message}\n${thrown.stack ?? ''}`);
      platformOptions.onUnhandled?.(id, rejection);
    },
    onHandled: (id: number) => platformOptions.onHandled?.(id),
  });
}

/**
 * What replaces a screen that threw while being drawn.
 *
 * expo-router calls the nearest `ErrorBoundary` above the route that failed; this is the root's,
 * and so the last resort. Everything it does is `CrashFallback`'s — the tree this replaced is gone,
 * navigator and theme provider included, so the fallback styles itself and finds its own way back.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return <CrashFallback error={error} retry={retry} />;
}

/**
 * The two singletons the app's own notifications work over: the phone's shade, and the storage
 * that remembers what is outstanding and when the нагадування is set for.
 */
const NOTIFY = { notifications: localNotifications, storage: remindersRepo, now: () => new Date() };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const pathname = usePathname();
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

  /**
   * The журнал gets its storage, once — after the migrations, like every other read in this file.
   * Whatever was recorded before this (a crash during launch, the first route) is buffered and
   * written here, in order. A second call is a no-op, which is what makes `retry` on the crash
   * fallback — which remounts this whole component — safe.
   */
  useEffect(() => {
    if (success) {
      bindJournal(reportingRepo);
    }
  }, [success]);

  /**
   * Every screen the owner opens, recorded in one place (design D3). A route and a moment, never
   * anything they typed; a dynamic segment stays as the concrete path (`/transaction/abc123`),
   * because an id is not a назва and is exactly what reproducing a bug needs.
   *
   * Not gated on `success`: the first route is journaled whether or not storage is ready, and the
   * buffer holds it until it is.
   */
  useEffect(() => {
    journal.record('screen', pathname);
  }, [pathname]);

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
          {/* «Нова транзакція»: the entry form, opened by the «+» on Головний. A static segment
              beside `transaction/[id]`, so the router resolves it to the form and never to the
              editor of a транзакція whose id happens to read "new" (design D1). */}
          <Stack.Screen name="transaction/new" options={{ presentation: 'card' }} />
          {/* The фіскальний чек of a транзакція: the scanner, and the позиції of the чек it
              attached. Pushed over the транзакція's own form, so «Назад» from either lands back
              on the транзакція rather than on the tab beneath it. */}
          <Stack.Screen name="transaction/scan" options={{ presentation: 'card' }} />
          <Stack.Screen name="transaction/receipt" options={{ presentation: 'card' }} />
          <Stack.Screen name="category/[month]/[categoryId]" options={{ presentation: 'card' }} />
          {/* Рухи рахунку: where a tap on a рахунок lands, and where that рахунок's own actions
              live. `account/` and not `accounts/` — the tab already owns `/accounts`. */}
          <Stack.Screen name="account/[id]" options={{ presentation: 'card' }} />
          {/* «Транзакції»: the whole history with its search, reached from the стрічка on
              Головний. Pushed over the tabs and not a sixth tab of its own (design D14). */}
          <Stack.Screen name="transactions" options={{ presentation: 'card' }} />
          {/* «AI-аналіз»: reached from «Звіти», pushed over the tabs like «Транзакції». Nothing
              of it is stored, so it has no state to restore and no place in the tab bar. */}
          <Stack.Screen name="ai-analysis" options={{ presentation: 'card' }} />
          {/* The Налаштування sections. `manage/` rather than `settings/` for the reason the
              category screen gives about `month/`: the tab already owns `/settings`. */}
          <Stack.Screen name="manage/categories" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/sources" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/rules" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/monobank" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/notifications" options={{ presentation: 'card' }} />
          {/* «Репорти про помилки»: the list, the form and one saved репорт. `new` is a static
              segment beside `[id]`, the same shape `transaction/new` has. */}
          <Stack.Screen name="manage/bug-reports/index" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/bug-reports/new" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage/bug-reports/[id]" options={{ presentation: 'card' }} />
          {/* The lever the emulator smoke pulls to see the crash fallback: a route that throws
              while rendering, in a development build only, reachable by deep link and linked to
              from nowhere (design D12). */}
          <Stack.Screen name="crash" options={{ presentation: 'card' }} />
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
