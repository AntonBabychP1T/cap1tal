import type { CurrencyCode, Money } from './money';

/**
 * The ліміт of the glossary: an optional monthly ceiling on a category. It colours the category
 * red where its month is shown and does nothing else — nothing is blocked and nothing is pushed.
 *
 * A category carries at most one, so the category id is the identity: there is no id of its own to
 * carry, and «the ліміт of Groceries» is the whole of what one is.
 */
export interface CategoryLimit {
  readonly categoryId: string;
  /** A positive сума in the currency the ліміт is judged in — never a bare number. */
  readonly amount: Money;
}

/**
 * Over the ліміт: strictly greater, so spending exactly the ліміт is not over it — a ceiling is
 * reached before it is exceeded.
 *
 * Both amounts have to be in the same currency, and that is not a formality here: comparing a UAH
 * ліміт against a USD спент would need a rate, and no rate exists in the domain. The caller picks
 * the spent of the ліміт's own currency; passing another is the same mistake as adding two
 * currencies, and is refused the same way.
 */
export function overLimit(spent: Money, limit: Money): boolean {
  if (spent.currency !== limit.currency) {
    throw new Error(`cannot judge ${spent.currency} spending against a ${limit.currency} ліміт`);
  }
  return spent.amount > limit.amount;
}

/**
 * Which categories are over their ліміт for one month, and the currency each was judged in —
 * everything a screen needs to mark a category red, in one pass over the ліміти.
 *
 * The breakdown is `categoryBreakdown`'s: витрати minus повернення of that category per currency,
 * negative коригування under the correction category. Only the ліміт's own currency is looked up,
 * so spending in any other currency never counts toward it and is never converted toward it; a
 * category with no spending in that currency is simply not over, since a ліміт is positive.
 *
 * The month is whichever month the breakdown was computed for: this function judges what it is
 * given, so months are judged independently by construction.
 *
 * The currency comes back with the id because the two screens ask different questions of the same
 * answer. The feed asks "is this category over?" — a витрата in any currency shows the category
 * marked, because it is the category that is over, not the line. The Місяць breakdown asks "is
 * *this row* over?", and only the row in the ліміт's own currency is.
 */
export function overLimitCategories(input: {
  breakdown: ReadonlyMap<CurrencyCode, ReadonlyMap<string, Money>>;
  limits: readonly CategoryLimit[];
}): Map<string, CurrencyCode> {
  const over = new Map<string, CurrencyCode>();
  for (const limit of input.limits) {
    const spent = input.breakdown.get(limit.amount.currency)?.get(limit.categoryId);
    if (spent && overLimit(spent, limit.amount)) {
      over.set(limit.categoryId, limit.amount.currency);
    }
  }
  return over;
}
