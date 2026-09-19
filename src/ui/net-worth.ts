import type { StoredRate } from '../db/rates-repo';
import type { CurrencyCode } from '../domain/money';
import type { AccountContribution, CurrencyTotal } from '../domain/net-worth';
import type { IsoDate } from '../domain/transaction';
import { byCurrency, formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { approximateUah } from './approx-uah';
import { calendarLabel } from './dates';

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
export function accountBasisLines(contributions: readonly AccountContribution[], now: Date): AccountBasisLine[] {
  return contributions.map((c) => ({
    accountId: c.accountId,
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
