import type { CommitSummary } from '../db/import-repo';
import type { ImportPlan } from '../saldo/interpret';
import { parseSaldoExport, type SaldoTransaction } from '../saldo/parse';
import {
  survey,
  EMPTY_EXISTING,
  type AccountEntry,
  type AccountRedirect,
  type Decisions,
  type ExistingState,
  type Survey,
} from '../saldo/survey';
import { interpret } from '../saldo/interpret';
import { verify, type Report } from '../saldo/verify';
import type { AccountKind } from '../domain/account';
import { accountChoiceLabel } from './labels';

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

export type Step = 'file' | 'accounts' | 'report' | 'done';

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

/** Moving between steps. Reaching the report is what marks it seen — the commit needs that. */
export function toStep(state: FlowState, step: Step): FlowState {
  return { ...state, step, reportSeen: state.reportSeen || step === 'report' };
}

/** The extra confirmation a second import needs before it may be committed. */
export function confirmSecondImport(state: FlowState): FlowState {
  return { ...state, secondImportConfirmed: true };
}

/**
 * Whether the commit may be offered at all: a plan the owner has seen the report for, and — on a
 * device that has imported before — the extra confirmation, because committing again doubles the
 * whole history.
 */
export function canCommit(state: FlowState): boolean {
  if (!state.plan || !state.reportSeen || state.outcome) {
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

/** One offer in the «Об'єднати з» list: what the owner reads, and what a tap sends back. */
export interface MergeTarget {
  readonly value: string;
  readonly label: string;
}

/**
 * Everything one entry could merge into, by name: the other entries of this import that are still
 * рахунки of their own, then the рахунки the owner already keeps.
 *
 * Three rules, and each is a promise the requirement makes rather than a convenience:
 * an entry that is itself merging away is not offered, because merging onto it would build a chain
 * no row displays; an archived рахунок is not offered, for the reason every other picker leaves
 * them out — an archived рахунок takes no new money; and the currency rides every label, because
 * it is the one thing that turns a redirect into a refusal, and the owner should read it before
 * they pick rather than after.
 *
 * It lives here and not in the screen because it is the whole of the scenario "The targets are
 * offered on the row", and `verify` never runs a screen.
 */
export function mergeTargets(state: FlowState, key: string): MergeTarget[] {
  return [
    ...accountRows(state)
      .filter((row) => row.key !== key && !row.mergedInto && !row.ontoExisting)
      .map((row) => ({ value: `entry:${row.key}`, label: accountChoiceLabel(row.becomes) })),
    ...state.existing.accounts
      .filter((a) => !a.archived)
      .map((a) => ({ value: `account:${a.id}`, label: `${accountChoiceLabel(a)} — наявний` })),
  ];
}

/**
 * The value a merge choice carries back, decoded. Two kinds of target live in one list, and the
 * prefix is what keeps «an entry of this import» and «a рахунок the owner already has» apart —
 * they are indistinguishable by name, and very different decisions. Encoded by `mergeTargets`
 * three lines up, so the pair is read and proven together.
 */
export function targetOf(value: string): AccountRedirect {
  return value.startsWith('account:')
    ? { to: 'account', accountId: value.slice('account:'.length) }
    : { to: 'entry', key: value.slice('entry:'.length) };
}

/** What the commit would create, for the owner to read before it does. */
export interface PlanSummary {
  readonly accounts: number;
  readonly newAccounts: number;
  readonly categories: number;
  readonly sources: number;
  readonly transactions: number;
  readonly droppedRows: number;
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
  };
}
