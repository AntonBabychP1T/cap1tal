import type { CommitSummary } from '../db/import-repo';
import type { ImportPlan } from '../saldo/interpret';
import { parseSaldoExport, type SaldoTransaction } from '../saldo/parse';
import {
  debtLegOf,
  survey,
  EMPTY_EXISTING,
  type AccountEntry,
  type AccountRedirect,
  type Decisions,
  type ExistingState,
  type PersonAssignment,
  type Survey,
} from '../saldo/survey';
import { interpret } from '../saldo/interpret';
import { verify, type Report } from '../saldo/verify';
import type { AccountKind } from '../domain/account';
import { EVIDENCE_STRENGTH, nameEvidence, type NameEvidence } from '../domain/name-match';
import type { Money } from '../domain/money';
import { evidenceLabel } from './labels';

/**
 * The «Імпорт Saldo» flow with none of its JSX: which step it stands on, the decisions the owner
 * has built so far, and what the engine makes of them. It lives here because `verify` never runs a
 * screen — this is the only place the flow's rules can be proven (design §1).
 *
 * Nothing here writes: every transition returns a new state, and the plan is simply the engine run
 * again over the new decisions. That is affordable because `interpret` is deterministic and pure,
 * and it is what keeps this module free of a cache that could disagree with what the owner sees.
 *
 * What the import makes of any given export row is not decided here — that is the `saldo-import`
 * capability's, and `state.plan` and `state.report` are its answers, passed through rather than
 * restated.
 */

export type Step = 'file' | 'accounts' | 'debts' | 'report' | 'done';

/** How a commit ended, once the screen has attempted one. */
export type Outcome =
  | { readonly kind: 'written'; readonly summary: CommitSummary }
  | { readonly kind: 'failed'; readonly reason: string };

export interface FlowState {
  readonly step: Step;
  readonly existing: ExistingState;
  /** When an import was committed before this one, if any — the second-import warning. */
  readonly previouslyCommittedAt?: Date;
  /** The owner's answers so far; the engine's only input besides the export. */
  readonly decisions: Decisions;
  readonly transactions: readonly SaldoTransaction[];
  readonly survey?: Survey;
  readonly plan?: ImportPlan;
  readonly report?: Report;
  /** Why the chosen file was refused, in the words the import gave. */
  readonly refusal?: string;
  /** The report has been shown; the commit is not offered before it has. */
  readonly reportSeen: boolean;
  /** The extra confirmation a second import needs, given. */
  readonly secondImportConfirmed: boolean;
  readonly outcome?: Outcome;
}

/** A flow that has read nothing yet, on a device whose state the caller has just loaded. */
export function startFlow(
  input: {
    readonly existing?: ExistingState;
    readonly previouslyCommittedAt?: Date;
  } = {},
): FlowState {
  return {
    step: 'file',
    existing: input.existing ?? EMPTY_EXISTING,
    ...(input.previouslyCommittedAt ? { previouslyCommittedAt: input.previouslyCommittedAt } : {}),
    decisions: {},
    transactions: [],
    reportSeen: false,
    secondImportConfirmed: false,
  };
}

/**
 * The chosen export's text. A file the import cannot read leaves the flow where it was, carrying
 * the reason and no plan — the owner picks another file. Nothing is imported from a refused file.
 */
export function startWithText(state: FlowState, text: string): FlowState {
  const parsed = parseSaldoExport(text);
  if (!parsed.ok) {
    return {
      ...state,
      step: 'file',
      refusal: parsed.reason,
      transactions: [],
      survey: undefined,
      plan: undefined,
      report: undefined,
    };
  }
  const started: FlowState = {
    ...state,
    step: 'accounts',
    refusal: undefined,
    transactions: parsed.transactions,
    reportSeen: false,
  };
  return derive(started);
}

/** Re-runs the engine over the current decisions. Every transition below ends here. */
function derive(state: FlowState): FlowState {
  if (state.transactions.length === 0) {
    return state;
  }
  const surveyed = survey(state.transactions, state.existing);
  const plan = interpret({
    transactions: state.transactions,
    survey: surveyed,
    decisions: state.decisions,
    existing: state.existing,
  });
  const report = verify({ transactions: state.transactions, plan, existing: state.existing });
  return { ...state, survey: surveyed, plan, report };
}

const withDecisions = (state: FlowState, decisions: Decisions): FlowState =>
  derive({ ...state, decisions });

/** Sets or clears one key of a decision record, dropping the record when it empties. */
function withEntry<T>(
  current: Readonly<Record<string, T>> | undefined,
  key: string,
  value: T | undefined,
): Readonly<Record<string, T>> | undefined {
  const next = { ...(current ?? {}) };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * Redirects one map entry onto another entry's рахунок or onto an existing one — how the
 * duplicates of one card become a single рахунок. Passing nothing undoes it. A redirect the import
 * rejects is not applied; it surfaces in `rejectedRedirects` with its reason.
 */
export function redirectAccount(state: FlowState, key: string, to?: AccountRedirect): FlowState {
  return withDecisions(state, {
    ...state.decisions,
    accountRedirects: withEntry(state.decisions.accountRedirects, key, to),
  });
}

/** The вид of the рахунок an entry becomes; nothing restores the proposed one. */
export function setAccountKind(state: FlowState, key: string, kind?: AccountKind): FlowState {
  return withDecisions(state, {
    ...state.decisions,
    accountKinds: withEntry(state.decisions.accountKinds, key, kind),
  });
}

/** Redirects a proposed категорія or джерело onto an existing row; nothing undoes it. */
export function redirectName(
  state: FlowState,
  list: 'categories' | 'sources',
  saldoName: string,
  existingId?: string,
): FlowState {
  const field = list === 'categories' ? 'categoryRedirects' : 'sourceRedirects';
  return withDecisions(state, {
    ...state.decisions,
    [field]: withEntry(state.decisions[field], saldoName, existingId),
  });
}

/** Assigns every «Борг» transaction carrying one description to a person; nothing undoes it. */
export function assignDescription(
  state: FlowState,
  description: string,
  to?: PersonAssignment,
): FlowState {
  return withDecisions(state, {
    ...state.decisions,
    debtPeople: withEntry(state.decisions.debtPeople, description, to),
  });
}

/** Assigns one «Борг» transaction, overriding whatever its description says. */
export function assignTransaction(
  state: FlowState,
  transactionId: string,
  to?: PersonAssignment,
): FlowState {
  return withDecisions(state, {
    ...state.decisions,
    debtTransactions: withEntry(state.decisions.debtTransactions, transactionId, to),
  });
}

/** Moving between steps. Reaching the report is what marks it seen — the commit needs that. */
export function toStep(state: FlowState, step: Step): FlowState {
  return { ...state, step, reportSeen: state.reportSeen || step === 'report' };
}

/** The extra confirmation a second import needs before it may be committed. */
export function confirmSecondImport(state: FlowState): FlowState {
  return { ...state, secondImportConfirmed: true };
}

/**
 * Whether the commit may be offered at all: a complete plan the owner has seen the report for,
 * and — on a device that has imported before — the extra confirmation, because committing again
 * doubles the whole history.
 */
export function canCommit(state: FlowState): boolean {
  if (!state.plan?.complete || !state.reportSeen || state.outcome) {
    return false;
  }
  return state.previouslyCommittedAt === undefined || state.secondImportConfirmed;
}

/** What the screen shows after a successful commit. */
export function committed(state: FlowState, summary: CommitSummary): FlowState {
  return { ...state, step: 'done', outcome: { kind: 'written', summary } };
}

/** What it shows when the write failed — nothing of the plan is in storage. */
export function commitFailed(state: FlowState, reason: string): FlowState {
  return { ...state, step: 'done', outcome: { kind: 'failed', reason } };
}

/** One row of the account-map step: the Saldo account, and the рахунок it would become. */
export interface AccountRow {
  readonly key: string;
  readonly entry: AccountEntry;
  /** The рахунок this entry's legs land on — its own proposal, or the one it was redirected onto. */
  readonly becomes: {
    readonly id: string;
    readonly name: string;
    readonly kind: AccountKind;
    readonly currency: string;
  };
  /** Set when this entry is merged onto another entry's рахунок rather than becoming its own. */
  readonly mergedInto?: string;
  /**
   * Set when the рахунок it lands on is one the owner already has. Kept apart from `mergedInto`
   * because the two are indistinguishable by name — the export's "mono black" and a рахунок the
   * owner called "mono black" are the same word and very different decisions.
   */
  readonly ontoExisting?: boolean;
  /** Why the redirect the owner asked for was not applied. */
  readonly rejection?: string;
}

export function accountRows(state: FlowState): AccountRow[] {
  const plan = state.plan;
  if (!state.survey || !plan) {
    return [];
  }
  const rejections = new Map(plan.rejectedRedirects.map((r) => [r.key, r.reason]));
  const byId = new Map(plan.accounts.map((a) => [a.id, a]));
  return state.survey.accounts.map((entry) => {
    const id = plan.accountKeys[entry.key] ?? '';
    const planned = byId.get(id);
    const becomes = {
      id,
      name: planned?.name ?? entry.proposedName,
      kind: planned?.kind ?? entry.proposedKind,
      currency: planned?.currency ?? entry.currency,
    };
    return {
      key: entry.key,
      entry,
      becomes,
      ...(planned?.existingId ? { ontoExisting: true } : {}),
      ...(!planned?.existingId && becomes.name !== entry.proposedName
        ? { mergedInto: becomes.name }
        : {}),
      ...(rejections.has(entry.key) ? { rejection: rejections.get(entry.key)! } : {}),
    };
  });
}

/** One «Борг» transaction and the person it is going to, if any. */
export interface DebtRow {
  readonly transactionId: string;
  readonly description: string;
  readonly date: string;
  readonly amount: Money;
  readonly assigned: boolean;
  /** The рахунок-борг it lands on, once it is assigned. */
  readonly person?: string;
}

/**
 * Every «Борг» transaction of the export, each with its date, its amount and the person it is
 * going to — the unassigned ones first, since they are what holds the commit back. The plan lists
 * only what is unresolved, so the assigned ones are read back off the перекази the plan built.
 */
export function debtRows(state: FlowState): DebtRow[] {
  const plan = state.plan;
  if (!plan) {
    return [];
  }
  const unresolved = new Set(plan.unresolvedDebts.map((debt) => debt.transactionId));
  const namesById = new Map(plan.accounts.map((planned) => [planned.id, planned.name]));
  // Which transactions are «Борг» is the export's answer, not the plan's: a рахунок the owner set
  // to вид `debt` on the map step has ordinary перекази too, and none of them is a «Борг» row.
  const debtDescriptions = new Map(
    state.transactions
      .filter((t) => debtLegOf(t) !== undefined)
      .map((t) => [t.id, t.legs[0]?.description ?? '']),
  );
  const rows: DebtRow[] = plan.unresolvedDebts.map((debt) => ({
    transactionId: debt.transactionId,
    description: debt.description,
    date: debt.date,
    amount: debt.amount,
    assigned: false,
  }));
  for (const planned of plan.transactions) {
    const [saldoId] = planned.saldoIds;
    const t = planned.transaction;
    if (
      t.type !== 'transfer' ||
      saldoId === undefined ||
      unresolved.has(saldoId) ||
      !debtDescriptions.has(saldoId)
    ) {
      continue;
    }
    const debtLeg = [t.fromAccountId, t.toAccountId].find((id) =>
      plan.accounts.some((planned2) => planned2.id === id && planned2.kind === 'debt'),
    );
    if (debtLeg === undefined) {
      continue;
    }
    rows.push({
      transactionId: saldoId,
      // The description it was assigned by, kept: it is how the owner tells two rows of one week
      // apart from each other after they have moved.
      description: debtDescriptions.get(saldoId) ?? '',
      date: t.date,
      amount: t.left,
      assigned: true,
      person: namesById.get(debtLeg) ?? '',
    });
  }
  return rows;
}

/** Every «Борг» transaction still attached to nobody — what blocks the commit, listed. */
export function unassignedDebts(state: FlowState): DebtRow[] {
  return debtRows(state).filter((row) => !row.assigned);
}

/** What the commit would create, for the owner to read before it does. */
export interface PlanSummary {
  readonly accounts: number;
  readonly newAccounts: number;
  readonly categories: number;
  readonly sources: number;
  readonly transactions: number;
  readonly droppedRows: number;
  readonly unassignedDebts: number;
}

export function planSummary(state: FlowState): PlanSummary | undefined {
  const plan = state.plan;
  if (!plan) {
    return undefined;
  }
  // The plan's own lists are already what it would create: a name the survey matched, or the
  // owner redirected onto an existing row, is not among them.
  return {
    accounts: plan.accounts.length,
    newAccounts: plan.accounts.filter((a) => !a.existingId).length,
    categories: plan.categories.length,
    sources: plan.sources.length,
    transactions: plan.transactions.length,
    droppedRows: plan.unexplained.length,
    unassignedDebts: plan.unresolvedDebts.length,
  };
}

/** One merge the flow proposes: an entry, where it would go, and why the app thinks so. */
export interface MergeSuggestion {
  /** The map entry that would stop being its own рахунок. */
  readonly key: string;
  /** What the entry's row calls it. */
  readonly entryName: string;
  readonly onto: AccountRedirect;
  /** The рахунок it would join, by the name the owner sees. */
  readonly targetName: string;
  /** Whether that рахунок is one the owner already keeps, rather than another entry. */
  readonly ontoExisting: boolean;
  /** The evidence, in the owner's words. */
  readonly reason: string;
}

/** The strongest candidate, or nothing when two are equally strong — a coin flip is not evidence. */
function strongest<T>(
  candidates: readonly { readonly target: T; readonly evidence: NameEvidence }[],
): { readonly target: T; readonly evidence: NameEvidence } | undefined {
  let best: { target: T; evidence: NameEvidence } | undefined;
  let tied = false;
  for (const candidate of candidates) {
    if (!best || EVIDENCE_STRENGTH[candidate.evidence] > EVIDENCE_STRENGTH[best.evidence]) {
      best = { target: candidate.target, evidence: candidate.evidence };
      tied = false;
    } else if (EVIDENCE_STRENGTH[candidate.evidence] === EVIDENCE_STRENGTH[best.evidence]) {
      tied = true;
    }
  }
  return tied ? undefined : best;
}

/**
 * Which map entries look like the same рахунок, before the owner has touched anything.
 *
 * A Saldo export carries one entry per account name the file ever used, so one card renamed once
 * arrives as two or three entries and would become two or three рахунки with a fraction of the
 * history each. The evidence that says otherwise is already on the screen — the names, and the
 * рахунки the owner already keeps — and this is what reads it.
 *
 * The rules, and each one is a refusal to guess:
 *
 * - Only entries the owner has made no decision about are proposed for; a redirect they already
 *   set is their answer, and this never argues with it.
 * - A рахунок the owner already has beats another entry: they kept it, its opening balance and
 *   its транзакції are there, and merging onto it is where this history belongs.
 * - Currencies must be equal, because the import rejects a cross-currency redirect — proposing
 *   one would be proposing a refusal.
 * - Two targets of equal strength propose nothing. The owner decides on the row.
 * - No chains: the first entry of a matching group is the target and the rest merge into it, so
 *   no proposal ever points at an entry that is itself merging away.
 *
 * Pure, like everything else here: it reads the flow's state and writes nothing.
 */
export function mergeSuggestions(state: FlowState): MergeSuggestion[] {
  const entries = state.survey?.accounts ?? [];
  if (entries.length === 0) {
    return [];
  }
  const decided = new Set(Object.keys(state.decisions.accountRedirects ?? {}));
  const existing = state.existing.accounts.filter((a) => !a.archived);

  const suggestions: MergeSuggestion[] = [];
  /** Entries that will merge away, and entries that will receive one. Never both. */
  const sources = new Set<string>();
  const targets = new Set<string>();

  entries.forEach((entry, index) => {
    if (decided.has(entry.key) || targets.has(entry.key)) {
      return;
    }

    const ontoExisting = strongest(
      existing
        .filter((a) => a.currency === entry.currency)
        .map((a) => ({ target: a, evidence: nameEvidence(entry.proposedName, a.name) }))
        .filter((c): c is { target: (typeof existing)[number]; evidence: NameEvidence } =>
          Boolean(c.evidence),
        ),
    );
    if (ontoExisting) {
      sources.add(entry.key);
      suggestions.push({
        key: entry.key,
        entryName: entry.proposedName,
        onto: { to: 'account', accountId: ontoExisting.target.id },
        targetName: ontoExisting.target.name,
        ontoExisting: true,
        reason: evidenceLabel(ontoExisting.evidence),
      });
      return;
    }

    // Earlier entries only: the first name a matching group appears under is the one the group
    // merges into, so no proposal can ever point at an entry that is itself merging away.
    const ontoEntry = strongest(
      entries
        .slice(0, index)
        .filter(
          (other) =>
            other.currency === entry.currency && !sources.has(other.key) && !decided.has(other.key),
        )
        .map((other) => ({
          target: other,
          evidence: nameEvidence(entry.proposedName, other.proposedName),
        }))
        .filter((c): c is { target: AccountEntry; evidence: NameEvidence } => Boolean(c.evidence)),
    );
    if (!ontoEntry) {
      return;
    }
    sources.add(entry.key);
    targets.add(ontoEntry.target.key);
    suggestions.push({
      key: entry.key,
      entryName: entry.proposedName,
      onto: { to: 'entry', key: ontoEntry.target.key },
      targetName: ontoEntry.target.proposedName,
      ontoExisting: false,
      reason: evidenceLabel(ontoEntry.evidence),
    });
  });

  return suggestions;
}

/**
 * Accepts a whole set of merges in one transition, so the engine runs once over the finished map
 * rather than once per merge. Not only for speed: a map derived halfway through a set is a map
 * nobody asked to see, and its intermediate rejections would appear and vanish.
 *
 * What it writes is exactly what the hand path writes — the same `accountRedirects` — so undoing
 * one is the «Скасувати об'єднання» that already exists, and nothing about an accepted proposal
 * is remembered as a proposal.
 */
export function applyMerges(
  state: FlowState,
  merges: readonly { readonly key: string; readonly onto: AccountRedirect }[],
): FlowState {
  if (merges.length === 0) {
    return state;
  }
  const accountRedirects = { ...(state.decisions.accountRedirects ?? {}) };
  for (const merge of merges) {
    accountRedirects[merge.key] = merge.onto;
  }
  return withDecisions(state, { ...state.decisions, accountRedirects });
}
