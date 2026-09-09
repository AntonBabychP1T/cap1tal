/**
 * The журнал: the app's own bounded record of what it has been doing, as values.
 *
 * This file holds the shape and the two rules — what an entry may carry, and what happens when
 * there are too many of them. The effectful half, the singleton every call site writes through,
 * is `src/ui/journal.ts`; storage is `src/db/reporting-repo.ts`. Keeping the shape one level down
 * is what lets `privacy.test.ts` prove things about the журнал without a database, the way
 * `src/analysis/` proves things about a пакет without a chooser.
 *
 * **The exclusion is in the type, not in a habit.** An entry has a `kind`, a `name`, an optional
 * `detail`, and — for the app's own work — a `run`, a `tookMs` and a `counts` whose values are
 * numbers. There is no сума, no назва, no опис, no bank text, no token: an action is named by its
 * kind, a screen by its route, a failure by the app's own words, a request by its method, host and
 * the shape of its path, and what an operation measured by numbers. There is no field a сума could
 * be put in, so no call site can put one there by accident.
 *
 * The one exception is stated rather than hidden: `detail` carries the app's own refusal verbatim,
 * and the app's own refusals sometimes quote what the owner typed («Рахунок «Картка» вже існує»).
 * A репорт that misquoted the error the owner saw would be worse for reproducing the bug than one
 * that repeats a назва the owner had just typed themselves — and the owner reads the whole репорт
 * before any of it leaves. `privacy.test.ts` pins that exception to exactly one entry.
 */

/**
 * What an entry is about. Seven kinds, and no eighth without a change that specifies it.
 *
 * The first four are what refused or what the owner walked past; the last three are the app's own
 * work — one outbound request, one thing the app did, one fact the device told it. `KINDS` in
 * `src/db/reporting-repo.ts` enumerates the same seven and is what refuses an eighth on the way
 * back out of storage.
 */
export type JournalKind =
  | 'screen'
  | 'failure'
  | 'alert'
  | 'crash'
  | 'network'
  | 'step'
  | 'native';

/**
 * One moment in the app's recent life.
 *
 * `name` is a route (`/manage/backup`), an action's kind (`local-save`), an `AlertKind`, a
 * request as `describeRequest` writes one, or the operation the app was doing — never anything the
 * owner typed. `detail` is the refusal text the owner was shown, a crash's message and stack, or
 * the device's own enumerated word; a `screen` entry has none.
 *
 * The three optional fields are what the app's own work adds, and `counts` is why adding them
 * costs the guarantee nothing: its values are numbers, so there is still no field a сума's text, a
 * назва or a bank's notification could be put in (design D2).
 */
export interface JournalEntry {
  readonly id: string;
  readonly at: Date;
  readonly kind: JournalKind;
  readonly name: string;
  readonly detail?: string;
  /** Ties every entry of one operation together — an opaque id, never a route. */
  readonly run?: string;
  /** How long the thing this entry names took. I/O and operations only, never a pure function. */
  readonly tookMs?: number;
  /** What the thing this entry names measured. Numbers, so no text of the owner's fits. */
  readonly counts?: Readonly<Record<string, number>>;
}

/**
 * How many entries the журнал keeps. Roughly a day or two of ordinary use — long enough that a bug
 * met in the evening is still explained by what the app did that afternoon, short enough that the
 * whole of it fits in one репорт without thought.
 *
 * Two thousand rather than five hundred since the журнал records the app's own work: a two-рахунок
 * sync writes roughly a dozen entries, and at five hundred a день of syncing would push the
 * morning's crash out. Two thousand rows of a few hundred bytes is well under a megabyte, and the
 * table is still read whole exactly once — when a репорт is filed (design D6).
 */
export const JOURNAL_LIMIT = 2000;

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
  network: 'мережа',
  step: 'крок',
  native: 'пристрій',
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
  const parts = [moment(entry.at), kindLabel(entry.kind), entry.name];
  if (entry.run !== undefined) {
    parts.push(runMark(entry.run));
  }
  if (entry.tookMs !== undefined) {
    parts.push(`${entry.tookMs} мс`);
  }
  const counts = countsLine(entry.counts);
  if (counts !== undefined) {
    parts.push(counts);
  }
  if (entry.detail !== undefined) {
    parts.push(fold(entry.detail));
  }
  return parts.join(' · ');
}

/**
 * The `run` on a line: `#a1b2c3d4`, the head of the id and no more.
 *
 * Short because it is read, not resolved — its whole job on a line is to let the eye tell one run
 * from another, and a whole `newId()` would take a third of the line to do it. The timeline
 * section groups by the id itself, so nothing depends on this prefix being unique.
 */
export function runMark(run: string): string {
  return `#${run.slice(0, 8)}`;
}

/**
 * What an operation measured, as `ключ=число` in key order — or nothing at all when it measured
 * nothing.
 *
 * Sorted by key rather than left in insertion order so that two renderings of one репорт are the
 * same string whatever built the record (design D7).
 */
function countsLine(counts: Readonly<Record<string, number>> | undefined): string | undefined {
  if (counts === undefined) {
    return undefined;
  }
  const keys = Object.keys(counts).sort();
  return keys.length === 0 ? undefined : keys.map((key) => `${key}=${counts[key]}`).join(' ');
}

/**
 * One outbound request as an entry's name: `GET api.monobank.ua/personal/client-info`.
 *
 * Two rules, and both are the privacy rule rather than tidiness (design D3):
 *
 * - **No query string, for any host.** Nothing this app sends carries a secret in a query
 *   (`api.ts` puts the token in a header and only there), and the one seam whose query *is* the
 *   owner's business — `src/fiscal/chk-all-web.ts`, whose header promises its URL is never logged
 *   — carries the реквізити of a purchase there. Dropped whole rather than filtered: a redactor
 *   over query values is a filter that has to be right every time.
 * - **The path whole for `api.monobank.ua`, its shape for everything else.** The bank's path
 *   carries the identifier of the рахунок a request is about, and «which card is not syncing» is
 *   the question this whole change exists to answer. Every other host's identifiers — a Drive file
 *   id — are replaced, so the one identifier the журнал keeps is the one the requirement names.
 *
 * A URL this cannot read is described by its method alone: an entry that says a request happened
 * and cannot say where is still worth more than no entry, and guessing at half a string is how a
 * реквізит would leak.
 */
export function describeRequest(method: string, url: string): string {
  const match = /^(?:[A-Za-z][A-Za-z\d+.-]*:)?\/\/([^/?#]+)([^?#]*)/.exec(url);
  if (match === null) {
    return `${method} ${UNREADABLE_URL}`;
  }
  const [, host = '', path = ''] = match;
  return `${method} ${host}${host === MONOBANK_API_HOST ? path : shapePath(path)}`;
}

/**
 * The vocabulary a `step` entry's `detail` uses for the phase it is in, and the word the sync
 * run's «how many рахунки» entry carries.
 *
 * Here, with the rest of the журнал's vocabulary, rather than beside the writer in
 * `src/ui/journal.ts`: `src/reporting/report.ts` reads these words to count sync runs and to find
 * a run's ending, and a second copy of «почалось» would mean changing the word in one place made
 * the репорт silently report «Синхронізацій: 0».
 */
export const STEP_BEGAN = 'почалось';
export const STEP_SUCCEEDED = 'вдалось';
export const STEP_FAILED = 'не вдалось';
export const SYNC_ACCOUNTS = 'рахунки';

/**
 * The name every entry of one monobank sync run carries.
 *
 * Here, with the rest of the журнал's vocabulary, rather than in `src/ui/monobank-sync.ts` where
 * it is written: the репорт's summary counts sync runs, and `src/reporting/report.ts` deliberately
 * imports nothing but this file. One constant, two readers, no second copy to go stale.
 */
export const SYNC_STEP = 'monobank-sync';

/** The one host whose path the журнал keeps whole, identifiers and all. */
const MONOBANK_API_HOST = 'api.monobank.ua';

/** What a URL that is not one is called. Named, so `privacy.test.ts` can look for it. */
export const UNREADABLE_URL = '—';

/** What a path segment that carries an identifier is written as instead. */
const IDENTIFIER = '{id}';

/**
 * How long a path segment may be and still be read as a word rather than an identifier.
 *
 * The longest word any endpoint this app reaches actually uses is `client-info` at eleven
 * characters; the identifiers are far longer — a Drive file id is thirty-three. Sixteen leaves
 * room for a word nobody has written yet and still refuses every identifier by length alone,
 * which matters because an identifier is not obliged to contain a digit.
 */
const WORD_MAX = 16;

/**
 * A path with every identifier in it replaced.
 *
 * A segment is kept only when it is a *short* word — letters, `_` and `-` and nothing else, and no
 * longer than `WORD_MAX` — or a version marker like `v3`. Everything else is an identifier as far
 * as this is concerned: a Drive file id, a реквізит, a number.
 *
 * The length is half the rule and not decoration. A Drive file id is `[A-Za-z0-9_-]{33}`, and one
 * that happens to contain no digit would pass a letters-only test and be written whole — the
 * requirement says «every identifier replaced», so a rule that depends on an id being unlucky
 * enough to contain a digit is not that rule. Conservative on purpose: the cost of replacing a
 * segment that was not an identifier is a slightly duller entry, and the cost of keeping one that
 * was is the whole guarantee.
 */
function shapePath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment === '' ||
      (segment.length <= WORD_MAX && /^[A-Za-z_-]+$/.test(segment)) ||
      /^v\d+$/.test(segment)
        ? segment
        : IDENTIFIER,
    )
    .join('/');
}

/**
 * The журнал as lines, with a run of the same screen folded into one.
 *
 * The репорт that prompted this change carried two hundred `екран · /route` entries out of two
 * hundred and eight, which is what the owner tapping between two tabs looks like from in here.
 * Folded rather than dropped: the count and the two moments carry every value the run held, so the
 * репорт still says everything it knows (design D6). Only consecutive entries of one and the same
 * route fold — anything at all between them means the app did something there, and that something
 * is what the reader is looking for.
 */
export function foldScreens(entries: readonly JournalEntry[]): string[] {
  const lines: string[] = [];
  let index = 0;
  while (index < entries.length) {
    const first = entries[index];
    if (first === undefined) {
      break;
    }
    let last = index;
    while (
      first.kind === 'screen' &&
      last + 1 < entries.length &&
      entries[last + 1]?.kind === 'screen' &&
      entries[last + 1]?.name === first.name
    ) {
      last += 1;
    }
    const runLength = last - index + 1;
    lines.push(
      runLength === 1
        ? entryLine(first)
        : `${moment(first.at)} · ${kindLabel('screen')} · ${first.name} · ×${runLength} · останній ${moment(entries[last]?.at ?? first.at)}`,
    );
    index = last + 1;
  }
  return lines;
}

/** A multi-line value on one line, with its breaks still visible. */
export function fold(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ⏎ ');
}
