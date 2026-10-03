import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FillColumn, Swap, TabFade, Tap } from '@/components/motion';
import { Choices } from '@/components/form';
import { Card, Chevron, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  categories as categoriesRepo,
  goals as goalsRepo,
  investments as investmentsRepo,
  limits as limitsRepo,
  rates as ratesRepo,
  rememberedRead,
  storedHistory,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { onProgressJudged, unseenAchievementsData } from '@/hooks/progress-ports';
import { todayIso } from '@/ui/dates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { PROGRESS_ROUTE } from '@/ui/progress-screen';
import {
  categoryBars,
  type ChartAxis,
  columnBarKey,
  columnMorph,
  type ColumnMorph,
  historyBars,
  type HistoryReadout,
  type ReportsBar,
  type ReportsHistory,
  reportsHistory,
  reportsSelection,
  type ReportsViewModel,
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
  from,
  color,
  room,
}: {
  bar: ReportsBar;
  /** The size it is first drawn at (`columnMorph`): 0 on the first drawing, the old size on a switch. */
  from: number;
  color: ThemeColor;
  /** Whether this chart holds a negative month at all, and so needs a half below the baseline. */
  room: boolean;
}) {
  const theme = useTheme();
  // A full-height bar slid out of the baseline, so it moves from its old height to its new one
  // with a transform alone (motion, "Progress fills from where it was").
  const filled = (
    <FillColumn
      size={bar.size}
      from={from}
      negative={bar.negative}
      style={[styles.bar, { backgroundColor: theme[color] }]}
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
 * Where a bar is first drawn from: its `columnMorph` start, or at its size when the chart
 * cross-faded instead.
 */
function fromOf(morph: ColumnMorph, month: string, key: string, size: number): number {
  return morph.kind === 'morph' ? (morph.bars.get(columnBarKey(month, key))?.from ?? size) : size;
}

/**
 * The two charts' way from the last model drawn to this one (design D12), kept beside it: how
 * each bar moves, and how many times each chart has cross-faded, which keys its re-drawing.
 */
interface ChartMotion {
  readonly model: ReportsViewModel | null;
  readonly history: ColumnMorph;
  readonly category: ColumnMorph;
  readonly historyFades: number;
  readonly categoryFades: number;
}

function chartMotion(was: ChartMotion, model: ReportsViewModel): ChartMotion {
  const history = columnMorph(was.model ? historyBars(was.model) : null, historyBars(model));
  // A chart that gives way to «Оберіть категорію…» or comes back from it cross-fades by its
  // own branch, and starts from empty again.
  const category = columnMorph(
    was.model && was.model.categoryChart.length > 0 ? categoryBars(was.model) : null,
    categoryBars(model),
  );
  return {
    model,
    history,
    category,
    historyFades: was.historyFades + (history.kind === 'fade' ? 1 : 0),
    categoryFades: was.categoryFades + (category.kind === 'fade' ? 1 : 0),
  };
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
  /** The chart's own width, without the tail below. */
  const chartWidth = useRef(0);
  /**
   * Room after the last column. The strip's furthest offset is its content less its window, and
   * that almost never lands where a column begins — so a strip scrolled to its newest month came
   * to rest with its leftmost month cut («ер 2026» for «Чер 2026»). The tail makes the offset that
   * starts on a whole column reachable (reports-screen, "A month strip never opens on a half-drawn
   * month").
   */
  const [tail, setTail] = useState(0);
  const tailNow = useRef(0);
  /** An offset waiting for the tail it needs to be laid out before it can be scrolled to. */
  const pending = useRef<number | undefined>(undefined);

  const bring = useCallback(() => {
    const month = markedNow.current;
    const column = month === undefined ? undefined : columns.current.get(month);
    const width = viewport.current;
    if (!column || width === 0 || chartWidth.current === 0) {
      return;
    }
    const whole = column.x >= offset.current && column.x + column.width <= offset.current + width;
    if (whole) {
      return;
    }
    // Every offset at which a column begins (less the pill's breathing room), from which the
    // marked column is still whole with its own breathing room; the smallest of them wins, so the
    // marked month comes to rest near the right edge with as many whole months before it as fit.
    const starts = [...columns.current.values()]
      .map((c) => Math.max(0, c.x - Spacing.one))
      .filter(
        (start) => start <= column.x && start + width >= column.x + column.width + Spacing.one,
      );
    const x = starts.length > 0 ? Math.min(...starts) : Math.max(0, column.x - Spacing.one);
    const needed = Math.max(0, Math.ceil(x + width - chartWidth.current));
    // Remembered here and not left to `onScroll`: a programmatic jump does not reliably raise a
    // scroll event on every platform, and the containment test above would then keep reading the
    // window the strip was at before this call and scroll again on the next measurement.
    offset.current = x;
    if (needed !== tailNow.current) {
      tailNow.current = needed;
      pending.current = x;
      setTail(needed);
      return;
    }
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
        onContentSizeChange={() => {
          // The tail has been laid out: the offset it was grown for is reachable now.
          if (pending.current !== undefined) {
            const x = pending.current;
            pending.current = undefined;
            scroller.current?.scrollTo({ x, animated: false });
          }
        }}
        onLayout={({ nativeEvent }) => {
          viewport.current = nativeEvent.layout.width;
          bring();
        }}>
        <View
          style={styles.chart}
          onLayout={({ nativeEvent }) => {
            chartWidth.current = nativeEvent.layout.width;
            bring();
          }}>
          {children}
        </View>
        <View style={{ width: tail }} />
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
    <Tap
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
    </Tap>
  );
}

/**
 * The picked month of the history chart, spelled out — and the chart's legend, because each number
 * carries the colour its bars are drawn in. One row instead of a legend and no numbers at all.
 */
function HistoryNumbers({ readout }: { readout: HistoryReadout }) {
  const router = useRouter();
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
      {/* A finished month that holds a транзакція leads to its підсумок, beneath its numbers. */}
      {readout.summaryOffer ? (
        <Tap
          onPress={() => router.push(readout.summaryOffer!.route)}
          accessibilityRole="button"
          accessibilityLabel={readout.summaryOffer.accessibilityLabel}
          style={styles.summaryOffer}>
          <ThemedText type="link">{readout.summaryOffer.label}</ThemedText>
          <Chevron />
        </Tap>
      ) : null}
    </View>
  );
}

/**
 * Everything on Звіти that no choice changes — the history by month, the категорії it carries, the
 * цілі — derived at most once per change stamp and day, not on every focus (reports-screen,
 * "Choosing on Звіти re-derives only what the choice changes"; app-speed-pass design D7). Every
 * input is storage, so the stamp is its whole key; the day covers `now`.
 */
const readReportsHistory = rememberedRead((): ReportsHistory => {
  // The stored history, read at most once per change stamp (app-speed-pass design D1). Every
  // рахунок and every категорія, archived included: the history keeps showing what it already
  // carries, and classifying an old переказ needs its вид.
  const history = storedHistory.read();
  const categories = categoriesRepo.list();
  // Nothing when a рахунок is beyond the safe range: each ціль's внески are then computed on their
  // own, and only a ціль that holds that рахунок meets the refusal.
  const balances = history.balancesIfSafe();
  // The quiet badge beside Прогрес — read-only, same as opening Прогрес itself would read, and
  // reading it here marks nothing seen (see progress-ports.ts).
  const unseen = unseenAchievementsData();
  return reportsHistory({
    accounts: history.accounts,
    transactions: history.transactions,
    ...(balances ? { balances } : {}),
    categoryNames: namesById(categories),
    categories,
    goals: goalsRepo.list(),
    // Every ліміт is a ціль витрат (design D1), and a склад spanning currencies needs the stored
    // rates to be approximated at all. Both are read here and changed nowhere.
    limits: limitsRepo.list(),
    rates: ratesRepo.all(),
    // An інвестиційний рахунок's внесок to a ціль is its поточна вартість where the app holds one;
    // the дата is the ціль's own screen's concern, so only the суми come this far.
    currentValues: investmentsRepo.amounts(),
    progressCandidates: unseen.candidates,
    earnedAchievements: unseen.earned,
    now: new Date(),
  });
});

/**
 * What this tab holds until it is first opened: Android builds every tab at launch, and this one
 * reads nothing until the owner looks at it (app-shell, "A tab reads storage only once it is first
 * opened"). Every hook below runs over it without touching storage, and the tab draws an empty body.
 */
const UNSEEN: ReportsHistory = reportsHistory({
  accounts: [],
  transactions: [],
  categoryNames: new Map(),
  goals: [],
  now: new Date(),
});

function ReportsScreen() {
  const router = useRouter();
  const [stored, , reloadWhenSeen] = useReloadOnFocus(
    useCallback(() => readReportsHistory(todayIso(new Date())), []),
    { whileUnseen: UNSEEN },
  );

  /**
   * A досягнення judged after a save (or a прогін) reaches this screen: at once in sight, on the
   * next focus otherwise (app-speed-pass design D5).
   */
  useEffect(() => onProgressJudged(reloadWhenSeen), [reloadWhenSeen]);

  const [shownCurrency, setShownCurrency] = useState<string>();
  const [chosenCategoryId, setChosenCategoryId] = useState<string>();
  /** The month whose numbers are spelled out. Undefined until tapped — the model reads the newest. */
  const [chosenMonth, setChosenMonth] = useState<string>();

  // Only what the choice changes is derived again on a tap; the history above is not.
  const model = useMemo(
    () => reportsSelection(stored, { shownCurrency, chosenCategoryId, chosenMonth }),
    [chosenCategoryId, chosenMonth, shownCurrency, stored],
  );

  // Adjusted during render: what the charts move from is the model drawn last.
  const [charts, setCharts] = useState<ChartMotion>(() =>
    chartMotion(
      {
        model: null,
        history: { kind: 'fade' },
        category: { kind: 'fade' },
        historyFades: 0,
        categoryFades: 0,
      },
      model,
    ),
  );
  if (charts.model !== model) {
    setCharts(chartMotion(charts, model));
  }

  if (stored === UNSEEN) {
    return <Screen>{null}</Screen>;
  }

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
              {/* Re-drawn with a cross-fade only when the bars cannot move (a sign flip, the room
                  below the baseline appearing or going); otherwise every bar moves. */}
              <Swap key={charts.historyFades} still={charts.historyFades === 0} style={styles.strip}>
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
                          from={fromOf(charts.history, column.month, bar.key, bar.size)}
                          color={BAR_COLORS[bar.key]!}
                          room={model.historyHasNegative}
                        />
                      ))}
                    </Column>
                  ))}
                </MonthStrip>
              </Swap>
            </View>
          </Card>

          <Card style={styles.chartCard}>
            <ThemedText type="overline">Одна категорія за місяцями</ThemedText>
            <Choices
              label="Категорія"
              choices={model.categoryChoices.map((c) => ({ value: c.id, label: c.label }))}
              selected={model.chosenCategoryId ?? undefined}
              onSelect={setChosenCategoryId}
              scroll
            />
            {model.categoryChart.length === 0 ? (
              <Swap key="choose">
                <ThemedText type="small" themeColor="textSecondary">
                  Оберіть категорію, щоб побачити її по місяцях.
                </ThemedText>
              </Swap>
            ) : (
              <Swap key="chart" style={styles.chartBody}>
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
                  <Swap
                    key={charts.categoryFades}
                    still={charts.categoryFades === 0}
                    style={styles.strip}>
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
                            from={fromOf(charts.category, column.month, 'spent', column.size)}
                            color={BAR_COLORS.spent!}
                            room={model.categoryChartHasNegative}
                          />
                        </Column>
                      ))}
                    </MonthStrip>
                  </Swap>
                </View>
              </Swap>
            )}
          </Card>
        </>
      )}

      <Card style={styles.chartCard}>
        <ThemedText type="overline">Цілі</ThemedText>
        {model.emptyGoalsMessage ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {model.emptyGoalsMessage}
            </ThemedText>
            {/* Not a dead end: the sentence says there is none, this is where one is made
                (reports-screen, "An empty цілі group leads to creating a ціль"). */}
            <Tap
              onPress={() => router.push('/manage/goals')}
              accessibilityRole="button"
              style={styles.goalOffer}>
              <ThemedText type="linkPrimary">Створити ціль</ThemedText>
              <Chevron />
            </Tap>
          </>
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
              <Tap
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
              </Tap>
            ))}
          </>
        ) : null}

        {model.goals.spending.length > 0 ? (
          <>
            <ThemedText type="small" themeColor="textMuted">
              {model.goals.spendingTitle}
            </ThemedText>
            {model.goals.spending.map((goal) => (
              <Tap
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
              </Tap>
            ))}
          </>
        ) : null}
      </Card>

      {/* The way in to «Прогрес», where the цілі already are. Present whether or not anything has
          been earned — «Прогрес» is the screen that says there is nothing yet — and it changes
          nothing this tab already shows. */}
      <Tap onPress={() => router.push(PROGRESS_ROUTE)} accessibilityRole="button">
        <Card style={styles.chartCard}>
          <View style={styles.row}>
            <ThemedText type="overline">Прогрес</ThemedText>
            <Chevron />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {model.progressBadge ?? 'Що вже вийшло і що варто зробити далі'}
          </ThemedText>
        </Card>
      </Tap>

      {/* The way in to «AI-аналіз», and nothing more: showing it computes nothing, builds no
          пакет and hands nothing to any app. It is offered on an empty history too — the
          AI-аналіз screen is the one that says there is nothing to analyse yet. */}
      <Tap onPress={() => router.push('/ai-analysis')} accessibilityRole="button">
        <Card style={styles.chartCard}>
          <View style={styles.row}>
            <ThemedText type="overline">AI-аналіз</ThemedText>
            <Chevron />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Передати ці числа застосунку, який ви оберете, щоб він їх пояснив
          </ThemedText>
        </Card>
      </Tap>
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
  goalOffer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half, minHeight: 44 },
  goalName: { flex: 1 },
  readout: { gap: Spacing.one },
  readoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  summaryOffer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, alignSelf: 'flex-start', paddingVertical: Spacing.one },
  readoutLabel: { flex: 1 },
  swatch: { width: Spacing.two, height: Spacing.two, borderRadius: Spacing.half },
  plot: { flexDirection: 'row', gap: Spacing.two },
  // The strip's place in the plot, as the ScrollView alone had it: whatever the axis leaves.
  strip: { flex: 1, minWidth: 0 },
  // The category chart's readout and plot, spaced as the card spaces its children.
  chartBody: { gap: Spacing.three },
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
  // Clipped: the bar inside is full height and slides out of the baseline (`FillColumn`).
  barHalf: { height: CHART_HEIGHT, justifyContent: 'flex-end', overflow: 'hidden' },
  barHalfBelow: { justifyContent: 'flex-start' },
  bar: { width: '100%', borderRadius: Spacing.half },
});

/**
 * The tab as the navigator mounts it: the screen inside the cross-fade every tab shares (motion,
 * "Screens enter from where they come from"; design D8).
 */
export default function ReportsTab() {
  return (
    <TabFade tab="reports">
      <ReportsScreen />
    </TabFade>
  );
}
