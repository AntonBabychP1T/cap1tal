import { activeCategories, activeSources, type Category, type Source } from '../domain/category';
import {
  CORRECTION_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Transaction,
} from '../domain/transaction';
import { withCurrent } from './account-choices';
import { byName } from './labels';

/**
 * The rows the app itself carries and the owner never picks: «Коригування» on the категорії side,
 * «Без джерела» on the джерела side. Both exist in the lists — a stored коригування and an
 * imported дохід resolve to them and display their names — and neither is ever an offer.
 */
const APP_ONLY_IDS: readonly string[] = [CORRECTION_CATEGORY_ID, UNSOURCED_SOURCE_ID];

/**
 * An app-only row is never re-added by `withCurrent`. For «Коригування» that could not happen
 * anyway — a коригування stores no category id at all, since the domain fixes its category — but
 * an imported дохід really does carry «Без джерела» while it waits to be retyped, and the carried
 * -row exception would otherwise put it back in the picker the spec keeps it out of. Opening such
 * a дохід therefore shows no джерело selected, which is the question the owner has to answer;
 * saving without answering stores the джерело it already had, untouched.
 */
function keepingCurrent<Row extends { readonly id: string }>(
  offered: Row[],
  all: readonly Row[],
  currentId: string | undefined,
): Row[] {
  return currentId !== undefined && APP_ONLY_IDS.includes(currentId)
    ? offered
    : withCurrent(offered, all, currentId);
}

/**
 * What the category picker of a витрата or a повернення offers. Archived rows are offered for
 * nothing new, and «Коригування» for nothing at all — it is a transaction type the app itself
 * creates, not a label the owner picks (categories: "«Коригування» exists but is never
 * pickable"). «Без категорії» and «Комісія» are ordinary choices, the spec is explicit about it,
 * and «Без категорії» leads the list because it is what a витрата arrives carrying: the default
 * belongs under the thumb, not halfway down the alphabet.
 */
export function expenseCategoryChoices(all: readonly Category[]): Category[] {
  const offered = activeCategories(all).filter((c) => c.id !== CORRECTION_CATEGORY_ID);
  return [
    ...offered.filter((c) => c.id === UNCATEGORISED_CATEGORY_ID),
    ...offered.filter((c) => c.id !== UNCATEGORISED_CATEGORY_ID).sort(byName),
  ];
}

/** `expenseCategoryChoices` for a transaction that already carries a category. */
export function categoryChoicesFor(
  all: readonly Category[],
  currentCategoryId: string | undefined,
): Category[] {
  return keepingCurrent(expenseCategoryChoices(all), all, currentCategoryId);
}

/**
 * The джерела a дохід may be recorded with: the unarchived ones, in Ukrainian order, without
 * «Без джерела» — that row is what a monobank arrival lands on before the owner has said what it
 * was, the джерело half of what «Коригування» is to the категорії, so it is in the list and in no
 * picker (categories: "App-only rows exist but are never pickable"). «Відсотки» is offered like
 * any other row: the owner records interest by hand too.
 */
export function sourceChoices(all: readonly Source[]): Source[] {
  return activeSources(all)
    .filter((s) => s.id !== UNSOURCED_SOURCE_ID)
    .sort(byName);
}

/** `sourceChoices` for a stored дохід, keeping the джерело it already carries. */
export function sourceChoicesFor(
  all: readonly Source[],
  currentSourceId: string | undefined,
): Source[] {
  return keepingCurrent(sourceChoices(all), all, currentSourceId);
}

/**
 * The рахунки, категорії and джерела of the latest транзакції, most recently used first, each once.
 */
export interface RecentlyUsed {
  readonly accounts: readonly string[];
  readonly categories: readonly string[];
  readonly sources: readonly string[];
}

/**
 * What the owner reached for last, read straight off the стрічка the screen has already loaded —
 * never counted and never stored (design D10). No table, no migration, and nothing to explain: it
 * is the order of use, not a ranking, so the категорія of the last витрата is first and the app
 * has learned nothing it cannot show.
 *
 * `feed` is `listLatest`'s order — newest first. A коригування contributes no категорія because the
 * domain fixes its own and stores none; a переказ carries neither категорія nor джерело. Only what
 * the транзакція actually holds counts, so nothing is inferred from an опис or an amount.
 *
 * Every type contributes a рахунок, though, and a переказ contributes two — the one the money left
 * before the one it arrived at, because that is the order the транзакція itself names them and both
 * are рахунки the owner is using. A коригування counts here where it counts nowhere else: it sits
 * on a рахунок the owner reconciled, which is a рахунок they are living on.
 */
export function recentlyUsed(feed: readonly Transaction[], limit: number): RecentlyUsed {
  const accounts: string[] = [];
  const categories: string[] = [];
  const sources: string[] = [];
  const account = (id: string) => {
    if (!accounts.includes(id)) accounts.push(id);
  };
  for (const t of feed) {
    if (t.type === 'expense' || t.type === 'refund') {
      if (!categories.includes(t.categoryId)) categories.push(t.categoryId);
      account(t.accountId);
    } else if (t.type === 'income') {
      if (!sources.includes(t.sourceId)) sources.push(t.sourceId);
      account(t.accountId);
    } else if (t.type === 'transfer') {
      account(t.fromAccountId);
      account(t.toAccountId);
    } else {
      account(t.accountId);
    }
    if (accounts.length >= limit && categories.length >= limit && sources.length >= limit) break;
  }
  return {
    accounts: accounts.slice(0, limit),
    categories: categories.slice(0, limit),
    sources: sources.slice(0, limit),
  };
}
