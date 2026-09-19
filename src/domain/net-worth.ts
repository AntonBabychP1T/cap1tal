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
}

/**
 * One currency's total, or why it has none. `overflow`: a sum would be unsafe to represent
 * exactly. `gap`: at least one account's contribution at this historical date cannot be
 * reconstructed (net-worth, "Undated opening money produces honest coverage gaps") — the current
 * reading (`currentNetWorth`) never produces this reason, only the history below does.
 */
export type CurrencyTotal =
  | { readonly status: 'known'; readonly amount: Money }
  | { readonly status: 'unavailable'; readonly reason: 'overflow' | 'gap' };

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
}): NetWorthReading {
  if (input.accounts.length === 0) {
    return { status: 'empty' };
  }

  const contributions: AccountContribution[] = input.accounts.map((account) => {
    const currentValue = input.currentValues.get(account.id);
    const usesCurrentValue = account.kind === 'investment' && currentValue !== undefined;
    const amount = contribution(account, input.transactions, currentValue?.amount);
    return {
      accountId: account.id,
      currency: account.currency,
      amount,
      basis: usesCurrentValue ? 'currentValue' : 'ledger',
      ...(usesCurrentValue ? { asOf: currentValue.asOf } : {}),
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
 * History (net-worth, "History is reconstructed…", "Undated opening money…", "History spans…").
 *
 * Always on the ledger basis — вкладено for an investment, never its поточна вартість: no
 * `currentValues` reach here at all, so a valuation entered today cannot join the curve for a
 * past date by construction (net-worth, "Today's valuation never changes past points").
 */

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

/** The last calendar date of `month`, as `'YYYY-MM-DD'`. */
function monthEndDate(month: Month): IsoDate {
  const match = MONTH_PATTERN.exec(month)!;
  const year = Number(match[1]);
  const m = Number(match[2]);
  return `${month}-${String(daysInMonth(year, m)).padStart(2, '0')}`;
}

/**
 * The dated points history reads at: `firstDate` itself, each calendar month-end from its month
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
 * One account's known-ness and value at one candidate `date`. A nonzero opening is unknown before
 * its own `firstDate` (or forever, absent one) — a zero opening is always known, contributing
 * nothing before its own first movement (net-worth, "Undated opening money produces honest
 * coverage gaps"). The one candidate date that is not a month-end or `today` — `globalFirstDate`
 * — is the one point needing `firstDateNet`'s sub-month precision; every other candidate is a
 * whole month-end (or `today`, already bounded to it by the repository), so the cumulative
 * monthly sum is exact there without it.
 */
function valueAt(
  input: AccountHistoryInput,
  date: IsoDate,
  globalFirstDate: IsoDate,
): { readonly known: boolean; readonly amount: number } {
  const opening = input.account.openingBalance.amount;
  if (opening !== 0 && (input.firstDate === undefined || date < input.firstDate)) {
    return { known: false, amount: 0 };
  }
  if (date === globalFirstDate && input.firstDate === globalFirstDate) {
    return { known: true, amount: opening + (input.firstDateNet ?? 0) };
  }
  let cumulative = 0;
  const month = monthOf(date);
  for (const [m, net] of input.monthlyNet) {
    if (m <= month) cumulative += net;
  }
  return { known: true, amount: opening + cumulative };
}

/**
 * The reconstructed Статок history: one point per candidate date, each currency's total known
 * only when every account of that currency is known at that date, a gap otherwise. No account
 * anywhere has ever carried a транзакція on or before `today` → no points at all — an empty
 * history has no span to be honest about, the same rule `reports.ts`'s `historyMonths` uses.
 */
export function netWorthHistory(input: {
  readonly accounts: readonly AccountHistoryInput[];
  readonly today: IsoDate;
}): readonly HistoryPoint[] {
  const firstDates = input.accounts
    .map((a) => a.firstDate)
    .filter((d): d is IsoDate => d !== undefined);
  if (firstDates.length === 0) {
    return [];
  }
  const globalFirstDate = firstDates.reduce((min, d) => (d < min ? d : min));

  const byCurrency = new Map<CurrencyCode, AccountHistoryInput[]>();
  for (const a of input.accounts) {
    const list = byCurrency.get(a.account.currency) ?? [];
    list.push(a);
    byCurrency.set(a.account.currency, list);
  }

  return candidateDates(globalFirstDate, input.today).map((date) => {
    const totals = new Map<CurrencyCode, CurrencyTotal>();
    for (const [currency, accounts] of byCurrency) {
      const amounts: number[] = [];
      let allKnown = true;
      for (const a of accounts) {
        const v = valueAt(a, date, globalFirstDate);
        if (!v.known) {
          allKnown = false;
          break;
        }
        amounts.push(v.amount);
      }
      totals.set(
        currency,
        allKnown ? sumSafely(currency, amounts) : { status: 'unavailable', reason: 'gap' },
      );
    }
    return { date, totals };
  });
}

/**
 * Change (net-worth, "Change requires a comparable previous month-end"). Absolute and, only for a
 * strictly positive baseline, a signed percentage rounded to one decimal.
 */
export interface CurrencyChange {
  readonly currency: CurrencyCode;
  readonly absolute: Money;
  /** Present only when the baseline is strictly positive — a percentage of zero or less lies. */
  readonly percent?: number;
  /** The baseline's own date — «від <date>», never described as investment return. */
  readonly since: IsoDate;
}

export type ChangeResult =
  | { readonly status: 'available'; readonly change: CurrencyChange }
  | {
      readonly status: 'unavailable';
      readonly reason: 'no-baseline' | 'valuation-substituted' | 'future-records';
    };

/** `round(numerator × 1000 / denominator) / 10` — one decimal place, no accumulated drift. */
function roundToOneDecimal(numerator: number, denominator: number): number {
  return Math.round((numerator * 1000) / denominator) / 10;
}

/**
 * One currency's change from the preceding calendar month-end to the current exact reading.
 * Suppressed — never silently substituted with an older period — when: the current reading
 * participates in an investment валюація substitution for this currency (the baseline is always
 * ledger-basis, a current reading using поточна вартість is not on the same basis); a future-dated
 * record affects this currency; or no known baseline point exists at all. The caller supplies
 * `currentUsedValuation` and `hasFutureRecords` (from `currentNetWorth`'s contributions and
 * `net-worth-repo.ts`'s future-record flag) and `previousMonthEnd` (a point `netWorthHistory`
 * produced for the preceding month-end, when there is one).
 */
export function netWorthChange(input: {
  readonly current: CurrencyTotal;
  readonly currentUsedValuation: boolean;
  readonly hasFutureRecords: boolean;
  readonly previousMonthEnd?: { readonly date: IsoDate; readonly total: CurrencyTotal };
}): ChangeResult {
  if (input.hasFutureRecords) {
    return { status: 'unavailable', reason: 'future-records' };
  }
  if (input.currentUsedValuation) {
    return { status: 'unavailable', reason: 'valuation-substituted' };
  }
  if (
    input.previousMonthEnd === undefined ||
    input.previousMonthEnd.total.status !== 'known' ||
    input.current.status !== 'known'
  ) {
    return { status: 'unavailable', reason: 'no-baseline' };
  }
  const baseline = input.previousMonthEnd.total.amount;
  const current = input.current.amount;
  if (baseline.currency !== current.currency) {
    throw new Error(`cannot compare ${current.currency} against a ${baseline.currency} baseline`);
  }
  const absolute = money(current.amount - baseline.amount, baseline.currency);
  const percent = baseline.amount > 0 ? roundToOneDecimal(absolute.amount, baseline.amount) : undefined;
  return {
    status: 'available',
    change: {
      currency: baseline.currency,
      absolute,
      since: input.previousMonthEnd.date,
      ...(percent === undefined ? {} : { percent }),
    },
  };
}
