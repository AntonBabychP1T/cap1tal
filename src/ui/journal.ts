import { appendBounded, type JournalEntry, type JournalKind } from '../reporting/journal';
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
    // recent 500» has to be true of the журнал then as well, not only of the table.
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

export const journal = {
  /**
   * Records one moment. Returns the entry's id, which is what a failure dialog hands to the
   * репорт form so the form can attach the very failure the owner is looking at.
   */
  record(kind: JournalKind, name: string, detail?: string): string {
    const entry: JournalEntry = {
      id: ids(),
      at: clock(),
      kind,
      name,
      ...(detail === undefined ? {} : { detail }),
    };
    write(entry);
    return entry.id;
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
