import { MAX_AMOUNT_MINOR, type Money } from './money';
import {
  UNCATEGORISED_CATEGORY_ID,
  isoDate,
  type IsoDate,
  type TransactionType,
} from './transaction';

/**
 * Розстрочки (glossary, «Розстрочки») — interest-free purchases paid in equal monthly платежі, kept
 * as a **plan** the owner enters by hand (installments design D1). The bank never debits the повна
 * сума; it debits the платежі, and each arrives as an ordinary витрата on its own day. So nothing
 * here is money the monthly picture counts: this module derives the графік, the state of each
 * платіж, which витрата is which платіж, and what the month still owes — and stores nothing. The
 * month arithmetic, the windows and the tie-break are shared with the зобов'язання
 * (`commitments.ts`, commitments design D2): one rule, stated once.
 *
 * Names follow the glossary's own glosses (design D0): розстрочка = `Installment`, платіж =
 * `InstallmentPart` (monobank's «частинами»; `Payment` is a forbidden synonym), списання = the
 * `debit` of a part, рахунок списання = `debitAccount`.
 *
 * Every function is pure: no clock, `today` passed in. Sums are integer minor units of UAH.
 */

/** The one currency a розстрочка is in: monobank «Покупка частинами» is a гривня product. */
export const INSTALLMENT_CURRENCY = 'UAH';

export const MIN_INSTALLMENT_PARTS = 2;
export const MAX_INSTALLMENT_PARTS = 60;

/** How far from its дата a списання may lie to be linked by the app: three days either way. */
export const AUTO_LINK_WINDOW_DAYS = 3;
/**
 * How far from its дата a списання may lie when the owner picks it by hand, and how far a linked
 * транзакція may drift (an edit of either side) before its link is dropped: ten days either way.
 */
export const HAND_LINK_WINDOW_DAYS = 10;

/** The owner's facts about one розстрочка — the only things stored (design D1). */
export interface Installment {
  readonly id: string;
  /** What was bought. */
  readonly name: string;
  /** The повна сума, UAH minor units. */
  readonly total: number;
  /** The кількість платежів, 2–60. */
  readonly partsCount: number;
  /** The щомісячний платіж, UAH minor units: every платіж but the last. */
  readonly part: number;
  /** The дата першого платежу. */
  readonly firstDue: IsoDate;
  /** The рахунок списання, a UAH рахунок. */
  readonly debitAccountId: string;
  /** How many of the first платежі were сплачено раніше, before the розстрочка was recorded. */
  readonly paidBefore: number;
  /** The категорія a linked витрата «Без категорії» takes; absent means none. */
  readonly categoryId?: string;
  /** The moment it was recorded — the tie-break between two розстрочки' платежі of one дата. */
  readonly recordedAt: number;
  /** The дата it was closed early, where it was. */
  readonly closedOn?: IsoDate;
}

/** A платіж linked to its списання. */
export interface InstallmentPartLink {
  readonly installmentId: string;
  readonly number: number;
  readonly transactionId: string;
}

/** A платіж the owner marked сплачено without a списання. */
export interface InstallmentPartMark {
  readonly installmentId: string;
  readonly number: number;
}

/** A транзакція the owner unlinked from a платіж: the app never links the two again by itself. */
export interface RefusedDebit {
  readonly installmentId: string;
  readonly number: number;
  readonly transactionId: string;
}

/** Everything stored per платіж — what cannot be derived from the розстрочка itself. */
export interface InstallmentFacts {
  readonly links: readonly InstallmentPartLink[];
  readonly marks: readonly InstallmentPartMark[];
  readonly refusals: readonly RefusedDebit[];
}

export const NO_INSTALLMENT_FACTS: InstallmentFacts = { links: [], marks: [], refusals: [] };

// ---------------------------------------------------------------------------------------------
// The split

/**
 * The щомісячний платіж and the last платіж (installments, "The щомісячний платіж is offered as an
 * even split with the remainder last"): `part` defaults to the повна сума ÷ кількість rounded down
 * to whole minor units, and the last is whatever makes the платежі add up to the повна сума
 * exactly. A `last` that is not above zero is the caller's to refuse (`installmentRefusal`).
 */
export function splitInstallment(
  total: number,
  count: number,
  part?: number,
): { readonly part: number; readonly last: number } {
  const each = part ?? Math.floor(total / count);
  return { part: each, last: total - (count - 1) * each };
}

// ---------------------------------------------------------------------------------------------
// Refusals

/** What the owner typed, before it is a stored розстрочка. */
export interface InstallmentInput {
  readonly name: string;
  readonly total: number;
  readonly partsCount: number;
  readonly part: number;
  readonly firstDue: IsoDate;
  readonly debitAccountId: string;
  readonly paidBefore: number;
  readonly categoryId?: string;
}

/** What the refusal needs to know of the world around the input. */
export interface InstallmentRefusalContext {
  /** The chosen рахунок списання; absent when none is chosen or it does not exist. */
  readonly account?: { readonly name: string; readonly currency: string; readonly archived: boolean };
  /** The chosen категорія; absent when none is chosen or it does not exist. */
  readonly category?: { readonly name: string; readonly archived: boolean };
  /**
   * The stored розстрочка being edited, where it is one. An archived рахунок or категорія is
   * refused only when it is *chosen* — at creation, or by changing to it — so a розстрочка whose
   * card was archived after it was recorded can still be edited.
   */
  readonly existing?: { readonly debitAccountId: string; readonly categoryId?: string };
}

export type InstallmentField =
  | 'name'
  | 'total'
  | 'partsCount'
  | 'part'
  | 'firstDue'
  | 'debitAccount'
  | 'paidBefore'
  | 'category';

export interface InstallmentProblem {
  readonly field: InstallmentField;
  /** Ukrainian, naming the value it concerns. */
  readonly message: string;
}

function isWholeIn(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
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
 * Every refusal the input meets, one per field at most, in the order the form asks (installments,
 * "A розстрочка holds what the owner bought and how it is paid"). The form shows each beside its
 * field; storage and the бекап refuse on the first.
 */
export function installmentProblems(
  input: InstallmentInput,
  context: InstallmentRefusalContext,
): InstallmentProblem[] {
  const problems: InstallmentProblem[] = [];
  if (input.name.trim() === '') {
    problems.push({ field: 'name', message: 'Назвіть, що куплено.' });
  }
  const totalOk = isWholeIn(input.total, 1, MAX_AMOUNT_MINOR);
  if (!totalOk) {
    problems.push({
      field: 'total',
      message:
        Number.isInteger(input.total) && input.total > MAX_AMOUNT_MINOR
          ? 'Повна сума завелика.'
          : 'Повна сума має бути більшою за нуль.',
    });
  }
  const countOk = isWholeIn(input.partsCount, MIN_INSTALLMENT_PARTS, MAX_INSTALLMENT_PARTS);
  if (!countOk) {
    problems.push({
      field: 'partsCount',
      message: `Кількість платежів — від ${MIN_INSTALLMENT_PARTS} до ${MAX_INSTALLMENT_PARTS}.`,
    });
  }
  if (!isWholeIn(input.part, 1, MAX_AMOUNT_MINOR)) {
    problems.push({ field: 'part', message: 'Щомісячний платіж має бути більшим за нуль.' });
  } else if (totalOk && countOk && splitInstallment(input.total, input.partsCount, input.part).last <= 0) {
    problems.push({
      field: 'part',
      message: 'Платежі разом більші за повну суму: зменште щомісячний платіж.',
    });
  }
  if (!isIsoDate(input.firstDue)) {
    problems.push({ field: 'firstDue', message: 'Вкажіть дату першого платежу.' });
  }
  const account = context.account;
  if (input.debitAccountId === '' || account === undefined) {
    problems.push({ field: 'debitAccount', message: 'Оберіть рахунок списання.' });
  } else if (account.currency !== INSTALLMENT_CURRENCY) {
    problems.push({ field: 'debitAccount', message: 'Рахунок списання має бути в гривнях.' });
  } else if (account.archived && context.existing?.debitAccountId !== input.debitAccountId) {
    problems.push({
      field: 'debitAccount',
      message: `Рахунок «${account.name}» в архіві — оберіть інший рахунок списання.`,
    });
  }
  if (countOk && !isWholeIn(input.paidBefore, 0, input.partsCount - 1)) {
    problems.push({
      field: 'paidBefore',
      message: `Сплачено раніше може бути щонайбільше ${input.partsCount - 1} з ${input.partsCount} платежів.`,
    });
  } else if (!countOk && !(Number.isInteger(input.paidBefore) && input.paidBefore >= 0)) {
    problems.push({ field: 'paidBefore', message: 'Вкажіть, скільки платежів уже сплачено.' });
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
  return problems;
}

/** The first refusal the input meets, or `undefined` when it may be stored. */
export function installmentRefusal(
  input: InstallmentInput,
  context: InstallmentRefusalContext,
): InstallmentProblem | undefined {
  return installmentProblems(input, context)[0];
}

// ---------------------------------------------------------------------------------------------
// Dates — UTC arithmetic on calendar dates, so no device timezone can move a дата.

function partsOfDate(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The calendar date `days` away from `date`. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = partsOfDate(date);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** Signed whole days from `from` to `to`. */
export function dayOffset(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The дата `months` calendar months after `first`, on `first`'s own day — or the month's last day
 * when it has no such day. Always from the *original* day, never chained, so 31 → 28 → 31. A
 * зобов'язання's графік steps it by its періодичність (commitments design D2).
 */
export function monthsAfter(first: IsoDate, months: number): IsoDate {
  const { year, month, day } = partsOfDate(first);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return formatDate(y, m, Math.min(day, lastDayOfMonth(y, m)));
}

// ---------------------------------------------------------------------------------------------
// The графік

export interface ScheduledPart {
  readonly number: number;
  readonly due: IsoDate;
  /** UAH minor units. */
  readonly amount: number;
}

/**
 * The графік (installments, "The графік places one платіж a month on the day of the first"): платіж
 * k on the day of the first, k − 1 months later, the last absorbing the remainder of the split.
 */
export function installmentSchedule(
  installment: Pick<Installment, 'total' | 'partsCount' | 'part' | 'firstDue'>,
): ScheduledPart[] {
  const { part, last } = splitInstallment(installment.total, installment.partsCount, installment.part);
  const parts: ScheduledPart[] = [];
  for (let number = 1; number <= installment.partsCount; number++) {
    parts.push({
      number,
      due: monthsAfter(installment.firstDue, number - 1),
      amount: number === installment.partsCount ? last : part,
    });
  }
  return parts;
}

/**
 * How many платежі fall before `today` — what «Вже сплачено платежів» starts at on the form, for a
 * розстрочка the owner records after it began. Capped at one less than the кількість, the most the
 * form admits.
 */
export function partsDueBefore(firstDue: IsoDate, partsCount: number, today: IsoDate): number {
  let count = 0;
  for (let k = 0; k < partsCount; k++) {
    if (monthsAfter(firstDue, k) < today) {
      count++;
    } else {
      break;
    }
  }
  return Math.min(count, Math.max(partsCount - 1, 0));
}

// ---------------------------------------------------------------------------------------------
// States

/** сплачено · закрито · очікується · списання не знайдено. */
export type InstallmentPartStateKind = 'paid' | 'closed' | 'expected' | 'notFound';

/** Why a платіж is сплачено: its списання, сплачено раніше, or the owner's mark. */
export type InstallmentPaidReason = 'debit' | 'paidBefore' | 'marked';

export interface InstallmentPart extends ScheduledPart {
  readonly state: InstallmentPartStateKind;
  readonly reason?: InstallmentPaidReason;
  /** The списання, for a платіж linked to one. */
  readonly transactionId?: string;
}

export interface InstallmentStatus {
  readonly installment: Installment;
  readonly parts: readonly InstallmentPart[];
  /** Сплачено платежі — the progress is this of the кількість. */
  readonly paidCount: number;
  /** Повна сума less every сплачено платіж; 0 once closed early. UAH minor units. */
  readonly remaining: number;
  /** Every платіж is сплачено. */
  readonly paidOff: boolean;
  /** Closed early. */
  readonly closed: boolean;
  /** The first платіж that is not сплачено, where one is. */
  readonly next?: InstallmentPart;
}

function factsOf(installmentId: string, facts: InstallmentFacts) {
  const links = new Map<number, string>();
  for (const link of facts.links) {
    if (link.installmentId === installmentId) {
      links.set(link.number, link.transactionId);
    }
  }
  const marks = new Set<number>();
  for (const mark of facts.marks) {
    if (mark.installmentId === installmentId) {
      marks.add(mark.number);
    }
  }
  return { links, marks };
}

function openState(due: IsoDate, today: IsoDate): InstallmentPartStateKind {
  return dayOffset(due, today) > AUTO_LINK_WINDOW_DAYS ? 'notFound' : 'expected';
}

/**
 * Every платіж in exactly one state against `today` (installments, "Every платіж is in exactly one
 * state"), with the progress and the залишок.
 */
export function installmentPartStates(
  installment: Installment,
  facts: InstallmentFacts,
  today: IsoDate,
): InstallmentStatus {
  const { links, marks } = factsOf(installment.id, facts);
  const closed = installment.closedOn !== undefined;
  const parts = installmentSchedule(installment).map((scheduled): InstallmentPart => {
    const transactionId = links.get(scheduled.number);
    if (transactionId !== undefined) {
      return { ...scheduled, state: 'paid', reason: 'debit', transactionId };
    }
    if (scheduled.number <= installment.paidBefore) {
      return { ...scheduled, state: 'paid', reason: 'paidBefore' };
    }
    if (marks.has(scheduled.number)) {
      return { ...scheduled, state: 'paid', reason: 'marked' };
    }
    return { ...scheduled, state: closed ? 'closed' : openState(scheduled.due, today) };
  });
  const paid = parts.filter((part) => part.state === 'paid');
  const paidSum = paid.reduce((sum, part) => sum + part.amount, 0);
  const paidOff = paid.length === parts.length;
  return {
    installment,
    parts,
    paidCount: paid.length,
    remaining: closed ? 0 : installment.total - paidSum,
    paidOff,
    closed,
    next: parts.find((part) => part.state !== 'paid'),
  };
}

/** Neither сплачена nor closed early: listed among the active ones, linked, warned about. */
export function isActiveInstallment(status: InstallmentStatus): boolean {
  return !status.closed && !status.paidOff;
}

// ---------------------------------------------------------------------------------------------
// Linking

/** A транзакція the linking may consider, or one already linked. */
export interface DebitCandidate {
  readonly id: string;
  readonly type: TransactionType;
  readonly date: IsoDate;
  /** The single рахунок of a non-переказ; absent for a переказ. */
  readonly accountId?: string;
  /** The сума of a non-переказ; absent for a переказ. */
  readonly amount?: Money;
  /** The категорія of a витрата or повернення. */
  readonly categoryId?: string;
  /**
   * The bank's опис, where it has one — read only by a зобов'язання's ознака (commitments design
   * D3); the розстрочка matcher ignores it.
   */
  readonly description?: string;
  /** When it was first stored — the tie-break between equally near candidates. */
  readonly createdAt: number;
}

export interface InstallmentMatch {
  readonly link: readonly InstallmentPartLink[];
  readonly drop: readonly { readonly installmentId: string; readonly number: number }[];
  readonly categorise: readonly { readonly transactionId: string; readonly categoryId: string }[];
}

/** A UAH витрата on that рахунок — the only kind of транзакція a списання can be. */
export function isDebitOn(candidate: DebitCandidate, debitAccountId: string): boolean {
  return (
    candidate.type === 'expense' &&
    candidate.accountId === debitAccountId &&
    candidate.amount?.currency === INSTALLMENT_CURRENCY
  );
}

/**
 * Whether a link still stands (installments, "The owner corrects what the app linked"; "A
 * розстрочка can be edited…"): its платіж exists, and its транзакція is still a UAH витрата on the
 * рахунок списання no more than ten days from that платіж's дата. The one statement of the rule —
 * the linking and an edit in storage both ask it.
 */
export function linkStands(
  installment: Installment,
  number: number,
  transaction: DebitCandidate | undefined,
): boolean {
  const part = installmentSchedule(installment)[number - 1];
  return (
    part !== undefined &&
    transaction !== undefined &&
    isDebitOn(transaction, installment.debitAccountId) &&
    daysApart(part.due, transaction.date) <= HAND_LINK_WINDOW_DAYS
  );
}

/** Whole calendar days between two dates, either order. */
export function daysApart(a: IsoDate, b: IsoDate): number {
  return Math.abs(dayOffset(a, b));
}

/**
 * Which платежі take which списання (installments, "A платіж is linked to its списання by the
 * app"; "The owner corrects what the app linked"; design D3).
 *
 * - `drop`: links of **any** розстрочка — closed and сплачені included — whose транзакція is gone
 *   from `transactions`, is no longer a UAH витрата on the рахунок списання, lies more than ten
 *   days from its платіж's дата, or whose платіж no longer exists.
 * - `link`: open платежі of active розстрочки, served by (дата, recordedAt, number), each taking
 *   the nearest candidate of exactly its сума within three days, ties by the one stored first,
 *   skipping refused pairs and транзакції already taken.
 * - `categorise`: only among the **new** links, the витрати «Без категорії» of a розстрочка with a
 *   категорія — an existing link is never re-categorised, so the owner's later choice stands.
 *
 * `transactions` holds every транзакція already linked plus every candidate; a linked id absent
 * from it was removed. `takenByCommitments` holds the транзакції linked to a платіж of a
 * зобов'язання: one транзакція is the списання of one платіж at most, whichever plan it belongs to
 * (commitments design D4), and one already linked stays where it is.
 */
export function matchInstallmentDebits(input: {
  readonly installments: readonly Installment[];
  readonly facts: InstallmentFacts;
  readonly transactions: readonly DebitCandidate[];
  readonly takenByCommitments?: ReadonlySet<string>;
  readonly today: IsoDate;
}): InstallmentMatch {
  const byId = new Map(input.transactions.map((t) => [t.id, t]));
  const installmentsById = new Map(input.installments.map((i) => [i.id, i]));

  const drop: { installmentId: string; number: number }[] = [];
  const keptLinks: InstallmentPartLink[] = [];
  for (const link of input.facts.links) {
    const installment = installmentsById.get(link.installmentId);
    if (installment !== undefined && linkStands(installment, link.number, byId.get(link.transactionId))) {
      keptLinks.push(link);
    } else {
      drop.push({ installmentId: link.installmentId, number: link.number });
    }
  }

  const factsAfterDrops: InstallmentFacts = { ...input.facts, links: keptLinks };
  const taken = new Set([
    ...keptLinks.map((link) => link.transactionId),
    ...(input.takenByCommitments ?? []),
  ]);
  const refused = new Set(
    input.facts.refusals.map((r) => `${r.installmentId}|${r.number}|${r.transactionId}`),
  );

  const open: { installment: Installment; part: InstallmentPart }[] = [];
  for (const installment of input.installments) {
    const status = installmentPartStates(installment, factsAfterDrops, input.today);
    if (!isActiveInstallment(status)) {
      continue;
    }
    for (const part of status.parts) {
      if (part.state === 'expected' || part.state === 'notFound') {
        open.push({ installment, part });
      }
    }
  }
  open.sort(
    (a, b) =>
      a.part.due.localeCompare(b.part.due) ||
      a.installment.recordedAt - b.installment.recordedAt ||
      a.part.number - b.part.number,
  );

  const link: InstallmentPartLink[] = [];
  const categorise: { transactionId: string; categoryId: string }[] = [];
  for (const { installment, part } of open) {
    let best: { candidate: DebitCandidate; distance: number } | undefined;
    for (const candidate of input.transactions) {
      if (
        taken.has(candidate.id) ||
        !isDebitOn(candidate, installment.debitAccountId) ||
        candidate.amount?.amount !== part.amount ||
        refused.has(`${installment.id}|${part.number}|${candidate.id}`)
      ) {
        continue;
      }
      const distance = daysApart(part.due, candidate.date);
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
    link.push({ installmentId: installment.id, number: part.number, transactionId: best.candidate.id });
    if (
      installment.categoryId !== undefined &&
      best.candidate.categoryId === UNCATEGORISED_CATEGORY_ID
    ) {
      categorise.push({ transactionId: best.candidate.id, categoryId: installment.categoryId });
    }
  }
  return { link, drop, categorise };
}

/** The tie-break between equally near candidates: the one stored first. */
export function recordedBefore(a: DebitCandidate, b: DebitCandidate): boolean {
  return a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}

/**
 * The window the linking scans for one open платіж — exposed so storage can load only the
 * candidates that could possibly match (design D4).
 */
export function autoLinkWindow(due: IsoDate): { readonly from: IsoDate; readonly to: IsoDate } {
  return { from: addDays(due, -AUTO_LINK_WINDOW_DAYS), to: addDays(due, AUTO_LINK_WINDOW_DAYS) };
}

/** The window «Обрати списання» lists from (installments-screen, "Picking the списання by hand"). */
export function handLinkWindow(due: IsoDate): { readonly from: IsoDate; readonly to: IsoDate } {
  return { from: addDays(due, -HAND_LINK_WINDOW_DAYS), to: addDays(due, HAND_LINK_WINDOW_DAYS) };
}

// ---------------------------------------------------------------------------------------------
// Нагадування про платіж

/** The hour of the warning the day before, phone time. */
export const INSTALLMENT_REMINDER_MINUTE_OF_DAY = 10 * 60;

/**
 * The дати the day before each expected платіж whose 10:00 is still ahead of `now` — one per дата
 * however many платежі fall on it, sorted (installments, "The app warns the day before an expected
 * платіж"). `parts` are the платежі of active розстрочки; only `expected` ones are warned about.
 */
export function installmentReminderDates(
  parts: readonly InstallmentPart[],
  now: { readonly date: IsoDate; readonly minuteOfDay: number },
): IsoDate[] {
  const dates = new Set<IsoDate>();
  for (const part of parts) {
    if (part.state !== 'expected') {
      continue;
    }
    const day = addDays(part.due, -1);
    if (day > now.date || (day === now.date && now.minuteOfDay < INSTALLMENT_REMINDER_MINUTE_OF_DAY)) {
      dates.add(day);
    }
  }
  return [...dates].sort();
}
