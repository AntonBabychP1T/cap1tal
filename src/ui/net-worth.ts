import type { StoredRate } from '../db/rates-repo';
import type {
  AccountFirstDate,
  AccountFirstDateMovement,
  AccountMonthMovement,
} from '../db/net-worth-repo';
import type { Account } from '../domain/account';
import type { CurrentValue } from '../domain/investments';
import type { CurrencyCode } from '../domain/money';
import {
  currentNetWorth,
  netWorthChange,
  netWorthHistory,
  type AccountContribution,
  type AccountHistoryInput,
  type ChangeResult,
  type CurrencyTotal,
  type HistoryPoint,
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

/**
 * The secondary «≈ … грн», by the same honesty rule `approximateTotals`/`approximatePicture`
 * already live under, restated here because none of them can name the missing currency or the
 * rate's own age — both of which «Статок» discloses beside the mark (design D3): a UAH-only
 * reading has nothing to approximate; a currency present with even a known zero total still needs
 * its own rate (net-worth, "Missing EUR withholds the entire approximation… including when EUR
 * totals zero"); an unavailable exact total (overflow) withholds the approximation too, since
 * there is no exact figure left to convert.
 */
export function approximateNetWorthUah(
  totals: ReadonlyMap<CurrencyCode, CurrencyTotal>,
  rates: readonly StoredRate[],
): ApproximateNetWorth {
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

  return {
    status: 'available',
    text: `≈ ${formatMinorUnitsGrouped(sum)} грн`,
    // At least one non-UAH currency exists (the uah-only check above) and every one has a rate
    // (the missing check above), so a rate — and therefore this — was always assigned.
    oldestRateAt: oldestRateAt!,
  };
}

/** One рахунок's line in the expandable basis explanation. */
export interface AccountBasisLine {
  readonly accountId: string;
  /** The рахунок's own name — archived or not, a правило-переказ's target label reads it the
   *  same way (`ruleTargetLabel`, `src/ui/list-management.ts`): resolved, never a bare id. */
  readonly name: string;
  readonly amount: string;
  /** «вкладено» or «поточна вартість на <date>» — never a bare basis keyword. */
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
): AccountBasisLine[] {
  return contributions.map((c) => ({
    accountId: c.accountId,
    name: accountNames.get(c.accountId) ?? c.accountId,
    amount: formatMoney(c.amount),
    basis: c.basis === 'currentValue' ? `поточна вартість на ${calendarLabel(c.asOf as IsoDate, now)}` : 'вкладено',
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
 * One dated point read aloud for point inspection or the accessible chronological list — its
 * exact value, or exactly why it has none (net-worth, "Point values remain exact… its exact USD
 * value or unknown reason and date are read").
 */
export function historyPointLabel(point: HistoryPoint, currency: CurrencyCode, now: Date): string {
  const date = calendarLabel(point.date, now);
  const total = point.totals.get(currency);
  if (total === undefined || total.status !== 'known') {
    const reason = total?.status === 'unavailable' && total.reason === 'overflow'
      ? 'сума перевищує безпечне представлення'
      : 'невідомо — недостатньо даних за цей період';
    return `${date}: ${reason}`;
  }
  return `${date}: ${formatMoney(total.amount)}`;
}

/**
 * History's own currency selection — independent of the category widget's (net-worth, "History
 * currency has a deterministic default… independently of the category widget selection"): UAH
 * when present, else the first currency in the existing order; falls back the same way whenever
 * `requested` is absent or no longer offered.
 */
export function selectHistoryCurrency(
  currencies: readonly CurrencyCode[],
  requested?: CurrencyCode,
): CurrencyCode | undefined {
  if (currencies.length === 0) {
    return undefined;
  }
  if (requested !== undefined && currencies.includes(requested)) {
    return requested;
  }
  return currencies.includes('UAH') ? 'UAH' : currencies[0];
}

/**
 * The change line: signed absolute, a percentage only when the baseline allowed one, «від
 * <date>» — or, unavailable, the one sentence naming why rather than a number (net-worth, "Change
 * requires a comparable previous month-end").
 */
export function changeLabel(change: ChangeResult, now: Date): string {
  if (change.status === 'unavailable') {
    switch (change.reason) {
      case 'no-baseline':
        return 'Порівняння з попереднім місяцем поки недоступне.';
      case 'valuation-substituted':
        return 'Порівняння недоступне: поточна вартість інвестиції замінює вкладене в цій валюті.';
      case 'future-records':
        return 'Порівняння недоступне: є записи з майбутніми датами.';
    }
  }
  const { absolute, percent, since } = change.change;
  const sign = absolute.amount >= 0 ? '+' : '';
  const percentText =
    percent !== undefined ? ` · ${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%` : '';
  return `${sign}${formatMoney(absolute)}${percentText} · від ${calendarLabel(since, now)}`;
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

export interface NetWorthWidgetModel {
  /** «Ще немає рахунків» — present exactly when there is no account at all. */
  readonly emptyMessage?: string;
  readonly readouts: readonly CurrencyReadout[];
  readonly approximate: ApproximateNetWorth;
  readonly explanation: readonly AccountBasisLine[];
  readonly accountsDifference: string;
  /** All account currencies, UAH first — the history selector's own choices (design D4). */
  readonly historyCurrencies: readonly CurrencyCode[];
  readonly historyCurrency?: CurrencyCode;
  readonly historySeries: readonly HistorySeriesPoint[];
  readonly historyPoints: readonly { readonly date: IsoDate; readonly label: string }[];
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
  readonly monthlyMovement: readonly AccountMonthMovement[];
  readonly firstDates: readonly AccountFirstDate[];
  readonly firstDateMovement: readonly AccountFirstDateMovement[];
  readonly accountsWithFutureRecords: ReadonlySet<string>;
  readonly rates: readonly StoredRate[];
  readonly requestedHistoryCurrency?: CurrencyCode;
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
      historySeries: [],
      historyPoints: [],
    };
  }

  const current = currentNetWorth({
    accounts: input.accounts,
    transactions: input.transactions,
    currentValues: input.currentValues,
  });
  const readouts = current.status === 'ready' ? currencyReadouts(current.totals) : [];
  const approximate: ApproximateNetWorth =
    current.status === 'ready'
      ? approximateNetWorthUah(current.totals, input.rates)
      : { status: 'unavailable', reason: 'uah-only' };
  const accountNames = new Map(input.accounts.map((a) => [a.id, a.name]));
  const explanation =
    current.status === 'ready' ? accountBasisLines(current.contributions, accountNames, input.now) : [];

  const historyInputs = buildHistoryInputs(
    input.accounts,
    input.monthlyMovement,
    input.firstDates,
    input.firstDateMovement,
  );
  const historyPointsAll = netWorthHistory({ accounts: historyInputs, today: input.today });

  const historyCurrencies = [...new Set(input.accounts.map((a) => a.currency))].sort(byCurrency);
  const historyCurrency = selectHistoryCurrency(historyCurrencies, input.requestedHistoryCurrency);

  const historySeries = historyCurrency ? historySeriesFor(historyPointsAll, historyCurrency) : [];
  const historyPoints = historyCurrency
    ? historyPointsAll.map((p) => ({ date: p.date, label: historyPointLabel(p, historyCurrency, input.now) }))
    : [];

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
    historySeries,
    historyPoints,
    ...(changeText ? { changeText } : {}),
    ...(historyPointsAll.length === 0 ? { historyUnavailableMessage: 'Історія поки недоступна.' } : {}),
  };
}
