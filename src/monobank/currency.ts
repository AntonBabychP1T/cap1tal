import type { CurrencyCode } from '../domain/money';

/**
 * monobank's public, tokenless currency endpoint — one of the two outbound connections the
 * product allows, and the only one this change touches. No token comes near this module.
 *
 * This is the boundary where floats stop. The endpoint answers with JSON numbers
 * (`"rateBuy": 41.2534`); everything downstream of `parseMonobankRates` is integer millionths.
 * The parser is total: an unrecognised, truncated or hostile payload parses to no rows, which
 * the specs already treat as a first-class state (no approximation, and silence about it).
 */

export const MONOBANK_CURRENCY_URL = 'https://api.monobank.ua/bank/currency';

export interface MonobankRate {
  readonly currency: CurrencyCode;
  /** UAH per one unit of `currency`, ×1e6. Always a positive safe integer. */
  readonly rateMillionths: number;
}

/** Only what `fetchMonobankRates` needs of `fetch`, so tests hand it a stub and never a network. */
export type FetchLike = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

/** ISO-4217 numeric for UAH: the only quote currency whose pairs interest us. */
const UAH_NUMERIC = 980;

/**
 * The currencies the app offers accounts in, minus UAH itself. The whitelist is also the guard
 * that keeps the converter correct: UAH, USD and EUR all have two minor digits, so
 * minor-units-in / minor-units-out needs no exponent. A currency with another exponent (JPY has
 * none) must extend `src/ui/approx-uah.ts`, not just this table.
 */
const OFFERED_BY_NUMERIC: Readonly<Record<number, CurrencyCode>> = {
  840: 'USD',
  978: 'EUR',
};

/**
 * The currencies a rate can ever be obtained for — the whitelist above, read out. Staleness is
 * decided against this list, not against the currencies a month happens to hold: a rate we can
 * have and do not is what sends us back to monobank.
 */
export const MONOBANK_RATE_CURRENCIES: readonly CurrencyCode[] = Object.values(
  OFFERED_BY_NUMERIC,
).sort();

const MILLION = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A JSON number that could be a rate: finite and above zero. Anything else is not one. */
function asRate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The endpoint's rows → the rates we keep. A pair is kept when it quotes an offered currency
 * against UAH; `rateBuy` is preferred and `rateCross` is the fallback.
 *
 * `rateBuy` is what the bank pays for the owner's foreign currency — the honest answer to "what
 * are my dollars worth in UAH today". `rateSell` answers the opposite question and is ignored.
 *
 * The float is converted exactly once, here. A currency listed twice keeps its first row.
 */
export function parseMonobankRates(payload: unknown): MonobankRate[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const rates: MonobankRate[] = [];
  const seen = new Set<CurrencyCode>();
  for (const entry of payload) {
    if (!isRecord(entry) || entry.currencyCodeB !== UAH_NUMERIC) {
      continue;
    }
    const codeA = entry.currencyCodeA;
    if (typeof codeA !== 'number') {
      continue;
    }
    const currency = OFFERED_BY_NUMERIC[codeA];
    if (!currency || seen.has(currency)) {
      continue;
    }
    const rate = asRate(entry.rateBuy) ?? asRate(entry.rateCross);
    if (rate === undefined) {
      continue;
    }
    const rateMillionths = Math.round(rate * MILLION);
    // A rate so large it leaves the safe-integer range is not a rate we can store or multiply by.
    if (!Number.isSafeInteger(rateMillionths) || rateMillionths <= 0) {
      continue;
    }
    seen.add(currency);
    rates.push({ currency, rateMillionths });
  }
  return rates;
}

/**
 * The current rates, or none. Every failure — offline, DNS, a non-200, the 429 the endpoint
 * answers when polled more often than every few minutes, a body that is not the expected JSON —
 * returns no rows rather than throwing. The caller keeps whatever it had cached and says nothing:
 * this figure is secondary, and the per-currency numbers do not depend on it.
 */
export async function fetchMonobankRates(fetchImpl: FetchLike): Promise<MonobankRate[]> {
  try {
    const response = await fetchImpl(MONOBANK_CURRENCY_URL);
    if (!response.ok) {
      return [];
    }
    return parseMonobankRates(await response.json());
  } catch {
    return [];
  }
}
