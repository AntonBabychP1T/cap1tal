import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Choices } from '@/components/form';
import { Card, Chevron, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  goals as goalsRepo,
  limits as limitsRepo,
  rates as ratesRepo,
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
 * A chart's span as one string, used as the strip's `key`. The months are contiguous, so how many
 * there are and which is first says which span this is — and a new span must remount the strip
 * (see `MonthStrip`), not merely re-render it.
 */
function spanOf(columns: readonly { readonly month: string }[]): string {
  return `${columns.length}:${columns[0]?.month ?? ''}`;
}

/** How a column tells the strip around it where it sits. Unset outside one, which is never. */
const MeasureColumn = createContext<
  ((month: string, x: number, width: number) => void) | undefined
>(undefined);

/**
 * A chart's columns behind a horizontal scroll that keeps the marked month whole on screen.
 *
 * A chart wider than its card opens at its left edge, while the month it marks is the newest one
 * holding a сума — usually its last column. The emulator showed exactly that: «Вер 2026» marked
 * and its pill cut in half by the right edge. So the strip measures its own viewport and every
 * column, and when the marked column is not wholly inside the window it scrolls it to the middle.
 *
 * Only when it is *not* already whole. A month picked on this chart was tapped, so it was already
 * visible, and a chart that jumped under the finger that tapped it would be worse than the
 * clipping this fixes. What does move is the other chart, which the pick governs too.
 *
 * Everything is a ref: none of these numbers is drawn, and putting a scroll offset in state would
 * re-render both charts on every pixel of a drag.
 *
 * **The caller keys this on its span** (see both call sites). A column reports its place through
 * `onLayout`, which does not fire when a column keeps its size and only slides sideways — so when
 * the span grows under a mounted «Звіти» (a транзакція recorded in a month the chart did not have,
 * then back to the tab) every remembered `x` is silently a column too far left, and the strip
 * would sit on its old offset believing the mark was still whole. The emulator found exactly that:
 * the readout said «ВЕР 2026» over a chart showing Лют–Тра 2026 and no pill anywhere. Remounting
 * on a new span throws the stale measurements away and makes every column report itself again.
 */
function MonthStrip({ marked, children }: { marked?: string; children: React.ReactNode }) {
  const scroller = useRef<ScrollView>(null);
  const columns = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const offset = useRef(0);
  const markedNow = useRef(marked);

  const bring = useCallback(() => {
    const month = markedNow.current;
    const column = month === undefined ? undefined : columns.current.get(month);
    const width = viewport.current;
    if (!column || width === 0) {
      return;
    }
    const whole = column.x >= offset.current && column.x + column.width <= offset.current + width;
    if (whole) {
      return;
    }
    const x = Math.max(0, column.x + column.width / 2 - width / 2);
    // Remembered here and not left to `onScroll`: a programmatic jump does not reliably raise a
    // scroll event on every platform, and the containment test above would then keep reading the
    // window the strip was at before this call and scroll again on the next measurement.
    offset.current = x;
    scroller.current?.scrollTo({ x, animated: false });
  }, []);

  // The mark moved — on opening, or because the owner picked a month on the other chart.
  useEffect(() => {
    markedNow.current = marked;
    bring();
  }, [bring, marked]);

  const measure = useCallback(
    (month: string, x: number, width: number) => {
      columns.current.set(month, { x, width });
      // A column laid out after the effect above has run still has to be brought in: on the first
      // pass there were no measurements for it to read.
      bring();
    },
    [bring],
  );

  return (
    <MeasureColumn.Provider value={measure}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={({ nativeEvent }) => {
          offset.current = nativeEvent.contentOffset.x;
        }}
        onLayout={({ nativeEvent }) => {
          viewport.current = nativeEvent.layout.width;
          bring();
        }}>
        <View style={styles.chart}>{children}</View>
      </ScrollView>
    </MeasureColumn.Provider>
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
  month,
  label,
  selected,
  onPick,
  children,
}: {
  month: string;
  label: string;
  selected: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const measure = useContext(MeasureColumn);
  return (
    <Pressable
      onPress={onPick}
      accessibilityLabel={label}
      style={styles.column}
      // Its own place in the strip, so the strip can tell whether the mark on it is whole.
      onLayout={({ nativeEvent }) =>
        measure?.(month, nativeEvent.layout.x, nativeEvent.layout.width)
      }>
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
        // Every ліміт is a ціль витрат (design D1), and a склад spanning currencies needs the
        // stored rates to be approximated at all. Both are read here and changed nowhere.
        limits: limitsRepo.list(),
        rates: ratesRepo.all(),
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
        limits: stored.limits,
        categories: stored.categories,
        rates: stored.rates,
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
              <MonthStrip key={spanOf(model.history)} marked={model.historyReadout?.month}>
                {model.history.map((column) => (
                  <Column
                    key={column.month}
                    month={column.month}
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
              </MonthStrip>
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
                  <MonthStrip
                    key={spanOf(model.categoryChart)}
                    marked={model.categoryReadout?.month}>
                    {model.categoryChart.map((column) => (
                      <Column
                        key={column.month}
                        month={column.month}
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
                  </MonthStrip>
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
        ) : null}

        {/* Two named groups, never one list: a ціль-накопичення moves toward a сума the owner
            wants and a ціль витрат away from one they do not, so neither is ever read in the
            other's words. Each row opens what explains it — the ціль's own breakdown, or the
            категорія's month, where its транзакції already are. */}
        {model.goals.accumulation.length > 0 ? (
          <>
            <ThemedText type="small" themeColor="textMuted">
              {model.goals.accumulationTitle}
            </ThemedText>
            {model.goals.accumulation.map((goal) => (
              <Pressable
                key={goal.id}
                onPress={() => router.push(goal.route as never)}
                style={styles.goal}>
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
                    {goal.progress === null
                      ? '—'
                      : `${goal.approximate ? '≈ ' : ''}${goal.progress} / ${goal.target}`}
                  </ThemedText>
                </View>
                <View style={styles.row}>
                  <ThemedText type="small" themeColor="textMuted">
                    {goal.uncountable ??
                      [
                        goal.percentage === null ? null : `${goal.approximate ? '≈ ' : ''}${goal.percentage} %`,
                        goal.deadline === null ? null : `до ${goal.deadline}`,
                        goal.accountCount,
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
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
              </Pressable>
            ))}
          </>
        ) : null}

        {model.goals.spending.length > 0 ? (
          <>
            <ThemedText type="small" themeColor="textMuted">
              {model.goals.spendingTitle}
            </ThemedText>
            {model.goals.spending.map((goal) => (
              <Pressable
                key={goal.categoryId}
                onPress={() => router.push(goal.route as never)}
                style={styles.goal}>
                <View style={styles.row}>
                  <ThemedText
                    numberOfLines={1}
                    style={styles.goalName}
                    themeColor={goal.exceededBy ? 'textDanger' : undefined}>
                    {goal.name}
                    {goal.archived ? ' · в архіві' : ''}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    tabular
                    themeColor={goal.exceededBy ? 'textDanger' : 'textSecondary'}>
                    {goal.spent} / {goal.ceiling}
                  </ThemedText>
                </View>
                <View style={styles.row}>
                  <ThemedText type="small" themeColor="textMuted">
                    {goal.monthLabel}
                    {goal.percentageUsed === null
                      ? ''
                      : ` · використано ${goal.percentageUsed} %`}
                  </ThemedText>
                  {/* Within: what may still be spent. Over: by how much — and no percentage at
                      all, because «виконано на 124 %» is a lie about a thing the owner did not
                      want to happen. */}
                  {goal.exceededBy ? (
                    <ThemedText type="overline" themeColor="textDanger">
                      Перевищено на {goal.exceededBy}
                    </ThemedText>
                  ) : (
                    <ThemedText type="overline" themeColor="textSecondary">
                      Можна ще {goal.mayStillSpend}
                    </ThemedText>
                  )}
                </View>
              </Pressable>
            ))}
          </>
        ) : null}
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
  // The horizontal padding is the mark's breathing room: a pill on the first or last column must
  // not sit flush against the edge the strip clips at, even when nothing scrolls.
  chart: { flexDirection: 'row', gap: Spacing.one, padding: Spacing.one },
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
