/**
 * Money: an integer amount in minor units (kopiykas, cents) with an ISO-4217
 * currency code. Amounts of different currencies never combine; the
 * approximate-UAH conversion is a display concern outside the domain.
 */

/** ISO-4217 code, e.g. 'UAH', 'EUR', 'USD'. The set is open per FR-A1. */
export type CurrencyCode = string;

export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * The largest single сума the app admits from outside — typed, imported from Saldo, restored from
 * a backup: 999 999 999,99 (just under a billion in major units), in minor units.
 *
 * `money` insists on a safe integer, and a total is only as safe as the rows it adds up: one row
 * at `Number.MAX_SAFE_INTEGER` is valid on its own and breaks every sum it enters, forever (the
 * Головний crash the QA pass found). At this ceiling roughly ninety thousand rows — every one of
 * them at the maximum — still add up inside the safe range (9.007e15 / 1e11 ≈ 90 071), which is
 * more than a person's lifetime of records, almost none of which comes near a billion. Nor does
 * the ceiling cut off a real amount: no one-person рахунок or покупка reaches a billion гривень.
 *
 * The domain does not enforce it inside `money` — sums and balances legitimately grow past any one
 * row — it is the bound each boundary checks before an amount is stored.
 */
export const MAX_AMOUNT_MINOR = 99_999_999_999;

export function money(amount: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`money amount must be an integer in minor units, got ${amount}`);
  }
  if (!CURRENCY_CODE.test(currency)) {
    throw new Error(`currency must be an ISO-4217 code, got "${currency}"`);
  }
  return { amount, currency };
}

function requireSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`cannot combine ${a.currency} with ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}
