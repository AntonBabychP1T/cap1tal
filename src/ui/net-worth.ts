import type { StoredRate } from '../db/rates-repo';
import type {
  AccountFirstDate,
  AccountFirstDateMovement,
  AccountMonthKindMovement,
  AccountMonthMovement,
} from '../db/net-worth-repo';
import type { Account, AccountKind } from '../domain/account';
import type { CurrentValue } from '../domain/investments';
import { money, type CurrencyCode, type Money } from '../domain/money';
import {
  changeOf,
  currentNetWorth,
  investmentDifference,
  monthFigures,
  roundHalfAway,
  type AccountContribution,
  type AccountHistoryInput,
  type CurrencyTotal,
  type MonthBreakdown,
  type MonthChange,
  type MonthFigure,
  type MovementByKind,
  type MovementKind,
  type NetWorthReading,
} from '../domain/net-worth';
import type { IsoDate, Month, Transaction } from '../domain/transaction';
import { byCurrency, formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { approximateUah } from './approx-uah';
import { calendarLabel } from './dates';

/**
 * Статок's presentation shared by the compact widget on Головний and the «Статок» screen (design
 * D6): exact per-currency readouts, the ≈ UAH conversion, the account-level basis explanation, the
 * history selection and one series builder (`netWorthSeries`) both read — everything
 * `src/domain/net-worth.ts` computed, turned into what the «Статок» spec scenarios name. Nothing
 * here is stored or requests anything; `rates` is whatever the caller already has cached.
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
 * `net-worth-repo.ts`'s flat readings, grouped by account into the domain's own input shape — the
 * one place that grouping happens, so a caller passes the repo's rows straight through.
 * `byType` (the розбивка's reading) is optional: a reading without it has no розбивка.
 */
export function buildHistoryInputs(
  accounts: readonly Account[],
  monthlyMovement: readonly AccountMonthMovement[],
  firstDates: readonly AccountFirstDate[],
  firstDateMovement: readonly AccountFirstDateMovement[],
  byType: readonly AccountMonthKindMovement[] = [],
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
  const kindsByAccount = new Map<string, Map<Month, Partial<Record<MovementKind, number>>>>();
  for (const row of byType) {
    let byMonth = kindsByAccount.get(row.accountId);
    if (!byMonth) {
      byMonth = new Map();
      kindsByAccount.set(row.accountId, byMonth);
    }
    const kinds = byMonth.get(row.month) ?? {};
    kinds[row.kind] = (kinds[row.kind] ?? 0) + row.net;
    byMonth.set(row.month, kinds);
  }
  return accounts.map((account) => {
    const kinds = kindsByAccount.get(account.id);
    return {
      account,
      firstDate: firstDateByAccount.get(account.id),
      firstDateNet: firstDateNetByAccount.get(account.id),
      monthlyNet: monthlyByAccount.get(account.id) ?? new Map(),
      ...(kinds ? { monthlyByKind: kinds as ReadonlyMap<Month, MovementByKind> } : {}),
    };
  });
}

/**
 * The reserved selector value of the combined «Усе ≈ грн» history. It is not an ISO-4217 code, so
 * it can never collide with a currency the owner holds.
 */
export const TOTAL_HISTORY = 'total';

/**
 * History's own selection — independent of the category widget's (net-worth, "History is readable
 * without colour, with «Усе ≈ грн» as the default reading"). A choice the owner made stands while
 * it is still offered: a currency still held, or «Усе ≈ грн» beside more than one — even with a
 * rate gone missing since, which then reads its withheld message rather than silently becoming
 * another reading. Otherwise the default: «Усе ≈ грн» when more than one currency is held and every
 * non-UAH one has a cached rate, else UAH when held, else the first currency in the existing order.
 */
export function selectHistory(
  currencies: readonly CurrencyCode[],
  rates: readonly StoredRate[],
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
  const rated = new Set(rates.map((r) => r.currency));
  if (currencies.length > 1 && currencies.every((c) => c === UAH || rated.has(c))) {
    return TOTAL_HISTORY;
  }
  return currencies.includes(UAH) ? UAH : currencies[0];
}

/** One entry of the history selector: a currency, or the combined «Усе ≈ грн». */
export interface HistoryChoice {
  /** The currency code, or `TOTAL_HISTORY` — what selecting it reports back. */
  readonly id: string;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
}

export const TOTAL_HISTORY_LABEL = 'Усе ≈ грн';
const TOTAL_HISTORY_ACCESSIBILITY = 'Усе, наближено в гривнях';

/** The selector's chips: the currencies, then «Усе ≈ грн» when it adds something. */
export function historyChoices(
  currencies: readonly CurrencyCode[],
  selection: string | undefined,
): HistoryChoice[] {
  const choices: HistoryChoice[] = currencies.map((currency) => ({
    id: currency,
    label: currency,
    accessibilityLabel: currency === selection ? `${currency}, обрано` : currency,
    selected: currency === selection,
  }));
  if (currencies.length > 1) {
    const selected = selection === TOTAL_HISTORY;
    choices.push({
      id: TOTAL_HISTORY,
      label: TOTAL_HISTORY_LABEL,
      accessibilityLabel: selected
        ? `${TOTAL_HISTORY_ACCESSIBILITY}, обрано`
        : TOTAL_HISTORY_ACCESSIBILITY,
      selected,
    });
  }
  return choices;
}

/** Why a point is unknown when a sum is not exactly representable — never «missing data». */
export const OVERFLOW_REASON = 'сума перевищує безпечне представлення';

/** The message that stands in for the whole combined history when a rate is missing. */
export function combinedWithheldMessage(missing: readonly CurrencyCode[]): string {
  return `Немає курсу ${missing.join(', ')} для сукупної історії.`;
}

/** «Історія розрахункових балансів · інвестиції за вкладеним», the per-currency basis line. */
export const HISTORY_BASIS = 'Історія розрахункових балансів · інвестиції за вкладеним';
export const HISTORY_BASIS_ACCESSIBILITY = 'Історія розрахункових балансів, інвестиції за вкладеним';
export const TOTAL_HISTORY_CAPTION = `${HISTORY_BASIS} · ≈ за поточним курсом, не за курсом на дату`;
export const TOTAL_HISTORY_CAPTION_ACCESSIBILITY =
  `${HISTORY_BASIS_ACCESSIBILITY}, наближено за поточним курсом, не за курсом на дату`;

/**
 * One reading of the history, month by month: a currency's exact figures, or the «Усе ≈ грн»
 * conversion of them. `approximate` readings are integer minor units UAH at the current rates.
 */
export interface HistoryReading {
  readonly id: string;
  readonly currency: CurrencyCode;
  readonly approximate: boolean;
  readonly months: readonly MonthFigure[];
}

/**
 * The «Усе ≈ грн» month figures (net-worth, "Приблизний статок в динаміці converts each dated
 * point at the current rate", "The change of приблизний статок compares recorded-balance points"):
 * each month's level is every held currency's level converted through `convertTotalsToUah` — the
 * headline's own function, so nothing rounds differently — its нові рахунки each currency's
 * converted, its зміна the two «≈» levels' difference less them. The розбивка converts each
 * currency's components; the rounding difference lands on «перекази й обмін», which already
 * carries the difference between the bank's rate and the current one, so the parts still add up
 * exactly to the «≈» difference. Withheld whole when any held currency lacks a rate.
 */
export function combinedReading(
  figures: ReadonlyMap<CurrencyCode, readonly MonthFigure[]>,
  rates: readonly StoredRate[],
):
  | { readonly status: 'ready'; readonly reading: HistoryReading; readonly oldestRateAt: Date }
  | { readonly status: 'withheld'; readonly missing: readonly CurrencyCode[] } {
  const held = [...figures.keys()].sort(byCurrency);
  const rateFor = new Map(rates.map((r) => [r.currency, r]));
  const foreign = held.filter((c) => c !== UAH);
  const missing = foreign.filter((c) => !rateFor.has(c));
  if (foreign.length === 0 || missing.length > 0) {
    return { status: 'withheld', missing };
  }
  const oldestRateAt = foreign
    .map((c) => rateFor.get(c)!.obtainedAt)
    .reduce((oldest, at) => (at < oldest ? at : oldest));
  const toUah = (currency: CurrencyCode, amount: number): number =>
    currency === UAH ? amount : approximateUah(amount, rateFor.get(currency)!.rateMillionths);

  const length = figures.get(held[0]!)!.length;
  const months: MonthFigure[] = [];
  let previous: number | undefined | null = null;
  for (let i = 0; i < length; i++) {
    const totals = new Map<CurrencyCode, CurrencyTotal>();
    const parts = { income: 0, spending: 0, correction: 0, transfer: 0, entered: 0 };
    for (const currency of held) {
      const f = figures.get(currency)![i]!;
      totals.set(
        currency,
        f.end === undefined
          ? { status: 'unavailable', reason: 'overflow' }
          : { status: 'known', amount: money(f.end, currency) },
      );
      for (const key of Object.keys(parts) as (keyof MonthBreakdown)[]) {
        parts[key] += toUah(currency, f.breakdown[key]);
      }
    }
    const first = figures.get(held[0]!)![i]!;
    const conversion = convertTotalsToUah(totals, rates);
    const end = conversion.status === 'known' ? conversion.amount : undefined;
    const base = previous === null ? 0 : previous;
    if (end !== undefined && base !== undefined) {
      parts.transfer = end - base - parts.income - parts.spending - parts.correction - parts.entered;
    }
    const change: MonthChange =
      previous === null
        ? { status: 'unavailable', reason: 'no-baseline' }
        : previous === undefined || end === undefined
          ? { status: 'unavailable', reason: 'overflow' }
          : { status: 'available', ...changeOf(end, previous, parts.entered) };
    months.push({
      month: first.month,
      date: first.date,
      ...(end === undefined ? {} : { end }),
      entered: parts.entered,
      change,
      breakdown: parts,
    });
    previous = end;
  }
  return {
    status: 'ready',
    reading: { id: TOTAL_HISTORY, currency: UAH, approximate: true, months },
    oldestRateAt,
  };
}

/** What every Статок view reads, built once per data reload (design D6). */
export interface NetWorthSeries {
  readonly current: NetWorthReading;
  /** All account currencies, UAH first — the currencies the history can be read in. */
  readonly currencies: readonly CurrencyCode[];
  readonly selection: CurrencyCode | typeof TOTAL_HISTORY | undefined;
  /** The selected reading; absent while «Усе ≈ грн» is withheld for a missing rate. */
  readonly reading?: HistoryReading;
  readonly withheldMessage?: string;
  /** «Усе ≈ грн» only: the oldest participating rate's own moment. */
  readonly oldestRateAt?: Date;
  /** A рахунок of the reading carries a транзакція dated after today. */
  readonly hasFutureRecords: boolean;
}

export interface NetWorthInput {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly currentValues: ReadonlyMap<string, CurrentValue>;
  /** Every рахунок's розрахунковий баланс over `transactions`, when the caller already has it. */
  readonly balances?: ReadonlyMap<string, Money>;
  readonly monthlyMovement: readonly AccountMonthMovement[];
  readonly monthlyMovementByType?: readonly AccountMonthKindMovement[];
  readonly firstDates: readonly AccountFirstDate[];
  readonly firstDateMovement: readonly AccountFirstDateMovement[];
  readonly rates: readonly StoredRate[];
  /** Every рахунок with a транзакція dated after today (`netWorthRepo.accountsWithFutureRecords`). */
  readonly accountsWithFutureRecords?: ReadonlySet<string>;
  /** A currency code, or `TOTAL_HISTORY` for the combined «Усе ≈ грн» reading. */
  readonly requestedHistory?: string;
  readonly now: Date;
  readonly today: IsoDate;
}

/**
 * The month-by-month figures of every currency, from the repository's bounded reads — the one
 * derivation both «Статок» and the підсумок місяця read their зміна and розбивка from
 * (month-summary, "The зміна equals Статок's"; design D6), so the two can never disagree.
 */
export function netWorthFigures(
  input: Pick<
    NetWorthInput,
    'accounts' | 'monthlyMovement' | 'monthlyMovementByType' | 'firstDates' | 'firstDateMovement' | 'today'
  >,
): ReadonlyMap<CurrencyCode, readonly MonthFigure[]> {
  return monthFigures({
    accounts: buildHistoryInputs(
      input.accounts,
      input.monthlyMovement,
      input.firstDates,
      input.firstDateMovement,
      input.monthlyMovementByType ?? [],
    ),
    today: input.today,
  });
}

/** The current reading, the history months and the selected reading — one pass over the input. */
export function netWorthSeries(input: NetWorthInput): NetWorthSeries {
  const current = currentNetWorth({
    accounts: input.accounts,
    transactions: input.transactions,
    currentValues: input.currentValues,
    ...(input.balances ? { balances: input.balances } : {}),
  });
  const currencies = [...new Set(input.accounts.map((a) => a.currency))].sort(byCurrency);
  const selection = selectHistory(currencies, input.rates, input.requestedHistory);
  const figures = netWorthFigures(input);
  const future = input.accountsWithFutureRecords ?? new Set<string>();
  const hasFutureRecords = input.accounts.some(
    (a) => future.has(a.id) && (selection === TOTAL_HISTORY || a.currency === selection),
  );
  if (selection === undefined) {
    return { current, currencies, selection, hasFutureRecords };
  }
  if (selection !== TOTAL_HISTORY) {
    return {
      current,
      currencies,
      selection,
      hasFutureRecords,
      reading: {
        id: selection,
        currency: selection,
        approximate: false,
        months: figures.get(selection) ?? [],
      },
    };
  }
  const combined = combinedReading(figures, input.rates);
  return combined.status === 'ready'
    ? { current, currencies, selection, hasFutureRecords, reading: combined.reading, oldestRateAt: combined.oldestRateAt }
    : { current, currencies, selection, hasFutureRecords, withheldMessage: combinedWithheldMessage(combined.missing) };
}

/**
 * The disclosure of транзакції dated after today (net-worth, "Future dates do not extend the
 * curve"): the current Статок counts them, the history and its change do not, so the headline
 * says why it differs from today's point rather than leaving the owner to wonder.
 */
export const FUTURE_RECORDS_LINE =
  'Є записи з майбутніми датами: вони вже в статку, але не в історії й не в зміні.';

/** Whole hryvnias of a «≈» amount, halves away from zero: «≈401 408 грн». */
function approxBody(minor: number): string {
  const whole = roundHalfAway(minor, 100);
  const grouped = formatMinorUnitsGrouped(Math.abs(whole) * 100).slice(0, -3);
  return `${grouped} грн`;
}

/** An amount of a reading, unsigned unless negative: «≈401 408 грн» or «12 345,67 UAH». */
export function readingAmount(reading: Pick<HistoryReading, 'approximate' | 'currency'>, minor: number): string {
  if (reading.approximate) {
    const whole = roundHalfAway(minor, 100);
    return `${whole < 0 ? '−' : ''}≈${approxBody(minor)}`;
  }
  return formatMoney(money(minor, reading.currency));
}

/** An amount of a reading with its sign always written: «+≈26 408 грн», «−56 000,00 UAH». */
export function signedReadingAmount(
  reading: Pick<HistoryReading, 'approximate' | 'currency'>,
  minor: number,
): string {
  const text = readingAmount(reading, minor);
  return minor > 0 ? `+${text}` : text;
}

/** «+62,4%», with the decimal comma every number the owner reads uses. */
export function percentText(percent: number): string {
  const digits = Math.abs(percent).toFixed(1).replace('.', ',');
  return `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${digits}%`;
}

/** Up, down or flat — the mark beside a зміна, so its direction is never told by colour alone. */
export type ChangeDirection = 'up' | 'down' | 'flat';

export function directionOf(absolute: number): ChangeDirection {
  return absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat';
}

const DIRECTION_MARK: Record<ChangeDirection, string> = { up: ' ▲', down: ' ▼', flat: '' };
export const DIRECTION_WORD: Record<ChangeDirection, string> = {
  up: 'зростання',
  down: 'спад',
  flat: 'без змін',
};

/** The words TalkBack says for a currency: hryvnias and the two common ones by name. */
const SPOKEN_CURRENCY: Readonly<Record<string, string>> = {
  UAH: 'гривень',
  USD: 'доларів',
  EUR: 'євро',
};

/**
 * An amount as TalkBack should say it: «мінус 56 000 гривень», «приблизно 401 408 гривень» —
 * words for the sign and the currency, the kopecks only when there are any.
 */
export function spokenAmount(
  reading: Pick<HistoryReading, 'approximate' | 'currency'>,
  minor: number,
  signed = false,
): string {
  const sign = minor < 0 ? 'мінус ' : signed && minor > 0 ? 'плюс ' : '';
  const currency = reading.approximate ? 'гривень' : (SPOKEN_CURRENCY[reading.currency] ?? reading.currency);
  if (reading.approximate) {
    return `${sign}приблизно ${approxBody(Math.abs(minor)).slice(0, -4)} ${currency}`;
  }
  const text = formatMinorUnitsGrouped(Math.abs(minor));
  const number = text.endsWith(',00') ? text.slice(0, -3) : text;
  return `${sign}${number} ${currency}`;
}

/** The sentence a зміна reads when there is none to give. */
export function noChangeReason(change: Extract<MonthChange, { status: 'unavailable' }>): string {
  return change.reason === 'overflow'
    ? `Порівняння недоступне: ${OVERFLOW_REASON}.`
    : 'Порівняння з попереднім місяцем поки недоступне.';
}

/**
 * One month's зміна as a line: signed amount, percentage where there is one, the up/down mark,
 * «від <the preceding month-end>» when `since` is given, and «нові рахунки» beside it when a
 * рахунок entered (net-worth, "Change requires a comparable previous month-end").
 */
export function changeLine(
  reading: Pick<HistoryReading, 'approximate' | 'currency'>,
  figure: Pick<MonthFigure, 'change' | 'entered'>,
  since: IsoDate | undefined,
  now: Date,
): { readonly text: string; readonly direction?: ChangeDirection } {
  if (figure.change.status === 'unavailable') {
    return { text: noChangeReason(figure.change) };
  }
  const { absolute, percent } = figure.change;
  const direction = directionOf(absolute);
  const parts = [
    `${signedReadingAmount(reading, absolute)}${percent !== undefined ? ` · ${percentText(percent)}` : ''}${DIRECTION_MARK[direction]}`,
  ];
  if (since !== undefined) parts.push(`від ${calendarLabel(since, now)}`);
  if (figure.entered !== 0) parts.push(`нові рахунки ${signedReadingAmount(reading, figure.entered)}`);
  return { text: parts.join(' · '), direction };
}

/** The headline: the current Статок in the reading — the приблизний статок, or the exact amount. */
export function headlineOf(series: NetWorthSeries, rates: readonly StoredRate[]): string | undefined {
  if (series.current.status !== 'ready' || series.selection === undefined) return undefined;
  if (series.selection === TOTAL_HISTORY) {
    const conversion = convertTotalsToUah(series.current.totals, rates);
    return conversion.status === 'known'
      ? readingAmount({ approximate: true, currency: UAH }, conversion.amount)
      : undefined;
  }
  const total = series.current.totals.get(series.selection);
  return total?.status === 'known' ? formatMoney(total.amount) : OVERFLOW_REASON;
}

/** Every exact per-currency current value on one line, UAH first. */
export function exactLine(current: NetWorthReading): string {
  return current.status === 'ready'
    ? currencyReadouts(current.totals).map((r) => r.text).join(' · ')
    : '';
}

/**
 * The line on поточна вартість beyond вкладено (net-worth, "The поточна вартість beyond вкладено is
 * read on its own"): the selected currency's, or every currency's converted for «Усе ≈ грн».
 */
export function investmentLine(
  series: NetWorthSeries,
  rates: readonly StoredRate[],
  now: Date,
): string | undefined {
  const differences = investmentDifference(series.current);
  if (differences.size === 0 || series.selection === undefined) return undefined;
  const say = (text: string, asOf: IsoDate) =>
    `інвестиції: ${text} понад вкладене, станом на ${calendarLabel(asOf, now)}`;
  if (series.selection !== TOTAL_HISTORY) {
    const own = differences.get(series.selection);
    return own ? say(formatSignedMoneyText(own.amount), own.asOf) : undefined;
  }
  const rateFor = new Map(rates.map((r) => [r.currency, r]));
  let sum = 0;
  let asOf: IsoDate | undefined;
  for (const [currency, difference] of differences) {
    const rate = rateFor.get(currency);
    if (currency !== UAH && rate === undefined) return undefined;
    sum += currency === UAH ? difference.amount.amount : approximateUah(difference.amount.amount, rate!.rateMillionths);
    if (asOf === undefined || difference.asOf < asOf) asOf = difference.asOf;
  }
  return say(signedReadingAmount({ approximate: true, currency: UAH }, sum), asOf!);
}

function formatSignedMoneyText(m: Money): string {
  return m.amount > 0 ? `+${formatMoney(m)}` : formatMoney(m);
}

/** The months of the chart under the widget: the current one and the eleven before it. */
export const WIDGET_MONTHS = 12;

/** One label under a chart: which bar or dot it names, its words, and whether it is today's month. */
export interface MonthTick {
  readonly index: number;
  readonly text: string;
  readonly current: boolean;
}

const SHORT_MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const MONTHS = [
  'січень',
  'лютий',
  'березень',
  'квітень',
  'травень',
  'червень',
  'липень',
  'серпень',
  'вересень',
  'жовтень',
  'листопад',
  'грудень',
];

/** «лис» — the month under a bar. */
export function shortMonthName(month: Month): string {
  return SHORT_MONTHS[Number(month.slice(5, 7)) - 1]!;
}

/** «листопад», and «листопад 2025» once the year is not `now`'s. */
export function monthName(month: Month, now: Date): string {
  const name = MONTHS[Number(month.slice(5, 7)) - 1]!;
  return Number(month.slice(0, 4)) === now.getFullYear() ? name : `${name} ${month.slice(0, 4)}`;
}

export interface NetWorthWidgetModel {
  /** «Ще немає рахунків» — present exactly when there is no account at all. */
  readonly emptyMessage?: string;
  /** The current Статок in the selected reading, prominently. */
  readonly headline?: string;
  /** Every exact per-currency current value on one line, always. */
  readonly exactLine: string;
  /** The same values one per currency, so only the one that changed moves. */
  readonly readouts: readonly CurrencyReadout[];
  readonly changeText?: string;
  readonly changeDirection?: ChangeDirection;
  readonly investmentLine?: string;
  /** Present when a рахунок of the reading carries a транзакція dated after today. */
  readonly futureLine?: string;
  /** «Усе ≈ грн» without a rate: stands in place of the chart and the change. */
  readonly withheldMessage?: string;
  /** The last twelve months' levels — month-ends and today — `undefined` where unknown. */
  readonly chartValues: readonly (number | undefined)[];
  readonly chartTicks: readonly MonthTick[];
  readonly chartLabel: string;
  /** What TalkBack says for the whole widget, which is one button opening «Статок». */
  readonly accessibilityLabel: string;
}

/**
 * The compact Статок widget (main-screen, "The Статок widget is a compact summary that opens
 * «Статок»"): the headline, the exact currencies, the change since the preceding month-end, the
 * investment line and a month-labelled twelve-month chart — no selector, point list or
 * explanation of its own; those belong to the screen, whose selection it reflects.
 */
export function netWorthWidgetModel(input: NetWorthInput): NetWorthWidgetModel {
  if (input.accounts.length === 0) {
    return {
      emptyMessage: 'Ще немає рахунків',
      exactLine: '',
      readouts: [],
      chartValues: [],
      chartTicks: [],
      chartLabel: 'Графік статку',
      accessibilityLabel: 'Статок. Ще немає рахунків',
    };
  }
  const series = netWorthSeries(input);
  return widgetFromSeries(series, input);
}

/** The widget's fields from an already-built series — the screen's own `netWorthSeries` result. */
export function widgetFromSeries(
  series: NetWorthSeries,
  input: Pick<NetWorthInput, 'rates' | 'now' | 'today'>,
): NetWorthWidgetModel {
  const headline = headlineOf(series, input.rates);
  const exact = exactLine(series.current);
  const readouts = series.current.status === 'ready' ? currencyReadouts(series.current.totals) : [];
  const investment = investmentLine(series, input.rates, input.now);
  const name = series.selection === TOTAL_HISTORY ? 'Статок, усе наближено в гривнях' : `Статок, ${series.selection}`;
  if (series.reading === undefined) {
    return {
      ...(headline ? { headline } : {}),
      exactLine: exact,
      readouts,
      ...(investment ? { investmentLine: investment } : {}),
      ...(series.hasFutureRecords ? { futureLine: FUTURE_RECORDS_LINE } : {}),
      ...(series.withheldMessage ? { withheldMessage: series.withheldMessage } : {}),
      chartValues: [],
      chartTicks: [],
      chartLabel: 'Графік статку',
      accessibilityLabel: [name, series.withheldMessage, exact, 'Відкриває Статок'].filter(Boolean).join('. '),
    };
  }
  const reading = series.reading;
  const months = reading.months.slice(-WIDGET_MONTHS);
  const currentMonth = months.at(-1);
  const previous = reading.months.at(-2);
  const change = currentMonth
    ? changeLine(reading, currentMonth, previous?.date, input.now)
    : undefined;
  const ticks = months.map((m, index) => ({
    index,
    text: shortMonthName(m.month),
    current: index === months.length - 1,
  }));
  const spokenChange =
    currentMonth?.change.status === 'available'
      ? `зміна ${spokenAmount(reading, currentMonth.change.absolute, true)}, ${DIRECTION_WORD[directionOf(currentMonth.change.absolute)]}, від ${calendarLabel(previous!.date, input.now)}`
      : change?.text;
  const spokenHeadline =
    series.selection === TOTAL_HISTORY && series.current.status === 'ready'
      ? (() => {
          const conversion = convertTotalsToUah(series.current.totals, input.rates);
          return conversion.status === 'known' ? spokenAmount(reading, conversion.amount) : headline;
        })()
      : headline;
  return {
    ...(headline ? { headline } : {}),
    exactLine: exact,
    readouts,
    ...(change ? { changeText: change.text } : {}),
    ...(change?.direction ? { changeDirection: change.direction } : {}),
    ...(investment ? { investmentLine: investment } : {}),
    ...(series.hasFutureRecords ? { futureLine: FUTURE_RECORDS_LINE } : {}),
    chartValues: months.map((m) => m.end),
    chartTicks: ticks,
    chartLabel: `Графік статку за ${months.length} міс., шкала в ${reading.approximate ? 'гривнях, наближено' : reading.currency}`,
    accessibilityLabel: [name, spokenHeadline, spokenChange, 'Відкриває Статок'].filter(Boolean).join('. '),
  };
}
