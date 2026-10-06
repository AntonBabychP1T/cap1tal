import type { StoredRate } from '../db/rates-repo';
import type { Account } from '../domain/account';
import {
  forecast,
  periodSummary,
  type HistoryPeriod,
  type MonthFigure,
} from '../domain/net-worth';
import { monthOf, type IsoDate, type Month } from '../domain/transaction';
import { MAX_PLOTTED_POINTS, monthTickLabels } from './dashboard-charts';
import { calendarLabel } from './dates';
import {
  ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
  DIRECTION_WORD,
  FUTURE_RECORDS_LINE,
  HISTORY_BASIS,
  HISTORY_BASIS_ACCESSIBILITY,
  OVERFLOW_REASON,
  TOTAL_HISTORY,
  TOTAL_HISTORY_CAPTION,
  TOTAL_HISTORY_CAPTION_ACCESSIBILITY,
  accountBasisLines,
  changeLine,
  directionOf,
  exactLine,
  headlineOf,
  historyChoices,
  investmentLine,
  monthName,
  percentText,
  rateFreshnessLabel,
  readingAmount,
  shortMonthName,
  signedReadingAmount,
  spokenAmount,
  type AccountBasisLine,
  type ChangeDirection,
  type HistoryChoice,
  type HistoryReading,
  type MonthTick,
  type NetWorthSeries,
} from './net-worth';

/**
 * The «Статок» screen's whole presentation (net-worth-screen spec), from one already-built
 * `NetWorthSeries` and the screen's own choices — the period, the view, «Прогноз» and the selected
 * month. Choosing any of them re-slices the same series; nothing here reads storage, a clock or the
 * network (design D6).
 */

/** «Стовпці» and «Лінія» draw the month-end level; «Зміна» each month's зміна. */
export type HistoryView = 'bars' | 'line' | 'change';

export const DEFAULT_PERIOD: HistoryPeriod = 12;
export const DEFAULT_VIEW: HistoryView = 'bars';

const PERIOD_LABELS: readonly { readonly id: HistoryPeriod; readonly label: string; readonly spoken: string }[] = [
  { id: 6, label: '6 міс', spoken: 'шість місяців' },
  { id: 12, label: '1 рік', spoken: 'один рік' },
  { id: 24, label: '2 роки', spoken: 'два роки' },
  { id: 'all', label: 'Усе', spoken: 'уся історія' },
];

const VIEW_LABELS: readonly { readonly id: HistoryView; readonly label: string }[] = [
  { id: 'bars', label: 'Стовпці' },
  { id: 'line', label: 'Лінія' },
  { id: 'change', label: 'Зміна' },
];

/** A chip of the period or the view selector. */
export interface ScreenChoice<T> {
  readonly id: T;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
}

/** One line of the selected month's розбивка. */
export interface BreakdownLine {
  readonly label: string;
  readonly text: string;
}

/** The card above the chart: the selected month's статок, its зміна and its розбивка. */
export interface MonthCard {
  readonly title: string;
  readonly value: string;
  /** Current month only: the поточна вартість beyond вкладено, reconciling the card and the bar. */
  readonly investmentLine?: string;
  /** Current month only: транзакції dated after today are in the статок, not in the history. */
  readonly futureLine?: string;
  readonly changeText: string;
  readonly changeDirection?: ChangeDirection;
  /**
   * What a screen reader says for `changeText`: «зміна мінус 56 000 гривень, спад, від 30 червня»,
   * the direction in words because the card draws a fall only in the danger colour (app-shell,
   * "Every switch and every coloured mark has an accessible name"). Without a зміна, its sentence.
   */
  readonly changeA11yLabel: string;
  readonly breakdown: readonly BreakdownLine[];
  /** The розбивка as one line, «дохід +60 000 · витрати −110 000 · коригування −6 000». */
  readonly breakdownText: string;
}

/** «Прогноз» drawn after today: the projected values and their range, in the reading's units. */
export interface ForecastDrawing {
  readonly values: readonly number[];
  readonly lows: readonly number[];
  readonly highs: readonly number[];
}

export interface ScreenChart {
  readonly kind: 'level' | 'change';
  readonly months: readonly Month[];
  /** The level (or the зміна, for «Зміна») per month; `undefined` where it is unknown or none. */
  readonly values: readonly (number | undefined)[];
  readonly ticks: readonly MonthTick[];
  /** The system text size the names were spaced for; `tickBoxes` draws them with it. */
  readonly fontScale: number;
  readonly selectedIndex: number;
  /** The months a рахунок entered in, by index: each carries a «нові рахунки» mark. */
  readonly entryIndexes: readonly number[];
  readonly accessibilityLabel: string;
  /** What TalkBack says for each month's bar or dot. */
  readonly monthLabels: readonly string[];
  readonly forecast?: ForecastDrawing;
}

export interface SummaryModel {
  readonly period: string;
  readonly change?: string;
  readonly average?: string;
  readonly best?: string;
  readonly worst?: string;
  readonly cutNote?: string;
}

export interface TableRow {
  readonly month: Month;
  readonly label: string;
  readonly value: string;
  readonly change?: string;
  readonly direction?: ChangeDirection;
  readonly note?: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
}

export interface NetWorthScreenModel {
  readonly emptyMessage?: string;
  readonly choices: readonly HistoryChoice[];
  readonly periods: readonly ScreenChoice<HistoryPeriod>[];
  readonly views: readonly ScreenChoice<HistoryView>[];
  /** Every exact per-currency current value on one line. */
  readonly exactLine: string;
  /** «Усе ≈ грн» without a rate: no card, chart, summary or table is drawn for it. */
  readonly withheldMessage?: string;
  readonly card?: MonthCard;
  readonly chart?: ScreenChart;
  /** Absent in «Зміна», which offers no forecast. */
  readonly forecastSwitch?: { readonly on: boolean };
  readonly forecastCaption?: string;
  readonly forecastWithheld?: string;
  readonly summary?: SummaryModel;
  readonly table: readonly TableRow[];
  readonly explanation: {
    readonly lines: readonly AccountBasisLine[];
    readonly accountsDifference: string;
    readonly caption: string;
    readonly captionAccessibilityLabel: string;
    readonly rateFreshness?: string;
  };
}

export interface ScreenChoices {
  readonly period: HistoryPeriod;
  readonly view: HistoryView;
  /** «Прогноз» switched on — off whenever the screen opens. */
  readonly forecast: boolean;
  /** The selected month; the current month when absent or outside the period. */
  readonly selectedMonth?: Month;
}

const BREAKDOWN_LABELS = {
  income: 'дохід',
  spending: 'витрати',
  correction: 'коригування',
  transfer: 'перекази й обмін',
  entered: 'нові рахунки',
} as const;

/**
 * The selected month's розбивка (net-worth-screen, "Selecting a month explains its change"): each
 * line signed, a zero one left out except дохід and витрати, «≈» on every amount of «Усе ≈ грн».
 */
function breakdownLines(reading: HistoryReading, figure: MonthFigure): BreakdownLine[] {
  return (Object.keys(BREAKDOWN_LABELS) as (keyof typeof BREAKDOWN_LABELS)[])
    .filter((key) => key === 'income' || key === 'spending' || figure.breakdown[key] !== 0)
    .map((key) => ({
      label: BREAKDOWN_LABELS[key],
      text: signedReadingAmount(reading, figure.breakdown[key]),
    }));
}

/** «вересень», or «жовтень (на 1 жовтня)» for the current month. */
function rowLabel(figure: MonthFigure, today: IsoDate, now: Date): string {
  const name = monthName(figure.month, now);
  return figure.date === today ? `${name} (на ${calendarLabel(today, now)})` : name;
}

/** What TalkBack says for one month: «липень, статок …, зміна мінус 56 000 гривень, спад». */
function spokenMonth(reading: HistoryReading, figure: MonthFigure, now: Date): string {
  const parts = [monthName(figure.month, now)];
  parts.push(
    figure.end === undefined ? `статок: ${OVERFLOW_REASON}` : `статок ${spokenAmount(reading, figure.end)}`,
  );
  if (figure.change.status === 'available') {
    parts.push(
      `зміна ${spokenAmount(reading, figure.change.absolute, true)}`,
      DIRECTION_WORD[directionOf(figure.change.absolute)],
    );
  }
  if (figure.entered !== 0) {
    parts.push(`нові рахунки ${spokenAmount(reading, figure.entered, true)}`);
  }
  return parts.join(', ');
}

/**
 * The card's зміна as TalkBack says it — built as the widget (`src/ui/net-worth.ts`) and
 * `spokenMonth` build theirs, with the same «від» and «нові рахунки» the drawn line carries.
 */
function changeA11yLabel(
  reading: HistoryReading,
  figure: MonthFigure,
  since: IsoDate | undefined,
  drawn: string,
  now: Date,
): string {
  if (figure.change.status !== 'available') return drawn;
  const parts = [
    `зміна ${spokenAmount(reading, figure.change.absolute, true)}`,
    DIRECTION_WORD[directionOf(figure.change.absolute)],
  ];
  if (since !== undefined) parts.push(`від ${calendarLabel(since, now)}`);
  if (figure.entered !== 0) parts.push(`нові рахунки ${spokenAmount(reading, figure.entered, true)}`);
  return parts.join(', ');
}

/** Labels at most this many months on a 360 dp screen. */
export const MAX_MONTH_LABELS = 12;

/**
 * The room one month name needs under the chart: a three-letter name in the 11 sp caption is about
 * 18 dp, and the rest keeps two names from touching.
 */
export const MIN_LABEL_DP = 24;

/** The chart's width before it has been measured — `NetWorthChart`'s own first guess. */
export const FALLBACK_CHART_WIDTH = 320;

/** The box one month name is drawn in at 100 % text; wide enough that no name is ever shortened. */
export const LABEL_BOX_DP = 40;

/** Where one month name is drawn under the chart, in dp from the chart's left edge. */
export interface TickBox {
  /** The middle of the `MIN_LABEL_DP × fontScale` the name owns; the spacing rule is on these. */
  readonly center: number;
  readonly left: number;
  readonly width: number;
  /** An edge name leans inward rather than hang over the chart's edge. */
  readonly align: 'left' | 'center' | 'right';
  /** The space between the box's aligned side and the name, for a name that leans inward. */
  readonly inset: number;
}

/**
 * The boxes the names at `indexes` are drawn in (net-worth-screen, "Every month is named and its
 * direction readable without colour"): each name owns `MIN_LABEL_DP × fontScale` around its centre,
 * which is its month's column unless that would put the name past the chart's edge; there it leans
 * inward, so the first and the last name are never clipped.
 */
export function tickBoxes(
  indexes: readonly number[],
  slots: number,
  chartWidth: number,
  fontScale: number,
): TickBox[] {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const slot = chartWidth / Math.max(slots, 1);
  const room = Math.min(MIN_LABEL_DP * scale, chartWidth);
  const box = Math.min(LABEL_BOX_DP * scale, chartWidth);
  return indexes.map((index) => {
    const x = (index + 0.5) * slot;
    const center = Math.min(Math.max(x, room / 2), chartWidth - room / 2);
    if (x - box / 2 < 0) {
      return { center, left: 0, width: box, align: 'left', inset: center - room / 2 };
    }
    if (x + box / 2 > chartWidth) {
      return { center, left: chartWidth - box, width: box, align: 'right', inset: chartWidth - center - room / 2 };
    }
    return { center, left: x - box / 2, width: box, align: 'center', inset: 0 };
  });
}

/**
 * The months named under a chart of `count` slots whose `current` month may be followed by
 * «Прогноз» (net-worth-screen, "Every month is named and its direction readable without colour"):
 * at most as many as `chartWidth` has room for at the text size `fontScale`, and when even those
 * crowd one another, fewer, until no two drawn names are closer than `MIN_LABEL_DP × fontScale`.
 */
function namedMonths(count: number, current: number, chartWidth: number, fontScale: number): number[] {
  const room = MIN_LABEL_DP * fontScale;
  const roomy = (indexes: readonly number[]) => {
    const centers = tickBoxes(indexes, count, chartWidth, fontScale).map((box) => box.center);
    return centers.every((center, i) => i === 0 || center - centers[i - 1]! >= room);
  };
  for (let cap = Math.min(MAX_MONTH_LABELS, Math.floor(chartWidth / room)); cap >= 2; cap -= 1) {
    const indexes = monthTickLabels(count, cap, current);
    if (roomy(indexes)) return indexes;
  }
  return current === 0 ? [0] : [0, current];
}

/** The «Статок» screen's model (net-worth-screen spec). */
export function netWorthScreenModel(input: {
  readonly series: NetWorthSeries;
  readonly accounts: readonly Account[];
  readonly rates: readonly StoredRate[];
  readonly choices: ScreenChoices;
  readonly now: Date;
  readonly today: IsoDate;
  /** The chart's measured width in dp; `FALLBACK_CHART_WIDTH` until it is known. */
  readonly chartWidth?: number;
  /** The system text size, 1 at 100 %: month names widen with it. */
  readonly fontScale?: number;
}): NetWorthScreenModel {
  const { series, choices, now, today } = input;
  const periods = PERIOD_LABELS.map((p) => ({
    id: p.id,
    label: p.label,
    accessibilityLabel: p.id === choices.period ? `Період ${p.spoken}, обрано` : `Період ${p.spoken}`,
    selected: p.id === choices.period,
  }));
  const views = VIEW_LABELS.map((v) => ({
    id: v.id,
    label: v.label,
    accessibilityLabel: v.id === choices.view ? `Вигляд ${v.label}, обрано` : `Вигляд ${v.label}`,
    selected: v.id === choices.view,
  }));
  const total = series.selection === TOTAL_HISTORY;
  const accountNames = new Map(input.accounts.map((a) => [a.id, a.name]));
  const accountKinds = new Map(input.accounts.map((a) => [a.id, a.kind]));
  const explanation = {
    lines:
      series.current.status === 'ready'
        ? accountBasisLines(series.current.contributions, accountNames, now, accountKinds)
        : [],
    accountsDifference: ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
    caption: total ? TOTAL_HISTORY_CAPTION : HISTORY_BASIS,
    captionAccessibilityLabel: total ? TOTAL_HISTORY_CAPTION_ACCESSIBILITY : HISTORY_BASIS_ACCESSIBILITY,
    ...(series.oldestRateAt ? { rateFreshness: rateFreshnessLabel(series.oldestRateAt, now) } : {}),
  };
  const base = {
    choices: historyChoices(series.currencies, series.selection),
    periods,
    views,
    exactLine: exactLine(series.current),
    explanation,
  };
  if (series.selection === undefined) {
    return { ...base, emptyMessage: 'Ще немає рахунків', table: [] };
  }
  const reading = series.reading;
  if (reading === undefined || reading.months.length === 0) {
    return { ...base, ...(series.withheldMessage ? { withheldMessage: series.withheldMessage } : {}), table: [] };
  }

  const all = reading.months;
  const shown = choices.period === 'all' ? all : all.slice(-choices.period);
  const current = all.at(-1)!;
  const selected =
    shown.find((m) => m.month === choices.selectedMonth) ?? shown.at(-1)!;
  const indexInAll = (figure: MonthFigure) => all.indexOf(figure);
  const previousOf = (figure: MonthFigure) => all[indexInAll(figure) - 1];

  // The card: the current month reads the current Статок, named «на <today>», as the widget does.
  const isCurrent = selected === current;
  const change = changeLine(reading, selected, previousOf(selected)?.date, now);
  const breakdown = breakdownLines(reading, selected);
  const card: MonthCard = {
    title: `Статок на ${calendarLabel(selected.date, now)}`,
    value: isCurrent
      ? (headlineOf(series, input.rates) ?? OVERFLOW_REASON)
      : selected.end === undefined
        ? OVERFLOW_REASON
        : readingAmount(reading, selected.end),
    ...(() => {
      const line = isCurrent ? investmentLine(series, input.rates, now) : undefined;
      return line ? { investmentLine: line } : {};
    })(),
    ...(isCurrent && series.hasFutureRecords ? { futureLine: FUTURE_RECORDS_LINE } : {}),
    changeText: change.text,
    ...(change.direction ? { changeDirection: change.direction } : {}),
    changeA11yLabel: changeA11yLabel(reading, selected, previousOf(selected)?.date, change.text, now),
    breakdown,
    breakdownText: breakdown.map((line) => `${line.label} ${line.text}`).join(' · '),
  };

  // The chart: at most `MAX_PLOTTED_POINTS` months, the newest (design D7); the table lists all.
  const kind = choices.view === 'change' ? 'change' : 'level';
  const plotted = shown.slice(-MAX_PLOTTED_POINTS);
  const values = plotted.map((m) =>
    kind === 'level' ? m.end : m.change.status === 'available' ? m.change.absolute : undefined,
  );
  const periodLabel = PERIOD_LABELS.find((p) => p.id === choices.period)!.spoken;
  const scale = reading.approximate ? 'гривнях, наближено' : reading.currency;
  const readingName = reading.approximate ? 'усе наближено в гривнях' : reading.currency;

  // «Прогноз»: only for the level views, only when switched on.
  const prognosis = kind === 'level' ? forecast(all, today) : undefined;
  let forecastDrawing: ForecastDrawing | undefined;
  let forecastCaption: string | undefined;
  let forecastWithheld: string | undefined;
  if (prognosis !== undefined && choices.forecast) {
    if (prognosis.status === 'ready') {
      // The current month's end is already a projected point; it is drawn after today's bar.
      forecastDrawing = {
        values: prognosis.points.map((p) => p.value),
        lows: prognosis.points.map((p) => p.low),
        highs: prognosis.points.map((p) => p.high),
      };
      const last = prognosis.points.at(-1)!;
      forecastCaption =
        `≈ якщо темп збережеться: ${signedReadingAmount(reading, prognosis.pace)} на місяць, медіана останніх 6 місяців. ` +
        `${calendarLabel(last.date, now)}: ${approxOf(reading, last.value)} (від ${approxOf(reading, last.low)} до ${approxOf(reading, last.high)})`;
    } else {
      forecastWithheld =
        prognosis.reason === 'too-short'
          ? 'Прогноз недоступний: потрібно 6 повних місяців.'
          : `Прогноз недоступний: ${OVERFLOW_REASON}.`;
    }
  }

  // The months named under the chart: «Прогноз»'s months count among them (design D16).
  const slotMonths = [
    ...plotted.map((m) => m.month),
    ...(forecastDrawing && prognosis?.status === 'ready' ? prognosis.points.map((p) => monthOf(p.date)) : []),
  ];
  // «Прогноз»'s first slot is the current month's own end, after today's bar: a month already named
  // under its recorded bar is not named a second time.
  const named = new Set<Month>();
  const fontScale = input.fontScale !== undefined && Number.isFinite(input.fontScale) && input.fontScale > 0 ? input.fontScale : 1;
  const ticks = namedMonths(slotMonths.length, plotted.length - 1, input.chartWidth ?? FALLBACK_CHART_WIDTH, fontScale).flatMap(
    (index) => {
      const month = slotMonths[index]!;
      if (named.has(month)) return [];
      named.add(month);
      return [{ index, text: shortMonthName(month), current: plotted[index] === current }];
    },
  );

  const chart: ScreenChart = {
    kind,
    months: plotted.map((m) => m.month),
    values,
    ticks,
    fontScale,
    selectedIndex: plotted.indexOf(selected),
    entryIndexes: plotted.flatMap((m, i) => (m.entered !== 0 ? [i] : [])),
    accessibilityLabel:
      `Графік статку, ${readingName}, ${kind === 'level' ? 'рівень на кінець місяця' : 'зміна за місяць'}, період ${periodLabel}, шкала в ${scale}` +
      (forecastDrawing ? ', далі прогноз на 6 місяців, якщо темп збережеться' : ''),
    monthLabels: plotted.map((m) => spokenMonth(reading, m, now)),
    ...(forecastDrawing ? { forecast: forecastDrawing } : {}),
  };

  // The summary beneath the chart.
  const summary = periodSummary(all, choices.period);
  const summaryModel: SummaryModel | undefined = summary
    ? {
        period: `${monthName(summary.startMonth, now)} — ${calendarLabel(today, now)}`,
        ...(summary.change !== undefined
          ? {
              change: `Зміна за період: ${signedReadingAmount(reading, summary.change)}${summary.percent !== undefined ? ` · ${percentText(summary.percent)}` : ''}`,
            }
          : {}),
        ...(summary.average !== undefined
          ? {
              average: `Середня за місяць: ${signedReadingAmount(reading, summary.average)} (повних місяців: ${summary.completeMonths})`,
            }
          : {}),
        ...(summary.best
          ? { best: `Найкращий: ${monthName(summary.best.month, now)} ${signedReadingAmount(reading, summary.best.change)}` }
          : {}),
        ...(summary.worst
          ? { worst: `Найгірший: ${monthName(summary.worst.month, now)} ${signedReadingAmount(reading, summary.worst.change)}` }
          : {}),
        ...(summary.cut ? { cutNote: `Історія коротша за період: від ${monthName(summary.startMonth, now)}` } : {}),
      }
    : undefined;

  // The month table, newest first.
  const table: TableRow[] = [...shown].reverse().map((m) => {
    const line = m.change.status === 'available' ? changeLine(reading, { change: m.change, entered: 0 }, undefined, now) : undefined;
    return {
      month: m.month,
      label: rowLabel(m, today, now),
      value: m.end === undefined ? OVERFLOW_REASON : readingAmount(reading, m.end),
      ...(line ? { change: line.text } : {}),
      ...(line?.direction ? { direction: line.direction } : {}),
      ...(m.entered !== 0 ? { note: `нові рахунки ${signedReadingAmount(reading, m.entered)}` } : {}),
      accessibilityLabel: spokenMonth(reading, m, now),
      selected: m === selected,
    };
  });

  return {
    ...base,
    card,
    chart,
    ...(kind === 'level' ? { forecastSwitch: { on: choices.forecast } } : {}),
    ...(forecastCaption ? { forecastCaption } : {}),
    ...(forecastWithheld ? { forecastWithheld } : {}),
    ...(summaryModel ? { summary: summaryModel } : {}),
    table,
  };
}

/** A projected value: always «≈», even on an exact currency's reading. */
function approxOf(reading: HistoryReading, minor: number): string {
  return reading.approximate ? readingAmount(reading, minor) : `≈ ${readingAmount(reading, minor)}`;
}
