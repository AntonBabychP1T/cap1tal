import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  accounts as accountsRepo,
  rates as ratesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { fetchMonobankRates } from '@/monobank/currency';
import { shouldRefreshRates } from '@/ui/approx-uah';
import { monthViewModel } from '@/ui/month-screen';
import { currentMonth, prevMonth, stepForward } from '@/ui/months';

import { Spacing } from '@/constants/theme';

/**
 * Місяць — where the owner reads one calendar month: витрачено, інвестовано, відкладено,
 * позичено, дохід and залишилось per currency, spent broken down by category, and the secondary
 * «≈ … грн» line. Every decision is already made and tested in `src/ui/month-screen.ts`,
 * `src/ui/months.ts` and `src/ui/approx-uah.ts`; this file is the wiring. See design.md §6.
 */

export default function MonthScreen() {
  const router = useRouter();
  const [shown, setShown] = useState(() => currentMonth(new Date()));

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        // Every account, archived included: a month may hold a transfer touching one that has
        // since been archived, and classifying it needs its вид (design decision 8).
        accounts: accountsRepo.list(),
        transactions: transactionsRepo.listMonth(shown),
        rates: ratesRepo.all(),
      }),
      [shown],
    ),
  );

  /**
   * The rate refresh, and the only network this screen touches. It runs while rendering the
   * numbers, never before them: nothing on the screen except the «≈» line depends on it, and
   * every failure path — offline, a 429, a body that is not JSON — returns no rows and leaves the
   * screen exactly as it was. Whatever was cached keeps serving the approximation.
   *
   * Asked at most once per focus, and deliberately **not** from `stored.rates`. This effect writes
   * to the rate cache and then calls `reload()`; if the freshly read cache were a dependency, its
   * own success would re-arm it. That is harmless when the answer covers every currency — the
   * second pass finds nothing stale — but a partial answer (monobank drops EUR, or a row is
   * malformed and the parser skips it) leaves EUR stale forever, so the effect would fetch, store,
   * re-arm, and fetch again with nothing but the endpoint's 429 to stop it. `design.md` promises
   * no retry loop anywhere, and `use-reload-on-focus.ts` warns about exactly this shape.
   *
   * So the cache is read straight from storage here — synchronous SQLite, the same read the rest
   * of the screen does — and the deps hold only `reload`, whose identity survives its own call.
   */
  useFocusEffect(
    useCallback(() => {
      let left = false;
      // Per currency, not off the newest row: a fresh USD rate must not keep a stale EUR one.
      if (shouldRefreshRates(ratesRepo.all(), new Date())) {
        void fetchMonobankRates(fetch).then((obtained) => {
          if (obtained.length === 0) {
            return;
          }
          // Stored even when the screen has been left in the meantime: the requirement is to store
          // what was obtained, the write is synchronous SQLite touching no React state, and
          // throwing a rate away would only mean asking monobank for it again. Only the re-render
          // is skipped — that is what `left` is for.
          const now = new Date();
          for (const rate of obtained) {
            ratesRepo.upsert(rate, now);
          }
          if (!left) {
            reload();
          }
        });
      }
      return () => {
        left = true;
      };
    }, [reload]),
  );

  const model = useMemo(
    () =>
      monthViewModel({
        month: shown,
        accounts: stored.accounts,
        transactions: stored.transactions,
        rates: stored.rates,
        now: new Date(),
      }),
    [shown, stored],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Pressable onPress={() => setShown(prevMonth(shown))} hitSlop={Spacing.two}>
              <ThemedText type="smallBold">←</ThemedText>
            </Pressable>
            <ThemedText type="subtitle">{model.title}</ThemedText>
            {/* The current month is the far edge: forward is not offered there at all. */}
            {model.canStepForward ? (
              <Pressable
                onPress={() => setShown(stepForward(shown, new Date()))}
                hitSlop={Spacing.two}>
                <ThemedText type="smallBold">→</ThemedText>
              </Pressable>
            ) : (
              // Keeps the title centred at the edge without offering a control that does nothing.
              <View style={styles.stepPlaceholder} />
            )}
          </View>

          {model.emptyMessage ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText>{model.emptyMessage}</ThemedText>
            </ThemedView>
          ) : null}

          {model.groups.map((group) => (
            <ThemedView key={group.currency} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{group.currency}</ThemedText>
              {group.numbers.map((row) => (
                <View key={row.key} style={styles.row}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.label}
                  </ThemedText>
                  <ThemedText type="smallBold">{row.amount}</ThemedText>
                </View>
              ))}

              {group.breakdown.length > 0 ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Витрачено за категоріями
                  </ThemedText>
                  {group.breakdown.map((row) => (
                    <Pressable
                      key={row.categoryId}
                      onPress={() => router.push(`/category/${model.month}/${row.categoryId}`)}>
                      <View style={styles.row}>
                        <ThemedText type="small">{row.label}</ThemedText>
                        <ThemedText type="smallBold">{row.amount}</ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </ThemedView>
          ))}

          {/* One «≈» line per monthly number, across every currency of that number — never one
              total per currency group. Absent whenever it cannot be honest. */}
          {model.approximate ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Приблизно в гривні</ThemedText>
              {model.approximate.map((row) => (
                <View key={row.key} style={styles.row}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.label}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.amount}
                  </ThemedText>
                </View>
              ))}
            </ThemedView>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepPlaceholder: { width: Spacing.three },
});
