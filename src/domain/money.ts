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
