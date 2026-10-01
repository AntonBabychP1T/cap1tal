import type { Account } from './account';
import { contribution } from './goals';
import type { CurrentValue } from './investments';
import { money, type CurrencyCode, type Money } from './money';
import { monthOf, type IsoDate, type Month, type Transaction } from './transaction';

/**
 * Статок: a derived reading of every recorded рахунок's contribution, never a stored balance of
 * its own. See openspec net-worth capability, decision D3.
 *
 * `Statok is a reading of existing account contributions`, `Archived and debt accounts retain
 * their signed contributions`, `Current valuation states its scope and dates`.
 */

/** One рахунок's signed contribution to Статок, in its own currency. */
export interface AccountContribution {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly amount: Money;
  /**
   * `ledger`: the рахунок's розрахунковий баланс (`computeBalance`). `currentValue`: an
   * інвестиційний рахунок's latest entered поточна вартість, replacing — never adding to —
   * вкладено; `asOf` is set exactly when this is `currentValue`.
   */
  readonly basis: 'ledger' | 'currentValue';
  readonly asOf?: IsoDate;
  /**
   * The розрахунковий баланс (вкладено) a `currentValue` replaced — set exactly when `basis` is
   * `currentValue`, so how far the headline stands from today's history point can be stated
   * (net-worth, "The поточна вартість beyond вкладено is read on its own").
   */
  readonly ledger?: Money;
}

/**
 * One currency's total, or why it has none: `overflow`, a sum would be unsafe to represent
 * exactly. Nothing else leaves a total unknown — every рахунок enters history at its дата
 * початкового залишку (net-worth, "A рахунок enters Статок history at its дата початкового
 * залишку"), so no рахунок is ever unknown at a date.
 */
export type CurrencyTotal =
  | { readonly status: 'known'; readonly amount: Money }
  | { readonly status: 'unavailable'; readonly reason: 'overflow' };

export type NetWorthReading =
  | { readonly status: 'empty' }
  | {
      readonly status: 'ready';
      readonly contributions: readonly AccountContribution[];
      readonly totals: ReadonlyMap<CurrencyCode, CurrencyTotal>;
    };

/**
 * Sums same-currency amounts the way every other exact total in this app does — except that an
 * amount `money()` itself would refuse (unsafe to represent as an integer) becomes `unavailable`
 * rather than a thrown exception or a silently wrong number (design D3, "Overflow… yields an
 * unavailable value, never an unsafe integer").
 */
function sumSafely(currency: CurrencyCode, amounts: readonly number[]): CurrencyTotal {
  const total = amounts.reduce((sum, a) => sum + a, 0);
  try {
    return { status: 'known', amount: money(total, currency) };
  } catch {
    return { status: 'unavailable', reason: 'overflow' };
  }
}

/**
 * The current Статок reading: every recorded рахунок's contribution — archived and debt included,
 * with their sign, an інвестиційний рахунок's latest поточна вартість replacing вкладено when one
 * has been entered — grouped into an exact per-currency total.
 *
 * No accounts at all is `empty`, not a zeroed reading — a рахунок yet to be created is not the
 * same statement as "everything is worth nothing" (net-worth, "Empty and incomplete data are not
 * zero money"). Every account that exists is otherwise represented, whatever its balance: a known
 * zero balance is a genuine reading, not the absence of one.
 *
 * `currentValues` carries a рахунок's own `CurrentValue` only when one was ever entered for it;
 * an інвестиційний рахунок absent from it falls back to вкладено (`contribution`'s own rule) —
 * present with a zero amount is a real observation, not absence (net-worth, "Zero observation is
 * not absence").
 */
export function currentNetWorth(input: {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly currentValues: ReadonlyMap<string, CurrentValue>;
  /**
   * `computeBalances` over the same `transactions`, when the caller already has it — so the reading
   * does not fold the whole history once per рахунок (app-speed-pass design D7).
   */
  readonly balances?: ReadonlyMap<string, Money>;
}): NetWorthReading {
  if (input.accounts.length === 0) {
    return { status: 'empty' };
  }

  const contributions: AccountContribution[] = input.accounts.map((account) => {
    const currentValue = input.currentValues.get(account.id);
    const usesCurrentValue = account.kind === 'investment' && currentValue !== undefined;
    const amount = contribution(account, input.transactions, currentValue?.amount, input.balances);
    return {
      accountId: account.id,
      currency: account.currency,
      amount,
      basis: usesCurrentValue ? 'currentValue' : 'ledger',
      ...(usesCurrentValue
        ? {
            asOf: currentValue.asOf,
            ledger: contribution(account, input.transactions, undefined, input.balances),
          }
        : {}),
    };
  });

  const byCurrency = new Map<CurrencyCode, number[]>();
  for (const c of contributions) {
    const list = byCurrency.get(c.currency) ?? [];
    list.push(c.amount.amount);
    byCurrency.set(c.currency, list);
  }

  const totals = new Map<CurrencyCode, CurrencyTotal>();
  for (const [currency, amounts] of byCurrency) {
    totals.set(currency, sumSafely(currency, amounts));
  }

  return { status: 'ready', contributions, totals };
}

/**
 * The поточна вартість beyond вкладено, per currency (net-worth, "The поточна вартість beyond
 * вкладено is read on its own"): Σ(поточна вартість − вкладено) over the рахунки counted at their
 * поточна вартість, with the oldest observation date among them. The headline counts it and today's
 * history point does not, so it is stated beside the headline and never folded into зміна.
 */
export function investmentDifference(
  reading: NetWorthReading,
): ReadonlyMap<CurrencyCode, { readonly amount: Money; readonly asOf: IsoDate }> {
  const result = new Map<CurrencyCode, { amount: Money; asOf: IsoDate }>();
  if (reading.status !== 'ready') return result;
  for (const c of reading.contributions) {
    if (c.basis !== 'currentValue' || c.ledger === undefined || c.asOf === undefined) continue;
    const previous = result.get(c.currency);
    const amount = (previous?.amount.amount ?? 0) + c.amount.amount - c.ledger.amount;
    result.set(c.currency, {
      amount: money(amount, c.currency),
      asOf: previous !== undefined && previous.asOf < c.asOf ? previous.asOf : c.asOf,
    });
  }
  return result;
}

/**
 * History (net-worth, "History is reconstructed…", "A рахунок enters Статок history…", "History
 * spans…").
 *
 * Always on the ledger basis — вкладено for an investment, never its поточна вартість: no
 * `currentValues` reach here at all, so a valuation entered today cannot join the curve for a
 * past date by construction (net-worth, "Today's valuation never changes past points").
 */

/** Which line of the розбивка a транзакція's effect belongs to. Витрата and повернення are one. */
export type MovementKind = 'income' | 'spending' | 'correction' | 'transfer';

/** One рахунок's net effect in one month, split by `MovementKind`; an absent kind moved nothing. */
export type MovementByKind = Readonly<Partial<Record<MovementKind, number>>>;

/**
 * The per-account, per-month ingredients one рахунок's historical points are built from — the
 * shape `src/db/net-worth-repo.ts` reads, kept here as plain data so this module stays pure. A
 * рахунок with no `firstDate` has never carried a транзакція on or before the date history is
 * read for.
 */
export interface AccountHistoryInput {
  readonly account: Account;
  readonly firstDate?: IsoDate;
  /** Net effect through (and including) `firstDate` — absent exactly when `firstDate` is. */
  readonly firstDateNet?: number;
  /** One entry per calendar month that had any movement; a month absent from it had none. */
  readonly monthlyNet: ReadonlyMap<Month, number>;
  /** The same movement split by kind, for the розбивка; absent when the caller reads no розбивка. */
  readonly monthlyByKind?: ReadonlyMap<Month, MovementByKind>;
}

export interface HistoryPoint {
  readonly date: IsoDate;
  readonly totals: ReadonlyMap<CurrencyCode, CurrencyTotal>;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** Small and local on purpose — the domain never imports `src/ui/months.ts` (design D4). */
function nextMonth(month: Month): Month {
  const match = MONTH_PATTERN.exec(month)!;
  const year = Number(match[1]);
  const m = Number(match[2]);
  return m === 12
    ? `${String(year + 1).padStart(4, '0')}-01`
    : `${String(year).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysOf(month: Month): number {
  const match = MONTH_PATTERN.exec(month)!;
  return daysInMonth(Number(match[1]), Number(match[2]));
}

/** The last calendar date of `month`, as `'YYYY-MM-DD'`. */
export function monthEndDate(month: Month): IsoDate {
  return `${month}-${String(daysOf(month)).padStart(2, '0')}`;
}

/** Every calendar month from `first` through `last`, in order. */
function monthsBetween(first: Month, last: Month): Month[] {
  const months: Month[] = [];
  for (let month = first; month <= last; month = nextMonth(month)) {
    months.push(month);
  }
  return months;
}

/**
 * The day a рахунок enters history (net-worth, "A рахунок enters Статок history at its дата
 * початкового залишку", design D1): the earlier of its recorded дата початкового залишку and its
 * first транзакція on or before `today` (the repository bounds `firstDate` so), the first
 * транзакція alone without a recorded дата, and `today` with neither — so today's point always
 * holds every рахунок, as the current Статок does. A recorded дата after today, which the
 * repository refuses but an older file might carry, counts as today. Derived, never stored: a
 * backdated транзакція can move it at any time.
 */
export function entryDate(input: AccountHistoryInput, today: IsoDate): IsoDate {
  const recorded = input.account.openingDate;
  const first = input.firstDate;
  const candidates = [recorded, first].filter((d): d is IsoDate => d !== undefined && d <= today);
  return candidates.length === 0 ? today : candidates.reduce((min, d) => (d < min ? d : min));
}

/**
 * The dated points history reads at: the first entry, each calendar month-end from its month
 * through the month before `today`'s, and `today` — deduplicated, in order (net-worth, "History
 * spans the available record without forecasting"). `today`'s own month never contributes a
 * separate month-end: `today` stands for it, whether or not `today` is that month's last day.
 */
function candidateDates(firstDate: IsoDate, today: IsoDate): IsoDate[] {
  const todayMonth = monthOf(today);
  const dates: IsoDate[] = [firstDate];
  for (let month = monthOf(firstDate); month < todayMonth; month = nextMonth(month)) {
    dates.push(monthEndDate(month));
  }
  dates.push(today);
  return [...new Set(dates)];
}

/**
 * One рахунок's value at each of `dates` (ascending): nothing before its `entry`, its opening plus
 * every movement through the date from it on. The one candidate date that is not a month-end or
 * `today` — the history's first date — is the one point needing `firstDateNet`'s sub-month
 * precision; every other candidate is a whole month-end (or `today`, already bounded to it by the
 * repository), so the cumulative monthly sum is exact there without it. Nothing moves before a
 * рахунок's first транзакція, and its entry is never after it, so at the first date a рахунок
 * whose first транзакція is later has moved by nothing yet.
 */
function valuesAt(
  input: AccountHistoryInput,
  entry: IsoDate,
  dates: readonly IsoDate[],
  globalFirstDate: IsoDate,
): number[] {
  const opening = input.account.openingBalance.amount;
  const months = [...input.monthlyNet.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let index = 0;
  let cumulative = 0;
  return dates.map((date) => {
    if (date < entry) return 0;
    if (date === globalFirstDate) {
      return opening + (input.firstDate === date ? (input.firstDateNet ?? 0) : 0);
    }
    const month = monthOf(date);
    while (index < months.length && months[index]![0] <= month) {
      cumulative += months[index]![1];
      index += 1;
    }
    return opening + cumulative;
  });
}

/**
 * The reconstructed Статок history: one point per candidate date, each currency's total the sum of
 * its рахунки there — every рахунок known at every date, so only a sum too large to represent
 * leaves one unknown. No рахунок at all → no points: there is nothing to have a history of.
 */
export function netWorthHistory(input: {
  readonly accounts: readonly AccountHistoryInput[];
  readonly today: IsoDate;
}): readonly HistoryPoint[] {
  if (input.accounts.length === 0) {
    return [];
  }
  const entries = input.accounts.map((a) => entryDate(a, input.today));
  const globalFirstDate = entries.reduce((min, d) => (d < min ? d : min));
  const dates = candidateDates(globalFirstDate, input.today);

  const byCurrency = new Map<CurrencyCode, number[][]>();
  input.accounts.forEach((a, i) => {
    const list = byCurrency.get(a.account.currency) ?? [];
    list.push(valuesAt(a, entries[i]!, dates, globalFirstDate));
    byCurrency.set(a.account.currency, list);
  });

  return dates.map((date, d) => {
    const totals = new Map<CurrencyCode, CurrencyTotal>();
    for (const [currency, values] of byCurrency) {
      totals.set(currency, sumSafely(currency, values.map((v) => v[d]!)));
    }
    return { date, totals };
  });
}

/** `round(numerator × 1000 / denominator) / 10` — one decimal place, no accumulated drift. */
function roundToOneDecimal(numerator: number, denominator: number): number {
  return roundHalfAway(numerator * 1000, denominator) / 10;
}

/** `numerator / denominator` rounded to an integer, halves away from zero — exact on integers. */
export function roundHalfAway(numerator: number, denominator: number): number {
  const negative = numerator < 0 !== denominator < 0;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const magnitude = Math.floor((2 * n + d) / (2 * d));
  // `+ 0` turns the −0 a zero magnitude would carry into 0.
  return (negative ? -magnitude : magnitude) + 0;
}

/**
 * The зміна between two known levels (net-worth, "Change requires a comparable previous
 * month-end"): their difference less the початкові залишки that `entered` between them, stated
 * apart and never as growth, and a percentage only of a strictly positive base. Both levels are
 * recorded-balance points, so an entered поточна вартість never enters or withholds it and a
 * транзакція dated after today never reaches either. Every month of every reading — today's
 * against the preceding month-end included, and the «≈» one — goes through here.
 */
export function changeOf(
  end: number,
  previous: number,
  entered: number,
): { readonly absolute: number; readonly percent?: number } {
  const absolute = end - previous - entered;
  return previous > 0 ? { absolute, percent: roundToOneDecimal(absolute, previous) } : { absolute };
}

/**
 * A month's розбивка (net-worth, "Each month's change has a розбивка"): what moved the level from
 * the previous month-end (zero before the first entry) to this month's end, or to today for the
 * current month — adding up to exactly that difference.
 */
export interface MonthBreakdown {
  readonly income: number;
  /** Витрати net of повернення — not Місяць's витрачено: коригування are their own line. */
  readonly spending: number;
  readonly correction: number;
  /** Перекази й обмін: zero for a переказ within one currency, non-zero only across currencies. */
  readonly transfer: number;
  /** Нові рахунки: the початкові залишки entering this month, which the зміна leaves out. */
  readonly entered: number;
}

/** A month's зміна, or why it has none. */
export type MonthChange =
  | { readonly status: 'available'; readonly absolute: number; readonly percent?: number }
  | {
      readonly status: 'unavailable';
      /** `no-baseline`: the history's first month; `overflow`: a level is not representable. */
      readonly reason: 'no-baseline' | 'overflow';
    };

/** One month of one reading: its level, what entered, its зміна and its розбивка. */
export interface MonthFigure {
  readonly month: Month;
  /** The month-end, or today for the current month. */
  readonly date: IsoDate;
  /** The level at `date`; absent when it is not representable. */
  readonly end?: number;
  readonly entered: number;
  readonly change: MonthChange;
  readonly breakdown: MonthBreakdown;
}

/**
 * The month-by-month reading of every currency (net-worth, "Each month's change has a розбивка"):
 * from the month of the history's first date through today's, each with its level, its нові
 * рахунки, its зміна against the month before — none for the first month, which has no preceding
 * month-end — and its розбивка. The identity Σ розбивка = end − previous end (0 before the first)
 * holds by construction: every movement of a рахунок is on or after its entry.
 */
export function monthFigures(input: {
  readonly accounts: readonly AccountHistoryInput[];
  readonly today: IsoDate;
}): ReadonlyMap<CurrencyCode, readonly MonthFigure[]> {
  const result = new Map<CurrencyCode, MonthFigure[]>();
  const points = netWorthHistory(input);
  if (points.length === 0) return result;
  const pointAt = new Map(points.map((p) => [p.date, p]));
  const months = monthsBetween(monthOf(points[0]!.date), monthOf(input.today));
  const todayMonth = monthOf(input.today);

  const currencies = [...new Set(input.accounts.map((a) => a.account.currency))];
  for (const currency of currencies) {
    const accounts = input.accounts.filter((a) => a.account.currency === currency);
    const entered = new Map<Month, number>();
    for (const a of accounts) {
      const month = monthOf(entryDate(a, input.today));
      entered.set(month, (entered.get(month) ?? 0) + a.account.openingBalance.amount);
    }
    const figures: MonthFigure[] = [];
    let previous: number | undefined | null = null; // null: before the first month
    for (const month of months) {
      const date = month === todayMonth ? input.today : monthEndDate(month);
      const total = pointAt.get(date)?.totals.get(currency);
      const end = total?.status === 'known' ? total.amount.amount : undefined;
      const monthEntered = entered.get(month) ?? 0;
      const kinds = { income: 0, spending: 0, correction: 0, transfer: 0 };
      for (const a of accounts) {
        const byKind = a.monthlyByKind?.get(month);
        if (byKind === undefined) continue;
        for (const kind of Object.keys(kinds) as MovementKind[]) {
          kinds[kind] += byKind[kind] ?? 0;
        }
      }
      const change: MonthChange =
        previous === null
          ? { status: 'unavailable', reason: 'no-baseline' }
          : previous === undefined || end === undefined
            ? { status: 'unavailable', reason: 'overflow' }
            : { status: 'available', ...changeOf(end, previous, monthEntered) };
      figures.push({
        month,
        date,
        ...(end === undefined ? {} : { end }),
        entered: monthEntered,
        change,
        breakdown: { ...kinds, entered: monthEntered },
      });
      previous = end;
    }
    result.set(currency, figures);
  }
  return result;
}

/** The figures `periodSummary` and `forecast` read — one currency's, or the «≈» reading's. */
export type MonthSeries = readonly Pick<MonthFigure, 'month' | 'end' | 'change'>[];

/** A period of history, counting the current month and the months before it. */
export type HistoryPeriod = 6 | 12 | 24 | 'all';

export interface PeriodSummary {
  /** The period's first month — the history's first when the period was cut. */
  readonly startMonth: Month;
  /** The period asked for more months than the history has. */
  readonly cut: boolean;
  /** Σ of the months' зміни; absent when one of them is not known. */
  readonly change?: number;
  /** Of the level before the period (the first month's end, when cut), only when positive. */
  readonly percent?: number;
  /** Per complete month, halves away from zero; absent without a complete month. */
  readonly average?: number;
  readonly completeMonths: number;
  readonly best?: { readonly month: Month; readonly change: number };
  readonly worst?: { readonly month: Month; readonly change: number };
}

/**
 * The summary of a period ending today (net-worth, "A period of history is summarised"). A complete
 * month is one that ended before today and has a зміна — never the current one, never the
 * history's first. A period longer than the history is cut to it and says so; its зміна then runs
 * from the end of the history's first month, whose level is the percentage's base. Ties for best or
 * worst go to the earlier month.
 */
export function periodSummary(months: MonthSeries, period: HistoryPeriod): PeriodSummary | undefined {
  if (months.length === 0) return undefined;
  const wanted = period === 'all' ? months.length : period;
  const cut = period !== 'all' && wanted > months.length;
  const start = Math.max(0, months.length - wanted);
  const included = months.slice(start);
  const base = start === 0 ? months[0]!.end : months[start - 1]!.end;
  const counted = start === 0 ? included.slice(1) : included;

  // A history of the current month alone has no month with a зміна: no period change at all,
  // rather than a zero one (net-worth, "No history or one date").
  const known = counted.length > 0 && counted.every((m) => m.change.status === 'available');
  const sum = counted.reduce(
    (total, m) => total + (m.change.status === 'available' ? m.change.absolute : 0),
    0,
  );
  // `counted` ends with the current month, which is never complete.
  const complete = counted
    .slice(0, -1)
    .filter((m) => m.change.status === 'available') as (MonthSeries[number] & {
    change: { status: 'available'; absolute: number };
  })[];
  const best = complete.reduce<(typeof complete)[number] | undefined>(
    (top, m) => (top === undefined || m.change.absolute > top.change.absolute ? m : top),
    undefined,
  );
  const worst = complete.reduce<(typeof complete)[number] | undefined>(
    (low, m) => (low === undefined || m.change.absolute < low.change.absolute ? m : low),
    undefined,
  );
  const completeSum = complete.reduce((total, m) => total + m.change.absolute, 0);

  return {
    startMonth: included[0]!.month,
    cut,
    ...(known ? { change: sum } : {}),
    ...(known && base !== undefined && base > 0 ? { percent: roundToOneDecimal(sum, base) } : {}),
    ...(complete.length > 0 ? { average: roundHalfAway(completeSum, complete.length) } : {}),
    completeMonths: complete.length,
    ...(best ? { best: { month: best.month, change: best.change.absolute } } : {}),
    ...(worst ? { worst: { month: worst.month, change: worst.change.absolute } } : {}),
  };
}

/** One projected month-end of «Прогноз статку»: the value at the темп and the range around it. */
export interface ForecastPoint {
  readonly date: IsoDate;
  readonly value: number;
  readonly low: number;
  readonly high: number;
}

export type Forecast =
  | {
      readonly status: 'ready';
      /** The темп: the median зміна of the last six complete months. */
      readonly pace: number;
      /** The lower and upper hinges of the last twelve complete months' зміни. */
      readonly lowPace: number;
      readonly highPace: number;
      /** The current month's end and the five month-ends after it. */
      readonly points: readonly ForecastPoint[];
    }
  | {
      readonly status: 'withheld';
      /** `too-short`: fewer than six complete months; `unknown`: one of them, or today, is not known. */
      readonly reason: 'too-short' | 'unknown';
    };

const FORECAST_MONTHS = 6;
const FORECAST_SPREAD_MONTHS = 12;

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : roundHalfAway(sorted[middle - 1]! + sorted[middle]!, 2);
}

/**
 * «Прогноз статку» (net-worth, "Прогноз статку is a marked, opt-in continuation", design D5): from
 * today's point, the end of the current month and the five after it at the темп — the median зміна
 * of the last six complete months — the rest of the current month in proportion to its days left;
 * the range advancing the same way at the hinges of the last twelve complete months' known зміни
 * (the medians of the lower and upper halves, the middle value of an odd count in neither).
 * Integer throughout. Computed on demand from `months` alone: it reads nothing else and is stored
 * nowhere, so it cannot become a record.
 */
export function forecast(months: MonthSeries, today: IsoDate): Forecast {
  const current = months.at(-1);
  const past = months.slice(0, -1).filter((m) => !(m.change.status === 'unavailable' && m.change.reason === 'no-baseline'));
  const lastSix = past.slice(-FORECAST_MONTHS);
  if (current === undefined || lastSix.length < FORECAST_MONTHS) {
    return { status: 'withheld', reason: 'too-short' };
  }
  if (current.end === undefined || lastSix.some((m) => m.change.status !== 'available')) {
    return { status: 'withheld', reason: 'unknown' };
  }
  const changeOfMonth = (m: MonthSeries[number]): number | undefined =>
    m.change.status === 'available' ? m.change.absolute : undefined;
  const ascending = (values: readonly (number | undefined)[]): number[] =>
    values.filter((v): v is number => v !== undefined).sort((a, b) => a - b);

  const pace = median(ascending(lastSix.map(changeOfMonth)));
  const spread = ascending(past.slice(-FORECAST_SPREAD_MONTHS).map(changeOfMonth));
  const half = Math.floor(spread.length / 2);
  const lowPace = median(spread.slice(0, half));
  const highPace = median(spread.slice(spread.length - half));

  const todayMonth = monthOf(today);
  const days = daysOf(todayMonth);
  const daysLeft = days - Number(today.slice(8, 10));
  const start = current.end;
  const points: ForecastPoint[] = [];
  let month = todayMonth;
  let value = start + roundHalfAway(pace * daysLeft, days);
  let low = start + roundHalfAway(lowPace * daysLeft, days);
  let high = start + roundHalfAway(highPace * daysLeft, days);
  for (let k = 0; k < FORECAST_MONTHS; k += 1) {
    if (k > 0) {
      month = nextMonth(month);
      value += pace;
      low += lowPace;
      high += highPace;
    }
    points.push({ date: monthEndDate(month), value, low, high });
  }
  return { status: 'ready', pace, lowPace, highPace, points };
}
