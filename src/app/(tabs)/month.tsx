import { useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Card,
  Divider,
  Meter,
  Screen,
  SectionLabel,
} from '@/components/surfaces';
import { RowAction } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
  rates as ratesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
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
        // One more bounded month, so an empty screen can name the month that has numbers. Read
        // unconditionally rather than in a second effect: it is one month, and the alternative is
        // a reload the owner would watch happen.
        previousTransactions: transactionsRepo.listMonth(prevMonth(shown)),
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

  useCurrentRates(reload);

  const model = useMemo(
    () =>
      monthViewModel({
        month: shown,
        accounts: stored.accounts,
        transactions: stored.transactions,
        rates: stored.rates,
        categoryNames: namesById(stored.categories),
        limits: stored.limits,
        previousTransactions: stored.previousTransactions,
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
        <Card style={styles.empty}>
          <ThemedText>{model.emptyMessage}</ThemedText>
          {/* The month before it, when that one has something to read: its витрачено and one way
              to get there — the same state the back arrow writes, so there is one way to be on it. */}
          {model.previous ? (
            <>
              <Divider />
              <ThemedText type="small" themeColor="textSecondary">
                {model.previous.label}
              </ThemedText>
              {model.previous.spent.map((row) => (
                <View key={row.amount} style={styles.line}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.label}
                  </ThemedText>
                  <ThemedText type="small" tabular style={styles.amount}>
                    {row.amount}
                  </ThemedText>
                </View>
              ))}
              <View style={styles.previousAction}>
                <RowAction
                  title={`Показати ${model.previous.label}`}
                  onPress={() => setShown(prevMonth(shown))}
                />
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      {model.groups.map((group) => {
        const leading = group.numbers.find((row) => row.key === group.lead);
        const rest = group.numbers.filter((row) => row.key !== group.lead);
        return (
          <Fragment key={group.currency}>
            <Card style={styles.numbers}>
              <ThemedText type="overline">{group.currency}</ThemedText>
              {/* One number leads the card. Which one is the model's decision, tested there: the
                  screen adds none of its own, and every one of the six is shown either way. */}
              {leading ? (
                <View style={styles.hero}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {leading.label}
                  </ThemedText>
                  <ThemedText type="title" numberOfLines={1} adjustsFontSizeToFit>
                    {leading.amount}
                  </ThemedText>
                  {/* Why залишилось is not the number above, when it is not. */}
                  {group.note ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {group.note}
                    </ThemedText>
                  ) : null}
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
  empty: { gap: Spacing.two },
  previousAction: { flexDirection: 'row' },
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
