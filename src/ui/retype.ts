import {
  expenseByDefault,
  refund,
  UNCATEGORISED_CATEGORY_ID,
  type Expense,
  type Refund,
  type Transaction,
  type TransactionType,
} from '../domain/transaction';

/**
 * The three decisions a retype needs, all pure so the MODIFIED "A transaction's type can be
 * changed from editing" requirement is provable at all: which types a stored transaction may
 * become, which label survives the move, and — for the feed's one tap — the same transaction
 * under a new category.
 *
 * витрата ↔ переказ needs a second leg and its own account picker, so the screen's form owns it
 * and `buildEntry` builds it; `shapesFor` is what offers it, and it is tested here like the rest.
 *
 * Building the retyped transaction is deliberately NOT here. The editing screen already has a
 * filled form, and `buildEntry` turns a filled form into a transaction; giving it the stored id
 * is the whole of what makes it an edit. A second constructor beside it would be two copies of
 * the same amount rules and the same "оберіть джерело" refusals, agreeing until they didn't.
 */

/** The types a transaction can be retyped between. A коригування is not among them. */
export type RetypeShape = Exclude<TransactionType, 'correction'>;

/**
 * What this transaction may become — exactly the moves the retype requirement names, and no more.
 * витрата is the hub: it goes to переказ, дохід or повернення and back from each.
 *
 * повернення ↔ дохід is absent though the shapes would allow it: a повернення is a negative
 * витрата in the category it came out of, and `.claude/rules/domain.md` is explicit that it is
 * never modelled as income. That one tap would raise дохід and stop the month's spent shrinking
 * at once — two numbers wrong from one gesture. витрата is the way between them, and going
 * through it makes the owner say what the money actually was.
 *
 * A коригування gets an empty list: nothing can record one until «звірити» arrives, so the
 * editing screen shows it rather than editing it and never asks what it could become.
 */
export function shapesFor(t: Transaction): RetypeShape[] {
  switch (t.type) {
    case 'transfer':
      return ['expense', 'transfer'];
    case 'expense':
      return ['expense', 'transfer', 'income', 'refund'];
    case 'income':
      return ['expense', 'income'];
    case 'refund':
      return ['expense', 'refund'];
    case 'correction':
      return [];
  }
}

/**
 * What a retype carries over before the owner has answered any picker: a label survives only as
 * long as the shape that carries it. A дохід has no category to carry into a витрата, a витрата
 * no джерело to carry into a дохід — so retyping into a дохід drops the category and asks for the
 * джерело, and retyping a дохід into a витрату drops the джерело and lands in «Без категорії»
 * unless the owner picks otherwise.
 *
 * The editing screen seeds its pickers with this when the owner flips the type, so what it shows
 * and what it then stores obey one rule rather than two.
 */
export function labelsAfterRetype(
  t: Transaction,
  to: RetypeShape,
): { readonly categoryId?: string; readonly sourceId?: string } {
  if (t.type === 'transfer' || t.type === 'correction' || to === 'transfer') {
    // A переказ carries neither label, and nothing carries one into it.
    return {};
  }
  const carried = to === 'income' || t.type === 'income' ? undefined : t.categoryId;
  return {
    // «Без категорії» is not carried into a повернення: it is what a витрата arrives wearing, not
    // something the owner picked, and a повернення must have no default (main-screen, "A
    // повернення is recorded in the category it returns to"). So the picker opens empty and asks.
    ...(carried === undefined || (to === 'refund' && carried === UNCATEGORISED_CATEGORY_ID)
      ? {}
      : { categoryId: carried }),
    ...(to === 'income' && t.type === 'income' ? { sourceId: t.sourceId } : {}),
  };
}

/**
 * The same transaction under a category the owner just picked — what the feed's one tap stores.
 * Not a retype at all: the type, the id, the сума, the рахунок and the date are untouched, which
 * is exactly why "without the editing screen having opened" is true of it.
 *
 * The pick is required. An unanswered picker hands back `''`, and storing that would reference a
 * category no row has — the foreign key would refuse it with SQLite's own words.
 */
export function recategorise(t: Transaction, categoryId: string): Expense | Refund {
  if (t.type !== 'expense' && t.type !== 'refund') {
    throw new Error('категорію має лише витрата або повернення');
  }
  if (!categoryId) {
    throw new Error('оберіть категорію');
  }
  return t.type === 'refund'
    ? refund({
        id: t.id,
        date: t.date,
        accountId: t.accountId,
        amount: t.amount,
        categoryId,
        ...(t.description ? { description: t.description } : {}),
      })
    : expenseByDefault({
        id: t.id,
        date: t.date,
        accountId: t.accountId,
        amount: t.amount,
        categoryId,
        // The original-currency сума describes the витрата the bank charged; recategorising says
        // nothing about it, so it stays.
        ...(t.originalAmount ? { originalAmount: t.originalAmount } : {}),
        // The bank's text describes the money, not the category the owner just chose for it.
        ...(t.description ? { description: t.description } : {}),
      });
}
