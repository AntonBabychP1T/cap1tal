import { computeBalance, type Account } from '../domain/account';
import { money, type Money } from '../domain/money';
import {
  expenseByDefault,
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
import { formatMoney, parseAmount } from './amount-input';
import { parseTypedDate } from './dates';
import { categoryLabel, sourceLabel, transactionTypeLabel } from './labels';
import { accountNameOf } from './transaction-line';

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
   * The опис: the bank's text on an imported транзакція, or the note the owner wrote when
   * recording or editing one by hand. Optional everywhere and informational everywhere — it moves
   * no total, no balance and no classification. Editing and retyping rebuild the транзакція
   * through here, so this is also what keeps the bank's text on it whatever shape it takes. Pass
   * what `normaliseDescription` returns: an empty field must arrive here as `undefined`, never as
   * `''`.
   */
  readonly description?: string;
}

/**
 * What the owner typed as the опис, ready to be stored: trimmed, and an empty field turned into
 * no опис at all. One place, because both screens that offer the field — recording and editing —
 * must agree, and because the column stores NULL for "no опис" and never the empty string
 * (`src/db/schema.ts`). A транзакція with no опис shows no empty row anywhere.
 */
export function normaliseDescription(typed: string | undefined): string | undefined {
  const trimmed = typed?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

/**
 * The рахунок the entry form opens on: the one last recorded on by hand, when it is still among
 * the рахунки the form offers. An offer and nothing more — the owner changes it freely before
 * recording, and `buildEntry` resolves whatever they end with against the same list.
 *
 * A remembered рахунок that has since been archived (or deleted, which nothing does) pre-chooses
 * nothing rather than quietly picking a neighbour: recording then refuses until the owner picks
 * one, which is exactly what it does on a device that has never recorded by hand.
 */
export function defaultAccountId(
  remembered: string | undefined,
  offered: readonly Account[],
): string | undefined {
  return offered.some((a) => a.id === remembered) ? remembered : undefined;
}

/**
 * The transaction the draft describes, or an `Error` naming in Ukrainian what is missing — the
 * screen shows that message verbatim through `failureMessage`. Every сума is parsed in its own
 * account's currency, so no amount can land on an account in a foreign one; the amount rules and
 * the calendar-date rule belong to `parseAmount` and to `parseTypedDate`, and their rejections
 * pass through untouched rather than being restated here — they are already the owner's own
 * sentences.
 *
 * The дата is parsed once, here, rather than by each domain factory in turn: the factories check
 * it again, and they refuse in the English of an invariant, which no form may show.
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
  const date = parseTypedDate(draft.date);

  switch (draft.type) {
    case 'expense':
      return expenseByDefault({
        id: context.id,
        date,
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
      // calendar date and a positive сума, which `parseTypedDate` and `parseAmount` already are.
      const income: Income = {
        type: 'income',
        id: context.id,
        date,
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
        date,
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
      // `transfer` refuses this too, and in the English of an invariant. Named here for the same
      // reason the cross-currency leg below is: the owner reads this sentence.
      if (to.id === from.id) {
        throw new Error('переказ зʼєднує два різні рахунки — оберіть інший рахунок');
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
      return transfer({
        id: context.id,
        date,
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


/**
 * What the owner reads after «Записати»: the сума with its currency and what it was recorded as —
 * the категорія of a витрата or повернення, the джерело of a дохід, both рахунки of a переказ —
 * and, when the owner accepted one, the комісія or the дохід «Відсотки» stored alongside.
 *
 * A line inside the entry card and not an Alert or a Toast (design D11): an Alert blocks and eats
 * the next tap, and `ToastAndroid` is Android-only while iOS must stay possible. Built here rather
 * than in JSX for the usual reason — it is what the screen *says*, so `verify` has to be able to
 * read it.
 *
 * `written` is exactly what was stored, in the order it was stored: one транзакція normally, and a
 * переказ followed by its accepted комісія or «Відсотки». Nothing stored, nothing said — a refused
 * recording shows its own refusal and no confirmation.
 */
export function recordedConfirmation(
  written: readonly Transaction[],
  names: {
    readonly accounts: ReadonlyMap<string, Account>;
    readonly categoryNames: ReadonlyMap<string, string>;
    readonly sourceNames: ReadonlyMap<string, string>;
  },
): string | undefined {
  const [first, ...alongside] = written;
  if (!first) {
    return undefined;
  }
  const parts = [`Записано: ${describe(first, names)}`];
  for (const extra of alongside) {
    parts.push(`разом із цим — ${describe(extra, names)}`);
  }
  return `${parts.join('; ')}.`;
}

function describe(
  t: Transaction,
  names: {
    readonly accounts: ReadonlyMap<string, Account>;
    readonly categoryNames: ReadonlyMap<string, string>;
    readonly sourceNames: ReadonlyMap<string, string>;
  },
): string {
  switch (t.type) {
    case 'expense':
    case 'refund':
      return `${transactionTypeLabel(t.type)} ${formatMoney(t.amount)} — ${categoryLabel(t.categoryId, names.categoryNames)}`;
    case 'income':
      return `дохід ${formatMoney(t.amount)} — ${sourceLabel(t.sourceId, names.sourceNames)}`;
    case 'transfer':
      return (
        `переказ ${formatMoney(t.left)} з «${accountNameOf(t.fromAccountId, names.accounts)}» ` +
        `на «${accountNameOf(t.toAccountId, names.accounts)}»`
      );
    case 'correction':
      return `коригування ${formatMoney(t.amount)}`;
  }
}
