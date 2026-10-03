import { largestPerMonthByKey, medianOf } from '../analysis/trends';
import type { Expense, Month, Transaction } from '../domain/transaction';
import { txRef, type MerchantKeyOf, type PriceChange } from './observation';
import {
  PRICE_BAND_BP,
  PRICE_NEAREST_MAX_FACTOR,
  PRICE_NEAREST_MIN_DIVISOR,
  PRICE_PRIOR_MONTHS,
} from './thresholds';
import { changePercentOf, monthBefore, withinBand, type Ledger } from './window';

/**
 * A regular payment whose price changed (observations, "A regular payment whose price changed is
 * stated"): a продавець charged within 5 % of one сума in each of the three calendar months before,
 * and charged this month only outside that band — at most twice, at least half the usual, so an
 * unrelated larger order at the same продавець is not mistaken for a new price.
 *
 * «Regular» is measured the way the пакет measures a recurring candidate: the largest витрата of
 * the продавець in each month (`largestPerMonthByKey`), and their median (`medianOf`). No поріг and
 * no window: a subscription that changed by fifty hryvnias is worth knowing.
 */
export function priceChanges(ledger: Ledger, month: Month, merchantKeyOf: MerchantKeyOf): PriceChange[] {
  const prior: Month[] = [];
  for (let m = month; prior.length < PRICE_PRIOR_MONTHS; ) {
    m = monthBefore(m);
    prior.unshift(m);
  }
  const priorTransactions: Transaction[] = prior.flatMap((m) => [...ledger.inMonth(m)]);
  const found: PriceChange[] = [];

  for (const currency of ledger.currencies) {
    const charges = new Map<string, Expense[]>();
    for (const t of ledger.inMonth(month)) {
      if (t.type !== 'expense' || t.amount.currency !== currency) continue;
      const merchant = merchantKeyOf(t);
      if (merchant === null) continue;
      const list = charges.get(merchant) ?? [];
      list.push(t);
      charges.set(merchant, list);
    }
    if (charges.size === 0) continue;

    const largest = largestPerMonthByKey({
      transactions: priorTransactions,
      months: prior,
      currency,
      keyOf: merchantKeyOf,
    });
    for (const [merchant, thisMonth] of charges) {
      const perMonth = largest.get(merchant);
      if (!perMonth || perMonth.length < PRICE_PRIOR_MONTHS) continue;
      const usual = medianOf(perMonth);
      if (usual.amount <= 0) continue;
      // Regular: each of the three lies within the band.
      if (!perMonth.every((m) => withinBand(m, usual, PRICE_BAND_BP))) continue;
      // Changed: none of this month's charges lies within it.
      if (thisMonth.some((t) => withinBand(t.amount, usual, PRICE_BAND_BP))) continue;
      const nearest = [...thisMonth].sort(
        (a, b) =>
          Math.abs(a.amount.amount - usual.amount) - Math.abs(b.amount.amount - usual.amount) ||
          (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )[0]!;
      const x = nearest.amount.amount;
      if (x * PRICE_NEAREST_MIN_DIVISOR < usual.amount || x > usual.amount * PRICE_NEAREST_MAX_FACTOR) continue;
      found.push({
        kind: 'price-change',
        month,
        currency,
        key: `price-change:${currency}:${nearest.id}:${month}`,
        transaction: txRef(nearest),
        usual,
        changePercent: changePercentOf(usual, nearest.amount),
      });
    }
  }
  return found;
}

