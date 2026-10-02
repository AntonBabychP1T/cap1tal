import { byCurrency } from '../ui/amount-input';
import type { Observation, ObservationKind } from './observation';

/**
 * The one fixed order of a month's спостереження (observations, "Спостереження are listed in one
 * fixed order"): by kind, then UAH before the other currencies by code, then by the size of what is
 * stated, larger first, then by names and ids so no two ever tie.
 *
 * Text is compared by code unit, never `localeCompare`: the phone and the test runner must order
 * one stored state alike, the rule `src/analysis/details.ts` keeps for the пакет.
 */
const KIND_ORDER: Readonly<Record<ObservationKind, number>> = {
  'possible-duplicate': 0,
  'price-change': 1,
  'merchant-outlier': 2,
  'category-early': 3,
  'category-vs-typical': 4,
  'category-run': 5,
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The size of what is stated, in minor units — the larger, the earlier. */
function sizeOf(o: Observation): number {
  switch (o.kind) {
    case 'possible-duplicate':
      return o.amount.amount;
    case 'price-change':
      return Math.abs(o.transaction.amount.amount - o.usual.amount);
    case 'merchant-outlier':
      return o.transaction.amount.amount - o.usual.amount;
    case 'category-early':
      return o.soFar.amount - o.previousWhole.amount;
    case 'category-vs-typical':
      return Math.abs(o.amount.amount - o.typical.amount);
    case 'category-run':
      return o.series[o.series.length - 1]!.amount - o.series[0]!.amount;
  }
}

/** The tie-breaking texts, in the spec's order: назва, опис, date, транзакція id, категорія id. */
function tieBreaks(o: Observation, nameOf: (categoryId: string) => string): readonly string[] {
  switch (o.kind) {
    case 'possible-duplicate':
      return ['', o.first.description ?? '', o.first.date, `${o.first.id}+${o.second.id}`, ''];
    case 'price-change':
    case 'merchant-outlier':
      return ['', o.transaction.description ?? '', o.transaction.date, o.transaction.id, ''];
    case 'category-early':
    case 'category-vs-typical':
    case 'category-run':
      return [nameOf(o.categoryId), '', '', '', o.categoryId];
  }
}

export function compareObservations(
  a: Observation,
  b: Observation,
  nameOf: (categoryId: string) => string,
): number {
  const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (byKind !== 0) return byKind;
  const byCurrencyOrder = byCurrency(a.currency, b.currency);
  if (byCurrencyOrder !== 0) return byCurrencyOrder;
  if (a.kind === 'possible-duplicate' && b.kind === 'possible-duplicate') {
    // The later date of the pair first, then the larger сума.
    const byDate = compareText(b.second.date, a.second.date);
    if (byDate !== 0) return byDate;
  }
  const bySize = sizeOf(b) - sizeOf(a);
  if (bySize !== 0) return bySize;
  const ta = tieBreaks(a, nameOf);
  const tb = tieBreaks(b, nameOf);
  for (let i = 0; i < ta.length; i += 1) {
    const byText = compareText(ta[i]!, tb[i]!);
    if (byText !== 0) return byText;
  }
  return compareText(a.key, b.key);
}

export function inOrder(
  observations: readonly Observation[],
  nameOf: (categoryId: string) => string,
): Observation[] {
  return [...observations].sort((a, b) => compareObservations(a, b, nameOf));
}
