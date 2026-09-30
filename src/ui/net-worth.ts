import type { StoredRate } from '../db/rates-repo';
import type {
  AccountFirstDate,
  AccountFirstDateMovement,
  AccountMonthMovement,
} from '../db/net-worth-repo';
import type { Account, AccountKind } from '../domain/account';
import type { CurrentValue } from '../domain/investments';
import { money, type CurrencyCode, type Money } from '../domain/money';
import {
  currentNetWorth,
  netWorthChange,
  netWorthHistory,
  type AccountContribution,
  type AccountHistoryInput,
  type ChangeResult,
  type CurrencyTotal,
  type HistoryPoint,
  type NetWorthReading,
} from '../domain/net-worth';
import type { IsoDate, Month, Transaction } from '../domain/transaction';
import { byCurrency, formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { approximateUah } from './approx-uah';
import { calendarLabel } from './dates';
import type { HistorySeriesPoint } from './dashboard-charts';

/**
 * The Статок widget's own presentation: exact per-currency readouts, the secondary ≈ UAH figure
 * and the account-level basis explanation — everything `src/domain/net-worth.ts` computed, turned
 * into what «Статок» spec scenarios name (net-worth, "Approximate UAH requires every rate",
 * "Current valuation states its scope and dates"). Nothing here is stored or requests anything;
 * `rates` is whatever the caller already has cached.
 */

const UAH: CurrencyCode = 'UAH';

/** One currency's exact line, or the sentence standing in for an unavailable one. */
export interface CurrencyReadout {
  readonly currency: CurrencyCode;
  readonly text: string;
  readonly available: boolean;
}

/**
 * Every currency Статок holds, UAH first then the existing currency order — exact figures only,
 * `known` totals formatted and an `unavailable` one named rather than hidden, so the owner reads
 * why a currency shows no number instead of finding one missing.
 */
export function currencyReadouts(totals: ReadonlyMap<CurrencyCode, CurrencyTotal>): CurrencyReadout[] {
  return [...totals.keys()]
    .sort(byCurrency)
    .map((currency) => {
      const total = totals.get(currency)!;
      return total.status === 'known'
        ? { currency, text: formatMoney(total.amount), available: true }
        : { currency, text: `${currency}: сума перевищує безпечне представлення`, available: false };
    });
}

/** Why the ≈ UAH figure has no value right now. */
export type ApproximateUnavailableReason =
  | { readonly reason: 'uah-only' }
  | { readonly reason: 'missing-rate'; readonly missing: readonly CurrencyCode[] }
  | { readonly reason: 'overflow' };

export type ApproximateNetWorth =
  | {
      readonly status: 'available';
      readonly text: string;
      /** The oldest participating cached rate's own moment — never today's fetch time. */
      readonly oldestRateAt: Date;
    }
  | ({ readonly status: 'unavailable' } & ApproximateUnavailableReason);

/** The outcome of converting exact per-currency totals into one UAH sum at the cached rates. */
export type UahConversion =
  | {
      readonly status: 'known';
      /** Integer minor units UAH, halves away from zero per currency (`approximateUah`). */
      readonly amount: number;
      /** The oldest participating cached rate's own moment — never today's fetch time. */
      readonly oldestRateAt: Date;
    }
  | ({ readonly status: 'unavailable' } & ApproximateUnavailableReason);

/**
 * The one conversion every ≈ UAH reading shares — the headline figure and each point of the
 * combined history — so they cannot round or pick rates differently (design D1). A UAH-only
 * reading has nothing to approximate; a currency present with even a known zero total still needs
 * its own rate (net-worth, "Missing EUR withholds the entire approximation… including when EUR
 * totals zero"); an unavailable exact total (overflow) withholds the sum too, since there is no
 * exact figure left to convert, and so does a sum that is not exactly representable.
 */
export function convertTotalsToUah(
  totals: ReadonlyMap<CurrencyCode, CurrencyTotal>,
  rates: readonly StoredRate[],
): UahConversion {
  const currencies = [...totals.keys()];
  if (!currencies.some((c) => c !== UAH)) {
    return { status: 'unavailable', reason: 'uah-only' };
  }

  const rateFor = new Map(rates.map((r) => [r.currency, r]));
  const missing = currencies.filter((c) => c !== UAH && !rateFor.has(c));
  if (missing.length > 0) {
    return { status: 'unavailable', reason: 'missing-rate', missing };
  }

  let sum = 0;
  let oldestRateAt: Date | undefined;
  for (const currency of currencies) {
    const total = totals.get(currency)!;
    if (total.status !== 'known') {
      return { status: 'unavailable', reason: 'overflow' };
    }
    if (currency === UAH) {
      sum += total.amount.amount;
    } else {
      const rate = rateFor.get(currency)!;
      sum += approximateUah(total.amount.amount, rate.rateMillionths);
      if (oldestRateAt === undefined || rate.obtainedAt < oldestRateAt) {
        oldestRateAt = rate.obtainedAt;
      }
    }
    if (!Number.isSafeInteger(sum)) {
      return { status: 'unavailable', reason: 'overflow' };
    }
  }

  // At least one non-UAH currency exists (the uah-only check above) and every one has a rate
  // (the missing check above), so a rate — and therefore this — was always assigned.
  return { status: 'known', amount: sum, oldestRateAt: oldestRateAt! };
}

/**
 * The secondary «≈ … грн», formatted from `convertTotalsToUah` — restated with the missing
 * currency and the rate's own age because «Статок» discloses both beside the mark (design D3).
 */
export function approximateNetWorthUah(
  totals: ReadonlyMap<CurrencyCode, CurrencyTotal>,
  rates: readonly StoredRate[],
): ApproximateNetWorth {
  const conversion = convertTotalsToUah(totals, rates);
  if (conversion.status === 'unavailable') {
    return conversion;
  }
  return {
    status: 'available',
    text: `≈ ${formatMinorUnitsGrouped(conversion.amount)} грн`,
    oldestRateAt: conversion.oldestRateAt,
  };
}

/** One рахунок's line in the expandable basis explanation. */
export interface AccountBasisLine {
  readonly accountId: string;
  /** The рахунок's own name — archived or not, a правило-переказ's target label reads it the
   *  same way (`ruleTargetLabel`, `src/ui/list-management.ts`): resolved, never a bare id. */
  readonly name: string;
  readonly amount: string;
  /**
   * «вкладено» or «поточна вартість на <date>» for an інвестиційний рахунок — never a bare basis
   * keyword — and empty for every other вид, which has no basis to name.
   */
  readonly basis: string;
}

/**
 * Every рахунок's contribution as a line the basis explanation shows: archived and debt accounts
 * included exactly as `currentNetWorth` produced them, an інвестиційний рахунок's line naming the
 * observation date when its поточна вартість is what is shown, and «вкладено» — never a bare
 * balance — when it fell back (net-worth, "Current valuation states its scope and dates").
 */
export function accountBasisLines(
  contributions: readonly AccountContribution[],
  accountNames: ReadonlyMap<string, string>,
  now: Date,
  /**
   * Each рахунок's вид. «вкладено» is an інвестиційний рахунок's word and nothing else's — a card
   * or a гаманець on the ledger basis is simply its balance, and writing «вкладено» after it
   * claimed an investment the owner never made (main-screen, "Статок's explanation and history say
   * only what holds"). A рахунок with no known вид claims no basis either.
   */
  accountKinds: ReadonlyMap<string, AccountKind>,
): AccountBasisLine[] {
  return contributions.map((c) => ({
    accountId: c.accountId,
    name: accountNames.get(c.accountId) ?? c.accountId,
    amount: formatMoney(c.amount),
    basis:
      c.basis === 'currentValue'
        ? `поточна вартість на ${calendarLabel(c.asOf as IsoDate, now)}`
        : accountKinds.get(c.accountId) === 'investment'
          ? 'вкладено'
          : '',
  }));
}

/**
 * The one sentence Статок's explanation owes the owner who already reads «Усього грошей» on
 * Рахунки: what differs and why, never a silent second number under a similar name (net-worth,
 * "Existing Accounts totals have a different scope").
 */
export const ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION =
  'Статок відрізняється від «Усього грошей» на Рахунках: тут враховані архівні рахунки та ' +
  'борги з їхнім знаком, а інвестиції показані за останньою внесеною поточною вартістю замість ' +
  'вкладеного.';

/** «≈» rate freshness, reusing the words the owner already reads on Рахунки/Головний. */
export function rateFreshnessLabel(oldestRateAt: Date, now: Date): string {
  return `курс станом на ${calendarLabel(dateOnly(oldestRateAt), now)}`;
}

function dateOnly(at: Date): IsoDate {
  const year = String(at.getFullYear()).padStart(4, '0');
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `netWorthHistory`'s dated points, for one currency, turned into `dashboard-charts.ts`'s
 * normalized series — `x` spread evenly across the points in order (this is a category axis of
 * dated points, not a continuous timeline, so equal spacing is honest: the gap between June 5 and
 * June 30 is not four times the gap between June 30 and July 31 on this axis). A `gap` or
 * `overflow` currency total is a missing value, never a fabricated one (net-worth, "no line
 * bridges an unknown gap").
 */
export function historySeriesFor(
  points: readonly HistoryPoint[],
  currency: CurrencyCode,
): HistorySeriesPoint[] {
  return points.map((point, i) => {
    const total = point.totals.get(currency);
    return {
      x: points.length > 1 ? i / (points.length - 1) : 0,
      value: total?.status === 'known' ? total.amount.amount : undefined,
    };
  });
}

/**
 * The points the chart draws for one currency: the history less its leading run of points with
 * no value in that currency. `netWorthHistory` starts every currency at the *global* first date —
 * the earliest транзакція of any рахунок in any currency — so a zero-opening USD рахунок from
 * October 2024 opened the UAH chart there too, while every UAH рахунок was only known from
 * February 2026: ~70% of the card's width was a stretch before the line began, read as a chart
 * that failed to draw. A gap *inside* the history stays — it is a break in the line the owner
 * should see, not a stretch before it. With no value at all there is nothing to start the axis at,
 * so every point is kept and the chart honestly draws nothing over the whole span.
 *
 * Only the chart and the span under it are trimmed: the point list still opens with the folded
 * «… — …: невідомо» line, which is where the owner reads *why* there is nothing earlier.
 */
export function chartedHistory(
  points: readonly HistoryPoint[],
  currency: CurrencyCode,
): readonly HistoryPoint[] {
  const first = points.findIndex((point) => point.totals.get(currency)?.status === 'known');
  return first <= 0 ? points : points.slice(first);
}

/** Why a point is unknown when a sum is not exactly representable — never «missing data». */
const OVERFLOW_REASON = 'сума перевищує безпечне представлення';

/**
 * One dated point read aloud for point inspection or the accessible chronological list — its
 * exact value, or exactly why it has none (net-worth, "Point values remain exact… its exact USD
 * value or unknown reason and date are read").
 */
export function historyPointLabel(point: HistoryPoint, currency: CurrencyCode, now: Date): string {
  const date = calendarLabel(point.date, now);
  const total = point.totals.get(currency);
  if (total === undefined || total.status !== 'known') {
    const reason = total?.status === 'unavailable' && total.reason === 'overflow'
      ? OVERFLOW_REASON
      : 'невідомо — недостатньо даних за цей період';
    return `${date}: ${reason}`;
  }
  return `${date}: ${formatMoney(total.amount)}`;
}

/** One row of the accessible point list — a point, or a run of unknown points read once. */
export interface HistoryPointRow {
  /** The first date the row covers; unique across the rows of one list. */
  readonly key: IsoDate;
  readonly label: string;
}

/** What one dated point reads as: its value line, or exactly why it has none. */
export type PointReading =
  | { readonly value: string }
  | { readonly reason: string };

/**
 * The chronological point list the owner reads under «Показати точки», with every run of
 * consecutive points that have no value *for the same reason* folded into one line naming the
 * run's first and last date (main-screen, "Статок's explanation and history say only what
 * holds"). Nothing is dropped: the run's dates and its reason are still read, only not fifteen
 * times over before the first number. A single unknown point stays a single date. `read` is what
 * a point says — one currency's, or the combined ≈ UAH history's — so both fold the same way.
 */
export function foldedPointRows<P extends { readonly date: IsoDate }>(
  points: readonly P[],
  read: (point: P) => PointReading,
  now: Date,
): HistoryPointRow[] {
  const reasonOf = (point: P): string | undefined => {
    const reading = read(point);
    return 'reason' in reading ? reading.reason : undefined;
  };
  const rows: HistoryPointRow[] = [];
  let i = 0;
  while (i < points.length) {
    const first = points[i]!;
    const reason = reasonOf(first);
    if (reason === undefined) {
      const reading = read(first) as { readonly value: string };
      rows.push({ key: first.date, label: `${calendarLabel(first.date, now)}: ${reading.value}` });
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < points.length && reasonOf(points[j + 1]!) === reason) {
      j += 1;
    }
    const last = points[j]!;
    const span =
      j === i
        ? calendarLabel(first.date, now)
        : `${calendarLabel(first.date, now)} — ${calendarLabel(last.date, now)}`;
    rows.push({ key: first.date, label: `${span}: ${reason}` });
    i = j + 1;
  }
  return rows;
}

/** One currency's point rows: `foldedPointRows` over what `historyPointLabel` says. */
export function historyPointRows(
  points: readonly HistoryPoint[],
  currency: CurrencyCode,
  now: Date,
): HistoryPointRow[] {
  return foldedPointRows(
    points,
    (point) => {
      const total = point.totals.get(currency);
      if (total?.status === 'known') {
        return { value: formatMoney(total.amount) };
      }
      return {
        reason:
          total?.status === 'unavailable' && total.reason === 'overflow'
            ? OVERFLOW_REASON
            : 'невідомо — недостатньо даних за цей період',
      };
    },
    now,
  );
}

/**
 * The reserved selector value of the combined «Усе ≈ грн» history. It is not an ISO-4217 code, so
 * it can never collide with a currency the owner holds (design D5).
 */
export const TOTAL_HISTORY = 'total';

/**
 * History's own selection — independent of the category widget's (net-worth, "History currency has
 * a deterministic default… independently of the category widget selection"): UAH when present, else
 * the first currency in the existing order; falls back the same way whenever `requested` is absent
 * or no longer offered. The combined choice is offered only beside more than one currency, and is
 * never the default, so a preserved one falls back once the owner holds a single currency.
 */
export function selectHistoryCurrency(
  currencies: readonly CurrencyCode[],
  requested?: string,
): CurrencyCode | typeof TOTAL_HISTORY | undefined {
  if (currencies.length === 0) {
    return undefined;
  }
  if (requested === TOTAL_HISTORY && currencies.length > 1) {
    return TOTAL_HISTORY;
  }
  if (requested !== undefined && currencies.includes(requested)) {
    return requested;
  }
  return currencies.includes('UAH') ? 'UAH' : currencies[0];
}

/**
 * The change line: signed absolute, a percentage only when the baseline allowed one, «від
 * <date>» — or, unavailable, the one sentence naming why rather than a number (net-worth, "Change
 * requires a comparable previous month-end"). `approximate` marks the combined ≈ UAH history's
 * amount with «≈» right after its sign, and words the valuation reason without «в цій валюті».
 */
export function changeLabel(change: ChangeResult, now: Date, approximate = false): string {
  if (change.status === 'unavailable') {
    switch (change.reason) {
      case 'no-baseline':
        return 'Порівняння з попереднім місяцем поки недоступне.';
      case 'valuation-substituted':
        return approximate
          ? 'Порівняння недоступне: поточна вартість інвестиції замінює вкладене.'
          : 'Порівняння недоступне: поточна вартість інвестиції замінює вкладене в цій валюті.';
      case 'future-records':
        return 'Порівняння недоступне: є записи з майбутніми датами.';
    }
  }
  const { absolute, percent, since } = change.change;
  const sign = absolute.amount >= 0 ? '+' : '';
  const percentText =
    // A decimal comma, as every other number the owner reads: «+62,4%», not «+62.4%».
    percent !== undefined
      ? ` · ${percent >= 0 ? '+' : ''}${percent.toFixed(1).replace('.', ',')}%`
      : '';
  const body = formatMoney(absolute);
  const amount = !approximate
    ? `${sign}${body}`
    : body.startsWith('−')
      ? `−≈${body.slice(1)}`
      : `${sign}≈${body}`;
  return `${amount}${percentText} · від ${calendarLabel(since, now)}`;
}

/** The last calendar date of the month before `today`, by the same day-0 trick everywhere else. */
function previousMonthEndDate(today: IsoDate): IsoDate {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const prevMonthNumber = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastDay = new Date(prevYear, prevMonthNumber, 0).getDate();
  return `${String(prevYear).padStart(4, '0')}-${String(prevMonthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * One dated point of the combined «Усе ≈ грн» history: every held currency's reconstructed баланс
 * converted at the current cached rate and summed, or exactly why there is no such sum — never a
 * partial one (net-worth, "Приблизний статок в динаміці is complete or absent").
 */
export type CombinedPoint = { readonly date: IsoDate } & (
  | { readonly status: 'known'; readonly amount: number }
  | {
      readonly status: 'unavailable';
      /** `gap`: `currency`'s баланс is unknown on this date; `overflow`: the sum is not exact. */
      readonly reason: 'gap' | 'overflow';
      readonly currency?: CurrencyCode;
    }
);

export type CombinedHistory =
  | {
      readonly status: 'ready';
      readonly points: readonly CombinedPoint[];
      /** The oldest cached rate any held currency uses — its own moment, never a fetch time. */
      readonly oldestRateAt: Date;
    }
  | {
      /** Rates are current, so a missing one is not a per-point gap: nothing is drawn (D2). */
      readonly status: 'withheld';
      readonly missing: readonly CurrencyCode[];
    };

/**
 * `netWorthHistory`'s points, every held currency converted at today's cached rate through
 * `convertTotalsToUah` — the headline ≈ figure's own function, so no point can round differently
 * (design D1, D2). `held` is every currency of any recorded рахунок, archived and zero-balance
 * ones included: each needs a rate, even at a zero баланс, and each must be known for a point to
 * have a value.
 */
export function combinedHistory(
  points: readonly HistoryPoint[],
  held: readonly CurrencyCode[],
  rates: readonly StoredRate[],
): CombinedHistory {
  const rateFor = new Map(rates.map((r) => [r.currency, r]));
  const foreign = held.filter((c) => c !== UAH);
  const missing = foreign.filter((c) => !rateFor.has(c));
  if (foreign.length === 0 || missing.length > 0) {
    // «Nothing to combine» (no foreign currency held) is never offered, so it is never read.
    return { status: 'withheld', missing };
  }
  const oldestRateAt = foreign
    .map((c) => rateFor.get(c)!.obtainedAt)
    .reduce((oldest, at) => (at < oldest ? at : oldest));

  const combined = points.map((point): CombinedPoint => {
    const totals = new Map<CurrencyCode, CurrencyTotal>();
    for (const currency of held) {
      const total = point.totals.get(currency) ?? ({ status: 'unavailable', reason: 'gap' } as const);
      if (total.status !== 'known') {
        return total.reason === 'overflow'
          ? { date: point.date, status: 'unavailable', reason: 'overflow' }
          : { date: point.date, status: 'unavailable', reason: 'gap', currency };
      }
      totals.set(currency, total);
    }
    const conversion = convertTotalsToUah(totals, rates);
    return conversion.status === 'known'
      ? { date: point.date, status: 'known', amount: conversion.amount }
      : // Every total is known and every rate present here, so only a sum that is not exactly
        // representable can be left.
        { date: point.date, status: 'unavailable', reason: 'overflow' };
  });
  return { status: 'ready', points: combined, oldestRateAt };
}

/** The combined history less its leading run of unknown points, as `chartedHistory` does per currency. */
export function chartedCombinedHistory(points: readonly CombinedPoint[]): readonly CombinedPoint[] {
  const first = points.findIndex((point) => point.status === 'known');
  return first <= 0 ? points : points.slice(first);
}

/** The combined points as the chart's normalized series; an unknown point is a break, never a value. */
export function combinedSeriesFor(points: readonly CombinedPoint[]): HistorySeriesPoint[] {
  return points.map((point, i) => ({
    x: points.length > 1 ? i / (points.length - 1) : 0,
    value: point.status === 'known' ? point.amount : undefined,
  }));
}

/** What one combined point reads as: its «≈» amount, or the reason it has none. */
function combinedReading(point: CombinedPoint): PointReading {
  if (point.status === 'known') {
    return { value: `≈ ${formatMinorUnitsGrouped(point.amount)} грн` };
  }
  return {
    reason:
      point.reason === 'overflow' ? OVERFLOW_REASON : `немає даних за ${point.currency ?? '—'}`,
  };
}

/** The combined history's chronological point list, same-reason unknown runs folded. */
export function combinedPointRows(points: readonly CombinedPoint[], now: Date): HistoryPointRow[] {
  return foldedPointRows(points, combinedReading, now);
}

/** The message that stands in for the whole combined history when a rate is missing. */
export function combinedWithheldMessage(missing: readonly CurrencyCode[]): string {
  return `Немає курсу ${missing.join(', ')} для сукупної історії.`;
}

/** The chip's words: the label drawn, and what TalkBack says with and without the selection. */
export const TOTAL_HISTORY_LABEL = 'Усе ≈ грн';
const TOTAL_HISTORY_ACCESSIBILITY = 'Усе, наближено в гривнях';

/** «Історія розрахункових балансів · інвестиції за вкладеним», the per-currency basis line. */
const HISTORY_BASIS = 'Історія розрахункових балансів · інвестиції за вкладеним';
const HISTORY_BASIS_ACCESSIBILITY = 'Історія розрахункових балансів, інвестиції за вкладеним';
const TOTAL_HISTORY_CAPTION = `${HISTORY_BASIS} · ≈ за поточним курсом, не за курсом на дату`;
const TOTAL_HISTORY_CAPTION_ACCESSIBILITY =
  `${HISTORY_BASIS_ACCESSIBILITY}, наближено за поточним курсом, не за курсом на дату`;

const CHART_LABEL = 'Графік історії статку';

/** The chart's accessibility label: its span when it has one, and «наближено в гривнях» when combined. */
function chartLabel(
  span: { readonly first: string; readonly last: string } | undefined,
  combined: boolean,
): string {
  const name = combined ? `${CHART_LABEL}, наближено в гривнях` : CHART_LABEL;
  return span ? `${name}, з ${span.first} по ${span.last}` : name;
}

/**
 * `net-worth-repo.ts`'s three flat readings, grouped by account into `netWorthHistory`'s own
 * input shape — the one place that grouping happens, so a caller passes the repo's rows straight
 * through without re-deriving the grouping itself.
 */
export function buildHistoryInputs(
  accounts: readonly Account[],
  monthlyMovement: readonly AccountMonthMovement[],
  firstDates: readonly AccountFirstDate[],
  firstDateMovement: readonly AccountFirstDateMovement[],
): AccountHistoryInput[] {
  const firstDateByAccount = new Map(firstDates.map((f) => [f.accountId, f.firstDate]));
  const firstDateNetByAccount = new Map(firstDateMovement.map((f) => [f.accountId, f.net]));
  const monthlyByAccount = new Map<string, Map<Month, number>>();
  for (const m of monthlyMovement) {
    let byMonth = monthlyByAccount.get(m.accountId);
    if (!byMonth) {
      byMonth = new Map();
      monthlyByAccount.set(m.accountId, byMonth);
    }
    byMonth.set(m.month, m.net);
  }
  return accounts.map((account) => ({
    account,
    firstDate: firstDateByAccount.get(account.id),
    firstDateNet: firstDateNetByAccount.get(account.id),
    monthlyNet: monthlyByAccount.get(account.id) ?? new Map(),
  }));
}

/**
 * The first and the last date the history chart covers, as read under its two ends (main-screen,
 * "Статок's explanation and history say only what holds") — so an empty stretch reads as «no data
 * then» rather than as a chart that failed to draw. None for a single point, which has no span.
 */
export function historySpanOf(
  points: readonly { readonly date: IsoDate }[],
  now: Date,
): { readonly first: string; readonly last: string } | undefined {
  const first = points[0];
  const last = points.at(-1);
  return first && last && points.length > 1
    ? { first: calendarLabel(first.date, now), last: calendarLabel(last.date, now) }
    : undefined;
}

/** One entry of the history selector: a currency, or the combined «Усе ≈ грн». */
export interface HistoryChoice {
  /** The currency code, or `TOTAL_HISTORY` — what selecting it reports back. */
  readonly id: string;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
}

export interface NetWorthWidgetModel {
  /** «Ще немає рахунків» — present exactly when there is no account at all. */
  readonly emptyMessage?: string;
  readonly readouts: readonly CurrencyReadout[];
  readonly approximate: ApproximateNetWorth;
  readonly explanation: readonly AccountBasisLine[];
  readonly accountsDifference: string;
  /** All account currencies, UAH first — the currencies the history can be read in (design D4). */
  readonly historyCurrencies: readonly CurrencyCode[];
  /** The selected currency; absent while the combined «Усе ≈ грн» is selected. */
  readonly historyCurrency?: CurrencyCode;
  /** The history selector's chips: the currencies, then «Усе ≈ грн» when it adds something. */
  readonly historyChoices: readonly HistoryChoice[];
  readonly historyTotalSelected: boolean;
  /** The basis line under the chips; the combined view adds the current-rate disclosure. */
  readonly historyCaption: string;
  readonly historyCaptionAccessibilityLabel: string;
  /** The chart's own accessibility label — names its span, and «наближено» when combined. */
  readonly historyChartLabel: string;
  /** Combined only: the oldest participating rate's own moment, as `rateFreshnessLabel`. */
  readonly historyRateFreshness?: string;
  /** Combined only: a rate is missing, so nothing else of the history is drawn (design D2). */
  readonly historyWithheldMessage?: string;
  readonly historySeries: readonly HistorySeriesPoint[];
  readonly historyPoints: readonly HistoryPointRow[];
  /** The first and the last date the chart covers, as the owner reads them under it. */
  readonly historySpan?: { readonly first: string; readonly last: string };
  readonly changeText?: string;
  /** No account anywhere has ever carried a транзакція on or before today. */
  readonly historyUnavailableMessage?: string;
}

/**
 * Everything the Статок widget renders, assembled from the domain readings and the caller's own
 * already-read repo rows — nothing here reads storage or a clock beyond what is passed in
 * (`now`/`today` are the caller's, per rules/domain.md).
 */
export function netWorthWidgetModel(input: {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly currentValues: ReadonlyMap<string, CurrentValue>;
  /** Every рахунок's розрахунковий баланс over `transactions`, when the caller already has it. */
  readonly balances?: ReadonlyMap<string, Money>;
  readonly monthlyMovement: readonly AccountMonthMovement[];
  readonly firstDates: readonly AccountFirstDate[];
  readonly firstDateMovement: readonly AccountFirstDateMovement[];
  readonly accountsWithFutureRecords: ReadonlySet<string>;
  readonly rates: readonly StoredRate[];
  /** A currency code, or `TOTAL_HISTORY` for the combined «Усе ≈ грн» reading. */
  readonly requestedHistory?: string;
  readonly now: Date;
  readonly today: IsoDate;
}): NetWorthWidgetModel {
  if (input.accounts.length === 0) {
    return {
      emptyMessage: 'Ще немає рахунків',
      readouts: [],
      approximate: { status: 'unavailable', reason: 'uah-only' },
      explanation: [],
      accountsDifference: ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
      historyCurrencies: [],
      historyChoices: [],
      historyTotalSelected: false,
      historyCaption: HISTORY_BASIS,
      historyCaptionAccessibilityLabel: HISTORY_BASIS_ACCESSIBILITY,
      historyChartLabel: CHART_LABEL,
      historySeries: [],
      historyPoints: [],
    };
  }

  const current = currentNetWorth({
    accounts: input.accounts,
    transactions: input.transactions,
    currentValues: input.currentValues,
    ...(input.balances ? { balances: input.balances } : {}),
  });
  const readouts = current.status === 'ready' ? currencyReadouts(current.totals) : [];
  const approximate: ApproximateNetWorth =
    current.status === 'ready'
      ? approximateNetWorthUah(current.totals, input.rates)
      : { status: 'unavailable', reason: 'uah-only' };
  const accountNames = new Map(input.accounts.map((a) => [a.id, a.name]));
  const accountKinds = new Map(input.accounts.map((a) => [a.id, a.kind]));
  const explanation =
    current.status === 'ready'
      ? accountBasisLines(current.contributions, accountNames, input.now, accountKinds)
      : [];

  const historyInputs = buildHistoryInputs(
    input.accounts,
    input.monthlyMovement,
    input.firstDates,
    input.firstDateMovement,
  );
  const historyPointsAll = netWorthHistory({ accounts: historyInputs, today: input.today });

  const historyCurrencies = [...new Set(input.accounts.map((a) => a.currency))].sort(byCurrency);
  const selection = selectHistoryCurrency(historyCurrencies, input.requestedHistory);
  const totalSelected = selection === TOTAL_HISTORY;
  const historyCurrency = totalSelected ? undefined : selection;

  const historyChoices: HistoryChoice[] = historyCurrencies.map((currency) => ({
    id: currency,
    label: currency,
    accessibilityLabel: currency === historyCurrency ? `${currency}, обрано` : currency,
    selected: currency === historyCurrency,
  }));
  if (historyCurrencies.length > 1) {
    historyChoices.push({
      id: TOTAL_HISTORY,
      label: TOTAL_HISTORY_LABEL,
      accessibilityLabel: totalSelected
        ? `${TOTAL_HISTORY_ACCESSIBILITY}, обрано`
        : TOTAL_HISTORY_ACCESSIBILITY,
      selected: totalSelected,
    });
  }

  const unavailableMessage =
    historyPointsAll.length === 0 ? { historyUnavailableMessage: 'Історія поки недоступна.' } : {};

  if (totalSelected) {
    return {
      readouts,
      approximate,
      explanation,
      accountsDifference: ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
      historyCurrencies,
      historyChoices,
      historyTotalSelected: true,
      historyCaption: TOTAL_HISTORY_CAPTION,
      historyCaptionAccessibilityLabel: TOTAL_HISTORY_CAPTION_ACCESSIBILITY,
      ...combinedHistoryModel(input, current, historyPointsAll, historyCurrencies),
      ...unavailableMessage,
    };
  }

  // The chart and the span under it start where the history currency has its first value
  // (`chartedHistory`); the point list reads the whole history, leading unknowns included.
  const chartedPoints = historyCurrency
    ? chartedHistory(historyPointsAll, historyCurrency)
    : historyPointsAll;
  const historySeries = historyCurrency ? historySeriesFor(chartedPoints, historyCurrency) : [];
  const historyPoints = historyCurrency
    ? historyPointRows(historyPointsAll, historyCurrency, input.now)
    : [];
  const historySpan = historySpanOf(chartedPoints, input.now);

  let changeText: string | undefined;
  if (historyCurrency !== undefined && current.status === 'ready') {
    const total = current.totals.get(historyCurrency);
    if (total !== undefined) {
      const previousDate = previousMonthEndDate(input.today);
      const previousPoint = historyPointsAll.find((p) => p.date === previousDate);
      const currentUsedValuation = current.contributions.some(
        (c) => c.currency === historyCurrency && c.basis === 'currentValue',
      );
      const hasFutureRecords = input.accounts.some(
        (a) => a.currency === historyCurrency && input.accountsWithFutureRecords.has(a.id),
      );
      const change = netWorthChange({
        current: total,
        currentUsedValuation,
        hasFutureRecords,
        ...(previousPoint
          ? {
              previousMonthEnd: {
                date: previousPoint.date,
                total: previousPoint.totals.get(historyCurrency) ?? { status: 'unavailable', reason: 'gap' },
              },
            }
          : {}),
      });
      changeText = changeLabel(change, input.now);
    }
  }

  return {
    readouts,
    approximate,
    explanation,
    accountsDifference: ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
    historyCurrencies,
    ...(historyCurrency ? { historyCurrency } : {}),
    historyChoices,
    historyTotalSelected: false,
    historyCaption: HISTORY_BASIS,
    historyCaptionAccessibilityLabel: HISTORY_BASIS_ACCESSIBILITY,
    historyChartLabel: chartLabel(historySpan, false),
    historySeries,
    historyPoints,
    ...(historySpan ? { historySpan } : {}),
    ...(changeText ? { changeText } : {}),
    ...unavailableMessage,
  };
}

/**
 * The history fields of the combined «Усе ≈ грн» reading (design D2–D4): withheld whole when a rate
 * is missing, otherwise the series, rows, span and change line in «≈» UAH terms.
 */
function combinedHistoryModel(
  input: {
    readonly accounts: readonly Account[];
    readonly accountsWithFutureRecords: ReadonlySet<string>;
    readonly rates: readonly StoredRate[];
    readonly now: Date;
    readonly today: IsoDate;
  },
  current: NetWorthReading,
  historyPointsAll: readonly HistoryPoint[],
  historyCurrencies: readonly CurrencyCode[],
): Pick<
  NetWorthWidgetModel,
  | 'historyChartLabel'
  | 'historySeries'
  | 'historyPoints'
  | 'historySpan'
  | 'changeText'
  | 'historyRateFreshness'
  | 'historyWithheldMessage'
> {
  const combined = combinedHistory(historyPointsAll, historyCurrencies, input.rates);
  if (combined.status === 'withheld') {
    return {
      historyChartLabel: chartLabel(undefined, true),
      historySeries: [],
      historyPoints: [],
      historyWithheldMessage: combinedWithheldMessage(combined.missing),
    };
  }

  const chartedPoints = chartedCombinedHistory(combined.points);
  const historySpan = historySpanOf(chartedPoints, input.now);

  let changeText: string | undefined;
  if (current.status === 'ready') {
    const conversion = convertTotalsToUah(current.totals, input.rates);
    const currentTotal: CurrencyTotal =
      conversion.status === 'known'
        ? { status: 'known', amount: money(conversion.amount, UAH) }
        : { status: 'unavailable', reason: 'overflow' };
    const previousPoint = combined.points.find((p) => p.date === previousMonthEndDate(input.today));
    const change = netWorthChange({
      current: currentTotal,
      currentUsedValuation: current.contributions.some((c) => c.basis === 'currentValue'),
      hasFutureRecords: input.accounts.some((a) => input.accountsWithFutureRecords.has(a.id)),
      ...(previousPoint
        ? {
            previousMonthEnd: {
              date: previousPoint.date,
              total:
                previousPoint.status === 'known'
                  ? { status: 'known', amount: money(previousPoint.amount, UAH) }
                  : { status: 'unavailable', reason: previousPoint.reason },
            },
          }
        : {}),
    });
    changeText = changeLabel(change, input.now, true);
  }

  return {
    historyChartLabel: chartLabel(historySpan, true),
    historySeries: combinedSeriesFor(chartedPoints),
    historyPoints: combinedPointRows(combined.points, input.now),
    ...(historySpan ? { historySpan } : {}),
    ...(changeText ? { changeText } : {}),
    historyRateFreshness: rateFreshnessLabel(combined.oldestRateAt, input.now),
  };
}
