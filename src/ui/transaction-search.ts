import { isMonth } from '../analysis/period';
import type { Category, Source } from '../domain/category';
import type { Month, Transaction } from '../domain/transaction';
import { parseAmount } from './amount-input';
import { folded, nameMatches } from './labels';
import { feedTitle, type TransactionLine } from './transaction-line';

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
  /**
   * The продавці whose назва the typed text occurs in: a транзакція whose опис is recognised as one
   * of them matches, whatever spelling the bank used (design M7).
   */
  readonly merchantIds: readonly string[];
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
  merchants: readonly { readonly id: string; readonly name: string }[] = [],
): SearchMatch | undefined {
  const text = query.trim();
  if (text === '') {
    return undefined;
  }
  const needle = folded(text);
  const named = <Row extends { readonly id: string; readonly name: string }>(
    rows: readonly Row[],
  ): string[] => rows.filter((row) => nameMatches(row.name, needle)).map((row) => row.id);

  return {
    text,
    ...(amountOf(text) !== undefined ? { amountMinor: amountOf(text) } : {}),
    categoryIds: named(categories),
    sourceIds: named(sources),
    merchantIds: named(merchants),
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
/**
 * The місяць «Транзакції» opens narrowed to, read from a `?month=` in the route — and nothing at
 * all for anything that is not a calendar місяць, an absent parameter included.
 *
 * It exists so «Закрий <місяць>» can land the owner on the very місяць it is about instead of on
 * the whole history. It lives here and not in the screen because it is a *decision* — «is this
 * text a місяць» — and screen logic `verify` cannot execute is how a wrong answer ships. The check
 * is `isMonth`'s, the app's existing answer, so «2026-13» is refused as a calendar місяць and not
 * merely as a shape.
 *
 * It is an initial value, never a lock: the picker changes it like any other narrowing.
 */
export function monthFromRoute(asked: string | undefined): Month | undefined {
  return asked !== undefined && isMonth(asked) ? asked : undefined;
}

/**
 * The продавець «Транзакції» opens narrowed to, read from a `?merchant=` in the route: the id when a
 * stored продавець carries it, and nothing otherwise — a продавець since deleted or merged, or any
 * other text, narrows nothing (transaction-search, "An unknown продавець narrows nothing"). Like the
 * місяць, an initial value and never a lock.
 */
export function merchantFromRoute(
  asked: string | undefined,
  merchants: readonly { readonly id: string }[],
): string | undefined {
  return asked !== undefined && merchants.some((m) => m.id === asked) ? asked : undefined;
}

/** The `?only=` value that opens «Транзакції» narrowed to «Без категорії». */
export const ONLY_UNCATEGORISED = 'uncategorised';

/** The `?only=` value that opens «Транзакції» narrowed to «Без джерела». */
export const ONLY_UNSOURCED = 'unsourced';

/**
 * The one «only …» narrowing in force: «Без категорії» or «Без джерела», never both — choosing one
 * takes the other off (transaction-search, "«Без джерела» and «Без категорії» take turns"). One
 * value rather than two flags, so the two cannot be on together by construction.
 */
export type OnlyNarrowing = typeof ONLY_UNCATEGORISED | typeof ONLY_UNSOURCED;

/**
 * The «only …» row's choices, drawn beside «Всі» — whose value is anything else, read by
 * `onlyFromRoute` as no narrowing.
 */
export const ONLY_CHOICES: readonly { readonly value: OnlyNarrowing; readonly label: string }[] = [
  { value: ONLY_UNCATEGORISED, label: 'Без категорії' },
  { value: ONLY_UNSOURCED, label: 'Без джерела' },
];

/**
 * The «only …» narrowing a `?only=` in the route asks for, or the one the owner picked on the row:
 * exactly `ONLY_UNCATEGORISED` or `ONLY_UNSOURCED`; anything else, empty or absent narrows nothing.
 * Like the місяць, an initial value and never a lock.
 */
export function onlyFromRoute(asked: string | undefined): OnlyNarrowing | undefined {
  return asked === ONLY_UNCATEGORISED || asked === ONLY_UNSOURCED ? asked : undefined;
}

/**
 * The route that opens «Транзакції» on `month`, narrowed by `only` when one is given — what
 * `monthFromRoute` and `onlyFromRoute` read back.
 */
export function narrowedMonthRoute(month: Month, only?: OnlyNarrowing): string {
  return only === undefined ? `/transactions?month=${month}` : `/transactions?month=${month}&only=${only}`;
}

/** The narrowing as what `transactionsRepo.search` takes: at most one of its two flags. */
export function onlyNarrowing(
  only: OnlyNarrowing | undefined,
): { readonly uncategorised?: true; readonly unsourced?: true } {
  if (only === ONLY_UNCATEGORISED) return { uncategorised: true };
  if (only === ONLY_UNSOURCED) return { unsourced: true };
  return {};
}

/**
 * What a line on «Транзакції» leads with. Under the «Без категорії» narrowing every line would
 * lead with the same «Без категорії», which tells the owner nothing about what to pick — so there
 * what the опис says leads: the продавець it is recognised as, «АТБ», or the опис itself, «Uklon».
 * A line with no опис, and every line with the narrowing off, reads as the стрічка reads.
 */
export function searchLineTitle(line: TransactionLine, uncategorisedOnly: boolean): string {
  return uncategorisedOnly && line.descriptionShown !== undefined ? line.descriptionShown : feedTitle(line);
}

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
 * The hint inside the search field of «Транзакції». It has to be read whole at the phone's default
 * text size on a 360 dp phone (transaction-search, "The hint fits"), so it names what is typed most
 * — the опис, the продавець, the сума — and not everything the search reads.
 */
export const SEARCH_HINT = 'опис, продавець або сума';

/**
 * How long typing must pause before the list is searched again (transaction-search, "Typing a
 * search is never held up by the search"; app-speed-pass design D6).
 */
export const SEARCH_PAUSE_MS = 250;

/**
 * How long to wait before `next` — what the field now holds — becomes the search: at once when the
 * field was cleared, so the unsearched list comes back without a pause, and after
 * `SEARCH_PAUSE_MS` of quiet otherwise, so fast typing searches once rather than once per letter.
 * `previous` is what the field held before this change; the answer does not depend on it today,
 * and it is there so a rule that does (a paste, say) has one place to live.
 */
export function searchDelayMs(_previous: string, next: string): number {
  return next.trim() === '' ? 0 : SEARCH_PAUSE_MS;
}

/**
 * The pages «Транзакції» shows, and what storage looked like when they were read: the stamp is
 * taken *before* the read that produced `transactions`, so a commit during that read makes the next
 * stamp differ (app-speed-pass design D6).
 */
export interface ShownPages extends ShownTransactions {
  readonly stamp: string;
}

/** What a page read needs: the search in force, and storage's change stamp. */
export interface PagePorts {
  readonly read: (limit: number, offset: number) => readonly Transaction[];
  readonly stamp: () => string;
}

/** Up to `limit` rows from the top — `showMore` from nothing — with the stamp taken first. */
function readFromTop(ports: PagePorts, limit: number): ShownPages {
  const stamp = ports.stamp();
  return { ...showMore([], ports.read, limit), stamp };
}

/** The first page of a search — what a new question starts with. */
export function firstPage(ports: PagePorts, size: number = PAGE_SIZE): ShownPages {
  return readFromTop(ports, size);
}

/**
 * «Показати ще». With nothing written since `shown` was read, only the next page is read and it
 * follows the rows already there. With something written in between, the rows shown and the next
 * page are read again together, in one read, so no транзакція is shown twice and none is skipped.
 */
export function nextPage(shown: ShownPages, ports: PagePorts, size: number = PAGE_SIZE): ShownPages {
  const stamp = ports.stamp();
  if (stamp !== shown.stamp) {
    return readFromTop(ports, shown.transactions.length + size);
  }
  return { ...showMore(shown.transactions, ports.read, size), stamp };
}

/**
 * Coming back to «Транзакції», or a write made from it: as many rows as were shown — never fewer
 * than a page — read again in one read, not page by page and never back to the first page.
 */
export function rereadPages(shown: ShownPages, ports: PagePorts, size: number = PAGE_SIZE): ShownPages {
  return readFromTop(ports, Math.max(shown.transactions.length, size));
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
  /** Whether anything at all is narrowing the list: a query, a рахунок, a місяць, «Без категорії». */
  narrowed: boolean;
}): string | null {
  if (input.shown > 0) {
    return null;
  }
  return input.narrowed
    ? 'Нічого не знайдено. Спробуйте змінити пошук або звузження.'
    : 'Ще нічого не записано.';
}

/**
 * The order of the рахунок row on «Транзакції» (transaction-search, "The filters leave the list on
 * the first screen"): the рахунки the latest транзакції touched first, in the order of that use,
 * then every other offered рахунок in the order it came in. The row scrolls sideways, and the
 * рахунок of today's кава should not be the twenty-seventh chip of it. `recentIds` is
 * `recentlyUsed(...).accounts`; an id it names that is not offered is ignored.
 */
export function accountFilterOrder<T extends { readonly id: string }>(
  offered: readonly T[],
  recentIds: readonly string[],
): T[] {
  const byId = new Map(offered.map((x) => [x.id, x]));
  const lead: T[] = [];
  for (const id of recentIds) {
    const found = byId.get(id);
    if (found && !lead.includes(found)) lead.push(found);
  }
  return [...lead, ...offered.filter((x) => !lead.includes(x))];
}
