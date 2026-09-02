import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Choices } from '@/components/form';
import { Card, Chevron, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  goals as goalsRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import {
  reportsViewModel,
  type ChartAxis,
  type HistoryReadout,
  type ReportsBar,
} from '@/ui/reports-screen';

import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Звіти — the whole history instead of one month: витрачено, дохід and інвестовано by month, one
 * category by month, and the цілі with their progress. Everything it decides —
 * which currency is shown, how tall each bar is, which categories the chooser offers, what each
 * chart's scale is, which month is spelled out, whether a ціль is reached or overdue — is
 * `src/ui/reports-screen.ts`, where `verify` can reach it; this file is the wiring.
 *
 * The bars are plain `View`s with a height: two charts are not a reason for a charting library,
 * and a new native-ish dependency would put both the build and iOS at risk for a rectangle
 * (design D6). The axis is two labels and a hairline, for the same reason.
 */

/** How tall a full-height bar is, in points. Every `size` of the model is a share of this. */
const CHART_HEIGHT = 96;

/**
 * One theme colour per number, so a column reads without a legend beside every bar. They are the
 * palette's own roles, not chart colours of their own: дохід is the app's `textPositive`
 * everywhere, and інвестовано borrows the one accent.
 */
const BAR_COLORS: Readonly<Record<string, ThemeColor>> = {
  spent: 'textSecondary',
  income: 'textPositive',
  invested: 'accent',
};

function Bar({
  bar,
  color,
  room,
}: {
  bar: ReportsBar;
  color: ThemeColor;
  /** Whether this chart holds a negative month at all, and so needs a half below the baseline. */
  room: boolean;
}) {
  const theme = useTheme();
  const filled = (
    <View
      style={[styles.bar, { height: bar.size * CHART_HEIGHT, backgroundColor: theme[color] }]}
    />
  );
  return (
    <View style={styles.barSlot}>
      {/* Above the baseline for a positive number, below it for a negative one — a month of
          returns really is below zero, and drawing it upwards would say the opposite. */}
      <View style={styles.barHalf}>{bar.negative ? null : filled}</View>
      {room ? (
        <View style={[styles.barHalf, styles.barHalfBelow]}>{bar.negative ? filled : null}</View>
      ) : null}
    </View>
  );
}

/**
 * A chart's scale, down the left of its plot: the сума a full-height bar stands for, zero at the
 * baseline, and the bottom of the scale where the chart uses the half below it. Outside the
 * horizontal scroll, so the labels never scroll away from the bars they measure.
 */
function Axis({ axis }: { axis: ChartAxis }) {
  return (
    <View>
      <View style={styles.axisAbove}>
        <AxisLabel>{axis.top}</AxisLabel>
        <AxisLabel>{axis.zero}</AxisLabel>
      </View>
      {axis.bottom ? (
        <View style={styles.axisBelow}>
          <AxisLabel>{axis.bottom}</AxisLabel>
        </View>
      ) : null}
    </View>
  );
}

function AxisLabel({ children }: { children: string }) {
  return (
    <ThemedText type="small" tabular themeColor="textMuted" numberOfLines={1}>
      {children}
    </ThemedText>
  );
}

/**
 * One month's column: its bars over the zero line, its name under them, and the tap that picks it.
 *
 * The pick is marked on the month's name and nowhere else — the app's own «current choice» tint,
 * the one a `Choices` chip carries. A fill behind the whole plot was tried first and read as one
 * more bar, which on a chart is worse than not marking it at all.
 */
function Column({
  label,
  selected,
  onPick,
  children,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPick} accessibilityLabel={label} style={styles.column}>
      <View>
        <View style={styles.columnBars}>{children}</View>
        {/* The zero the bars grow from, drawn per column so it reaches exactly as far as the
            chart does and scrolls with it. */}
        <View
          style={[styles.baseline, { top: CHART_HEIGHT, borderTopColor: theme.border }]}
          pointerEvents="none"
        />
      </View>
      <ThemedText
        type="small"
        themeColor={selected ? 'accent' : 'textMuted'}
        style={[
          styles.columnLabel,
          selected ? { backgroundColor: theme.accentSurface } : null,
        ]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * The picked month of the history chart, spelled out — and the chart's legend, because each number
 * carries the colour its bars are drawn in. One row instead of a legend and no numbers at all.
 */
function HistoryNumbers({ readout }: { readout: HistoryReadout }) {
  return (
    <View style={styles.readout}>
      <ThemedText type="overline" themeColor="textSecondary">
        {readout.label}
      </ThemedText>
      {readout.numbers.map((number) => (
        <View key={number.key} style={styles.readoutRow}>
          <Swatch color={BAR_COLORS[number.key]!} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.readoutLabel}>
            {number.label}
          </ThemedText>
          <ThemedText type="small" tabular>
            {number.amount}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        // Every рахунок and every категорія, archived included: the history keeps showing what it
        // already carries, and classifying an old переказ needs its вид.
        accounts: accountsRepo.list(),
        transactions: transactionsRepo.listAll(),
        categories: categoriesRepo.list(),
        goals: goalsRepo.list(),
      }),
      [],
    ),
  );

  const [shownCurrency, setShownCurrency] = useState<string>();
  const [chosenCategoryId, setChosenCategoryId] = useState<string>();
  /** The month whose numbers are spelled out. Undefined until tapped — the model reads the newest. */
  const [chosenMonth, setChosenMonth] = useState<string>();

  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const model = useMemo(
    () =>
      reportsViewModel({
        accounts: stored.accounts,
        transactions: stored.transactions,
        categoryNames,
        goals: stored.goals,
        shownCurrency,
        chosenCategoryId,
        chosenMonth,
        now: new Date(),
      }),
    [categoryNames, chosenCategoryId, chosenMonth, shownCurrency, stored],
  );

  return (
    <Screen>
      <ScreenHeader title="Звіти" />

      {model.emptyHistoryMessage ? (
        <Card>
          <ThemedText>{model.emptyHistoryMessage}</ThemedText>
        </Card>
      ) : (
        <>
          {/* One currency governs both charts; the switch appears only when there is one. */}
          {model.canSwitchCurrency ? (
            <Choices
              label="Валюта"
              choices={model.currencies.map((c) => ({ value: c, label: c }))}
              selected={model.shownCurrency ?? undefined}
              onSelect={setShownCurrency}
            />
          ) : null}

          <Card style={styles.chartCard}>
            <ThemedText type="overline">Історія за місяцями · {model.shownCurrency}</ThemedText>
            {model.historyReadout ? <HistoryNumbers readout={model.historyReadout} /> : null}
            <View style={styles.plot}>
              {model.historyAxis ? <Axis axis={model.historyAxis} /> : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chart}>
                  {model.history.map((column) => (
                    <Column
                      key={column.month}
                      label={column.label}
                      selected={column.selected}
                      onPick={() => setChosenMonth(column.month)}>
                      {column.bars.map((bar) => (
                        <Bar
                          key={bar.key}
                          bar={bar}
                          color={BAR_COLORS[bar.key]!}
                          room={model.historyHasNegative}
                        />
                      ))}
                    </Column>
                  ))}
                </View>
              </ScrollView>
            </View>
          </Card>

          <Card style={styles.chartCard}>
            <ThemedText type="overline">Одна категорія за місяцями</ThemedText>
            <Choices
              label="Категорія"
              choices={model.categoryChoices.map((c) => ({ value: c.id, label: c.label }))}
              selected={model.chosenCategoryId ?? undefined}
              onSelect={setChosenCategoryId}
            />
            {model.categoryChart.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Оберіть категорію, щоб побачити її по місяцях.
              </ThemedText>
            ) : (
              <>
                {model.categoryReadout ? (
                  <View style={styles.readoutRow}>
                    <ThemedText type="overline" themeColor="textSecondary">
                      {model.categoryReadout.label}
                    </ThemedText>
                    <ThemedText type="small" tabular>
                      {model.categoryReadout.amount}
                    </ThemedText>
                  </View>
                ) : null}
                <View style={styles.plot}>
                  {model.categoryAxis ? <Axis axis={model.categoryAxis} /> : null}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chart}>
                      {model.categoryChart.map((column) => (
                        <Column
                          key={column.month}
                          label={column.label}
                          selected={column.selected}
                          onPick={() => setChosenMonth(column.month)}>
                          <Bar
                            bar={column}
                            color={BAR_COLORS.spent!}
                            room={model.categoryChartHasNegative}
                          />
                        </Column>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </>
            )}
          </Card>
        </>
      )}

      <Card style={styles.chartCard}>
        <ThemedText type="overline">Цілі</ThemedText>
        {model.emptyGoalsMessage ? (
          <ThemedText type="small" themeColor="textSecondary">
            {model.emptyGoalsMessage}
          </ThemedText>
        ) : (
          model.goals.map((goal) => (
            <View key={goal.id} style={styles.goal}>
              <View style={styles.row}>
                <ThemedText
                  numberOfLines={1}
                  style={styles.goalName}
                  themeColor={
                    goal.reached ? 'textPositive' : goal.overdue ? 'textDanger' : undefined
                  }>
                  {goal.name}
                </ThemedText>
                <ThemedText
                  type="small"
                  tabular
                  themeColor={
                    goal.reached ? 'textPositive' : goal.overdue ? 'textDanger' : 'textSecondary'
                  }>
                  {goal.progress} / {goal.target}
                </ThemedText>
              </View>
              <View style={styles.row}>
                <ThemedText type="small" themeColor="textMuted">
                  до {goal.deadline}
                </ThemedText>
                {goal.reached ? (
                  <ThemedText type="overline" themeColor="textPositive">
                    Досягнута
                  </ThemedText>
                ) : null}
                {goal.overdue ? (
                  <ThemedText type="overline" themeColor="textDanger">
                    Прострочена
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Card>

      {/* The way in to «AI-аналіз», and nothing more: showing it computes nothing, builds no
          пакет and hands nothing to any app. It is offered on an empty history too — the
          AI-аналіз screen is the one that says there is nothing to analyse yet. */}
      <Pressable onPress={() => router.push('/ai-analysis')} accessibilityRole="button">
        <Card style={styles.chartCard}>
          <View style={styles.row}>
            <ThemedText type="overline">AI-аналіз</ThemedText>
            <Chevron />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Передати ці числа застосунку, який ви оберете, щоб він їх пояснив
          </ThemedText>
        </Card>
      </Pressable>
    </Screen>
  );
}

/** The read-out's dot — the same colour the number's bars are drawn in. */
function Swatch({ color }: { color: ThemeColor }) {
  const theme = useTheme();
  return <View style={[styles.swatch, { backgroundColor: theme[color] }]} />;
}

const styles = StyleSheet.create({
  chartCard: { gap: Spacing.three },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  goal: { gap: Spacing.one },
  goalName: { flex: 1 },
  readout: { gap: Spacing.one },
  readoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  readoutLabel: { flex: 1 },
  swatch: { width: Spacing.two, height: Spacing.two, borderRadius: Spacing.half },
  plot: { flexDirection: 'row', gap: Spacing.two },
  axisAbove: { height: CHART_HEIGHT, justifyContent: 'space-between', alignItems: 'flex-end' },
  axisBelow: { height: CHART_HEIGHT, justifyContent: 'flex-end', alignItems: 'flex-end' },
  chart: { flexDirection: 'row', gap: Spacing.one, paddingVertical: Spacing.one },
  column: { alignItems: 'center', gap: Spacing.one },
  columnLabel: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.half,
    overflow: 'hidden',
  },
  columnBars: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.half },
  baseline: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  barSlot: { width: Spacing.two },
  barHalf: { height: CHART_HEIGHT, justifyContent: 'flex-end' },
  barHalfBelow: { justifyContent: 'flex-start' },
  bar: { width: '100%', borderRadius: Spacing.half },
});
