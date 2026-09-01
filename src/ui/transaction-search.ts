import type { Category, Source } from '../domain/category';
import type { Transaction } from '../domain/transaction';
import { parseAmount } from './amount-input';

/**
 * What the owner typed on «Транзакції», turned into the thing storage can be asked, and the paging
 * that keeps what is already on the screen.
 *
 * Both are pure so the same query is proven twice: once as a criterion here, once as a query in
 * `src/db/transactions-repo.test.ts`. The screen decides nothing.
 */

/** Exactly what `transactionsRepo.search` takes as its `match`. */
export interface SearchMatch {
  /** Matched in the опис, case-insensitively, at any position. */
  readonly text: string;
  /** The typed text read as a сума in minor units, when it reads as one. Names no currency. */
  readonly amountMinor?: number;
  /** The категорії whose names the typed text occurs in — archived ones included. */
  readonly categoryIds: readonly string[];
  /** The джерела whose names the typed text occurs in — archived ones included. */
  readonly sourceIds: readonly string[];
}

/** The fold the owner's data needs; `toLowerCase()` folds ASCII only. */
function folded(value: string): string {
  return value.toLocaleLowerCase('uk');
}

/**
 * The typed query as a criterion, or `undefined` when nothing was typed — an empty search narrows
 * nothing, so the screen shows the history exactly as it does with no search at all.
 *
 * The категорії and джерела are matched by name over the whole list, archived rows included: a
 * витрата keeps showing the категорія it carries after that категорія is archived, so a history
 * that could not be searched by it would be a history with holes in it.
 *
 * A query that reads as a сума also carries that сума in minor units. It names no currency, which
 * is why the repository compares it against every leg whatever the currency: the owner typed
 * «1200», not «1200 UAH», and the app may not guess which of their currencies they meant.
 */
export function searchCriteria(
  query: string,
  categories: readonly Category[],
  sources: readonly Source[],
): SearchMatch | undefined {
  const text = query.trim();
  if (text === '') {
    return undefined;
  }
  const needle = folded(text);
  const named = <Row extends { readonly id: string; readonly name: string }>(
    rows: readonly Row[],
  ): string[] => rows.filter((row) => folded(row.name).includes(needle)).map((row) => row.id);

  return {
    text,
    ...(amountOf(text) !== undefined ? { amountMinor: amountOf(text) } : {}),
    categoryIds: named(categories),
    sourceIds: named(sources),
  };
}

/**
 * The typed text as minor units, when it reads as a сума. «1200» is 1200,00 — major units, the way
 * every other amount in the app is typed — so it finds a витрата of 120000 minor units and not one
 * of 1200. What is not a сума is simply not one: the text still searches описи and names.
 */
function amountOf(text: string): number | undefined {
  try {
    // Any currency would do — the parse only reads digits, and the result carries no currency into
    // the search. UAH is the owner's own, so the rounding rules are theirs.
    return parseAmount(text, 'UAH').amount;
  } catch {
    return undefined;
  }
}

/**
 * How many транзакції one «показати ще» adds. A hundred to start — a number to tune after the
 * emulator pass, not a rule.
 */
export const PAGE_SIZE = 100;

export interface ShownTransactions {
  /** What is on the screen: what was already there, then what came next, in the same order. */
  readonly transactions: readonly Transaction[];
  /** Whether storage holds more than these — knowledge, never a guess. */
  readonly more: boolean;
}

/**
 * One page more. `read` is `transactionsRepo.search` already carrying the criterion and the
 * filters in force; it is asked for one beyond a page, so «показати ще» is offered exactly when
 * there is something to show and the end is plain when it is reached.
 *
 * What is already shown stays where it is: the next page follows it, in the same order, and
 * nothing is re-read or re-ordered. Starting over is `showMore([], read)`.
 */
export function showMore(
  shown: readonly Transaction[],
  read: (limit: number, offset: number) => readonly Transaction[],
  size: number = PAGE_SIZE,
): ShownTransactions {
  const next = read(size + 1, shown.length);
  return {
    transactions: [...shown, ...next.slice(0, size)],
    more: next.length > size,
  };
}


/**
 * What the screen says instead of a list, or `null` when there is a list to show. Two different
 * situations and two different sentences: a device that has recorded nothing at all is not a
 * search that found nothing, and telling the owner the second when the first is true would send
 * them looking for a query to loosen that was never the problem.
 *
 * A search that found nothing keeps the query and the narrowing exactly as they are — that is the
 * screen's doing, and this only says so — and never falls back to showing unrelated транзакції.
 */
export function emptyMessage(input: {
  shown: number;
  /** Whether anything at all is narrowing the list: a typed query, a рахунок or a місяць. */
  narrowed: boolean;
}): string | null {
  if (input.shown > 0) {
    return null;
  }
  return input.narrowed
    ? 'Нічого не знайдено. Спробуйте змінити пошук або звузження.'
    : 'Ще нічого не записано.';
}
