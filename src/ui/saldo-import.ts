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
import {
  accountChoiceLabel,
  accountCount,
  categoryCount,
  plural,
  sourceCount,
  transactionCount,
} from './labels';
import { looksLikeSameAccount, similarity } from './name-similarity';

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
  /**
   * The rows whose підказка про дубль the owner has waved away, by key.
   *
   * Here and not in `Decisions`, deliberately. `Decisions` is the engine's input and its contract
   * is that replaying the same value over the same export reproduces the same plan; a dismissal
   * changes no plan, only one sentence on one row, and putting it there would let two imports with
   * the same decisions produce the same plan and a different screen. Nothing about it reaches
   * storage either — leaving the flow forgets it, which is right for a one-time import.
   */
  readonly dismissedHints: readonly string[];
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
    dismissedHints: [],
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
    // A different export is a different map: nothing waved away on the last one applies to it.
    dismissedHints: [],
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

/**
 * Waves away one row's підказка про дубль for the rest of this import. It decides nothing: the plan
 * built from the state before and after is the same plan, which is the whole reason it is not a
 * decision.
 */
export function dismissHint(state: FlowState, key: string): FlowState {
  return state.dismissedHints.includes(key)
    ? state
    : { ...state, dismissedHints: [...state.dismissedHints, key] };
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
  /**
   * The row's one line of state, named once here rather than re-derived from three optional fields
   * wherever a row is drawn. The three below stay: the screen still needs the target's name, and
   * the two kinds of merge are indistinguishable by name.
   */
  readonly state: 'new' | 'merged-entry' | 'merged-existing';
  /** The назви of the entries merged onto this row's рахунок, so a merge reads from both ends. */
  readonly receives: readonly string[];
  /** Whether the owner changed the вид — i.e. whether «Повернути вид із Saldo» has anything to do. */
  readonly kindOverridden: boolean;
  /** The підказка про дубль to state on this row, if the flow may state one. */
  readonly duplicateHint?: DuplicateHint;
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

/** Everything about a row except the підказка, which is computed from all of the rows at once. */
type BaseRow = Omit<AccountRow, 'duplicateHint'>;

function baseRows(state: FlowState): BaseRow[] {
  const plan = state.plan;
  if (!state.survey || !plan) {
    return [];
  }
  const rejections = new Map(plan.rejectedRedirects.map((r) => [r.key, r.reason]));
  const byId = new Map(plan.accounts.map((a) => [a.id, a]));
  const rows: Omit<BaseRow, 'receives'>[] = state.survey.accounts.map((entry) => {
    const id = plan.accountKeys[entry.key] ?? '';
    const planned = byId.get(id);
    const becomes = {
      id,
      name: planned?.name ?? entry.proposedName,
      kind: planned?.kind ?? entry.proposedKind,
      currency: planned?.currency ?? entry.currency,
    };
    const ontoExisting = Boolean(planned?.existingId);
    const mergedInto =
      !ontoExisting && becomes.name !== entry.proposedName ? becomes.name : undefined;
    return {
      key: entry.key,
      entry,
      becomes,
      state: ontoExisting ? 'merged-existing' : mergedInto ? 'merged-entry' : 'new',
      kindOverridden: state.decisions.accountKinds?.[entry.key] !== undefined,
      ...(ontoExisting ? { ontoExisting: true } : {}),
      ...(mergedInto ? { mergedInto } : {}),
      ...(rejections.has(entry.key) ? { rejection: rejections.get(entry.key)! } : {}),
    };
  });
  // A merge is two facts and the owner may be looking at either end of it, so the receiving row
  // names what it takes in. Only a row that is itself becoming a рахунок receives anything: when
  // the target is a рахунок the owner already has, the thing receiving is not on this screen.
  return rows.map((row) => ({
    ...row,
    receives:
      row.state === 'new'
        ? rows
            .filter(
              (other) =>
                other.key !== row.key &&
                other.state !== 'new' &&
                other.becomes.id === row.becomes.id,
            )
            .map((other) => other.entry.saldoAccount)
        : [],
  }));
}

export function accountRows(state: FlowState): AccountRow[] {
  const hints = duplicateHints(state);
  return baseRows(state).map((row) => {
    const hint = hints.get(row.key);
    return hint ? { ...row, duplicateHint: hint } : row;
  });
}

/** One offer in the «Об’єднати з» list: what the owner reads, and what a tap sends back. */
export interface MergeTarget {
  /** The encoded redirect — `entry:<key>` or `account:<id>`, decoded by `targetOf`. */
  readonly id: string;
  /** What the owner reads: the назва with its currency, and «наявний» when it is one. */
  readonly name: string;
}

/**
 * The way back out of a merge, offered from inside the list as well as from the row.
 *
 * **It is deliberately not an element of `mergeTargets`.** Inside the list, `narrow` would delete
 * it the moment the owner typed anything — typing «mono» would take away the only way out — and it
 * would count toward `PICKER_SIZE`, so five real targets plus it would raise a search field over a
 * five-item list. So it stands on its own, above the list, drawn unconditionally.
 */
export const SEPARATE_TARGET: MergeTarget = {
  id: 'separate',
  name: 'Створити окремий рахунок',
};

/** What the open targets say for a currency with nothing in it to merge with. */
export function noTargetsMessage(currency: string): string {
  return `Немає рахунків у валюті ${currency}, з якими можна об’єднати`;
}

/** One рахунок an entry could be merged onto, before it is either ranked or drawn. */
interface Candidate {
  readonly id: string;
  /** The bare назва: what a likeness is measured against, and what a підказка про дубль names. */
  readonly accountName: string;
  /** The same рахунок as the owner reads it in a list — the назва with its currency. */
  readonly label: string;
}

/** The account map reduced to what deciding a merge needs, so the same rules serve both halves. */
interface MapEntry {
  readonly key: string;
  /** The entry's own назва from the export — invariant, and what a likeness is measured *from*. */
  readonly saldoAccount: string;
  readonly currency: string;
  /** What it is called when it is somebody else's target: its own name, or the one it merged onto. */
  readonly becomesName: string;
  readonly mergedAway: boolean;
}

const mapEntriesOf = (rows: readonly Omit<BaseRow, 'receives'>[]): MapEntry[] =>
  rows.map((row) => ({
    key: row.key,
    saldoAccount: row.entry.saldoAccount,
    currency: row.entry.currency,
    becomesName: row.becomes.name,
    mergedAway: row.state !== 'new',
  }));

/** The map as the export left it, before a single decision — what the grouping is decided from. */
const pristineEntries = (state: FlowState): MapEntry[] =>
  (state.survey?.accounts ?? []).map((entry) => ({
    key: entry.key,
    saldoAccount: entry.saldoAccount,
    currency: entry.currency,
    becomesName: entry.proposedName,
    mergedAway: false,
  }));

/**
 * Everything one entry could legally be merged onto, most alike first.
 *
 * Four filters, and each is a promise the requirement makes rather than a convenience: the row
 * itself is out; an entry that is itself merging away is out, because merging onto it would build a
 * chain no row displays; an archived рахунок is out, for the reason every other picker leaves them
 * out — an archived рахунок takes no new money; and **another currency is out**, because the import
 * refuses such a merge, and an offer that exists to be refused is not an offer.
 *
 * Then the order: by how much each name resembles the entry's own, descending, stably — so every
 * tie keeps the order it already had, the entries in the export's order and then the рахунки the
 * owner keeps. On a list of seventeen, most pairs are ties, and a list that reshuffles is a list
 * the owner has to re-read.
 */
function candidatesFor(
  entries: readonly MapEntry[],
  existing: ExistingState,
  key: string,
): Candidate[] {
  const self = entries.find((entry) => entry.key === key);
  if (!self) {
    return [];
  }
  const offered: Candidate[] = [
    ...entries
      .filter((entry) => entry.key !== key && !entry.mergedAway && entry.currency === self.currency)
      .map((entry) => ({
        id: `entry:${entry.key}`,
        accountName: entry.becomesName,
        label: accountChoiceLabel({
          name: entry.becomesName,
          currency: entry.currency,
        }),
      })),
    ...existing.accounts
      .filter((account) => !account.archived && account.currency === self.currency)
      .map((account) => ({
        id: `account:${account.id}`,
        accountName: account.name,
        label: `${accountChoiceLabel(account)} — наявний`,
      })),
  ];
  return offered
    .map((candidate) => ({
      candidate,
      score: similarity(self.saldoAccount, candidate.accountName),
    }))
    .sort((a, b) => b.score - a.score)
    .map((scored) => scored.candidate);
}

/**
 * The рахунки one entry may be merged onto, by name and in order.
 *
 * It lives here and not in the screen because it is the whole of the requirement — which рахунки
 * are offered, how each is named and which comes first — and `verify` never runs a screen.
 */
export function mergeTargets(state: FlowState, key: string): MergeTarget[] {
  return candidatesFor(mapEntriesOf(baseRows(state)), state.existing, key).map((candidate) => ({
    id: candidate.id,
    name: candidate.label,
  }));
}

/**
 * The one sentence a row may state about another рахунок: «Схоже, це той самий рахунок → «…»».
 *
 * `id` is the merge target the sentence names, encoded exactly as `mergeTargets` encodes it, so
 * taking the підказка is literally the redirect a pick from the list would have sent. `name` is the
 * bare назва the sentence reads out — not the list's label, which carries the currency too.
 */
export interface DuplicateHint {
  readonly id: string;
  readonly name: string;
}

/**
 * Which rows would carry a підказка про дубль over a given map, before anything is dismissed.
 *
 * A підказка may name only a рахунок that row's own merge targets would offer. Without that, the
 * promise "taking it applies exactly the redirect the owner could have made through the targets"
 * breaks in two concrete ways: an archived рахунок would be named and then refused, and an entry
 * that has since merged onto a third рахунок would send the redirect down a chain the engine
 * follows to its far end, leaving the row stating a рахунок the підказка never named.
 *
 * **Exactly one candidate, or none.** A guess between two is not a підказка.
 *
 * **One pair, one підказка.** When two entries qualify for each other, the later of them in the
 * map's order carries the line and points at the earlier. Otherwise the same pair is offered twice,
 * and the second offer goes stale the moment the first is taken. Later→earlier is a coin toss with
 * one thin argument — the earlier entry is the one the export met first, so it is marginally more
 * likely to be the longer-lived рахунок, and the surviving рахунок takes the target's name. It is
 * undoable in the selector and renameable afterwards; it is written down so it is recognised as a
 * decision rather than rediscovered as a defect.
 */
function hintsOver(
  entries: readonly MapEntry[],
  existing: ExistingState,
): Map<string, DuplicateHint> {
  const stated = new Map<string, DuplicateHint>();
  for (const entry of entries) {
    const qualifying = candidatesFor(entries, existing, entry.key).filter((candidate) =>
      looksLikeSameAccount(entry.saldoAccount, candidate.accountName),
    );
    const only = qualifying.length === 1 ? qualifying[0]! : undefined;
    if (only) {
      stated.set(entry.key, { id: only.id, name: only.accountName });
    }
  }

  const order = new Map(entries.map((entry, index) => [entry.key, index]));
  for (const [key, hint] of [...stated]) {
    if (!hint.id.startsWith('entry:')) {
      continue;
    }
    const other = hint.id.slice('entry:'.length);
    if (stated.get(other)?.id === `entry:${key}` && order.get(key)! < order.get(other)!) {
      stated.delete(key);
    }
  }
  return stated;
}

/**
 * The підказки the flow states right now, by row.
 *
 * Two things are being kept apart here, and the split is the whole of §D7/§D11. **Which rows are
 * grouped** is static — `mapSections` computes it from the export and the owner's рахунки alone, so
 * nothing moves under a finger. **Whether a row still states its підказка** is dynamic: it stops
 * once that row is merged, once the рахунок it names is merged away (it leaves the candidates, so
 * the sentence is simply not recomputed), or once the owner dismisses it. A row whose підказка is
 * gone stays in its group, saying what it now is.
 */
export function duplicateHints(state: FlowState): ReadonlyMap<string, DuplicateHint> {
  const rows = baseRows(state);
  const stated = hintsOver(mapEntriesOf(rows), state.existing);
  const shown = new Map<string, DuplicateHint>();
  for (const row of rows) {
    const hint = stated.get(row.key);
    if (hint && row.state === 'new' && !state.dismissedHints.includes(row.key)) {
      shown.set(row.key, hint);
    }
  }
  return shown;
}

/**
 * The row's one line of what will happen to it, in the owner's words.
 *
 * Here rather than in the screen for the reason `mapSummary` and `noTargetsMessage` are here: it is
 * a sentence the owner reads, the requirement is about what it says, and `verify` never runs JSX.
 * Three states and no fourth — `AccountRow.state` names them, so nothing downstream can invent one
 * out of three optional fields the way the old screen's nested ternary did.
 */
export function stateLine(row: AccountRow): string {
  if (row.state === 'merged-existing') {
    return `Додається до наявного «${row.becomes.name}»`;
  }
  return row.state === 'merged-entry' ? `Об’єднується з «${row.mergedInto}»` : 'Новий рахунок';
}

/** What a receiving row says it takes in, or nothing when it takes in nothing. */
export function receivesLine(row: AccountRow): string | undefined {
  return row.receives.length === 0
    ? undefined
    : `Приймає: ${row.receives.map((name) => `«${name}»`).join(', ')}`;
}

/**
 * The two groups the map is drawn in: the rows that carried a підказка про дубль **when the export
 * was read**, and everything else.
 *
 * Membership is computed from the survey and the owner's рахунки only — never from the decisions
 * and never from the dismissals — so merging, undoing and dismissing move no row. Recomputing it as
 * decisions change would empty the first group as the owner works, which reads as rows vanishing.
 */
export interface MapSections {
  readonly duplicates: readonly AccountRow[];
  readonly rest: readonly AccountRow[];
}

export function mapSections(state: FlowState): MapSections {
  const grouped = hintsOver(pristineEntries(state), state.existing);
  const rows = accountRows(state);
  return {
    duplicates: rows.filter((row) => grouped.has(row.key)),
    rest: rows.filter((row) => !grouped.has(row.key)),
  };
}

/**
 * The line the step opens with: what the export holds, how much of it wants a second look, and that
 * the rest needs nothing. It is worded so it stays true after the owner has answered — «схожі на
 * дублі» is what the export looked like, not what is still outstanding — because its counts are the
 * static ones and must not move under the owner's eye.
 */
export interface MapSummary {
  readonly accounts: number;
  readonly duplicates: number;
  readonly sentence: string;
}

export function mapSummary(state: FlowState): MapSummary {
  const sections = mapSections(state);
  const accounts = sections.duplicates.length + sections.rest.length;
  const duplicates = sections.duplicates.length;
  const found = `${accountCount(accounts)} з Saldo.`;
  // «дубль» is the object of «на» and stays in the accusative plural at every count above one —
  // only «схожий» declines with the number. «13 схожих на дублів» was what declining both read as.
  const one = duplicates === 1;
  const alike = one ? 'дубль' : 'дублі';
  const them = one ? 'його' : 'їх';
  return {
    accounts,
    duplicates,
    sentence:
      duplicates === 0
        ? `${found} Дублів не видно — усі буде створено окремо.`
        : // Nothing is promised about a rest that does not exist: with every row in the first
          // group, «решту буде створено окремо» is a sentence the section below it contradicts.
          duplicates === accounts
          ? `${found} ${one ? 'Він схожий' : 'Усі схожі'} на ${alike} — перевірте ${them}.`
          : `${found} ${duplicates} ${plural(duplicates, 'схожий', 'схожі', 'схожих')} ` +
            `на ${alike} — перевірте ${them}; решту буде створено окремо.`,
  };
}

/**
 * The value a merge choice carries back, decoded. Three kinds of answer live in one list, and the
 * prefix is what keeps them apart: «an entry of this import» and «a рахунок the owner already has»
 * are indistinguishable by name and very different decisions, and `SEPARATE_TARGET` is not a
 * рахунок at all — it decodes to no redirect, which is exactly what `redirectAccount` already means
 * when it is passed nothing. Encoded by `candidatesFor` above, so the pair is read and proven
 * together.
 */
export function targetOf(value: string): AccountRedirect | undefined {
  if (value === SEPARATE_TARGET.id) {
    return undefined;
  }
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

/**
 * The two sentences the import states its counts in — what the commit would write, and what it
 * wrote. They live here rather than in the screen because `verify` never runs JSX: a sentence
 * built inside `saldo-import.tsx` is a sentence nothing proves, which is how «2 рахунків» reached
 * the emulator.
 *
 * Two functions and not one, because the two summaries count different things: the plan states the
 * рахунки it would **create** (`newAccounts`), the result states the рахунки it wrote. Collapsing
 * them would move that translation to the caller, which is where a wrong number would enter.
 */
export function planLine(summary: PlanSummary): string {
  return `Буде записано: ${counts(summary.transactions, summary.newAccounts, summary.categories, summary.sources)}.`;
}

export function writtenLine(summary: CommitSummary): string {
  return `Записано: ${counts(summary.transactions, summary.accounts, summary.categories, summary.sources)}.`;
}

function counts(
  transactions: number,
  accounts: number,
  categories: number,
  sources: number,
): string {
  return [
    transactionCount(transactions),
    accountCount(accounts),
    categoryCount(categories),
    sourceCount(sources),
  ].join(', ');
}
