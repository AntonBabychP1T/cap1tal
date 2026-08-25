import type { Account } from '../domain/account';
import {
  expenseByDefault,
  isoDate,
  refund,
  transfer,
  type Income,
  type Transaction,
  type TransactionType,
} from '../domain/transaction';
import { parseAmount } from './amount-input';

/**
 * What the Головний entry form decides, with none of its JSX: the four-way type switch turned
 * into the transaction to store, or into the reason it cannot be stored. It lives here because
 * `verify` never runs a screen — this is the only place those rules can be proven (design §8).
 *
 * The комісія of a переказ is deliberately not decided here: the proposal is a question for the
 * owner, so it stays with the screen (`src/components/fee-dialog.ts`), which takes the `Transfer`
 * this returns and asks before storing.
 */
/**
 * The four types the owner can record. Derived from the domain's own union rather than restated,
 * so a sixth transaction type could not appear there and be silently missing here — коригування
 * is the one the app creates for itself, never from this form.
 */
export type EntryType = Exclude<TransactionType, 'correction'>;

export interface EntryDraft {
  readonly type: EntryType;
  /** The рахунок; for a переказ, the account the money left. */
  readonly accountId?: string;
  /** переказ only: where it arrived. */
  readonly toAccountId?: string;
  readonly amount: string;
  /** переказ only; empty means "стільки ж" for a same-currency переказ. */
  readonly arrived?: string;
  readonly date: string;
  /** витрата (defaults to «Без категорії») and повернення (required, no default). */
  readonly categoryId?: string;
  /** дохід only, required, no default. */
  readonly sourceId?: string;
}

/**
 * The transaction the draft describes, or an `Error` naming in Ukrainian what is missing — the
 * screen shows that message verbatim through `failureMessage`. Every сума is parsed in its own
 * account's currency, so no amount can land on an account in a foreign one; the amount rules and
 * the calendar-date rule belong to `parseAmount` and to the domain, and their rejections pass
 * through untouched rather than being restated here.
 */
export function buildEntry(
  draft: EntryDraft,
  context: { readonly id: string; readonly accounts: readonly Account[] },
): Transaction {
  // Resolved against the list the caller's pickers offered, so archived accounts are already out
  // (`account-choices.ts` owns that); an id that is not in it was never a choice.
  const from = context.accounts.find((a) => a.id === draft.accountId);
  if (!from) {
    throw new Error('оберіть рахунок');
  }

  switch (draft.type) {
    case 'expense':
      return expenseByDefault({
        id: context.id,
        date: draft.date,
        accountId: from.id,
        amount: parseAmount(draft.amount, from.currency),
        // Nothing picked means «Без категорії» — the default is the domain's, not the form's.
        ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
      });

    case 'income': {
      if (!draft.sourceId) {
        throw new Error('оберіть джерело');
      }
      // The domain has no factory for a дохід, and it asks nothing an Expense does not: a
      // calendar date and a positive сума, which `isoDate` and `parseAmount` already are.
      const income: Income = {
        type: 'income',
        id: context.id,
        date: isoDate(draft.date),
        accountId: from.id,
        amount: parseAmount(draft.amount, from.currency),
        sourceId: draft.sourceId,
      };
      return income;
    }

    case 'refund':
      if (!draft.categoryId) {
        throw new Error('оберіть категорію');
      }
      // Typed positive like a витрата's: `refund` is the negative expense, not a negative number.
      return refund({
        id: context.id,
        date: draft.date,
        accountId: from.id,
        amount: parseAmount(draft.amount, from.currency),
        categoryId: draft.categoryId,
      });

    case 'transfer': {
      const to = context.accounts.find((a) => a.id === draft.toAccountId);
      if (!to) {
        throw new Error('оберіть рахунок, куди прийшли гроші');
      }
      const left = parseAmount(draft.amount, from.currency);
      const typedArrived = draft.arrived?.trim() ?? '';
      // Same currency: «скільки прийшло» is optional and defaults to the сума that left, so an
      // untouched field records the same amount on both legs and proposes no комісія.
      const sameCurrency = from.currency === to.currency;
      if (typedArrived === '' && !sameCurrency) {
        // Across currencies nothing may be inferred — there is no rate — so the leg is required,
        // and it is named here rather than left to `parseAmount`'s English "is not an amount".
        throw new Error('вкажіть, скільки прийшло — валюти різні, тож нічого не перераховується');
      }
      const arrived =
        typedArrived === '' && sameCurrency ? left : parseAmount(typedArrived, to.currency);
      // `transfer` rejects the same account on both legs; that error surfaces to the screen.
      return transfer({
        id: context.id,
        date: draft.date,
        fromAccountId: from.id,
        toAccountId: to.id,
        left,
        arrived,
      });
    }
  }
}
