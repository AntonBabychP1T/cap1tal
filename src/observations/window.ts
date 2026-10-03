import { medianOf } from '../analysis/trends';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { categoryBreakdown } from '../domain/monthly-picture';
import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import { isCompleted, monthBefore } from '../progress/summary';
import { NOTICEABLE_BP, WINDOW_MIN_MONTHS, WINDOW_MONTHS } from './thresholds';

/** The calendar month before — the зведення прогресу's own, re-exported for the detectors. */
export { monthBefore };

/**
 * The past a month is read against (observations, "The past is read over a window of finished
 * months, per currency"): which months, what is typical over them, and what is noticeable.
 *
 * Everything is per currency and nothing is converted. Medians are `medianOf`'s — the пакет's own,
 * so «typical» rounds the one way everywhere in the app.
 */

/** Every currency a транзакція names — both legs of a переказ, as a ProgressSummary row counts it. */
export function currenciesOfTransaction(t: Transaction): readonly CurrencyCode[] {
  if (t.type !== 'transfer') return [t.amount.currency];
  return t.left.currency === t.arrived.currency
    ? [t.left.currency]
    : [t.left.currency, t.arrived.currency];
}

/**
 * The stored history as the detectors read it: grouped by month once, with each month's
 * breakdown by категорія computed at most once however many detectors ask for it.
 */
export interface Ledger {
  readonly today: IsoDate;
  /** Every currency any транзакція names, in no particular order. */
  readonly currencies: readonly CurrencyCode[];
  /** Every month holding a транзакція, oldest first. */
  readonly months: readonly Month[];
  /** The транзакції dated in `month`, in the order they were given. */
  inMonth(month: Month): readonly Transaction[];
  /** `categoryBreakdown` of the month in one currency: категорія → витрачено, net of повернення. */
  breakdown(month: Month, currency: CurrencyCode): ReadonlyMap<string, Money>;
  /** The month's витрачено in one currency — the breakdown's sum, which is `monthlyPicture`'s. */
  spent(month: Month, currency: CurrencyCode): Money;
  /** Whether some транзакція of `month` names `currency`. */
  isActive(month: Month, currency: CurrencyCode): boolean;
}

export function ledgerOf(transactions: readonly Transaction[], today: IsoDate): Ledger {
  const grouped = new Map<Month, Transaction[]>();
  const active = new Map<CurrencyCode, Set<Month>>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    const bucket = grouped.get(month);
    if (bucket) bucket.push(t);
    else grouped.set(month, [t]);
    for (const currency of currenciesOfTransaction(t)) {
      const months = active.get(currency) ?? new Set<Month>();
      months.add(month);
      active.set(currency, months);
    }
  }
  const breakdowns = new Map<Month, Map<CurrencyCode, Map<string, Money>>>();
  const breakdownOf = (month: Month) => {
    let held = breakdowns.get(month);
    if (!held) {
      held = categoryBreakdown({ month, transactions: grouped.get(month) ?? [] });
      breakdowns.set(month, held);
    }
    return held;
  };
  const empty: ReadonlyMap<string, Money> = new Map();
  return {
    today,
    currencies: [...active.keys()],
    months: [...grouped.keys()].sort(),
    inMonth: (month) => grouped.get(month) ?? [],
    breakdown: (month, currency) => breakdownOf(month).get(currency) ?? empty,
    spent: (month, currency) => {
      let total = 0;
      for (const amount of breakdownOf(month).get(currency)?.values() ?? []) total += amount.amount;
      return money(total, currency);
    },
    isActive: (month, currency) => active.get(currency)?.has(month) ?? false,
  };
}

/**
 * The завершені активні місяці of one currency, oldest first: calendar months that have ended by
 * today and hold at least one транзакція naming the currency — `completedMonthsIn`'s rule, over
 * транзакції rather than a зведення прогресу (design D2; the parity is a test).
 */
export function finishedActiveMonths(ledger: Ledger, currency: CurrencyCode): Month[] {
  return ledger.months.filter(
    (month) => ledger.isActive(month, currency) && isCompleted(month, ledger.today),
  );
}

/**
 * The window of `month` in one currency: the most recent завершені активні місяці before it, up to
 * six, oldest first — or `null` when there are fewer than three. The month itself is never in its
 * own window.
 */
export function windowOf(ledger: Ledger, month: Month, currency: CurrencyCode): Month[] | null {
  const before = finishedActiveMonths(ledger, currency).filter((m) => m < month);
  const window = before.slice(-WINDOW_MONTHS);
  return window.length >= WINDOW_MIN_MONTHS ? window : null;
}

/** The median of the currency's whole витрачено over the window. Not necessarily positive. */
export function typicalSpentOf(ledger: Ledger, window: readonly Month[], currency: CurrencyCode): Money {
  return medianOf(window.map((month) => ledger.spent(month, currency)));
}

/**
 * The типова сума of one категорія: the median of its витрачено over the window, net of повернення,
 * a month without it counting as zero.
 */
export function typicalOf(
  ledger: Ledger,
  window: readonly Month[],
  currency: CurrencyCode,
  categoryId: string,
): Money {
  return medianOf(
    window.map((month) => ledger.breakdown(month, currency).get(categoryId) ?? money(0, currency)),
  );
}

/** The поріг помітності: 3 % of the типова сума of витрачено, rounded half away from zero. */
export function noticeableOf(typicalSpent: Money): Money {
  return money(
    Number(ratioHalfAway(BigInt(typicalSpent.amount) * BigInt(NOTICEABLE_BP), 10000n)),
    typicalSpent.currency,
  );
}

/**
 * What a month is read against in one currency, or `null` when there is nothing typical: fewer
 * than three months in the window, or a typical витрачено that is not positive.
 */
export interface Baseline {
  readonly currency: CurrencyCode;
  /** The window, oldest first. */
  readonly window: readonly Month[];
  /** Positive. */
  readonly typicalSpent: Money;
  readonly noticeable: Money;
}

export function baselineOf(ledger: Ledger, month: Month, currency: CurrencyCode): Baseline | null {
  const window = windowOf(ledger, month, currency);
  if (!window) return null;
  const typicalSpent = typicalSpentOf(ledger, window, currency);
  if (typicalSpent.amount <= 0) return null;
  return { currency, window, typicalSpent, noticeable: noticeableOf(typicalSpent) };
}

/**
 * `numerator / denominator` rounded half away from zero, in BigInt so a сума times 10 000 never
 * passes 2^53 on the way. The denominator must be positive.
 */
export function ratioHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('a ratio needs a positive denominator');
  const negative = numerator < 0n;
  const magnitude = (2n * (negative ? -numerator : numerator) + denominator) / (2n * denominator);
  return negative ? -magnitude : magnitude;
}

/** `(after − before) × 100 / before`, a whole percent rounded half away from zero; `before` > 0. */
export function changePercentOf(before: Money, after: Money): number {
  return Number(ratioHalfAway((BigInt(after.amount) - BigInt(before.amount)) * 100n, BigInt(before.amount)));
}

/** Whether `|a − b| × 10 000 ≥ bandBp × |b|` — `a` lies at least `bandBp` away from `b`. */
export function outsideBand(a: Money, b: Money, bandBp: number): boolean {
  const distance = BigInt(Math.abs(a.amount - b.amount)) * 10000n;
  return distance >= BigInt(bandBp) * BigInt(Math.abs(b.amount));
}

/** Whether `|a − b| × 10 000 ≤ bandBp × |b|` — `a` lies within `bandBp` of `b`, the edge included. */
export function withinBand(a: Money, b: Money, bandBp: number): boolean {
  const distance = BigInt(Math.abs(a.amount - b.amount)) * 10000n;
  return distance <= BigInt(bandBp) * BigInt(Math.abs(b.amount));
}
