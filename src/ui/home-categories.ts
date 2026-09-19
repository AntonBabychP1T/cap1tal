import { categoryBreakdown } from '../domain/monthly-picture';
import { money, type CurrencyCode, type Money } from '../domain/money';
import type { Month, Transaction } from '../domain/transaction';
import { byCurrency, formatMoney } from './amount-input';
import { byName, categoryLabel } from './labels';

/**
 * «Топ категорій витрат, <місяць>» — the same signed `categoryBreakdown` monthly-picture already
 * computes, ranked and currency-selected for the widget (main-screen, "Top categories read the
 * same signed monthly breakdown", "Category currencies never mix", "Signed or empty breakdowns
 * never claim false shares"). No new arithmetic: this module decides only ranking, remainder and
 * currency selection.
 */

export interface CategoryRow {
  readonly categoryId: string;
  readonly name: string;
  readonly amount: Money;
  /** «Продукти, 700,00 UAH» — the exact reading a screen reader gives a legend/donut row. */
  readonly accessibilityLabel: string;
}

export interface CategoryRemainder {
  readonly count: number;
  /** «Ще N». */
  readonly label: string;
  readonly amount: Money;
  /** «Ще 2 категорії, 300,00 UAH». */
  readonly accessibilityLabel: string;
}

/** One currency chip the selector offers — text plus its own accessible selected-state. */
export interface CurrencyChip {
  readonly currency: CurrencyCode;
  readonly selected: boolean;
  /** «UAH, обрано» or «USD» — never a colour alone standing for the selection. */
  readonly accessibilityLabel: string;
}

export interface CategoryPresentation {
  /** Every currency the month's breakdown holds, UAH first — the selector's own choices. */
  readonly currencies: readonly CurrencyCode[];
  /** `undefined` exactly when `currencies` is empty. */
  readonly selectedCurrency?: CurrencyCode;
  /** One chip per currency, only when there is more than one to choose from (design D2). */
  readonly currencyChips: readonly CurrencyChip[];
  /** The signed sum of every category in the selected currency — the donut's own center. */
  readonly center?: Money;
  /** Up to five largest signed amounts, descending, ties by Ukrainian name then id. */
  readonly rows: readonly CategoryRow[];
  readonly remainder?: CategoryRemainder;
  /** «Ще немає витрат» — present exactly when the month's breakdown has no category at all. */
  readonly emptyMessage?: string;
}

const NO_CATEGORIES_MESSAGE = 'Ще немає витрат';

/**
 * `requestedCurrency` is the caller's own remembered selection (React state owns "survives
 * rerenders in the same month"; this function owns "reset on month change/disappearance" by
 * falling back whenever the request is absent or no longer among `currencies`): UAH when present,
 * otherwise the first currency in the existing order (design D2).
 */
export function categoryPresentation(input: {
  readonly month: Month;
  readonly transactions: readonly Transaction[];
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly requestedCurrency?: CurrencyCode;
}): CategoryPresentation {
  const breakdown = categoryBreakdown({ month: input.month, transactions: input.transactions });
  const currencies = [...breakdown.keys()].sort(byCurrency);

  if (currencies.length === 0) {
    return { currencies: [], currencyChips: [], rows: [], emptyMessage: NO_CATEGORIES_MESSAGE };
  }

  const selectedCurrency =
    input.requestedCurrency !== undefined && currencies.includes(input.requestedCurrency)
      ? input.requestedCurrency
      : (currencies.includes('UAH') ? 'UAH' : currencies[0]!);

  // Only when there is more than one to choose from — a single currency needs no selector at all.
  const currencyChips: CurrencyChip[] =
    currencies.length > 1
      ? currencies.map((currency) => {
          const selected = currency === selectedCurrency;
          return {
            currency,
            selected,
            accessibilityLabel: selected ? `${currency}, обрано` : currency,
          };
        })
      : [];

  const byCategory = breakdown.get(selectedCurrency)!;
  const entries = [...byCategory.entries()].map(([categoryId, amount]) => ({
    categoryId,
    name: categoryLabel(categoryId, input.categoryNames),
    amount: amount.amount,
  }));

  const center = entries.reduce((sum, e) => sum + e.amount, 0);

  const ranked = [...entries].sort(
    (a, b) => b.amount - a.amount || byName({ name: a.name, id: a.categoryId }, { name: b.name, id: b.categoryId }),
  );
  const rows: CategoryRow[] = ranked.slice(0, 5).map((e) => {
    const amount = money(e.amount, selectedCurrency);
    return {
      categoryId: e.categoryId,
      name: e.name,
      amount,
      accessibilityLabel: `${e.name}, ${formatMoney(amount)}`,
    };
  });
  const rest = ranked.slice(5);
  const remainder: CategoryRemainder | undefined =
    rest.length > 0
      ? (() => {
          const amount = money(rest.reduce((sum, e) => sum + e.amount, 0), selectedCurrency);
          const label = `Ще ${rest.length}`;
          return {
            count: rest.length,
            label,
            amount,
            accessibilityLabel: `${label} категорії, ${formatMoney(amount)}`,
          };
        })()
      : undefined;

  return {
    currencies,
    selectedCurrency,
    currencyChips,
    center: money(center, selectedCurrency),
    rows,
    ...(remainder ? { remainder } : {}),
  };
}
