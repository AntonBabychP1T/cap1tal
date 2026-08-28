import type { Category } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import type { CurrencyCode } from '../domain/money';
import { formatMoney, parseAmount } from './amount-input';
import { byName, OFFERED_CURRENCIES } from './labels';

/**
 * What the «Ліміти» section of Налаштування shows and accepts. Pure, because the section itself is
 * JSX and `verify` never runs JSX — so which categories are listed, what each row says and what a
 * typed ліміт becomes are all provable here.
 *
 * The list is not the категорії list: an archived category is listed **only while it carries a
 * ліміт**, so a leftover ceiling can still be found and cleared, and disappears once it is. An
 * archived category with no ліміт would be a row offering to put a ceiling on spending that can no
 * longer happen.
 */

/** One row of the section: a category, and the ліміт it carries or the absence of one. */
export interface LimitRow {
  readonly categoryId: string;
  readonly name: string;
  /** «2500,00 UAH», or `null` when this category carries no ліміт. */
  readonly limit: string | null;
  /** Set apart in the list: this category is archived and is here only for its ліміт. */
  readonly archived: boolean;
}

export function limitRows(input: {
  categories: readonly Category[];
  limits: readonly CategoryLimit[];
}): LimitRow[] {
  const byCategory = new Map(input.limits.map((limit) => [limit.categoryId, limit]));
  const row = (category: Category): LimitRow => {
    const limit = byCategory.get(category.id);
    return {
      categoryId: category.id,
      name: category.name,
      limit: limit ? formatMoney(limit.amount) : null,
      archived: category.archived,
    };
  };
  return [
    ...input.categories.filter((c) => !c.archived).sort(byName).map(row),
    // After them, and only the ones with something to clear.
    ...input.categories
      .filter((c) => c.archived && byCategory.has(c.id))
      .sort(byName)
      .map(row),
  ];
}

/** What the form holds: the сума in major units, as typed, and the currency picked beside it. */
export interface LimitDraft {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

/**
 * The currencies a ліміт may be set in: the same ones a рахунок can be created in, so the owner
 * never has to say a currency the app would not otherwise accept.
 */
export const LIMIT_CURRENCIES = OFFERED_CURRENCIES;

/** UAH — the owner's own currency, and what most ліміти will be in. */
export const DEFAULT_LIMIT_CURRENCY: CurrencyCode = 'UAH';

/**
 * The form's one decision: either the draft is a ліміт, or it is refused in the owner's own
 * language. `parseAmount` does the refusing — the сума is entered the way an amount is entered
 * when recording, so "2500" and "2500,00" are the same 250000 minor units and zero, a negative or
 * anything that is not a number is not an amount at all.
 */
export function limitFromDraft(categoryId: string, draft: LimitDraft): CategoryLimit {
  if (!LIMIT_CURRENCIES.includes(draft.currency as (typeof LIMIT_CURRENCIES)[number])) {
    throw new Error(`валюта ліміту — одна з ${LIMIT_CURRENCIES.join(', ')}`);
  }
  return { categoryId, amount: parseAmount(draft.amount, draft.currency) };
}
