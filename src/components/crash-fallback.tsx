import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { BugReportForm } from './bug-report-form';

import { Colors, Spacing } from '@/constants/theme';
import { reporting as reportingRepo } from '@/db/repos';
import type { JournalEntry } from '@/reporting/journal';
import { buildInfo, deviceInfo } from '@/platform/app-build-device';
import { submitForm, type FormFields, type ReportContext } from '@/ui/bug-report-screen';
import { newId } from '@/ui/id';
import { journal } from '@/ui/journal';

/**
 * What the owner sees instead of a dead app when a screen throws while being drawn.
 *
 * **It stands alone, deliberately.** The tree it replaced is gone — the navigator, the theme
 * provider and every hook that needs either went with it — so this component reads the system
 * scheme itself, paints from `Colors` directly, and answers the back gesture through React
 * Native's own `BackHandler` rather than `useCloseOnBack`, whose `useFocusEffect` needs the
 * navigator that is not there (design D4).
 *
 * **The way back is a navigation and then a `retry`, in that order.** expo-router's `retry` only
 * clears the boundary's error state; the navigation state lives above this and still points at the
 * route that threw, so a bare `retry` would redraw the crash. `router.replace('/')` is the
 * module-level imperative API — no hook, no navigator context — and its queue is drained by the
 * container mounted *above* this boundary, which is still alive. `retry` then follows on the next
 * tick, because that drain happens in an effect of the same commit and clearing the error
 * alongside it would remount the Stack against the old state.
 */
export function CrashFallback({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();
  const [reporting, setReporting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [prompting, setPrompting] = useState<JournalEntry | null>(null);

  /**
   * The crash, recorded once — the route it happened on first, then the crash itself.
   *
   * The route has to be written here and not left to the root layout's own effect: when a screen
   * throws on its very first draw, React discards that whole render and the effect never commits,
   * so without this the журнал would name the *previous* screen as where the crash happened
   * (design D4 (a)). `usePathname` is `useSyncExternalStore` over expo-router's module-level
   * store, so it is readable with no navigator beneath it.
   */
  const recorded = useRef(false);
  useEffect(() => {
    if (recorded.current) {
      return;
    }
    recorded.current = true;
    journal.record('screen', pathname);
    const id = journal.record('crash', 'render', `${error.message}\n${error.stack ?? ''}`);
    setPrompting(journal.byId(id));
  }, [error, pathname]);

  /** Both ways out: leave the route that threw, then let the boundary draw the app again. */
  const goBack = () => {
    router.replace('/');
    setTimeout(() => {
      void retry();
    }, 0);
  };

  /** The device's own «назад» is the same as «Повернутися» — never a second dead end. */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `goBack` closes over `retry` only
  }, [retry]);

  const save = (fields: FormFields) => {
    const id = newId();
    const facts = phoneFacts();
    const context: ReportContext = {
      build: buildInfo(),
      device: deviceInfo(),
      migrationsApplied: facts.migrationsApplied,
      counts: facts.counts,
      journal: journal.tail(),
      prompting,
      now: new Date(),
      // Always the crash: this component is drawn only when a screen threw, so there is no other
      // door it could be.
      origin: 'crash',
    };
    const outcome = submitForm({ id, fields, context, save: (report) => reportingRepo.create(report) });
    if (outcome.kind === 'refused') {
      setRefusal(outcome.message);
      return;
    }
    // Saved. The owner goes back to the app; the репорт waits for them under Налаштування, at
    // `savedRoute(id)`, which the section lists newest first.
    goBack();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.textDanger }]}>Екран не намалювався</Text>
        <Text style={[styles.body, { color: theme.text }]}>
          Застосунок спіймав помилку і не закрився. Нижче — те, що він про неї знає.
        </Text>
        <Text style={[styles.error, { color: theme.textSecondary, borderColor: theme.border }]}>
          {error.message}
        </Text>

        {reporting ? (
          <BugReportForm prompting={prompting} refusal={refusal} onSave={save} />
        ) : (
          <View style={styles.actions}>
            <Text
              accessibilityRole="button"
              onPress={() => setReporting(true)}
              style={[styles.action, { color: theme.onAccent, backgroundColor: theme.accent }]}>
              Повідомити про помилку
            </Text>
            <Text
              accessibilityRole="button"
              onPress={goBack}
              style={[styles.action, { color: theme.text, borderColor: theme.border, borderWidth: 1 }]}>
              Повернутися
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * What the phone holds, counted here rather than in `src/ui/`.
 *
 * Wrapped in its own guard: the fallback is shown when things are already wrong, and a crash
 * during the migrations means these reads throw. A репорт with zeroes in it is worth far more than
 * a fallback that crashes while being drawn — which would leave the owner with nothing at all.
 */
function phoneFacts() {
  try {
    return {
      migrationsApplied: reportingRepo.migrationsApplied(),
      counts: reportingRepo.counts(),
    };
  } catch {
    return {
      migrationsApplied: 0,
      counts: { accounts: 0, transactions: 0, categories: 0, rules: 0, drafts: 0 },
    };
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, paddingTop: Spacing.six, gap: Spacing.three },
  title: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  error: { fontSize: 13, borderWidth: 1, borderRadius: 8, padding: Spacing.three },
  actions: { gap: Spacing.two },
  action: {
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
