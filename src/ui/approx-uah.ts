import { money, type CurrencyCode, type Money } from '../domain/money';
import type { MonthlyNumbers } from '../domain/monthly-picture';
import { MONOBANK_RATE_CURRENCIES, type MonobankRate } from '../monobank/currency';

/**
 * The approximate UAH equivalent — display only. Nothing here is ever stored, no transaction
 * carries it, and no balance or monthly number derives from it: the per-currency numbers stay the
 * truth and this is a second, softer line beside them. That is why it lives in `src/ui` and not
 * in `src/domain`, which stays rate-free.
 *
 * Absence is a first-class answer. A month with no foreign currency has nothing to approximate,
 * and a month whose currencies are not all covered by a known rate gets no approximation at all —
 * never a partial one, which would read as a total.
 */

const UAH: CurrencyCode = 'UAH';
const MILLION = 1_000_000n;

/**
 * `amount × rateMillionths / 1e6`, rounded to the nearest minor unit with halves away from zero.
 *
 * In BigInt, for two reasons. The product exceeds 2^53 for ordinary monthly sums (a million
 * hryvnia is 1e8 minor units, and a rate is ~5e7 millionths), and neither obvious shortcut gets
 * the rounding right: integer division truncates toward zero, so −412534.5 would become −412534,
 * and `Math.round` rounds toward +∞, so it would give −412534 as well. The rule is symmetric —
 * −10000 USD is worth exactly as much as +10000 USD, with the other sign.
 *
 * Minor-units-in / minor-units-out is only correct because UAH, USD and EUR all have two minor
 * digits. The whitelist in `src/monobank/currency.ts` is what keeps that true; a currency with a
 * different exponent must extend this function, not just that table.
 */
export function approximateUah(amount: number, rateMillionths: number): number {
  const product = BigInt(amount) * BigInt(rateMillionths);
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const whole = magnitude / MILLION;
  const remainder = magnitude % MILLION;
  const rounded = remainder * 2n >= MILLION ? whole + 1n : whole;
  return Number(negative ? -rounded : rounded);
}

/** The six numbers of one month, approximated into UAH — or `null` when they cannot honestly be. */
export function approximatePicture(
  picture: ReadonlyMap<CurrencyCode, MonthlyNumbers>,
  rates: readonly MonobankRate[],
): MonthlyNumbers | null {
  const currencies = [...picture.keys()];
  if (!currencies.some((currency) => currency !== UAH)) {
    // A UAH-only month is already in UAH. Approximating it would only add a second, identical
    // number marked "approximately", which says less than the number beside it.
    return null;
  }

  const rateFor = new Map(rates.map((rate) => [rate.currency, rate.rateMillionths]));
  const converted = new Map<CurrencyCode, number>();
  for (const currency of currencies) {
    if (currency === UAH) {
      continue;
    }
    const rateMillionths = rateFor.get(currency);
    if (rateMillionths === undefined) {
      // One unknown rate withholds the whole approximation: a sum missing a currency is not an
      // approximation of the month, it is an approximation of part of it wearing the month's name.
      return null;
    }
    converted.set(currency, rateMillionths);
  }

  const sumOf = (field: keyof MonthlyNumbers): number | null => {
    let total = 0;
    for (const [currency, numbers] of picture) {
      const amount = numbers[field].amount;
      total += currency === UAH ? amount : approximateUah(amount, converted.get(currency)!);
      if (!Number.isSafeInteger(total)) {
        return null;
      }
    }
    return total;
  };

  const fields = ['spent', 'invested', 'saved', 'lent', 'income', 'left'] as const;
  const totals = new Map<(typeof fields)[number], Money>();
  for (const field of fields) {
    const total = sumOf(field);
    // Beyond the safe-integer range there is no honest number left to show, and this figure is
    // the one thing on the screen that is allowed to be absent.
    if (total === null) {
      return null;
    }
    totals.set(field, money(total, UAH));
  }

  return {
    spent: totals.get('spent')!,
    invested: totals.get('invested')!,
    saved: totals.get('saved')!,
    lent: totals.get('lent')!,
    income: totals.get('income')!,
    left: totals.get('left')!,
  };
}

/**
 * How old a rate may be before the screen asks monobank again. One hour keeps us far under the
 * endpoint's rate limit (it 429s at roughly one call per five minutes), and a rate an hour old is
 * still an honest "approximately" for a month's total.
 */
export const RATE_MAX_AGE_MS = 60 * 60 * 1000;

/** What `staleCurrencies` needs of a stored rate. `StoredRate` satisfies it. */
export interface KnownRate {
  readonly currency: CurrencyCode;
  readonly obtainedAt: Date;
}

/**
 * The currencies monobank could give us a rate for and either has not, or gave us too long ago.
 *
 * Decided per currency on purpose. Asking "is the newest stored rate old?" would let a fresh USD
 * rate keep a week-old EUR rate serving the approximation forever, which is exactly what a
 * partial answer from the endpoint produces.
 *
 * A rate stamped in the future — the device clock moved back — counts as fresh rather than as an
 * error: refetching would not fix a clock, and this figure is not worth an error message.
 */
export function staleCurrencies(rates: readonly KnownRate[], now: Date): CurrencyCode[] {
  const obtainedAt = new Map(rates.map((rate) => [rate.currency, rate.obtainedAt.getTime()]));
  return MONOBANK_RATE_CURRENCIES.filter((currency) => {
    const at = obtainedAt.get(currency);
    return at === undefined || now.getTime() - at > RATE_MAX_AGE_MS;
  });
}

/** Whether opening the screen should ask monobank at all. */
export function shouldRefreshRates(rates: readonly KnownRate[], now: Date): boolean {
  return staleCurrencies(rates, now).length > 0;
}
