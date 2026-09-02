import type { Account } from '../domain/account';
import type { CurrencyCode } from '../domain/money';
import type { Rule } from '../domain/rules';
import {
  UNSOURCED_SOURCE_ID,
  type Expense,
  type Income,
  type IsoDate,
} from '../domain/transaction';
import { confirmDraft, dismissDraft, type Draft } from '../notifications/draft';
import { formatMoney, parseAmount } from './amount-input';
import { sourceLabel, transactionTypeLabel } from './labels';
import { accountNameOf } from './transaction-line';

/**
 * The чернетки awaiting the owner on Головний: what each one says, and what confirming or
 * dismissing it does. Pure, so `verify` — which never runs a screen — holds the surface to what
 * the spec says it shows and to what an answer actually creates.
 *
 * No rule about money lives here. What a чернетка confirms into is `confirmDraft`'s (the правила
 * at the moment of confirmation, «Без категорії» when none matches, «Без джерела» for money in),
 * what a typed сума means is `parseAmount`'s — the same rules a manual витрата is recorded under —
 * and what survives is `src/db/notifications-repo.ts`'s. This module joins the three and puts the
 * result into the owner's own words.
 */


/** One pending чернетка as Головний reads it. */
export interface DraftLine {
  readonly id: string;
  /** The рахунок it awaits on — its name, archived or not. */
  readonly accountName: string;
  readonly date: IsoDate;
  /** The notification's own text, verbatim. */
  readonly text: string;
  /** What it proposes, in the glossary's words: «витрата», «дохід «Без джерела»», or neither. */
  readonly proposal: string;
  /** The сума with its currency, when the bank named one this рахунок holds. */
  readonly amount?: string;
  /** True for a raw чернетка: the owner supplies the сума before it can confirm. */
  readonly needsAmount: boolean;
  /** The сума the notification named in another currency — information, never a proposal. */
  readonly original?: string;
  /** The currency a supplied сума is entered in: the рахунок's, always. */
  readonly currency: CurrencyCode;
}

/**
 * Every pending чернетка, in the order storage hands them over — newest first, by when it was
 * drafted (`pendingDrafts`). The order is not recomputed here: a чернетка carries the date the
 * money moved, and a bank posting this morning about yesterday's purchase would sort it under
 * something the owner has already answered.
 */
export function draftLines(input: {
  readonly drafts: readonly Draft[];
  readonly accounts: readonly Account[];
  /** The owner's джерела by id, so «Без джерела» is read under whatever they renamed it to. */
  readonly sourceNames: ReadonlyMap<string, string>;
}): DraftLine[] {
  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  return input.drafts.map((draft) => {
    const proposal = draft.proposal;
    return {
      id: draft.id,
      accountName: accountNameOf(draft.accountId, byId),
      date: draft.date,
      text: draft.text,
      currency: draft.currency,
      needsAmount: proposal.kind === 'raw',
      ...(proposal.kind === 'raw'
        ? {
            proposal: 'суму не прочитано',
            ...(proposal.original
              ? { original: `у сповіщенні ${formatMoney(proposal.original)}` }
              : {}),
          }
        : {
            proposal:
              proposal.kind === 'income'
                ? `${transactionTypeLabel('income')} · ${sourceLabel(UNSOURCED_SOURCE_ID, input.sourceNames)}`
                : transactionTypeLabel('expense'),
            amount: formatMoney(proposal.amount),
          }),
    };
  });
}

/** What a чернетка needs of storage. The real one is `src/db/notifications-repo.ts`. */
export interface DraftStorage {
  confirm(draftId: string, transaction: Expense | Income, storedAt: Date): void;
  dismiss(draftId: string): void;
}

export interface DraftPorts {
  readonly storage: DraftStorage;
  /** Read at the moment of confirmation, so a правило created since drafting is honoured. */
  readonly rules: () => readonly Rule[];
  readonly newId: () => string;
  readonly now: () => Date;
}

/**
 * What answering a чернетка came to. `amount-required` and `rejected` both leave it pending — the
 * first because nothing was typed, the second because what was typed is not a сума.
 */
export type DraftAnswer =
  | { readonly kind: 'confirmed'; readonly transaction: Expense | Income }
  | { readonly kind: 'amount-required'; readonly message: string }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'dismissed' };

/**
 * The owner's yes. The транзакція is exactly the one `confirmDraft` decides — правила re-read
 * here and not at drafting, so one created after the чернетка appeared is honoured — and it is
 * stored together with the чернетка's settlement, in one storage transaction.
 *
 * A raw чернетка needs the сума the notification did not carry: it is typed in major units of the
 * рахунок's currency and parsed by exactly the rules a manual витрата is recorded under, so an
 * empty, negative or over-precise one is refused in the owner's own language and the чернетка
 * still awaits.
 */
export function confirmPendingDraft(
  draft: Draft,
  ports: DraftPorts,
  typedAmount?: string,
): DraftAnswer {
  let supplied: number | undefined;
  if (draft.proposal.kind === 'raw') {
    const typed = typedAmount?.trim() ?? '';
    if (typed === '') {
      return { kind: 'amount-required', message: `Напишіть суму в ${draft.currency}.` };
    }
    try {
      supplied = parseAmount(typed, draft.currency).amount;
    } catch (error) {
      return { kind: 'rejected', message: error instanceof Error ? error.message : String(error) };
    }
  }

  const decided = confirmDraft(draft, { rules: ports.rules(), newId: ports.newId }, supplied);
  if (decided.kind === 'amount-required') {
    return { kind: 'amount-required', message: `Напишіть суму в ${draft.currency}.` };
  }

  ports.storage.confirm(decided.draftId, decided.transaction, ports.now());
  return { kind: 'confirmed', transaction: decided.transaction };
}

/**
 * The owner's no: nothing is created, no розрахунковий баланс and no monthly number moves, and
 * the чернетка is spent. The fingerprint stays where it is, which is what makes a dismissal
 * survive the phone posting the same notification again.
 */
export function dismissPendingDraft(draft: Draft, ports: DraftPorts): DraftAnswer {
  const dismissed = dismissDraft(draft);
  ports.storage.dismiss(dismissed.draftId);
  return { kind: 'dismissed' };
}

/** The confirmation dismissing asks for — the same gesture deletion uses everywhere else. */
export function dismissConfirmation(line: DraftLine): string {
  return `Відхилити чернетку «${line.text}»? Транзакція не створиться, і вона більше не зʼявиться.`;
}
