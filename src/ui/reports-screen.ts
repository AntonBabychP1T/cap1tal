import type { Account } from '../domain/account';
import { goalProgress, isOverdue, isReached, type Goal } from '../domain/goals';
import { money, type CurrencyCode, type Money } from '../domain/money';
import {
  categoriesInHistory,
  categorySeries,
  historySeries,
  type MonthTotals,
} from '../domain/reports';
import type { IsoDate, Month, Transaction } from '../domain/transaction';
import { formatMoney } from './amount-input';
import { todayIso } from './dates';
import { byName, categoryLabel } from './labels';
import { currentMonth, shortMonthLabel } from './months';

/**
 * Everything the «Звіти» tab renders, as data — so what it says is under `verify` even though the
 * bars themselves are JSX. The screen maps over this model and adds no decision of its own.
 *
 * The numbers are `domain/reports.ts`'s and the ціль states are `domain/goals.ts`'s; what lives
 * here is the presentation: which currency is shown, how tall each bar is against the others, what
 * scale it is read against, which month is spelled out in full under it, what a month is called,
 * and which sentence stands in for an empty chart.
 */

/** The three numbers of the history chart, in the order they are read. */
const HISTORY_KEYS = ['spent', 'income', 'invested'] as const;

type HistoryKey = (typeof HISTORY_KEYS)[number];

/** The glossary's words, as the chart's legend. */
const HISTORY_LABELS: Readonly<Record<HistoryKey, string>> = {
  spent: 'Витрачено',
  income: 'Дохід',
  invested: 'Інвестовано',
};

/**
 * One bar. `size` is a ratio, not money: the amount against the largest absolute value of its own
 * chart, so 1 is the tallest bar there and 0 is a month where nothing moved. `negative` says the
 * bar belongs below the baseline — a month of returns really is negative інвестовано, and drawing
 * it upwards would say the opposite of what happened.
 */
export interface ReportsBar {
  readonly amount: string;
  readonly size: number;
  readonly negative: boolean;
}

/** One month's column of the history chart: the three numbers sharing one scale. */
export interface HistoryColumn {
  readonly month: Month;
  /** «Сер 2026» — the month and its year, so no column is ambiguous across a year end. */
  readonly label: string;
  /** This is the month spelled out in full under the chart, and marked on it. */
  readonly selected: boolean;
  readonly bars: readonly (ReportsBar & { readonly key: HistoryKey; readonly label: string })[];
}

/** One month of the chosen category's chart. */
export interface CategoryColumn extends ReportsBar {
  readonly month: Month;
  readonly label: string;
  readonly selected: boolean;
}

/**
 * The scale one chart is read against. Without it a bar says only "taller than that other bar",
 * which is not an answer to "how much did August cost".
 *
 * `bottom` is `null` unless the chart holds a month below zero: a chart with nothing negative in
 * it should not label a half of itself it never uses. When it is there it is `top` with a minus
 * sign, because the scale is symmetric by construction — every bar is measured against the
 * largest *absolute* amount of its own chart.
 */
export interface ChartAxis {
  /** «45000,00 UAH» — what a full-height bar stands for. */
  readonly top: string;
  /** «0,00 UAH» — the baseline the bars grow from. */
  readonly zero: string;
  readonly bottom: string | null;
}

/** One month of the history chart, spelled out: the three numbers, each with its currency. */
export interface HistoryReadout {
  readonly month: Month;
  readonly label: string;
  readonly numbers: readonly {
    readonly key: HistoryKey;
    readonly label: string;
    readonly amount: string;
  }[];
}

/** The same for the category chart, which has one number per month. */
export interface CategoryReadout {
  readonly month: Month;
  readonly label: string;
  readonly amount: string;
}

/** One ціль as «Звіти» shows it: what was wanted, by when, and how far the рахунок has got. */
export interface ReportsGoalRow {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly deadline: IsoDate;
  /** The linked рахунок's розрахунковий баланс, read now. */
  readonly progress: string;
  readonly reached: boolean;
  readonly overdue: boolean;
}

export interface ReportsViewModel {
  /** The currencies the stored history holds, UAH first then alphabetically. */
  readonly currencies: readonly CurrencyCode[];
  /** The one currency governing both charts; `null` only when there is no chart to govern. */
  readonly shownCurrency: CurrencyCode | null;
  /** One currency is no choice: the switch is offered only when there is something to switch to. */
  readonly canSwitchCurrency: boolean;
  readonly history: readonly HistoryColumn[];
  /** The history chart's scale; `null` only when there is no chart to scale. */
  readonly historyAxis: ChartAxis | null;
  /** The picked month of the history chart, spelled out; `null` when there is no chart. */
  readonly historyReadout: HistoryReadout | null;
  /**
   * Some month of the history chart is below zero, so the chart needs room under its baseline.
   * A chart with nothing negative in it should not reserve half its height for the possibility.
   */
  readonly historyHasNegative: boolean;
  /** The categories some stored транзакція carries, under their current names. */
  readonly categoryChoices: readonly { readonly id: string; readonly label: string }[];
  readonly chosenCategoryId: string | null;
  readonly chosenCategoryLabel: string | null;
  readonly categoryChart: readonly CategoryColumn[];
  /** The category chart's scale; `null` while no category is chosen. */
  readonly categoryAxis: ChartAxis | null;
  /** The picked month of the category chart, spelled out; `null` while none is chosen. */
  readonly categoryReadout: CategoryReadout | null;
  /** The same, for the category chart — a category's month goes negative when повернення outran it. */
  readonly categoryChartHasNegative: boolean;
  readonly goals: readonly ReportsGoalRow[];
  /** What to say instead of an empty chart, or `null` when there is a chart. */
  readonly emptyHistoryMessage: string | null;
  /** What to say instead of an empty ціль list, or `null` when there are цілі. */
  readonly emptyGoalsMessage: string | null;
}

/** UAH first — the owner's own currency — then the rest alphabetically, so the order is stable. */
function byCurrency(a: CurrencyCode, b: CurrencyCode): number {
  if (a === b) return 0;
  if (a === 'UAH') return -1;
  if (b === 'UAH') return 1;
  return a < b ? -1 : 1;
}

/** The tallest thing in a chart, by absolute value — what every bar of it is measured against. */
function largest(amounts: readonly Money[]): number {
  return amounts.reduce((most, m) => Math.max(most, Math.abs(m.amount)), 0);
}

function bar(amount: Money, scale: number): ReportsBar {
  return {
    amount: formatMoney(amount),
    size: scale === 0 ? 0 : Math.abs(amount.amount) / scale,
    negative: amount.amount < 0,
  };
}

/** The tallest of the three numbers over every month — what the whole history chart is scaled to. */
function historyScaleOf(series: readonly MonthTotals[]): number {
  return largest(series.flatMap((month) => HISTORY_KEYS.map((key) => month[key])));
}

function historyColumns(
  series: readonly MonthTotals[],
  scale: number,
  readMonth: Month | null,
): HistoryColumn[] {
  return series.map((month) => ({
    month: month.month,
    label: shortMonthLabel(month.month),
    selected: month.month === readMonth,
    bars: HISTORY_KEYS.map((key) => ({
      key,
      label: HISTORY_LABELS[key],
      ...bar(month[key], scale),
    })),
  }));
}

/**
 * A chart's scale as the three labels beside it. An all-zero chart gets a scale of zero rather
 * than none: "nothing happened in this currency" is an answer, and a chart with no scale at all
 * cannot be told from a chart whose scale was left off — which is exactly the defect this fixes.
 */
function axisOf(scale: number, currency: CurrencyCode, hasNegative: boolean): ChartAxis {
  return {
    top: formatMoney(money(scale, currency)),
    zero: formatMoney(money(0, currency)),
    bottom: hasNegative ? formatMoney(money(-scale, currency)) : null,
  };
}

/**
 * Which month is spelled out: the one the owner picked, or — until they pick — the newest month of
 * the span that holds a сума of its own in the shown currency. The newest month of the span is the
 * current one, and the current one holds nothing until its first транзакція is recorded: opening
 * the tab on three zeroes spells out a month that has not happened yet while the month that did is
 * left unmentioned. A span whose every month is zero still spells out its newest — an all-zero
 * history is an answer, and blank is not.
 *
 * A picked month the span no longer holds — after a currency switch onto a shorter history, say —
 * falls through to the same choice rather than leaving nothing spelled out. Deciding it here, and
 * not in a `useEffect` that resets state, is what makes the fallback provable.
 */
function monthToRead(series: readonly MonthTotals[], chosen: Month | undefined): Month | null {
  if (chosen && series.some((month) => month.month === chosen)) {
    return chosen;
  }
  const happened = series.filter((month) => HISTORY_KEYS.some((key) => month[key].amount !== 0));
  const fallback = happened[happened.length - 1] ?? series[series.length - 1];
  return fallback?.month ?? null;
}

export function reportsViewModel(input: {
  /** Every рахунок, archived included: a transfer classified in any month may touch one. */
  accounts: readonly Account[];
  /** The whole stored history — `transactionsRepo.listAll()`. */
  transactions: readonly Transaction[];
  /** The категорії list as the screen loaded it, so the chooser reads the owner's own names. */
  categoryNames: ReadonlyMap<string, string>;
  goals: readonly Goal[];
  /** What the owner switched to; ignored when the history does not hold it. */
  shownCurrency?: CurrencyCode;
  /** What the owner chose; ignored when the history does not carry it. */
  chosenCategoryId?: string;
  /** The month whose numbers are spelled out; ignored when the span does not hold it. */
  chosenMonth?: Month;
  now: Date;
}): ReportsViewModel {
  const month = currentMonth(input.now);
  const series = historySeries({
    accounts: input.accounts,
    transactions: input.transactions,
    currentMonth: month,
  });

  const currencies = [...series.keys()].sort(byCurrency);
  // The first of them is UAH when UAH occurs and the alphabetically first one otherwise — the
  // ordering above says both at once.
  const shownCurrency =
    input.shownCurrency && currencies.includes(input.shownCurrency)
      ? input.shownCurrency
      : (currencies[0] ?? null);

  const offered = categoriesInHistory(input.transactions)
    .map((id) => ({ id, name: categoryLabel(id, input.categoryNames) }))
    .sort(byName)
    .map(({ id, name }) => ({ id, label: name }));

  const chosenCategoryId =
    input.chosenCategoryId && offered.some((c) => c.id === input.chosenCategoryId)
      ? input.chosenCategoryId
      : null;

  // Both charts span exactly the months `historyMonths` decided, so one picked month governs both:
  // June's history above August's Groceries would be two answers to one question.
  const shownSeries = shownCurrency ? series.get(shownCurrency)! : [];
  const readMonth = monthToRead(shownSeries, input.chosenMonth);

  const categoryMonths =
    chosenCategoryId && shownCurrency
      ? (categorySeries({
          categoryId: chosenCategoryId,
          transactions: input.transactions,
          currentMonth: month,
          currencies: [shownCurrency],
        }).get(shownCurrency) ?? [])
      : [];
  const categoryScale = largest(categoryMonths.map((m) => m.amount));
  const categoryChart: CategoryColumn[] = categoryMonths.map((m) => ({
    month: m.month,
    label: shortMonthLabel(m.month),
    selected: m.month === readMonth,
    ...bar(m.amount, categoryScale),
  }));

  const today = todayIso(input.now);
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));
  const goals: ReportsGoalRow[] = input.goals.map((goal) => {
    const account = accountsById.get(goal.accountId);
    // Storage refuses a ціль whose рахунок is not there, so the fallback is unreachable; it exists
    // so a half-loaded screen shows a ціль at zero rather than throwing on the way to a chart.
    const progress = account
      ? goalProgress(account, input.transactions)
      : money(0, goal.target.currency);
    return {
      id: goal.id,
      name: goal.name,
      target: formatMoney(goal.target),
      deadline: goal.deadline,
      progress: formatMoney(progress),
      reached: isReached(goal, progress),
      overdue: isOverdue(goal, progress, today),
    };
  });

  const historyScale = historyScaleOf(shownSeries);
  const history = shownCurrency ? historyColumns(shownSeries, historyScale, readMonth) : [];
  const historyHasNegative = history.some((column) => column.bars.some((b) => b.negative));
  const categoryChartHasNegative = categoryChart.some((column) => column.negative);

  // The month spelled out *is* the marked column, so the read-out and the bar can never disagree:
  // there is one formatted сума and both read it.
  const readHistory = history.find((column) => column.selected);
  const readCategory = categoryChart.find((column) => column.selected);

  return {
    currencies,
    shownCurrency,
    canSwitchCurrency: currencies.length > 1,
    history,
    historyAxis:
      shownCurrency && history.length > 0
        ? axisOf(historyScale, shownCurrency, historyHasNegative)
        : null,
    historyReadout: readHistory
      ? {
          month: readHistory.month,
          label: readHistory.label,
          numbers: readHistory.bars.map(({ key, label, amount }) => ({ key, label, amount })),
        }
      : null,
    historyHasNegative,
    categoryChoices: offered,
    chosenCategoryId,
    chosenCategoryLabel: chosenCategoryId
      ? categoryLabel(chosenCategoryId, input.categoryNames)
      : null,
    categoryChart,
    categoryAxis:
      shownCurrency && categoryChart.length > 0
        ? axisOf(categoryScale, shownCurrency, categoryChartHasNegative)
        : null,
    categoryReadout: readCategory
      ? { month: readCategory.month, label: readCategory.label, amount: readCategory.amount }
      : null,
    categoryChartHasNegative,
    goals,
    emptyHistoryMessage: emptyHistoryMessageFor(currencies.length, input.transactions.length > 0),
    emptyGoalsMessage: goals.length === 0 ? 'Цілей поки немає.' : null,
  };
}

/**
 * A history with nothing recorded says so rather than drawing an empty chart. A history that holds
 * only transfers between рахунки that move no monthly number — card to wallet, say — would be an
 * equally blank chart while being a different situation, so it gets its own sentence, exactly as
 * the Місяць screen gives that case its own.
 */
function emptyHistoryMessageFor(currencyCount: number, hasTransactions: boolean): string | null {
  if (currencyCount > 0) {
    return null;
  }
  return hasTransactions
    ? 'За всю історію гроші лише переходили між рахунками.'
    : 'Історія порожня — ще нічого не записано.';
}
