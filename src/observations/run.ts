import { money, type Money } from '../domain/money';
import type { Month } from '../domain/transaction';
import { isCompleted } from '../progress/summary';
import type { CategoryRun, CategoryVsTypical } from './observation';
import { RUN_MIN } from './thresholds';
import { isCategorySubject } from './vs-typical';
import { baselineOf, monthBefore, type Ledger } from './window';

/**
 * A категорія of a finished month that has grown for the third calendar month running, or longer
 * (observations, "A категорія that has grown three months running is stated").
 *
 * Walking back from the month: each earlier calendar month must be a завершений активний місяць of
 * the currency, hold strictly less, and still hold more than zero — so a month with no транзакція
 * of the currency, a flat month, or a month without the категорія ends the run. A категорія
 * already stated against its типова сума is not stated again as a run: one fact per категорія.
 */
export function runs(
  ledger: Ledger,
  month: Month,
  againstTypical: readonly CategoryVsTypical[],
): CategoryRun[] {
  const found: CategoryRun[] = [];
  for (const currency of ledger.currencies) {
    if (!ledger.isActive(month, currency)) continue;
    const baseline = baselineOf(ledger, month, currency);
    if (!baseline) continue;
    const typicalStated = new Set(
      againstTypical.filter((o) => o.currency === currency).map((o) => o.categoryId),
    );
    const valueOf = (m: Month, categoryId: string): Money =>
      ledger.breakdown(m, currency).get(categoryId) ?? money(0, currency);

    for (const [categoryId, last] of ledger.breakdown(month, currency)) {
      if (!isCategorySubject(categoryId) || typicalStated.has(categoryId)) continue;
      const series: Money[] = [last];
      let earliest = month;
      for (;;) {
        const before = monthBefore(earliest);
        if (!ledger.isActive(before, currency) || !isCompleted(before, ledger.today)) break;
        const value = valueOf(before, categoryId);
        if (value.amount <= 0 || value.amount >= series[0]!.amount) break;
        series.unshift(value);
        earliest = before;
      }
      const run = series.length - 1;
      if (run < RUN_MIN) continue;
      if (last.amount - series[0]!.amount < baseline.noticeable.amount) continue;
      found.push({
        kind: 'category-run',
        month,
        currency,
        key: `category-run:${currency}:${categoryId}:${month}`,
        categoryId,
        run,
        series,
      });
    }
  }
  return found;
}
