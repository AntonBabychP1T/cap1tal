import { foldMerchant } from '../analysis/details';
import type { CurrencyCode, Money } from '../domain/money';
import type { Expense, IsoDate, Month } from '../domain/transaction';

/**
 * The closed catalogue of спостереження (observations design D4): numbers only. The words are
 * `src/ui/observations.ts`'s — a scenario asserts a сума or a percentage, and wording polished at
 * the emulator must never be a change to this module.
 */

/** A транзакція as an спостереження names it: enough to find, order and lead to it. */
export interface TxRef {
  readonly id: string;
  readonly date: IsoDate;
  readonly accountId: string;
  readonly amount: Money;
  readonly description?: string;
  /** The категорія of a витрата — what its transaction line names it by when it has no опис. */
  readonly categoryId?: string;
}

interface Common {
  /** The month whose спостереження this is. */
  readonly month: Month;
  readonly currency: CurrencyCode;
  /** Stable and unique within a month's list: `kind:currency:subject:month`. */
  readonly key: string;
}

export interface PossibleDuplicate extends Common {
  readonly kind: 'possible-duplicate';
  readonly amount: Money;
  readonly accountId: string;
  /** The earlier of the two (by date, then id). */
  readonly first: TxRef;
  readonly second: TxRef;
}

export interface PriceChange extends Common {
  readonly kind: 'price-change';
  readonly transaction: TxRef;
  /** The usual сума R: the median of the three months' largest charges. */
  readonly usual: Money;
  /** (X − R) as a whole percent of R, rounded half away from zero; signed. */
  readonly changePercent: number;
}

export interface MerchantOutlier extends Common {
  readonly kind: 'merchant-outlier';
  readonly transaction: TxRef;
  /** The median of the продавець's earlier витрати. */
  readonly usual: Money;
  /** X ÷ R in tenths, rounded half away from zero: 42 is «4,2». */
  readonly ratioTenths: number;
}

export interface CategoryEarly extends Common {
  readonly kind: 'category-early';
  readonly categoryId: string;
  /** Today's day of the month. */
  readonly daysElapsed: number;
  /** The категорія's витрачено from the 1st through today. */
  readonly soFar: Money;
  /** The whole previous calendar month's. There is deliberately no end-of-month сума here. */
  readonly previousWhole: Money;
}

export interface CategoryVsTypical extends Common {
  readonly kind: 'category-vs-typical';
  readonly categoryId: string;
  readonly amount: Money;
  readonly typical: Money;
  /** (A − T) as a whole percent of T, rounded half away from zero; signed. */
  readonly changePercent: number;
}

export interface CategoryRun extends Common {
  readonly kind: 'category-run';
  readonly categoryId: string;
  /** k: the number of rises, at least three. */
  readonly run: number;
  /** The k + 1 сум, oldest first. */
  readonly series: readonly Money[];
}

export type Observation =
  | PossibleDuplicate
  | PriceChange
  | MerchantOutlier
  | CategoryEarly
  | CategoryVsTypical
  | CategoryRun;

export type ObservationKind = Observation['kind'];

/** The продавець of a витрата, or none: the glossary's term, bound in one place (design D11). */
export type MerchantKeyOf = (t: Expense) => string | null;

/**
 * The glossary's продавець today: the folded опис, exactly as the пакет groups витрати by it. A
 * витрата without an опис — or with one that folds to nothing — has none.
 */
export const merchantOfDescription: MerchantKeyOf = (t) => {
  if (!t.description) return null;
  const folded = foldMerchant(t.description);
  return folded === '' ? null : folded;
};

/** An unordered pair answered «Не дубль» — whichever way round it is given. */
export interface AnsweredPair {
  readonly first: string;
  readonly second: string;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function txRef(t: Expense): TxRef {
  return {
    id: t.id,
    date: t.date,
    accountId: t.accountId,
    amount: t.amount,
    ...(t.description ? { description: t.description } : {}),
    categoryId: t.categoryId,
  };
}
