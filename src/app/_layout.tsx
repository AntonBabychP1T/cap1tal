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
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { db } from '@/db/client';
import {
  monobank as monobankRepo,
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
import { syncDue } from '@/monobank/auto';
import { syncPorts } from '@/hooks/monobank-ports';
import { ALERT_PORTS } from '@/hooks/use-alerting';
import { reportCollection } from '@/ui/alerting';
import { dateOfEpochMs } from '@/ui/dates';
import { newId } from '@/ui/id';
import { bindJournal, journal, reportFailure } from '@/ui/journal';
import { startSync } from '@/ui/monobank-sync';
import { drainCaptures } from '@/ui/notification-drain';
import { reconcileOnLaunch } from '@/ui/reminder-schedule';
import { sweepCaptures } from '@/ui/bug-report-here';
import { screenCapture } from '@/platform/screen-capture-device';
import { BugReportHere } from '@/components/bug-report-here';
import { CAPTURE_DEFAULTS, type CaptureSettings } from '@/db/reporting-repo';
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

/**
 * The last sync attempt as `syncDue` wants it: a moment, or nothing at all on a device that has
 * attempted none. Spelled out here because `attemptedAtMs: undefined` and an absent key are the
 * same thing to `syncDue` but not to `exactOptionalPropertyTypes`.
 */
function attemptOf(): { attemptedAtMs?: number } {
  const attempt = monobankRepo.attempt();
  return attempt ? { attemptedAtMs: attempt.attemptedAtMs } : {};
}

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
   * And the monobank sync, on the same two triggers, so «відкрив cap1tal» is when the money
   * arrives rather than four taps into Налаштування.
   *
   * Everything decided here is `syncDue`'s and `startSync`'s, both proven under `verify`: whether
   * the quiet interval has passed, and that two runs never overlap. What is left is the trigger,
   * and one thing only this file knows — whether storage is ready.
   *
   * No `cancelled` port, deliberately (design D4). Pages commit as they are read and an account's
   * moment moves only when it completes, so a run the OS suspends either resumes and finishes or
   * leaves a cursor that is valid to resume from; cancelling on background would mean a first sync
   * of three рахунки, which needs four minutes, never finishing at all.
   *
   * `attended: true` is a fact, not a guess: this run exists *because* the app was opened or
   * foregrounded, so the owner is in it, and Головний says what happened in «Потребує уваги» in
   * more words than a notification may carry (design D5).
   */
  const syncNow = useCallback(async (): Promise<void> => {
    if (!success) {
      return;
    }
    if (!syncDue({ links: monobankRepo.listLinks().length, nowMs: Date.now(), ...attemptOf() })) {
      return;
    }
    // No `onProgress` and no `cancelled`: this run reports nowhere and stops for nothing.
    await startSync({
      sync: syncPorts(),
      attempts: monobankRepo,
      alerts: ALERT_PORTS,
      attended: true,
    });
  }, [success]);

  /**
   * A run that throws outright — storage refusing a read, rather than any outcome the coordinator
   * has a word for — is journaled and goes no further. Without this it is an unhandled rejection
   * on the app's launch path, which in release is a red box nobody can act on.
   */
  const syncQuietly = useCallback(() => {
    syncNow().catch((thrown: unknown) => {
      reportFailure('monobank-sync', thrown);
    });
  }, [syncNow]);

  useEffect(syncQuietly, [syncQuietly]);

  useOnForeground(syncQuietly);

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
   * Everything a capture ever wrote, swept once at launch.
   *
   * Every exit path in the sheet discards its own file — but a process that died between the
   * capture and the save took its exit path with it, and that is exactly when litter would
   * otherwise accumulate. This is what makes «a cancelled репорт leaves nothing behind» true
   * rather than merely intended (design D5).
   *
   * Not gated on `success`: the cache is a directory, not a table, so there is nothing for the
   * migrations to prepare and a launch that cannot open storage should still tidy up after itself.
   */
  useEffect(() => {
    void sweepCaptures(screenCapture);
  }, []);

  /**
   * The two switches that decide how a репорт may be filed from the screen the owner is on.
   *
   * Read after the migrations, and again whenever the owner leaves «Репорти про помилки» — the
   * switches are written on that pushed screen while the thing they govern lives here, beneath it,
   * so a switch would otherwise not land until the next launch. One row, on a navigation the owner
   * just made; a context provider for two booleans that change twice in the life of a phone would
   * be more machinery than the problem (design D10).
   */
  // Read during render rather than cached in state: synchronous SQLite makes re-querying the
  // simplest correct thing (`use-reload-on-focus.ts` says so for the screens), it is one row of
  // one table, and it means a switch the owner just flipped is in effect the moment they navigate
  // back — with no effect, no provider and nothing to keep in step.
  const capture: CaptureSettings = success ? reportingRepo.captureSettings() : CAPTURE_DEFAULTS;

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
    // `GestureHandlerRootView` at the very root, which is RNGH's documented requirement and the
    // real cost of the two-finger gesture: its Android root view intercepts and re-dispatches
    // touches for the whole tree. Nothing in the app mounted one before, so the emulator pass
    // (tasks 8.1–8.5) walks every tab, a long list and a form with the keyboard up before this is
    // believed. `flex: 1` is not optional — without it the whole app lays out at zero height.
    <GestureHandlerRootView style={styles.root}>
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
            {/* The breakdown of one ціль-накопичення, pushed over «Звіти» like «Рухи рахунку». */}
            <Stack.Screen name="goal/[id]" options={{ presentation: 'card' }} />
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
        {/* Above the Stack and not inside it (design D4): an overlay writes no `screen` entry, so
            the last one in the журнал stays the screen the owner is complaining about, «Скасувати»
            returns them to a half-typed form untouched, and no navigation animation can race the
            capture. It draws nothing at all until the owner asks. */}
        {success ? <BugReportHere settings={capture} /> : null}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
