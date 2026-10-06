import { monthOf, UNCATEGORISED_CATEGORY_ID, UNSOURCED_SOURCE_ID, type Income, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import type { Draft } from '../notifications/draft';
import { possibleDuplicates } from '../observations/duplicates';
import { pairKey, type AnsweredPair, type PossibleDuplicate } from '../observations/observation';
import { inOrder } from '../observations/order';
import { ledgerOf, type Ledger } from '../observations/window';
import { isCompleted } from '../progress/summary';
import { plural } from './labels';
import { dayLabel } from './dates';
import { monthInYearLabel, monthLabel, prevMonth } from './months';
import { isMonth } from '../analysis/period';

/**
 * «Що потребує відповіді» (answer-queue capability): everything that waits for the owner's word, in
 * one fixed order of groups — a reading over stored state, computed when shown and stored nowhere
 * (design D1). Pure: it takes what the screen loaded and returns the groups, their counts and the
 * month line; it reads no clock, no storage and no React.
 *
 * Головний's rail row is `queueRow` over the same result, so the number it names and the entries
 * the queue holds cannot disagree.
 */

/** The title of the queue screen, and the words of Головний's rail row. */
export const ANSWER_QUEUE_TITLE = 'Що потребує відповіді';

/** What an unnarrowed queue with nothing in it says, and nothing else. */
export const NOTHING_WAITS = 'Нічого не чекає відповіді';

export type QueueGroup =
  | { readonly kind: 'drafts'; readonly title: 'Чернетки'; readonly entries: readonly Draft[] }
  | { readonly kind: 'duplicates'; readonly title: 'Можливі дублі'; readonly entries: readonly PossibleDuplicate[] }
  | { readonly kind: 'uncategorised'; readonly title: 'Без категорії'; readonly entries: readonly Transaction[] }
  | { readonly kind: 'unsourced'; readonly title: 'Без джерела'; readonly entries: readonly Income[] };

export type QueueGroupKind = QueueGroup['kind'];

/** The line leading to the most recent finished month that is not clean. */
export interface QueueMonthLine {
  readonly month: Month;
  /** Витрати and повернення «Без категорії», доходи «Без джерела» and чернетки dated in it. */
  readonly remaining: number;
  /** «У вересні 2026 ще 12 без відповіді». */
  readonly text: string;
}

export interface AnswerQueue {
  /** The rail's monobank sentence, word for word, when it stands; never counted. */
  readonly bank: string | null;
  /** Only while the queue is not narrowed. */
  readonly monthLine: QueueMonthLine | null;
  /** The місяць the queue is narrowed to, and how that narrowing reads. */
  readonly narrowedTo: { readonly month: Month; readonly label: string } | null;
  /** The groups that hold an entry, in the queue's order; an empty group takes no space. */
  readonly groups: readonly QueueGroup[];
  /** How many entries wait in all — the bank is not an entry. */
  readonly total: number;
  /**
   * What the screen says when no group holds anything: «Нічого не чекає відповіді», or that nothing
   * in the narrowed місяць waits. `null` while any group holds an entry.
   */
  readonly emptyMessage: string | null;
}

export interface AnswerQueueInput {
  /** Every stored транзакція, in any order. */
  readonly transactions: readonly Transaction[];
  /** The pending чернетки, in storage's order — newest drafted first (`pendingDrafts`). */
  readonly drafts: readonly Draft[];
  /** The «Не дубль» answers. */
  readonly answers: readonly AnsweredPair[];
  /** The рахунки linked to monobank, as the дубль detector reads them. */
  readonly linkedAccountIds: ReadonlySet<string>;
  /** `monobankRailRow`'s sentence, or `null` when the rail carries no monobank row. */
  readonly bank: string | null;
  readonly today: IsoDate;
  /** The місяць the queue is narrowed to; absent is the whole history. */
  readonly month?: Month;
  /** Категорія names by id, for the observations capability's tie-breaks between дублі. */
  readonly categoryNames?: ReadonlyMap<string, string>;
  /**
   * Whether a pair was answered «Не дубль» on this visit: «Можливі дублі» then stays in place even
   * with no pair left, so the «Скасувати» beside the answer is still there to take (answer-queue,
   * "«Не дубль» in the queue, then undone"). It counts nothing — an answered pair is no entry.
   */
  readonly keepDuplicates?: boolean;
}

/** «Без категорії»: exactly the витрати and повернення the feed marks as uncategorised. */
export function isUncategorisedQuestion(t: Transaction): boolean {
  return (t.type === 'expense' || t.type === 'refund') && t.categoryId === UNCATEGORISED_CATEGORY_ID;
}

function isUnsourced(t: Transaction): t is Income {
  return t.type === 'income' && t.sourceId === UNSOURCED_SOURCE_ID;
}

/** Newest дата first; the order given breaks a tie, so equal dates keep storage's recency. */
function newestFirst<T extends { readonly date: IsoDate }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.date === b.row.date ? a.index - b.index : a.row.date < b.row.date ? 1 : -1))
    .map(({ row }) => row);
}

/**
 * The можливі дублі the queue holds (design D2): unnarrowed, those stated for the current month and
 * the month before, each pair once even when both months state it; narrowed, those stated for that
 * місяць — none for a місяць still to come.
 */
function duplicatesFor(
  ledger: Ledger,
  input: AnswerQueueInput,
): PossibleDuplicate[] {
  const current = monthOf(input.today);
  const answered = new Set(input.answers.map((a) => pairKey(a.first, a.second)));
  const months =
    input.month === undefined ? [current, prevMonth(current)] : input.month <= current ? [input.month] : [];
  const seen = new Set<string>();
  const pairs: PossibleDuplicate[] = [];
  for (const month of months) {
    for (const pair of possibleDuplicates(ledger, month, answered, input.linkedAccountIds)) {
      const key = pairKey(pair.first.id, pair.second.id);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(pair);
    }
  }
  const names = input.categoryNames ?? new Map<string, string>();
  return inOrder(pairs, (id) => names.get(id) ?? id) as PossibleDuplicate[];
}

/**
 * The most recent завершений активний місяць — a calendar місяць that has ended by today and holds
 * a транзакція — the one «Закрий <місяць>» is ever about.
 */
function latestFinishedMonth(transactions: readonly Transaction[], today: IsoDate): Month | undefined {
  let latest: Month | undefined;
  for (const t of transactions) {
    // A переказ alone does not make a місяць активний — `progress-repo`'s reading, which «Закрий
    // <місяць>» is decided by, so the line and the виклик name the same місяць.
    if (t.type === 'transfer') continue;
    const month = monthOf(t.date);
    if (isCompleted(month, today) && (latest === undefined || month > latest)) latest = month;
  }
  return latest;
}

/**
 * How many records of a місяць still wait: витрати and повернення «Без категорії», доходи «Без
 * джерела» and pending чернетки dated in it. A можливий дубль does not count — it does not count
 * toward a чистий місяць either.
 */
function remainingIn(month: Month, transactions: readonly Transaction[], drafts: readonly Draft[]): number {
  let n = 0;
  for (const t of transactions) {
    if (monthOf(t.date) === month && (isUncategorisedQuestion(t) || isUnsourced(t))) n += 1;
  }
  for (const d of drafts) {
    if (monthOf(d.date) === month) n += 1;
  }
  return n;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The queue, in the order the answer-queue capability fixes. */
export function answerQueue(input: AnswerQueueInput): AnswerQueue {
  const inScope = (date: IsoDate) => input.month === undefined || monthOf(date) === input.month;
  const ledger = ledgerOf(input.transactions, input.today);

  // Newest дата first, as the other groups; storage's own order (newest drafted) breaks a tie.
  const drafts = newestFirst(input.drafts.filter((d) => inScope(d.date)));
  const duplicates = duplicatesFor(ledger, input);
  const uncategorised = newestFirst(input.transactions.filter((t) => isUncategorisedQuestion(t) && inScope(t.date)));
  const unsourced = newestFirst(input.transactions.filter((t): t is Income => isUnsourced(t) && inScope(t.date)));

  const all: QueueGroup[] = [
    { kind: 'drafts', title: 'Чернетки', entries: drafts },
    { kind: 'duplicates', title: 'Можливі дублі', entries: duplicates },
    { kind: 'uncategorised', title: 'Без категорії', entries: uncategorised },
    { kind: 'unsourced', title: 'Без джерела', entries: unsourced },
  ];
  const groups = all.filter((g) => g.entries.length > 0 || (g.kind === 'duplicates' && input.keepDuplicates === true));
  const total = groups.reduce((sum, g) => sum + g.entries.length, 0);

  let monthLine: QueueMonthLine | null = null;
  if (input.month === undefined) {
    const finished = latestFinishedMonth(input.transactions, input.today);
    const remaining = finished === undefined ? 0 : remainingIn(finished, input.transactions, input.drafts);
    if (finished !== undefined && remaining > 0) {
      monthLine = {
        month: finished,
        remaining,
        text: `${capitalised(monthInYearLabel(finished))} ще ${remaining} без відповіді`,
      };
    }
  }

  return {
    bank: input.bank,
    monthLine,
    narrowedTo: input.month === undefined ? null : { month: input.month, label: monthLabel(input.month) },
    groups,
    total,
    // Said only when nothing at all stands on the screen: not beside the bank entry, which still
    // waits ("Nothing waits" asks monobank to be readable), nor beside a kept «Скасувати».
    emptyMessage:
      total > 0 || input.bank !== null || groups.length > 0
        ? null
        : input.month === undefined
          ? NOTHING_WAITS
          : `${capitalised(monthInYearLabel(input.month))} нічого не чекає відповіді`,
  };
}

const KIND_WORDS: Readonly<Record<QueueGroupKind, (n: number) => string>> = {
  drafts: (n) => `${n} ${plural(n, 'чернетка', 'чернетки', 'чернеток')}`,
  duplicates: (n) => `${n} ${plural(n, 'дубль', 'дублі', 'дублів')}`,
  uncategorised: (n) => `${n} без категорії`,
  unsourced: (n) => `${n} без джерела`,
};

/**
 * Головний's rail row (main-screen, "One rail row names what waits for an answer"): how many entries
 * the unnarrowed queue holds and, in its order of groups, how many of each kind — or `null`, so the
 * row takes no space, when nothing waits. The bank is not counted: the rail states it in its own row.
 */
export function queueRow(queue: AnswerQueue): { readonly total: number; readonly label: string; readonly kinds: string } | null {
  if (queue.total === 0) return null;
  return {
    total: queue.total,
    label: `${ANSWER_QUEUE_TITLE}: ${queue.total}`,
    kinds: queue.groups
      .filter((g) => g.entries.length > 0)
      .map((g) => KIND_WORDS[g.kind](g.entries.length))
      .join(' · '),
  };
}

/**
 * The second line of a «Без категорії» or «Без джерела» entry: its рахунок, what it is when its
 * title does not say, and its дата (answer-queue, "Every entry states its сума in its own currency").
 * The feed's subtitle names a повернення by its type alone; an entry here names its рахунок always.
 */
export function queueSubtitle(
  line: { readonly type: string; readonly accounts: string; readonly date: IsoDate; readonly category?: string; readonly source?: string },
  now: Date,
): string {
  const labelled = line.category !== undefined || line.source !== undefined;
  const kind = line.type === 'повернення' || !labelled ? ` · ${line.type}` : '';
  return `${line.accounts}${kind} · ${dayLabel(line.date, now)}`;
}

/** How many entries a long group shows at first, and how many more each offer adds. */
export const QUEUE_PAGE = 20;

/**
 * The entries of a group the screen shows (design D3): the newest `shown` of them, and an offer
 * naming how many more there are. `shown` is the screen's own state — an answer removes its entry
 * from `entries` and leaves `shown` alone, so the entries already in sight stay in sight.
 */
export function visibleEntries<T>(
  entries: readonly T[],
  shown: number,
): { readonly visible: readonly T[]; readonly more: number; readonly moreLabel: string | null } {
  const visible = entries.slice(0, Math.max(shown, 0));
  const more = entries.length - visible.length;
  return { visible, more, moreLabel: more > 0 ? `Показати ще (${more})` : null };
}

/**
 * The `month` route parameter of `/answers` (design D3): a calendar місяць narrows the queue, and
 * anything else — «2026-13», «вересень», nothing at all — narrows nothing, by the same `isMonth`
 * «Транзакції» reads its own with (`monthFromRoute`).
 */
export function answerMonthFromRoute(asked: string | undefined): Month | undefined {
  return asked !== undefined && isMonth(asked) ? asked : undefined;
}

/** Where the queue narrowed to one місяць is opened — the підсумок and «Закрий <місяць>» alike. */
export function answersRoute(month?: Month): string {
  return month === undefined ? '/answers' : `/answers?month=${month}`;
}
