import { activeCategories, activeSources, type Category, type Source } from '../domain/category';
import { CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { withCurrent } from './account-choices';
import { byName } from './labels';

/**
 * «Коригування» is never re-added by `withCurrent`, and cannot be: a коригування stores no
 * category id at all — the domain fixes its category — so no transaction with a category picker
 * ever carries it. The spec's "«Коригування» SHALL NOT be offered in any picker" therefore holds
 * without an exception to make; this guard says so out loud rather than relying on it.
 */
function keepingCurrent<Row extends { readonly id: string }>(
  offered: Row[],
  all: readonly Row[],
  currentId: string | undefined,
): Row[] {
  return currentId === CORRECTION_CATEGORY_ID ? offered : withCurrent(offered, all, currentId);
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

/** The джерела a дохід may be recorded with: the unarchived ones, in Ukrainian order. */
export function sourceChoices(all: readonly Source[]): Source[] {
  return activeSources(all).sort(byName);
}

/** `sourceChoices` for a stored дохід, keeping the джерело it already carries. */
export function sourceChoicesFor(
  all: readonly Source[],
  currentSourceId: string | undefined,
): Source[] {
  return keepingCurrent(sourceChoices(all), all, currentSourceId);
}
