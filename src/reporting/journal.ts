/**
 * The журнал: the app's own bounded record of what it has been doing, as values.
 *
 * This file holds the shape and the two rules — what an entry may carry, and what happens when
 * there are too many of them. The effectful half, the singleton every call site writes through,
 * is `src/ui/journal.ts`; storage is `src/db/reporting-repo.ts`. Keeping the shape one level down
 * is what lets `privacy.test.ts` prove things about the журнал without a database, the way
 * `src/analysis/` proves things about a пакет without a chooser.
 *
 * **The exclusion is in the type, not in a habit.** An entry has a `kind`, a `name` and an
 * optional `detail`, and nothing else: no сума, no назва, no опис, no bank text, no token. An
 * action is named by its kind, a screen by its route, a failure by the app's own words. There is
 * no field a сума could be put in, so no call site can put one there by accident.
 *
 * The one exception is stated rather than hidden: `detail` carries the app's own refusal verbatim,
 * and the app's own refusals sometimes quote what the owner typed («Рахунок «Картка» вже існує»).
 * A репорт that misquoted the error the owner saw would be worse for reproducing the bug than one
 * that repeats a назва the owner had just typed themselves — and the owner reads the whole репорт
 * before any of it leaves. `privacy.test.ts` pins that exception to exactly one entry.
 */

/** What an entry is about. Four kinds, and no fifth without a change that specifies it. */
export type JournalKind = 'screen' | 'failure' | 'alert' | 'crash';

/**
 * One moment in the app's recent life.
 *
 * `name` is a route (`/manage/backup`), an action's kind (`local-save`) or an `AlertKind` — never
 * anything the owner typed. `detail` is the refusal text the owner was shown, or a crash's message
 * and stack; a `screen` entry has none.
 */
export interface JournalEntry {
  readonly id: string;
  readonly at: Date;
  readonly kind: JournalKind;
  readonly name: string;
  readonly detail?: string;
}

/**
 * How many entries the журнал keeps. Roughly a day or two of ordinary use — long enough that a bug
 * met in the evening is still explained by what the app did that afternoon, short enough that the
 * whole of it fits in one репорт without thought.
 */
export const JOURNAL_LIMIT = 500;

/**
 * The журнал with one more entry in it, oldest dropped once it is full.
 *
 * Pure and total: it returns a new array and never mutates the one it was given, so the storage
 * that prunes in SQL and the tests that prune in memory are proving the same rule.
 */
export function appendBounded(
  entries: readonly JournalEntry[],
  entry: JournalEntry,
  limit: number = JOURNAL_LIMIT,
): readonly JournalEntry[] {
  const next = [...entries, entry];
  return next.length <= limit ? next : next.slice(next.length - limit);
}

/**
 * A moment as the репорт writes one: `2026-09-02 17:31:12.472`, from the device's local parts.
 *
 * Local rather than UTC for the reason `src/ui/dates.ts` gives about a purchase at 01:00 in Kyiv:
 * the owner says «вчора ввечері», and a репорт whose moments were three hours off would cost a
 * round of arithmetic at exactly the moment it is meant to save one. Built from the parts and not
 * through `Intl`, so two renderings of one репорт are the same string.
 */
export function moment(at: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const date = `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  return `${date} ${time}.${pad(at.getMilliseconds(), 3)}`;
}

/** What each kind is called in the репорт the owner reads before it leaves. */
const KIND_LABELS: Readonly<Record<JournalKind, string>> = {
  screen: 'екран',
  failure: 'збій',
  alert: 'сповіщення',
  crash: 'падіння',
};

export function kindLabel(kind: JournalKind): string {
  return KIND_LABELS[kind];
}

/**
 * One entry as one line of the rendered журнал.
 *
 * One line per entry is what makes a журнал of 500 readable at all, so a `detail` that spans lines
 * — a crash's stack — is folded onto this one with `⏎` where its newlines were. Folded rather than
 * truncated: the репорт carries every value it holds, and a stack cut off at its first frame is
 * exactly the half that does not identify the bug. The prompting failure is additionally rendered
 * whole, in its own section, where the stack is readable as a stack.
 */
export function entryLine(entry: JournalEntry): string {
  const head = `${moment(entry.at)} · ${kindLabel(entry.kind)} · ${entry.name}`;
  return entry.detail === undefined ? head : `${head} · ${fold(entry.detail)}`;
}

/** A multi-line value on one line, with its breaks still visible. */
export function fold(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ⏎ ');
}
