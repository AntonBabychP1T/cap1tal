import { categoryBreakdown } from '../domain/monthly-picture';
import { monthOf } from '../domain/transaction';
import type { CategoryEarly } from './observation';
import { isCategorySubject } from './vs-typical';
import { baselineOf, monthBefore, type Ledger } from './window';

/**
 * A категорія of the current month that has already cost as much as the whole of the previous
 * month (observations, "A категорія that has already reached last month's whole is stated in the
 * current month").
 *
 * Two recorded facts compared, and nothing more: the result carries the days passed, the сума so
 * far and the previous month's whole — and no pace, no projection and no end-of-month сума, which
 * vision §14.10 forbids anything but «Прогноз статку» to state.
 */
export function early(ledger: Ledger): CategoryEarly[] {
  const month = monthOf(ledger.today);
  const previous = monthBefore(month);
  // From the 1st through today: a транзакція dated later in this month has not happened yet.
  const soFar = categoryBreakdown({
    month,
    transactions: ledger.inMonth(month).filter((t) => t.date <= ledger.today),
  });
  const daysElapsed = Number(ledger.today.slice(8, 10));

  const found: CategoryEarly[] = [];
  for (const [currency, byCategory] of soFar) {
    const baseline = baselineOf(ledger, month, currency);
    if (!baseline) continue;
    const before = ledger.breakdown(previous, currency);
    for (const [categoryId, amount] of byCategory) {
      if (!isCategorySubject(categoryId)) continue;
      const whole = before.get(categoryId);
      if (!whole || whole.amount <= 0) continue;
      if (whole.amount < baseline.noticeable.amount) continue;
      if (amount.amount < whole.amount) continue;
      found.push({
        kind: 'category-early',
        month,
        currency,
        key: `category-early:${currency}:${categoryId}:${month}`,
        categoryId,
        daysElapsed,
        soFar: amount,
        previousWhole: whole,
      });
    }
  }
  return found;
}
