import type { Account } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { matchRule, type Rule } from '../domain/rules';
import {
  expenseByDefault,
  isoDate,
  UNSOURCED_SOURCE_ID,
  type Expense,
  type Income,
  type IsoDate,
} from '../domain/transaction';
import { fingerprintOf, type CapturedNotification } from './capture';
import { parseInputOf, parseNotification, type NotificationParser } from './parse';

/**
 * From a captured notification to the owner's truth: which apps are read at all, what a
 * notification proposes, and what confirming or dismissing that proposal creates.
 *
 * Every decision here is a function of its inputs — the capture, the watches, the fingerprints
 * already seen and the owner's правила. Nothing is stored, nothing is fetched, no clock is read:
 * the calendar date arrives through an injected port (design D9), exactly as it does in mono's
 * `StatementContext`, and storing what comes back is the `bank-notifications-screen` change's job.
 */

/** One app the owner opted into reading, and the рахунок its notifications land on. */
export interface Watch {
  readonly packageName: string;
  readonly accountId: string;
  /** The рахунок's currency — the only currency a сума ever attaches to a чернетка in. */
  readonly currency: CurrencyCode;
}

/** All a watch needs of a рахунок: that it exists, and what currency it holds money in. */
export type WatchableAccount = Pick<Account, 'id' | 'currency'>;

export type WatchResult =
  | { readonly kind: 'watched'; readonly watches: readonly Watch[]; readonly watch: Watch }
  | { readonly kind: 'already-watched'; readonly watch: Watch }
  | { readonly kind: 'no-such-account' };

/** The watch on an app, if the owner set one. The one lookup that decides whether to read at all. */
export function watchFor(watches: readonly Watch[], packageName: string): Watch | undefined {
  return watches.find((watch) => watch.packageName === packageName);
}

/**
 * The watch set with one more app in it, or a typed rejection.
 *
 * One app maps to exactly one рахунок, so a second watch on the same package is refused rather
 * than replacing the first — a notification that could land on either of two рахунки has no right
 * answer. Two apps may name the same рахунок: two of the owner's cards at one bank, or a bank
 * whose app posts under a second package, are one рахунок's worth of money.
 *
 * The рахунок must exist, and the watch takes its currency from it rather than being told one:
 * a watch is the only thing that decides which currency a сума may attach in, so a mistyped
 * currency there would land every сума in money that рахунок does not hold. Deriving it makes
 * that unrepresentable instead of merely unlikely.
 */
export function addWatch(
  watches: readonly Watch[],
  request: { readonly packageName: string; readonly accountId: string },
  accounts: readonly WatchableAccount[],
): WatchResult {
  const existing = watchFor(watches, request.packageName);
  if (existing !== undefined) return { kind: 'already-watched', watch: existing };
  const account = accounts.find((candidate) => candidate.id === request.accountId);
  if (account === undefined) return { kind: 'no-such-account' };
  const watch: Watch = {
    packageName: request.packageName,
    accountId: account.id,
    currency: account.currency,
  };
  return { kind: 'watched', watches: [...watches, watch], watch };
}

/**
 * What a чернетка proposes: the витрата the bank said left, the дохід it said arrived, or nothing
 * but the text when the parsers could not read it. A raw чернетка keeps the сума the notification
 * named in another currency as `original` — information the витрата carries once the owner says
 * what the bank actually charged (the transactions spec's original-currency amount).
 */
export type DraftProposal =
  | { readonly kind: 'expense'; readonly amount: Money }
  | { readonly kind: 'income'; readonly amount: Money }
  | { readonly kind: 'raw'; readonly original?: Money };

/**
 * A транзакція proposed and not yet said a word about (glossary, "Draft"). It is not a транзакція:
 * no розрахунковий баланс and no monthly number can read it, because nothing outside this module
 * is ever handed one as a транзакція — only `confirmDraft` produces those.
 */
export interface Draft {
  readonly id: string;
  readonly accountId: string;
  /** The рахунок's currency, carried so a supplied сума can never land in another one. */
  readonly currency: CurrencyCode;
  readonly date: IsoDate;
  /** The parse input: title and text joined, whitespace collapsed — what правила match on. */
  readonly text: string;
  readonly proposal: DraftProposal;
}

/** What `processCapture` needs beyond the notification itself. */
export interface ProcessContext {
  readonly watches: readonly Watch[];
  /** The fingerprints already processed. Input only; the caller stores what comes back. */
  readonly seenFingerprints: ReadonlySet<string>;
  /** The owner's правила, applied by description with no MCC — a notification carries none. */
  readonly rules: readonly Rule[];
  readonly newId: () => string;
  /**
   * Epoch milliseconds → the calendar date of that moment in the device's timezone. Injected
   * because the domain holds no Date objects and no timezone opinion (design D9); tests pass a
   * fixed one, which is what makes the determinism scenario mean anything.
   */
  readonly dateOf: (epochMs: number) => IsoDate;
  /** Per-app parsers; defaults to the shipped registry. */
  readonly parsers?: ReadonlyMap<string, NotificationParser>;
}

/**
 * What one captured notification came to. `ignored` is an unwatched app — nothing was read and
 * nothing is remembered; `duplicate` is a fingerprint already seen. The other two carry the
 * fingerprint the caller must store beside what it stores, in one SQLite transaction, so a crash
 * can never leave the money without its dedup mark.
 */
export type CaptureOutcome =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'drafted'; readonly draft: Draft; readonly fingerprint: string }
  | { readonly kind: 'auto-confirmed'; readonly transaction: Expense; readonly fingerprint: string };

/**
 * A captured notification → what it comes to, decided in the only order that is safe: is this app
 * read at all, then has this notification been seen before, and only then what it says.
 *
 * An unwatched app's notification is not parsed, not drafted and not even remembered — the opt-in
 * is what makes the privacy promise enforceable, so an app the owner did not point at leaves no
 * trace whatsoever. A fingerprint already seen yields nothing regardless of what became of the
 * чернетка it once made: confirmed, dismissed, or a транзакція since deleted, Android re-posting
 * that notification never doubles the money.
 */
export function processCapture(capture: CapturedNotification, ctx: ProcessContext): CaptureOutcome {
  const watch = watchFor(ctx.watches, capture.packageName);
  if (watch === undefined) return { kind: 'ignored' };

  const fingerprint = fingerprintOf(capture);
  if (ctx.seenFingerprints.has(fingerprint)) return { kind: 'duplicate' };

  const text = parseInputOf(capture);
  const date = isoDate(ctx.dateOf(capture.postedAt));
  const outcome = parseNotification(capture, ctx.parsers);
  const draft = (proposal: DraftProposal): Draft => ({
    id: ctx.newId(),
    accountId: watch.accountId,
    currency: watch.currency,
    date,
    text,
    proposal,
  });

  if (outcome.kind === 'unparsed') {
    return { kind: 'drafted', draft: draft({ kind: 'raw' }), fingerprint };
  }

  const { direction, amount } = outcome.movement;
  if (amount.currency !== watch.currency) {
    // The notification named a currency that is not the рахунок's: a foreign purchase showing the
    // merchant's own amount. What the bank charged in the рахунок's currency is not in the text,
    // so nothing is proposed as a сума — the named amount rides along as the reference the витрата
    // will keep as information once the owner supplies the charge.
    return { kind: 'drafted', draft: draft({ kind: 'raw', original: amount }), fingerprint };
  }

  if (direction === 'in') {
    return { kind: 'drafted', draft: draft({ kind: 'income', amount }), fingerprint };
  }

  // FR-S3's "або автоматично за правилом", decided here and only here: a правило that recognises
  // the merchant now confirms the витрата now. A правило created later is honoured the moment the
  // owner confirms (`confirmDraft` matches again), but no sweep reaches back for чернетки the
  // owner has already seen and may mean to dismiss (design D8).
  const categoryId = matchRule(ctx.rules, { description: text });
  if (categoryId !== undefined) {
    return {
      kind: 'auto-confirmed',
      transaction: expenseByDefault({
        id: ctx.newId(),
        date,
        accountId: watch.accountId,
        amount,
        categoryId,
        description: text,
      }),
      fingerprint,
    };
  }

  return { kind: 'drafted', draft: draft({ kind: 'expense', amount }), fingerprint };
}

/** What confirming a чернетка needs: the правила as they stand now, and an id for what it creates. */
export interface ConfirmContext {
  readonly rules: readonly Rule[];
  readonly newId: () => string;
}

/**
 * The owner's word on a чернетка. `confirmed` carries the транзакція to store and the чернетка it
 * settles; `amount-required` is the raw чернетка that has no сума to confirm — it still awaits.
 */
export type ConfirmResult =
  | { readonly kind: 'confirmed'; readonly draftId: string; readonly transaction: Expense | Income }
  | { readonly kind: 'amount-required'; readonly draftId: string };

/** Settling a чернетка the owner said no to. It creates nothing; only the чернетка is spent. */
export interface DismissResult {
  readonly kind: 'dismissed';
  readonly draftId: string;
}

/** A сума the owner typed is usable only as a positive whole number of minor units. */
function suppliedMinorUnits(supplied: number | undefined): number | undefined {
  if (supplied === undefined || !Number.isSafeInteger(supplied) || supplied <= 0) return undefined;
  return supplied;
}

/**
 * Confirming a чернетка: exactly the транзакція it proposed, on its рахунок, on its date, with its
 * text as the опис.
 *
 * The категорія is decided here rather than at drafting, so a правило the owner created after
 * seeing the чернетка is honoured (design D8); no match leaves `categoryId` off entirely, which is
 * how «Без категорії» stays the domain's own default rather than a string this module repeats. A
 * дохід keeps «Без джерела» — a starting state, never a verdict.
 *
 * A raw чернетка has no сума of its own, so it confirms only with one the owner supplies, and that
 * сума is in the рахунок's currency by construction: the number is minor units and the currency is
 * the чернетка's. `suppliedAmount` is ignored for a чернетка that already carries a сума — what
 * the bank said is not retyped here; the transaction editor is where the owner changes it.
 */
export function confirmDraft(
  draft: Draft,
  ctx: ConfirmContext,
  suppliedAmount?: number,
): ConfirmResult {
  const date = isoDate(draft.date);
  if (draft.proposal.kind !== 'raw' && draft.proposal.amount.currency !== draft.currency) {
    // `processCapture` cannot build one of these, but a чернетка read back out of storage could be
    // one; relabelling money silently is the one thing worse than stopping, exactly as
    // `mapStatement` decides for the same mistake.
    throw new Error(
      `чернетка "${draft.id}" of ${draft.currency} cannot propose ${draft.proposal.amount.currency}`,
    );
  }

  if (draft.proposal.kind === 'income') {
    // Built exactly as `mapStatement` builds an imported дохід: no factory exists for one, so the
    // date is validated here rather than trusted.
    const income: Income = {
      type: 'income',
      id: ctx.newId(),
      date,
      accountId: draft.accountId,
      amount: draft.proposal.amount,
      sourceId: UNSOURCED_SOURCE_ID,
      ...(draft.text ? { description: draft.text } : {}),
    };
    return { kind: 'confirmed', draftId: draft.id, transaction: income };
  }

  const proposal = draft.proposal;
  if (proposal.kind === 'raw') {
    const supplied = suppliedMinorUnits(suppliedAmount);
    if (supplied === undefined) return { kind: 'amount-required', draftId: draft.id };
    return confirmedExpense(draft, ctx, money(supplied, draft.currency), proposal.original);
  }
  return confirmedExpense(draft, ctx, proposal.amount, undefined);
}

/** The one shape a confirmed витрата takes, whether its сума came from the bank or the owner. */
function confirmedExpense(
  draft: Draft,
  ctx: ConfirmContext,
  amount: Money,
  original: Money | undefined,
): ConfirmResult {
  const categoryId = matchRule(ctx.rules, { description: draft.text });
  return {
    kind: 'confirmed',
    draftId: draft.id,
    transaction: expenseByDefault({
      id: ctx.newId(),
      date: isoDate(draft.date),
      accountId: draft.accountId,
      amount,
      // No match means no categoryId at all: «Без категорії» is the domain's default, not ours.
      ...(categoryId !== undefined ? { categoryId } : {}),
      // The notification named this currency and the bank charged another; the transactions spec
      // keeps the named сума as information on the витрата.
      ...(original !== undefined ? { originalAmount: original } : {}),
      description: draft.text,
    }),
  };
}

/**
 * Dismissing a чернетка: nothing is created, no balance moves, and the чернетка awaits nothing
 * further. It does not un-remember the fingerprint — a dismissed notification stays dismissed even
 * when the phone posts it again.
 */
export function dismissDraft(draft: Draft): DismissResult {
  return { kind: 'dismissed', draftId: draft.id };
}
