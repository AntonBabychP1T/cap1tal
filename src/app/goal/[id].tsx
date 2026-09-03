import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  goals as goalsRepo,
  rates as ratesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { goalScreenModel } from '@/ui/goal-screen';

import { Spacing } from '@/constants/theme';

/**
 * The breakdown of one ціль-накопичення: its progress with the mark it earned, and the внесок of
 * every рахунок of its склад — so «why does cap1tal think there is already 487 300 for the car» is
 * answered on one screen.
 *
 * Pushed like `account/[id].tsx` and with the same way back. It records nothing: every decision is
 * `src/ui/goal-screen.ts`, where `verify` can reach it, and this file is the wiring.
 *
 * A ціль витрат has no screen here on purpose — choosing one opens the категорія's month, where
 * its транзакції already are.
 */
export default function GoalScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        goal: goalsRepo.get(id),
        // Every рахунок, archived included: an archived one keeps feeding its ціль.
        accounts: accountsRepo.list(),
        transactions: transactionsRepo.listAll(),
        rates: ratesRepo.all(),
      }),
      [id],
    ),
  );

  const model = useMemo(
    () =>
      goalScreenModel({
        goal: stored.goal,
        accounts: stored.accounts,
        transactions: stored.transactions,
        rates: stored.rates,
        now: new Date(),
      }),
    [stored],
  );

  if (model.kind === 'gone') {
    return (
      <Screen>
        <ScreenHeader title="Ціль" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          {model.message}
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={model.name}
        subtitle={
          model.deadline
            ? `до ${model.deadline}${model.overdue ? ' · прострочена' : ''}`
            : 'без дати'
        }
        back={() => router.back()}
      />

      <Card style={styles.summary}>
        {model.readout.uncountable ? (
          // No total and no percentage: the readable внески are below, and the sum of them is not
          // this ціль's progress.
          <ThemedText type="small" themeColor="textDanger">
            {model.readout.uncountable}
          </ThemedText>
        ) : (
          <>
            <View style={styles.row}>
              <ThemedText tabular style={styles.progress}>
                {model.readout.approximate ? '≈ ' : ''}
                {model.readout.progress}
              </ThemedText>
              <ThemedText type="small" tabular themeColor="textSecondary">
                з {model.readout.target}
              </ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textMuted">
                {model.readout.approximate ? '≈ ' : ''}
                {model.readout.percentage} %
              </ThemedText>
              {model.readout.reached ? (
                <ThemedText type="overline" themeColor="textPositive">
                  Досягнуто
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Залишилось накопичити {model.readout.approximate ? '≈ ' : ''}
                  {model.readout.leftToAccumulate}
                </ThemedText>
              )}
            </View>
          </>
        )}
      </Card>

      <SectionLabel>Що враховується</SectionLabel>
      <ListCard>
        {model.accounts.map((row, index) => (
          <ListRow key={row.accountId} last={index === model.accounts.length - 1} style={styles.row}>
            <View style={styles.name}>
              <ThemedText numberOfLines={1}>
                {row.name}
                {row.archived ? ' · в архіві' : ''}
              </ThemedText>
              {row.valueAsOf ? (
                <ThemedText type="small" themeColor="textMuted">
                  поточна вартість на {row.valueAsOf}
                </ThemedText>
              ) : null}
              {row.rateUnknown ? (
                <ThemedText type="small" themeColor="textDanger">
                  курс невідомий
                </ThemedText>
              ) : null}
            </View>
            <View style={styles.amounts}>
              {/* The рахунок's own сума is the truth; the conversion is the second line under it. */}
              <ThemedText tabular>{row.own}</ThemedText>
              {row.approximateInGoalCurrency ? (
                <ThemedText type="small" tabular themeColor="textSecondary">
                  {row.approximateInGoalCurrency}
                </ThemedText>
              ) : null}
            </View>
          </ListRow>
        ))}
      </ListCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  progress: { fontWeight: 600 },
  name: { flex: 1, gap: Spacing.one },
  amounts: { alignItems: 'flex-end' },
});
