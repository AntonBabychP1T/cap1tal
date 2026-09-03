import { money, type CurrencyCode, type Money } from '../domain/money';
import type { IsoDate, Month } from '../domain/transaction';
import { isCompleted, type ProgressSummary } from './summary';

/**
 * The **місячна норма витрат**: the сума the owner has confirmed as the measure of «one month of
 * витрати», per currency — and the proposal the app offers them.
 *
 * The app never *decides* the норма. It proposes the median of «витрачено» over the last six
 * завершені активні місяці of that currency, shows exactly which six, and the owner accepts it or
 * types their own (design D7). What this module deliberately does **not** do is guess «базові
 * витрати» from the names of категорії: it takes no категорія, imports none, and has no way to
 * know what any of them are called. Category meaning belongs to the owner (vision §7), and a
 * renamed категорія must never move a досягнення.
 *
 * The median, not the mean: one holiday месяць should not move the number every досягнення about
 * the резерв is measured against.
 */

/** What the app offers: a сума, and the six місяці it was read from — oldest first. */
export interface NormProposal {
  readonly amount: Money;
  readonly months: readonly Month[];
}

/** How many завершені активні місяці a proposal is read from. Fewer, and there is no proposal. */
export const NORM_WINDOW = 6;

/**
 * The завершені активні місяці of one currency, oldest first: a завершений місяць holding at least
 * one транзакція that names that currency. A місяць that held only a дохід counts — it is a месяць
 * of the owner's life in that currency, and its витрачено of zero is a real answer, not a gap.
 */
export function completedMonthsIn(
  summary: ProgressSummary,
  currency: CurrencyCode,
  today: IsoDate,
): Month[] {
  const months = new Set<Month>();
  for (const row of summary.months) {
    if (row.currency === currency && row.transactions > 0 && isCompleted(row.month, today)) {
      months.add(row.month);
    }
  }
  return [...months].sort();
}

/**
 * The median of an even-length run: the mean of the two middle values, rounded half away from
 * zero, so the answer is an integer in minor units like every other сума in this app. Half away
 * from zero is `approximateUah`'s rule too — one rounding convention across the app, not two.
 */
function medianOfEven(sorted: readonly number[]): number {
  const upper = sorted.length / 2;
  const sum = sorted[upper - 1]! + sorted[upper]!;
  return Math.sign(sum) * Math.round(Math.abs(sum) / 2);
}

/**
 * The норма to propose for one currency, or nothing at all.
 *
 * Nothing when fewer than six завершені активні місяці exist in that currency — a median of two
 * місяці is not a median, and the owner is better asked than misled. Nothing, too, when the median
 * is not positive: six місяці that held only доходи and перекази give a median of zero, and a
 * норма of zero is not a норма (storage refuses one).
 */
export function proposeNorm(
  summary: ProgressSummary,
  currency: CurrencyCode,
  today: IsoDate,
): NormProposal | undefined {
  const window = completedMonthsIn(summary, currency, today).slice(-NORM_WINDOW);
  if (window.length < NORM_WINDOW) {
    return undefined;
  }
  const spentBy = new Map<Month, number>();
  for (const row of summary.months) {
    if (row.currency === currency) {
      spentBy.set(row.month, (spentBy.get(row.month) ?? 0) + row.spent);
    }
  }
  const sorted = window.map((month) => spentBy.get(month) ?? 0).sort((a, b) => a - b);
  const median = medianOfEven(sorted);
  return median > 0 ? { amount: money(median, currency), months: window } : undefined;
}
