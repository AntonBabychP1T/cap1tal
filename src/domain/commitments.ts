import { foldCase } from './fold';
import {
  AUTO_LINK_WINDOW_DAYS,
  HAND_LINK_WINDOW_DAYS,
  addDays,
  dayOffset,
  daysApart,
  monthsAfter,
  recordedBefore,
  type DebitCandidate,
} from './installments';
import { MAX_AMOUNT_MINOR, money, type Money } from './money';
import { UNCATEGORISED_CATEGORY_ID, isoDate, monthOf, type IsoDate, type Month } from './transaction';

/**
 * Зобов'язання (glossary, «Зобов'язання») — payments the owner already knows will recur: оренда,
 * інтернет, мобільний, підписки, страхування. Like a розстрочка it is a **plan** the owner enters
 * by hand (commitments design D1): it records, moves and counts no money. Each платіж reaches the
 * app as the ordinary витрата of its day, and this module says which витрата is which платіж, what
 * state each платіж is in, and what the current month still owes — «Вільно після зобов'язань».
 *
 * Names (design D0): зобов'язання = `Commitment`; its платіж = `CommitmentDue` (a dated amount owed —
 * `Payment` is a forbidden synonym, and "part" stays the розстрочка's, whose платіж really is a part
 * of a whole); періодичність = `Periodicity`; ознака = `marker`; пропущено = `skipped`; дата
 * припинення = `stoppedOn`.
 *
 * The month arithmetic, the windows and the tie-break are the розстрочка's, imported rather than
 * copied (design D2). Every function is pure: no clock, `today` passed in. Sums are integer minor
 * units of the зобов'язання's own currency — the currency of its рахунок списання — never converted.
 */

/** «щомісяця» · «щокварталу» · «щопівроку» · «щороку». */
export type Periodicity = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly';

export const PERIODICITIES: readonly Periodicity[] = ['monthly', 'quarterly', 'halfYearly', 'yearly'];

/** How many calendar months lie between two платежі. */
export const PERIOD_MONTHS: Readonly<Record<Periodicity, number>> = {
  monthly: 1,
  quarterly: 3,
  halfYearly: 6,
  yearly: 12,
};

/** The shortest ознака: «uber» is wide enough already; two letters would catch almost anything. */
export const MIN_MARKER_LENGTH = 3;

/** The owner's facts about one зобов'язання — the only things stored (design D1). */
export interface Commitment {
  readonly id: string;
  /** What is paid for. */
  readonly name: string;
  /** The сума of one платіж, minor units of `currency`. */
  readonly amount: number;
  /** The currency of the рахунок списання. */
  readonly currency: string;
  readonly periodicity: Periodicity;
  /** The дата першого платежу. */
  readonly firstDue: IsoDate;
  /** The рахунок списання, of any currency. */
  readonly debitAccountId: string;
  /** The категорія a linked витрата «Без категорії» takes; absent means none. */
  readonly categoryId?: string;
  /** The ознака, trimmed; absent means none — then only the exact сума is recognised. */
  readonly marker?: string;
  /** The moment it was recorded — the tie-break between two plans' платежі of one дата. */
  readonly recordedAt: number;
  /** The дата припинення, once stopped: no платіж exists after it. */
  readonly stoppedOn?: IsoDate;
}

/** A платіж linked to its списання. */
export interface CommitmentDueLink {
  readonly commitmentId: string;
  readonly number: number;
  readonly transactionId: string;
}

/** сплачено without a списання, or пропущено — the owner's word, one per платіж. */
export type CommitmentMarkKind = 'paid' | 'skipped';

export interface CommitmentDueMark {
  readonly commitmentId: string;
  readonly number: number;
  readonly kind: CommitmentMarkKind;
}

/** A транзакція the owner unlinked from a платіж: the app never links the two again by itself. */
export interface CommitmentRefusal {
  readonly commitmentId: string;
  readonly number: number;
  readonly transactionId: string;
}

/** Everything stored per платіж — what cannot be derived from the зобов'язання itself. */
export interface CommitmentFacts {
  readonly links: readonly CommitmentDueLink[];
  readonly marks: readonly CommitmentDueMark[];
  readonly refusals: readonly CommitmentRefusal[];
}

export const NO_COMMITMENT_FACTS: CommitmentFacts = { links: [], marks: [], refusals: [] };

// ---------------------------------------------------------------------------------------------
// Refusals

/** What the owner typed, before it is a stored зобов'язання. */
export interface CommitmentInput {
  readonly name: string;
  readonly amount: number;
  readonly periodicity: string;
  readonly firstDue: IsoDate;
  readonly debitAccountId: string;
  readonly categoryId?: string;
  readonly marker?: string;
  /**
   * The currency the сума is in, where the caller states one — storage and the бекап do; the form
   * takes the рахунок's own and leaves it out. It must be the рахунок списання's.
   */
  readonly currency?: string;
}

/** What the refusal needs to know of the world around the input. */
export interface CommitmentRefusalContext {
  /** The chosen рахунок списання; absent when none is chosen or it does not exist. */
  readonly account?: { readonly name: string; readonly currency: string; readonly archived: boolean };
  /** The chosen категорія; absent when none is chosen or it does not exist. */
  readonly category?: { readonly name: string; readonly archived: boolean };
  /**
   * The stored зобов'язання being edited, where it is one. An archived рахунок or категорія is
   * refused only when it is *chosen* — at creation, or by changing to it — so a зобов'язання whose
   * card was archived after it was recorded can still be edited (and restored from a бекап).
   */
  readonly existing?: { readonly debitAccountId: string; readonly categoryId?: string };
}

export type CommitmentField =
  | 'name'
  | 'amount'
  | 'periodicity'
  | 'firstDue'
  | 'debitAccount'
  | 'category'
  | 'marker';

export interface CommitmentProblem {
  readonly field: CommitmentField;
  /** Ukrainian, naming the value it concerns. */
  readonly message: string;
}

/** The ознака as stored: trimmed, and none when nothing is left. */
export function normaliseMarker(marker: string | undefined): string | undefined {
  const trimmed = marker?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

export function isPeriodicity(value: string): value is Periodicity {
  return (PERIODICITIES as readonly string[]).includes(value);
}

function isIsoDate(value: string): boolean {
  try {
    isoDate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every refusal the input meets, one per field at most, in the order the form asks (commitments,
 * "A зобов'язання holds what is paid, how often and from where"). The form shows each beside its
 * field; storage and the бекап refuse on the first.
 */
export function commitmentProblems(
  input: CommitmentInput,
  context: CommitmentRefusalContext,
): CommitmentProblem[] {
  const problems: CommitmentProblem[] = [];
  if (input.name.trim() === '') {
    problems.push({ field: 'name', message: 'Назвіть, за що цей платіж.' });
  }
  const account = context.account;
  if (!(Number.isInteger(input.amount) && input.amount >= 1 && input.amount <= MAX_AMOUNT_MINOR)) {
    problems.push({
      field: 'amount',
      message:
        Number.isInteger(input.amount) && input.amount > MAX_AMOUNT_MINOR
          ? 'Сума завелика.'
          : 'Сума має бути більшою за нуль.',
    });
  } else if (input.currency !== undefined && account !== undefined && input.currency !== account.currency) {
    problems.push({
      field: 'amount',
      message: `Сума має бути у валюті рахунку списання «${account.name}» (${account.currency}).`,
    });
  }
  if (!isPeriodicity(input.periodicity)) {
    problems.push({ field: 'periodicity', message: 'Оберіть, як часто списується платіж.' });
  }
  if (!isIsoDate(input.firstDue)) {
    problems.push({ field: 'firstDue', message: 'Вкажіть дату першого платежу.' });
  }
  if (input.debitAccountId === '' || account === undefined) {
    problems.push({ field: 'debitAccount', message: 'Оберіть рахунок списання.' });
  } else if (account.archived && context.existing?.debitAccountId !== input.debitAccountId) {
    problems.push({
      field: 'debitAccount',
      message: `Рахунок «${account.name}» в архіві — оберіть інший рахунок списання.`,
    });
  }
  if (input.categoryId !== undefined) {
    const category = context.category;
    if (category === undefined) {
      problems.push({ field: 'category', message: 'Такої категорії немає.' });
    } else if (category.archived && context.existing?.categoryId !== input.categoryId) {
      problems.push({
        field: 'category',
        message: `Категорія «${category.name}» в архіві — оберіть іншу.`,
      });
    }
  }
  const marker = normaliseMarker(input.marker);
  if (marker !== undefined && [...marker].length < MIN_MARKER_LENGTH) {
    problems.push({
      field: 'marker',
      message: `Текст в описі списання — щонайменше ${MIN_MARKER_LENGTH} символи.`,
    });
  }
  return problems;
}

/** The first refusal the input meets, or `undefined` when it may be stored. */
export function commitmentRefusal(
  input: CommitmentInput,
  context: CommitmentRefusalContext,
): CommitmentProblem | undefined {
  return commitmentProblems(input, context)[0];
}

// ---------------------------------------------------------------------------------------------
// The графік

export interface ScheduledDue {
  readonly number: number;
  readonly due: IsoDate;
}

/**
 * The дата of платіж `number` (commitments, "The графік places a платіж every period on the day of
 * the first"): (number − 1) × 1, 3, 6 or 12 months after the first, on its day — the month's last
 * day where that day does not exist, and back to the original day after. Whether the платіж exists
 * — after the дата припинення it does not — is `commitmentSchedule`'s question.
 */
export function commitmentDueDate(
  commitment: Pick<Commitment, 'firstDue' | 'periodicity'>,
  number: number,
): IsoDate {
  return monthsAfter(commitment.firstDue, (number - 1) * PERIOD_MONTHS[commitment.periodicity]);
}

/**
 * Every платіж from the first up to `until` and, once stopped, up to the дата припинення — both
 * inclusive. The графік itself has no end (design D1): the caller bounds it by what it reads.
 */
export function commitmentSchedule(
  commitment: Pick<Commitment, 'firstDue' | 'periodicity' | 'stoppedOn'>,
  until: IsoDate,
): ScheduledDue[] {
  const bound =
    commitment.stoppedOn !== undefined && commitment.stoppedOn < until ? commitment.stoppedOn : until;
  const dues: ScheduledDue[] = [];
  for (let number = 1; ; number++) {
    const due = commitmentDueDate(commitment, number);
    if (due > bound) {
      return dues;
    }
    dues.push({ number, due });
  }
}

/** Whether платіж `number` exists: it is not before the first and not after the дата припинення. */
export function dueExists(
  commitment: Pick<Commitment, 'firstDue' | 'periodicity' | 'stoppedOn'>,
  number: number,
): boolean {
  return (
    Number.isInteger(number) &&
    number >= 1 &&
    (commitment.stoppedOn === undefined || commitmentDueDate(commitment, number) <= commitment.stoppedOn)
  );
}

/**
 * The дата of the first платіж after `date`, the графік taken as endless — the bound a reader passes
 * to show "every платіж up to today and the next one" (design D1). Stepped through the графік rather
 * than `date` plus one period, which would miss the 31st after a 28th.
 */
export function firstDueAfter(
  commitment: Pick<Commitment, 'firstDue' | 'periodicity'>,
  date: IsoDate,
): IsoDate {
  for (let number = 1; ; number++) {
    const due = commitmentDueDate(commitment, number);
    if (due > date) {
      return due;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// States

/** сплачено · пропущено · очікується · списання не знайдено. */
export type CommitmentDueStateKind = 'paid' | 'skipped' | 'expected' | 'notFound';

/** Why a платіж is сплачено: its списання, or the owner's mark. */
export type CommitmentPaidReason = 'debit' | 'marked';

export interface CommitmentDue extends ScheduledDue {
  /** The scheduled сума: always the зобов'язання's current сума, in its currency. */
  readonly amount: number;
  readonly currency: string;
  readonly state: CommitmentDueStateKind;
  readonly reason?: CommitmentPaidReason;
  /** The списання, for a платіж linked to one. */
  readonly transactionId?: string;
}

function factsOf(commitmentId: string, facts: CommitmentFacts) {
  const links = new Map<number, string>();
  for (const link of facts.links) {
    if (link.commitmentId === commitmentId) {
      links.set(link.number, link.transactionId);
    }
  }
  const marks = new Map<number, CommitmentMarkKind>();
  for (const mark of facts.marks) {
    if (mark.commitmentId === commitmentId) {
      marks.set(mark.number, mark.kind);
    }
  }
  return { links, marks };
}

function openState(due: IsoDate, today: IsoDate): CommitmentDueStateKind {
  return dayOffset(due, today) > AUTO_LINK_WINDOW_DAYS ? 'notFound' : 'expected';
}

/**
 * Every платіж up to `until` in exactly one state against `today` (commitments, "Every платіж of a
 * зобов'язання is in exactly one state"), first first.
 */
export function commitmentDues(
  commitment: Commitment,
  facts: CommitmentFacts,
  bounds: { readonly until: IsoDate; readonly today: IsoDate },
): CommitmentDue[] {
  const { links, marks } = factsOf(commitment.id, facts);
  return commitmentSchedule(commitment, bounds.until).map((scheduled): CommitmentDue => {
    const base = { ...scheduled, amount: commitment.amount, currency: commitment.currency };
    const transactionId = links.get(scheduled.number);
    if (transactionId !== undefined) {
      return { ...base, state: 'paid', reason: 'debit', transactionId };
    }
    const mark = marks.get(scheduled.number);
    if (mark === 'paid') {
      return { ...base, state: 'paid', reason: 'marked' };
    }
    if (mark === 'skipped') {
      return { ...base, state: 'skipped' };
    }
    return { ...base, state: openState(scheduled.due, bounds.today) };
  });
}

/** Still owed: neither сплачено nor пропущено. */
export function isOpenDue(due: Pick<CommitmentDue, 'state'>): boolean {
  return due.state === 'expected' || due.state === 'notFound';
}

/**
 * The найближчий платіж — the earliest that is очікується or списання не знайдено — which orders
 * the list (commitments-screen, "Зобов'язання opens on the active ones, nearest платіж first").
 */
export function nearestDue(dues: readonly CommitmentDue[]): CommitmentDue | undefined {
  let nearest: CommitmentDue | undefined;
  for (const due of dues) {
    if (isOpenDue(due) && (nearest === undefined || due.due < nearest.due)) {
      nearest = due;
    }
  }
  return nearest;
}

// ---------------------------------------------------------------------------------------------
// Linking

/** A витрата on the рахунок списання in the зобов'язання's currency — the only kind a списання is. */
export function isCommitmentDebitOn(
  candidate: DebitCandidate,
  commitment: Pick<Commitment, 'debitAccountId' | 'currency'>,
): boolean {
  return (
    candidate.type === 'expense' &&
    candidate.accountId === commitment.debitAccountId &&
    candidate.amount?.currency === commitment.currency
  );
}

/**
 * Whether a витрата is recognised as this зобов'язання's списання by the app (commitments, "A
 * платіж of a зобов'язання is linked to its списання by the app"): with an ознака, its опис holds
 * it, letters compared without regard to case, whatever the сума; without one, its сума is exactly
 * the зобов'язання's.
 */
export function recognisedAs(
  candidate: DebitCandidate,
  commitment: Pick<Commitment, 'amount' | 'marker'>,
): boolean {
  const marker = normaliseMarker(commitment.marker);
  return marker !== undefined
    ? foldCase(candidate.description ?? '').includes(foldCase(marker))
    : candidate.amount?.amount === commitment.amount;
}

/**
 * Whether a link still stands: its платіж exists, and its транзакція is still a витрата on the
 * рахунок списання in its currency, no more than ten days from that платіж's дата. The one
 * statement of the rule — the linking and an edit in storage both ask it.
 */
export function commitmentLinkStands(
  commitment: Commitment,
  number: number,
  transaction: DebitCandidate | undefined,
): boolean {
  return (
    dueExists(commitment, number) &&
    transaction !== undefined &&
    isCommitmentDebitOn(transaction, commitment) &&
    daysApart(commitmentDueDate(commitment, number), transaction.date) <= HAND_LINK_WINDOW_DAYS
  );
}

export interface CommitmentMatch {
  readonly link: readonly CommitmentDueLink[];
  readonly drop: readonly { readonly commitmentId: string; readonly number: number }[];
  readonly categorise: readonly { readonly transactionId: string; readonly categoryId: string }[];
}

/** The last day a платіж may fall on for the app to link it: no candidate is dated past today. */
export function linkHorizon(today: IsoDate): IsoDate {
  return addDays(today, AUTO_LINK_WINDOW_DAYS);
}

/**
 * Which платежі take which списання (commitments, "A платіж of a зобов'язання is linked to its
 * списання by the app"; "The owner corrects what the app linked to a зобов'язання"; design D3, D4).
 *
 * - `drop`: links whose транзакція is gone from `transactions`, is no longer a витрата on the
 *   рахунок списання in its currency, lies more than ten days from its платіж's дата, or whose
 *   платіж no longer exists. Marks and refusals are not the matcher's: storage drops them at the
 *   moment of an edit or a stop (`factsDroppedByEdit`, `factsDroppedByStop`).
 * - `link`: open платежі — of stopped зобов'язання too, up to the stop — served by (дата,
 *   recordedAt, number), each taking the nearest recognised candidate within three days, ties by
 *   the one stored first, skipping refused pairs, транзакції a kept link holds, and
 *   `takenByInstallments` — the розстрочки are served first, in the same pass.
 * - `categorise`: only among the **new** links, the витрати «Без категорії» of a зобов'язання with a
 *   категорія — an existing link is never re-categorised, so the owner's later choice stands.
 *
 * `transactions` holds every транзакція already linked plus every candidate; a linked id absent
 * from it was removed.
 */
export function matchCommitmentDebits(input: {
  readonly commitments: readonly Commitment[];
  readonly facts: CommitmentFacts;
  readonly transactions: readonly DebitCandidate[];
  readonly takenByInstallments?: ReadonlySet<string>;
  readonly today: IsoDate;
}): CommitmentMatch {
  const byId = new Map(input.transactions.map((t) => [t.id, t]));
  const commitmentsById = new Map(input.commitments.map((c) => [c.id, c]));

  const drop: { commitmentId: string; number: number }[] = [];
  const keptLinks: CommitmentDueLink[] = [];
  for (const link of input.facts.links) {
    const commitment = commitmentsById.get(link.commitmentId);
    if (commitment !== undefined && commitmentLinkStands(commitment, link.number, byId.get(link.transactionId))) {
      keptLinks.push(link);
    } else {
      drop.push({ commitmentId: link.commitmentId, number: link.number });
    }
  }

  const factsAfterDrops: CommitmentFacts = { ...input.facts, links: keptLinks };
  const taken = new Set([
    ...keptLinks.map((link) => link.transactionId),
    ...(input.takenByInstallments ?? []),
  ]);
  const refused = new Set(
    input.facts.refusals.map((r) => `${r.commitmentId}|${r.number}|${r.transactionId}`),
  );

  const until = linkHorizon(input.today);
  const open: { commitment: Commitment; due: CommitmentDue }[] = [];
  for (const commitment of input.commitments) {
    for (const due of commitmentDues(commitment, factsAfterDrops, { until, today: input.today })) {
      if (isOpenDue(due)) {
        open.push({ commitment, due });
      }
    }
  }
  open.sort(
    (a, b) =>
      a.due.due.localeCompare(b.due.due) ||
      a.commitment.recordedAt - b.commitment.recordedAt ||
      a.commitment.id.localeCompare(b.commitment.id) ||
      a.due.number - b.due.number,
  );

  const link: CommitmentDueLink[] = [];
  const categorise: { transactionId: string; categoryId: string }[] = [];
  for (const { commitment, due } of open) {
    let best: { candidate: DebitCandidate; distance: number } | undefined;
    for (const candidate of input.transactions) {
      if (
        taken.has(candidate.id) ||
        !isCommitmentDebitOn(candidate, commitment) ||
        !recognisedAs(candidate, commitment) ||
        refused.has(`${commitment.id}|${due.number}|${candidate.id}`)
      ) {
        continue;
      }
      const distance = daysApart(due.due, candidate.date);
      if (distance > AUTO_LINK_WINDOW_DAYS) {
        continue;
      }
      if (
        best === undefined ||
        distance < best.distance ||
        (distance === best.distance && recordedBefore(candidate, best.candidate))
      ) {
        best = { candidate, distance };
      }
    }
    if (best === undefined) {
      continue;
    }
    taken.add(best.candidate.id);
    link.push({ commitmentId: commitment.id, number: due.number, transactionId: best.candidate.id });
    if (commitment.categoryId !== undefined && best.candidate.categoryId === UNCATEGORISED_CATEGORY_ID) {
      categorise.push({ transactionId: best.candidate.id, categoryId: commitment.categoryId });
    }
  }
  return { link, drop, categorise };
}

// ---------------------------------------------------------------------------------------------
// What an edit or a stop takes with it

function ofCommitment(facts: CommitmentFacts, commitmentId: string): CommitmentFacts {
  return {
    links: facts.links.filter((f) => f.commitmentId === commitmentId),
    marks: facts.marks.filter((f) => f.commitmentId === commitmentId),
    refusals: facts.refusals.filter((f) => f.commitmentId === commitmentId),
  };
}

/**
 * The marks and refusals an edit takes away (commitments, "A зобов'язання can be edited, stopped,
 * resumed and deleted"): those of every платіж whose дата the edit moves by more than ten days — a
 * new first дата, a new періодичність. Links are not here: whether one stands after an edit is
 * `commitmentLinkStands` against the edited зобов'язання. What falls after the дата припинення of
 * the edited графік is `factsDroppedByStop`'s, applied in the same write.
 */
export function factsDroppedByEdit(
  before: Pick<Commitment, 'firstDue' | 'periodicity'>,
  after: Pick<Commitment, 'id' | 'firstDue' | 'periodicity'>,
  facts: CommitmentFacts,
): CommitmentFacts {
  const mine = ofCommitment(facts, after.id);
  const moved = (number: number) =>
    daysApart(commitmentDueDate(before, number), commitmentDueDate(after, number)) > HAND_LINK_WINDOW_DAYS;
  return {
    links: [],
    marks: mine.marks.filter((mark) => moved(mark.number)),
    refusals: mine.refusals.filter((refusal) => moved(refusal.number)),
  };
}

/**
 * Every link, mark and refusal of a платіж dated after `stoppedOn` — what a stop removes, so that a
 * resume brings those платежі back as their дати give them, with nothing said about them.
 */
export function factsDroppedByStop(
  commitment: Pick<Commitment, 'id' | 'firstDue' | 'periodicity'>,
  stoppedOn: IsoDate,
  facts: CommitmentFacts,
): CommitmentFacts {
  const mine = ofCommitment(facts, commitment.id);
  const after = (number: number) => commitmentDueDate(commitment, number) > stoppedOn;
  return {
    links: mine.links.filter((link) => after(link.number)),
    marks: mine.marks.filter((mark) => after(mark.number)),
    refusals: mine.refusals.filter((refusal) => after(refusal.number)),
  };
}

// ---------------------------------------------------------------------------------------------
// Вільно після зобов'язань

/** A платіж of either plan, as the month's reading counts it. */
export interface OwedDue {
  readonly due: IsoDate;
  readonly amount: number;
  readonly currency: string;
  readonly state: string;
}

/**
 * The сума of the month's платежі still owed — очікується or списання не знайдено — per currency.
 * Сплачено is already inside залишилось as its витрата; пропущено and закрито are owed by no one.
 */
export function owedByCurrency(dues: readonly OwedDue[], month: Month): Map<string, number> {
  const owed = new Map<string, number>();
  for (const due of dues) {
    if (monthOf(due.due) === month && (due.state === 'expected' || due.state === 'notFound')) {
      owed.set(due.currency, (owed.get(due.currency) ?? 0) + due.amount);
    }
  }
  return owed;
}

/**
 * «Вільно після зобов'язань» (commitments, "Вільно після зобов'язань is залишилось less what this
 * month still owes"): per currency, that currency's залишилось less every платіж of the current
 * month still owed. **The owed map holds the розстрочки' платежі too**: a розстрочка is not a
 * зобов'язання, but its платежі are as promised as any, and the reading's name is the owner's
 * (glossary, «Вільно після зобов'язань»).
 *
 * Empty for any month but today's. A currency appears only where the month has a залишилось in it
 * and owes a non-zero сума in it; nothing is converted or added across currencies.
 */
export function freeAfterCommitments(
  leftByCurrency: ReadonlyMap<string, Money>,
  owed: ReadonlyMap<string, number>,
  month: Month,
  today: IsoDate,
): Map<string, Money> {
  const free = new Map<string, Money>();
  if (monthOf(today) !== month) {
    return free;
  }
  for (const [currency, sum] of owed) {
    const left = leftByCurrency.get(currency);
    if (sum !== 0 && left !== undefined && left.currency === currency) {
      free.set(currency, money(left.amount - sum, currency));
    }
  }
  return free;
}
