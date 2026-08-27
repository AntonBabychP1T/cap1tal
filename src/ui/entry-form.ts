import { computeBalance, type Account } from '../domain/account';
import { money, type Money } from '../domain/money';
import {
  expenseByDefault,
  isoDate,
  proposeFee,
  refund,
  transfer,
  INTEREST_SOURCE_ID,
  type Expense,
  type Income,
  type Transaction,
  type TransactionType,
  type Transfer,
} from '../domain/transaction';
import { parseAmount } from './amount-input';

/**
 * What the Головний entry form decides, with none of its JSX: the four-way type switch turned
 * into the transaction to store, or into the reason it cannot be stored. It lives here because
 * `verify` never runs a screen — this is the only place those rules can be proven (design §8).
 *
 * What a переказ proposes on top of itself — комісія or «Відсотки» — is decided here too, in
 * `proposeForTransfer`; only the asking belongs to the screen
 * (`src/components/transfer-dialog.ts`), which takes what this returns and puts the question.
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
  /**
   * The опис the транзакція already carries — imports put it there, the form never asks for one.
   * Editing and retyping rebuild the транзакція through here, so this is what keeps the bank's
   * text on it whatever shape it takes.
   */
  readonly description?: string;
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
        ...(draft.description ? { description: draft.description } : {}),
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
        ...(draft.description ? { description: draft.description } : {}),
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
        ...(draft.description ? { description: draft.description } : {}),
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
        ...(draft.description ? { description: draft.description } : {}),
      });
    }
  }
}

/**
 * What a переказ proposes on top of itself, with the переказ to store if the owner accepts.
 *
 * The two proposals are mutually exclusive by construction, not by precedence: a переказ out of a
 * рахунок-борг never proposes a комісія — a person is not a bank, so a repayment that arrives
 * short is no fee — and «Відсотки» is proposed only when the two legs are equal. A переказ whose
 * numbers say nothing proposes nothing, and the typed legs are stored as they are.
 */
export type TransferProposal =
  | {
      readonly kind: 'fee';
      /** The переказ to store instead of the typed one, if accepted. */
      readonly transfer: Transfer;
      readonly expense: Omit<Expense, 'id'>;
    }
  | {
      readonly kind: 'interest';
      readonly transfer: Transfer;
      readonly income: Omit<Income, 'id'>;
    };

/**
 * The комісія of a short same-currency переказ, or the дохід «Відсотки» of a repayment above the
 * principal — or nothing.
 *
 * The principal is the рахунок-борг's розрахунковий баланс *before* this переказ, which is why
 * the source's stored транзакції come in whole and the переказ's own id is excluded: reopening an
 * unchanged repayment must propose nothing, and editing one up must compare against what was owed
 * before it, not against the balance it already moved.
 */
export function proposeForTransfer(
  candidate: Transfer,
  context: {
    readonly accounts: readonly Account[];
    /** Every stored транзакція touching the рахунок the money left, as storage holds them. */
    readonly sourceTransactions: readonly Transaction[];
  },
): TransferProposal | null {
  const from = context.accounts.find((a) => a.id === candidate.fromAccountId);
  const to = context.accounts.find((a) => a.id === candidate.toAccountId);
  if (!from || !to) {
    return null;
  }

  if (from.kind === 'debt') {
    const excess = interestExcess(candidate, from, to, context.sourceTransactions);
    if (!excess) {
      return null;
    }
    const principal = money(candidate.left.amount - excess.amount, from.currency);
    return {
      kind: 'interest',
      transfer: transfer({ ...candidate, left: principal, arrived: principal }),
      income: {
        type: 'income',
        date: candidate.date,
        accountId: to.id,
        amount: excess,
        sourceId: INTEREST_SOURCE_ID,
      },
    };
  }

  const fee = proposeFee(candidate);
  return fee
    ? { kind: 'fee', transfer: transfer({ ...candidate, left: candidate.arrived }), expense: fee }
    : null;
}

/** How much of a repayment is above the principal, or nothing when none of it is. */
function interestExcess(
  candidate: Transfer,
  from: Account,
  to: Account,
  sourceTransactions: readonly Transaction[],
): Money | null {
  // Lending, not repaying; and money arriving on another рахунок-борг is one person paying for
  // another, which is not interest the owner earned.
  if (to.kind === 'debt' || from.currency !== to.currency) {
    return null;
  }
  // Unequal legs are the комісія's shape, and no комісія is proposed out of a рахунок-борг — so
  // such a переказ is stored exactly as typed and proposes nothing at all.
  if (candidate.left.amount !== candidate.arrived.amount) {
    return null;
  }
  const owed = computeBalance(
    from,
    sourceTransactions.filter((t) => t.id !== candidate.id),
  );
  if (owed.amount <= 0 || candidate.left.amount <= owed.amount) {
    return null;
  }
  return money(candidate.left.amount - owed.amount, from.currency);
}
