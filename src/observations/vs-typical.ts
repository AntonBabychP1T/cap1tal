import { money } from '../domain/money';
import { CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID, type Month } from '../domain/transaction';
import type { CategoryVsTypical } from './observation';
import { TYPICAL_BAND_BP } from './thresholds';
import { baselineOf, changePercentOf, outsideBand, typicalOf, type Ledger } from './window';

/**
 * «Коригування» and «Без категорії» are never the subject of a category-level спостереження: each
 * has its own line in the підсумок місяця. «Комісія» is an ordinary категорія of витрачено here.
 */
export function isCategorySubject(categoryId: string): boolean {
  return categoryId !== CORRECTION_CATEGORY_ID && categoryId !== UNCATEGORISED_CATEGORY_ID;
}

/**
 * A категорія of a finished month against its типова сума (observations, "A категорія of a
 * finished month is stated against its типова сума"): stated when it lies ±25 % or more from it
 * and by at least the поріг помітності, in each currency of the month.
 */
export function vsTypical(ledger: Ledger, month: Month): CategoryVsTypical[] {
  const found: CategoryVsTypical[] = [];
  for (const currency of ledger.currencies) {
    if (!ledger.isActive(month, currency)) continue;
    const baseline = baselineOf(ledger, month, currency);
    if (!baseline) continue;

    // A категорія with a positive типова сума was present in some window month; one present in the
    // month itself but in none of them has a типова сума of zero and is never stated here.
    const candidates = new Set<string>();
    for (const m of baseline.window) {
      for (const categoryId of ledger.breakdown(m, currency).keys()) candidates.add(categoryId);
    }
    const shown = ledger.breakdown(month, currency);
    for (const categoryId of candidates) {
      if (!isCategorySubject(categoryId)) continue;
      const typical = typicalOf(ledger, baseline.window, currency, categoryId);
      if (typical.amount <= 0) continue;
      const amount = shown.get(categoryId) ?? money(0, currency);
      if (amount.amount < 0) continue;
      if (!outsideBand(amount, typical, TYPICAL_BAND_BP)) continue;
      if (Math.abs(amount.amount - typical.amount) < baseline.noticeable.amount) continue;
      found.push({
        kind: 'category-vs-typical',
        month,
        currency,
        key: `category-vs-typical:${currency}:${categoryId}:${month}`,
        categoryId,
        amount,
        typical,
        changePercent: changePercentOf(typical, amount),
      });
    }
  }
  return found;
}
