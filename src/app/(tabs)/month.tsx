import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Card,
  Divider,
  Meter,
  Screen,
  SectionLabel,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
  rates as ratesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { fetchMonobankRates } from '@/monobank/currency';
import { shouldRefreshRates } from '@/ui/approx-uah';
import { monthViewModel } from '@/ui/month-screen';
import { currentMonth, prevMonth, stepForward } from '@/ui/months';

import { Spacing } from '@/constants/theme';

/** The step arrows. Drawn, never removed: at the edge the disabled one keeps the title centred. */
function Step({ arrow, onPress }: { arrow: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={Spacing.three}>
      <ThemedText type="subtitle" themeColor={onPress ? 'text' : 'textMuted'}>
        {arrow}
      </ThemedText>
    </Pressable>
  );
}

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
        // Every category, archived included: a month keeps showing the categories its витрати
        // already carry, and an archived one appears there like any other.
        categories: categoriesRepo.list(),
        // Every ліміт, so the breakdown can mark the categories this month went over.
        limits: limitsRepo.list(),
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
        categoryNames: namesById(stored.categories),
        limits: stored.limits,
        now: new Date(),
      }),
    [shown, stored],
  );

  return (
    <Screen>
      <View style={styles.stepper}>
        <Step arrow="←" onPress={() => setShown(prevMonth(shown))} />
        <ThemedText type="subtitle">{model.title}</ThemedText>
        {/* The current month is the far edge: forward is shown spent rather than offered. */}
        <Step
          arrow="→"
          onPress={
            model.canStepForward ? () => setShown(stepForward(shown, new Date())) : undefined
          }
        />
      </View>

      {model.emptyMessage ? (
        <Card>
          <ThemedText>{model.emptyMessage}</ThemedText>
        </Card>
      ) : null}

      {model.groups.map((group) => {
        const left = group.numbers.find((row) => row.key === 'left');
        const rest = group.numbers.filter((row) => row.key !== 'left');
        return (
          <Fragment key={group.currency}>
            <Card style={styles.numbers}>
              <ThemedText type="overline">{group.currency}</ThemedText>
              {/* One number leads the card — what is left is the answer the month is opened for. */}
              {left ? (
                <View style={styles.hero}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {left.label}
                  </ThemedText>
                  <ThemedText type="title" numberOfLines={1} adjustsFontSizeToFit>
                    {left.amount}
                  </ThemedText>
                </View>
              ) : null}
              <Divider />
              <View style={styles.numberRows}>
                {rest.map((row) => (
                  <View key={row.key} style={styles.line}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {row.label}
                    </ThemedText>
                    <ThemedText
                      type="small"
                      tabular
                      style={styles.amount}
                      themeColor={row.key === 'income' ? 'textPositive' : undefined}>
                      {row.amount}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </Card>

            {group.breakdown.length > 0 ? (
              <>
                <SectionLabel note={group.currency}>Витрачено за категоріями</SectionLabel>
                <Card style={styles.breakdown}>
                  {group.breakdown.map((row) => (
                    <Pressable
                      key={row.categoryId}
                      onPress={() => router.push(`/category/${model.month}/${row.categoryId}`)}>
                      <View style={styles.line}>
                        {/* Over its ліміт for this month, in this row's own currency: the amount
                            and its category turn red, and nothing else about the row changes. */}
                        <ThemedText
                          numberOfLines={1}
                          style={styles.label}
                          themeColor={row.overLimit ? 'textDanger' : undefined}>
                          {row.label}
                        </ThemedText>
                        <ThemedText
                          tabular
                          style={styles.amount}
                          themeColor={row.overLimit ? 'textDanger' : undefined}>
                          {row.amount}
                        </ThemedText>
                      </View>
                      {/* The bar is the month's shape at a glance: the largest категорія fills it
                          and the rest are read against it. */}
                      <View style={styles.meter}>
                        <Meter
                          value={row.share}
                          color={row.overLimit ? 'textDanger' : 'textSecondary'}
                          track={row.overLimit ? 'dangerSurface' : 'backgroundSelected'}
                        />
                      </View>
                    </Pressable>
                  ))}
                </Card>
              </>
            ) : null}
          </Fragment>
        );
      })}

      {/* One «≈» line per monthly number, across every currency of that number — never one
          total per currency group. Absent whenever it cannot be honest. */}
      {model.approximate ? (
        <>
          <SectionLabel>Приблизно в гривні</SectionLabel>
          <Card>
            {model.approximate.map((row) => (
              <View key={row.key} style={styles.line}>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.label}
                </ThemedText>
                <ThemedText type="small" tabular themeColor="textSecondary">
                  {row.amount}
                </ThemedText>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numbers: { gap: Spacing.three },
  hero: { gap: Spacing.half },
  numberRows: { gap: Spacing.two + Spacing.half },
  breakdown: { gap: Spacing.three },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  label: { flex: 1 },
  meter: { marginTop: Spacing.two - Spacing.half },
  amount: { fontWeight: 600 },
});
