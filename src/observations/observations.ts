import type { Category } from '../domain/category';
import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import { possibleDuplicates } from './duplicates';
import { early } from './early';
import { merchantOutliers } from './merchant-outlier';
import {
  merchantOfDescription,
  pairKey,
  type AnsweredPair,
  type MerchantKeyOf,
  type Observation,
} from './observation';
import { inOrder } from './order';
import { priceChanges } from './price-change';
import { runs } from './run';
import { vsTypical } from './vs-typical';
import { ledgerOf, type Ledger } from './window';

/**
 * The спостереження of one month (observations, "An спостереження is a stated fact, computed when
 * shown and stored nowhere"): a pure function of the stored транзакції, the категорії (for the
 * order's names), the «Не дубль» answers and today. The same state on the same date gives the same
 * list in the same order; nothing is written, posted or requested.
 *
 * - The **current month** runs the detectors that read a month in progress: дубль, price change,
 *   a purchase above its продавець, and «already more than last month».
 * - A **завершений активний місяць** runs the ones that read a whole month: дубль, price change,
 *   a purchase above its продавець, against the типова сума, and the run.
 * - Any other month has none.
 */
export interface ObservationsInput {
  readonly month: Month;
  readonly categories: readonly Category[];
  readonly answers: readonly AnsweredPair[];
  /** The рахунки linked to monobank: equal описи on one of them read as the bank's own records. */
  readonly linkedAccountIds: ReadonlySet<string>;
  /**
   * The glossary's продавець, bound in one place (design D11): the folded опис today; whichever of
   * this change and `merchant-normalization` lands second swaps the binding here, not the detectors.
   */
  readonly merchantKeyOf?: MerchantKeyOf;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Over a ledger already built — what a screen that reads several months of one history passes. */
export function observationsIn(ledger: Ledger, input: ObservationsInput): Observation[] {
  const { month } = input;
  if (!MONTH.test(month)) return [];
  const current = monthOf(ledger.today);
  const finished = month < current && ledger.inMonth(month).length > 0;
  if (month !== current && !finished) return [];

  const merchantKeyOf = input.merchantKeyOf ?? merchantOfDescription;
  const answered = new Set(input.answers.map((a) => pairKey(a.first, a.second)));
  const found: Observation[] = [
    ...possibleDuplicates(ledger, month, answered, input.linkedAccountIds),
    ...priceChanges(ledger, month, merchantKeyOf),
    ...merchantOutliers(ledger, month, merchantKeyOf),
  ];
  if (month === current) {
    found.push(...early(ledger));
  } else {
    const againstTypical = vsTypical(ledger, month);
    found.push(...againstTypical, ...runs(ledger, month, againstTypical));
  }

  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  return inOrder(found, (id) => names.get(id) ?? id);
}

export function observationsOf(
  input: ObservationsInput & { readonly today: IsoDate; readonly transactions: readonly Transaction[] },
): Observation[] {
  return observationsIn(ledgerOf(input.transactions, input.today), input);
}
