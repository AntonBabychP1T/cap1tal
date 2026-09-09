import { REQUEST_TIMEOUT_NAME } from '../monobank/yielding';
import {
  appendBounded,
  describeRequest,
  STEP_BEGAN,
  STEP_FAILED,
  STEP_SUCCEEDED,
  type JournalEntry,
  type JournalKind,
} from '../reporting/journal';
import { newId } from './id';
import { failureMessage } from './labels';

/**
 * The журнал as the app writes it: one module-level singleton over a storage port, and
 * `reportFailure` as the single door every shown failure goes through.
 *
 * **Why a singleton and not a context.** Two of the four writers run outside React entirely — the
 * `ErrorUtils` global handler and the promise-rejection tracker — and a context cannot be reached
 * from either. A module both the root layout and a global handler can import is what covers all
 * four (design D2).
 *
 * **Why there is a buffer before `bind`.** Storage only exists after the migrations, and the most
 * interesting crash of all is the one during launch. Entries recorded before `bind` go to a small
 * in-memory list and are flushed, in order, the moment storage arrives. If the migrations
 * themselves fail, nothing is ever bound and nothing is journaled — the same as today, and the
 * red «Не вдалося підготувати сховище» view is what the owner sees either way.
 *
 * **Nothing here throws.** Every writer is a call site that was already handling a failure — a
 * catch block about to show a dialog, or a crash handler. A журнал that could throw would turn a
 * refusal the owner could read into a crash they could not, which is precisely backwards. So the
 * storage call is guarded and a journal that cannot write is simply a journal that is missing an
 * entry.
 */

/** What the журнал needs of storage. The real one is `src/db/reporting-repo.ts`. */
export interface JournalStorage {
  /** Appends one entry and prunes the журнал back to its bound, in one go. */
  append(entry: JournalEntry): void;
  /** The whole журнал, oldest first. */
  tail(): readonly JournalEntry[];
  /** One entry by id, or `null` once the pruning has taken it. */
  byId(id: string): JournalEntry | null;
}

/** What `bind` may be told, so a test can drive the singleton without a clock or a random id. */
export interface JournalOptions {
  readonly now?: () => Date;
  readonly newId?: () => string;
}

let storage: JournalStorage | null = null;
let buffered: readonly JournalEntry[] = [];
let clock: () => Date = () => new Date();
let ids: () => string = newId;

/**
 * Gives the журнал its storage, once. A second call is a no-op — `retry` on the crash fallback
 * remounts the whole root layout, and a second `bind` there must not replay the buffer or swap the
 * storage out from under an entry being written.
 */
export function bindJournal(next: JournalStorage, options: JournalOptions = {}): void {
  if (storage !== null) {
    return;
  }
  storage = next;
  clock = options.now ?? clock;
  ids = options.newId ?? ids;
  const pending = buffered;
  buffered = [];
  for (const entry of pending) {
    write(entry);
  }
}

/**
 * Only for tests: a fresh журнал over an array, bound in one call, with a reader for what it holds.
 *
 * One helper rather than a copy in every suite that now writes entries — a `step` around an
 * operation means a great many suites see the журнал whether they are about it or not, and each of
 * them repeating the double is how the double drifts.
 */
export function bindTestJournal(options: JournalOptions = {}): () => readonly JournalEntry[] {
  const entries: JournalEntry[] = [];
  resetJournalForTests();
  bindJournal(
    {
      append: (entry) => entries.push(entry),
      tail: () => entries,
      byId: (id) => entries.find((entry) => entry.id === id) ?? null,
    },
    options,
  );
  return () => entries;
}

/** Only for tests: forgets the storage and the buffer, so each one starts from nothing. */
export function resetJournalForTests(): void {
  storage = null;
  buffered = [];
  clock = () => new Date();
  ids = newId;
}

function write(entry: JournalEntry): void {
  if (storage === null) {
    // The same bound the storage keeps, kept here too. A launch that never reaches `bind` — the
    // migrations failing — is the one case this buffer is all there is, and «at most the most
    // recent `JOURNAL_LIMIT`» has to be true of the журнал then as well, not only of the table.
    buffered = appendBounded(buffered, entry);
    return;
  }
  try {
    storage.append(entry);
  } catch {
    // See the module comment: a журнал that cannot write is a missing entry, never a crash on top
    // of the failure it was trying to record.
  }
}

/** What an entry may carry beyond its kind, name and detail. All three are optional, always. */
export interface JournalTail {
  readonly run?: string;
  readonly tookMs?: number;
  readonly counts?: Readonly<Record<string, number>>;
}

/** What one `journal.step` came to, as the operation itself names it. */
export interface StepEnding {
  /**
   * The operation's own enumerated word for what it came to — `not-configured`, `uploaded`. When
   * absent the entry says «вдалось», which is what an operation that simply finished did.
   */
  readonly detail?: string;
  readonly counts?: Readonly<Record<string, number>>;
}

/**
 * The app's own words for a request that got no answer.
 *
 * Composed here and never taken from the caught error: a platform's rejection may quote the whole
 * URL it was given, which would put back exactly the file id and the реквізити that
 * `describeRequest`'s path shaping removes (design D3). Two words, because two is what this seam
 * can honestly tell apart — the app's own timeout, by the `name` `withRequestTimeout` gives its
 * rejection, and everything else.
 */
const NO_ANSWER = 'не відповів';
const BROKE = 'зірвався';

export const journal = {
  /**
   * Records one moment. Returns the entry's id, which is what a failure dialog hands to the
   * репорт form so the form can attach the very failure the owner is looking at.
   *
   * `tail` is what the app's own work adds — the mark tying one operation's entries together, how
   * long the thing took, and what it measured. Every existing two- and three-argument call writes
   * exactly the entry it wrote before.
   */
  record(kind: JournalKind, name: string, detail?: string, tail: JournalTail = {}): string {
    const entry: JournalEntry = {
      id: ids(),
      at: clock(),
      kind,
      name,
      ...(detail === undefined ? {} : { detail }),
      ...(tail.run === undefined ? {} : { run: tail.run }),
      ...(tail.tookMs === undefined ? {} : { tookMs: tail.tookMs }),
      ...(tail.counts === undefined ? {} : { counts: tail.counts }),
    };
    write(entry);
    return entry.id;
  },

  /**
   * One thing the app did, recorded at both ends under one mark.
   *
   * Both ends, and not just the failing one, because the run this whole change exists to make
   * visible is the one that never *returns* — a background chance the system kills mid-wait leaves
   * only its beginning, and that beginning is the evidence. A wrapper rather than two call-site
   * lines for the same reason `reportFailure` is one door: «recorded when it begins and when it
   * ends» cannot be half-done by a caller who forgot the second half.
   *
   * A throw writes the failing end and rethrows the original error untouched: the журнал is beside
   * what the caller does about a failure, never instead of it.
   */
  async step<T>(
    name: string,
    fn: () => Promise<T>,
    options: {
      readonly run?: string;
      /** What the value `fn` answered with says about the ending — its word, and its counts. */
      readonly ending?: (value: T) => StepEnding;
    } = {},
  ): Promise<T> {
    const run = options.run ?? ids();
    const startedMs = clock().getTime();
    journal.record('step', name, STEP_BEGAN, { run });
    let value: T;
    try {
      value = await fn();
    } catch (error) {
      journal.record('step', name, STEP_FAILED, { run, tookMs: clock().getTime() - startedMs });
      throw error;
    }
    const ending = options.ending?.(value) ?? {};
    journal.record('step', name, ending.detail ?? STEP_SUCCEEDED, {
      run,
      tookMs: clock().getTime() - startedMs,
      ...(ending.counts === undefined ? {} : { counts: ending.counts }),
    });
    return value;
  },

  /**
   * Any fetch-like with one `network` entry written per call.
   *
   * Wrapping the seam rather than adding a line at each call site is the whole point: the five
   * places the app reaches the network go through four different fetch-like shapes, and a request
   * nobody remembered to journal is exactly the request a репорт needs (design D3).
   *
   * Generic over the rest of the arguments and over the answer, so a one-argument
   * `(url) => Promise<{ ok, status, text() }>` and a two-argument `AuthFetchLike` both pass
   * through unchanged. **The answer is returned as it was given and its body is never read** —
   * `AuthFetchLike` has no `clone()`, and one read here would be the read the caller is about to
   * make.
   */
  watchFetch<A extends unknown[], R extends { readonly status: number }>(
    impl: (url: string, ...rest: A) => Promise<R>,
    options: {
      readonly run?: string;
      /** The method this call used. `GET` for every seam but Drive, which reads it off its init. */
      readonly method?: (...rest: A) => string;
    } = {},
  ): (url: string, ...rest: A) => Promise<R> {
    return async (url, ...rest) => {
      const name = describeRequest(options.method?.(...rest) ?? 'GET', url);
      const startedMs = clock().getTime();
      const tail = (): JournalTail => ({
        ...(options.run === undefined ? {} : { run: options.run }),
        tookMs: clock().getTime() - startedMs,
      });
      let response: R;
      try {
        response = await impl(url, ...rest);
      } catch (error) {
        journal.record('network', name, timedOut(error) ? NO_ANSWER : BROKE, tail());
        throw error;
      }
      journal.record('network', name, undefined, { ...tail(), counts: { status: response.status } });
      return response;
    };
  },

  /**
   * A failure the screen shows in place rather than in a dialog — the бекап's, the monobank
   * sync's — journaled with the text the owner is now looking at. The dialogs go through
   * `reportFailure` instead, which does the same and hands the text back.
   */
  failure(where: string, text: string): string {
    return journal.record('failure', where, text);
  },

  /** The whole журнал, oldest first — the buffer's contents while nothing is bound yet. */
  tail(): readonly JournalEntry[] {
    return storage === null ? [...buffered] : storage.tail();
  },

  /** One entry by id, for the form that is about to attach it to a репорт. */
  byId(id: string): JournalEntry | null {
    if (storage === null) {
      return buffered.find((entry) => entry.id === id) ?? null;
    }
    return storage.byId(id);
  },
};

/** Whether a rejection is the app's own request timeout, by the name it gives it and not its text. */
function timedOut(error: unknown): boolean {
  return error instanceof Error && error.name === REQUEST_TIMEOUT_NAME;
}

/**
 * The one door for a failure the owner is about to be shown.
 *
 * It returns exactly what `failureMessage` returned, so a call site changes from
 * `Alert.alert('Не записано', failureMessage(error))` to
 * `Alert.alert('Не записано', reportFailure('local-save', error))` and nothing else about it moves.
 * `where` is the action's kind — `local-save`, `account-rename` — never a route and never anything
 * the owner typed; the route the репорт names is derived from the журнал itself (design D9).
 */
export function reportFailure(where: string, error: unknown): string {
  const message = failureMessage(error);
  journal.record('failure', where, message);
  return message;
}

/**
 * The same, for a call site that needs the entry's id as well — the failure dialogs, which offer
 * «Повідомити про помилку» and have to say *which* failure.
 */
export function reportFailureEntry(
  where: string,
  error: unknown,
): { readonly id: string; readonly message: string } {
  const message = failureMessage(error);
  return { id: journal.record('failure', where, message), message };
}
