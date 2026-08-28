import type { Rule } from '../domain/rules';
import type { IsoDate } from '../domain/transaction';
import type { StatementAnswer, StoredMonobankLink } from '../db/monobank-repo';
import {
  fetchClientInfo,
  fetchStatement,
  type AuthFetchLike,
  type MonobankAccount,
  type Outcome,
  type StatementItem,
} from './api';
import type { MonobankTokenStore } from '../platform/monobank-token';
import { continueWindow, isFullAnswer, mapStatement, planWindows, type StatementWindow } from './sync';

/**
 * One foreground sync run: the effectful half that `api.ts` and `sync.ts` deliberately are not.
 *
 * Everything that is not a pure decision is a port — the token, the authenticated fetch, storage,
 * the правила, the clock, the device's calendar, the wait between requests and id generation — so
 * every path below runs under `npm run verify` against synthetic answers, with no network, no
 * timer and no emulator (design D5). What the coordinator itself owns is the order: one run end
 * captured at the start, links processed one after another, windows oldest first, a page committed
 * the moment it is read, and a cursor that moves only when the whole window behind it is done.
 *
 * The token is read into a local variable and goes no further: it is not in a progress event, not
 * in a result, not in an error. An `invalid-token` answer stops the run rather than offering the
 * same rejected secret to every remaining account.
 */

/** monobank's personal API allows one request a minute; the run paces itself to that. */
export const MIN_REQUEST_GAP_MS = 60_000;

/** What storage has to offer a run. `src/db/monobank-repo.ts` is the implementation. */
export interface SyncStorage {
  listLinks(): readonly StoredMonobankLink[];
  importedIds(monobankAccountId: string): Set<string>;
  upsertAccounts(accounts: readonly MonobankAccount[], obtainedAt: Date): void;
  commitStatementAnswer(answer: StatementAnswer): void;
}

export interface SyncPorts {
  readonly tokenStore: MonobankTokenStore;
  readonly fetch: AuthFetchLike;
  readonly storage: SyncStorage;
  /** The owner's правила автокатегоризації, loaded once for the whole run. */
  readonly rules: () => readonly Rule[];
  /** A monotonic-enough millisecond clock: the run's end, and the pacing between requests. */
  readonly nowMs: () => number;
  /** The same instant as a `Date`, for storage metadata. */
  readonly now: () => Date;
  /** Unix seconds → the calendar date of that moment on this device (`api.ts`'s `dateOf`). */
  readonly dateOf: (unixSeconds: number) => IsoDate;
  /** How the run waits out the API's request gap. A cancellable timer in the app. */
  readonly wait: (ms: number) => Promise<void>;
  readonly newId: () => string;
  /** Where the screen hears about progress; a run with no listener behaves identically. */
  readonly onProgress?: (progress: SyncProgress) => void;
  /** Asked before each request and after each wait, so leaving the screen can stop a long run. */
  readonly cancelled?: () => boolean;
  /** Overridden in tests, which must never wait a real minute. */
  readonly minRequestGapMs?: number;
}

/**
 * How one linked account finished. The four the screen spec names, plus `cancelled` for an
 * account the owner stopped the run before: calling that one «недоступно» would blame the bank
 * for the owner's own decision.
 *
 * A storage failure is `unavailable` on purpose. From where the owner stands it is the same
 * answer — nothing was imported, the cursor did not move, try again — and inventing a fifth word
 * for it would ask them to care which side of the device failed.
 */
export type AccountOutcome =
  | 'complete'
  | 'invalid-token'
  | 'rate-limited'
  | 'unavailable'
  | 'cancelled';

export interface AccountResult {
  readonly monobankAccountId: string;
  readonly accountId: string;
  readonly outcome: AccountOutcome;
  /** New транзакції this run stored for this account; committed work, never a projection. */
  readonly imported: number;
}

/** What a whole run answers with. Every state the screen has to tell apart is one of these. */
export type SyncRun =
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'storage-unavailable' }
  | { readonly kind: 'no-links' }
  | {
      readonly kind: 'ran';
      /** New транзакції across every account — the number the result reports. */
      readonly imported: number;
      readonly accounts: readonly AccountResult[];
    };

/** What the screen hears while a run is going on. */
export type SyncProgress =
  | { readonly kind: 'started'; readonly accounts: number }
  /** About to work on this account: `index` of `of`, one-based, so a screen can say "2 з 3". */
  | {
      readonly kind: 'account';
      readonly monobankAccountId: string;
      readonly index: number;
      readonly of: number;
    }
  /** Sitting out the API's request gap. Explicit, so a long first sync does not look frozen. */
  | { readonly kind: 'waiting'; readonly ms: number }
  /** One account is done, with what it did. */
  | { readonly kind: 'finished-account'; readonly result: AccountResult };

/** The API failure of a client-info or statement answer, as an account outcome. */
function outcomeOf(answer: Outcome<unknown>): Exclude<AccountOutcome, 'complete' | 'cancelled'> {
  switch (answer.kind) {
    case 'invalid-token':
      return 'invalid-token';
    case 'rate-limited':
      return 'rate-limited';
    default:
      return 'unavailable';
  }
}

export async function syncLinkedAccounts(ports: SyncPorts): Promise<SyncRun> {
  const gap = ports.minRequestGapMs ?? MIN_REQUEST_GAP_MS;
  const cancelled = () => ports.cancelled?.() ?? false;
  const report = (progress: SyncProgress) => ports.onProgress?.(progress);

  const stored = await ports.tokenStore.read();
  if (stored.kind === 'unavailable') {
    return { kind: 'storage-unavailable' };
  }
  if (!stored.token) {
    return { kind: 'not-configured' };
  }
  // The one variable the secret lives in for the whole run. Nothing below puts it anywhere else.
  const token = stored.token;

  const links = [...ports.storage.listLinks()].sort((a, b) =>
    a.monobankAccountId < b.monobankAccountId ? -1 : a.monobankAccountId > b.monobankAccountId ? 1 : 0,
  );
  if (links.length === 0) {
    return { kind: 'no-links' };
  }

  /**
   * One run end for every account. Taken once, so two accounts synced in the same run cover the
   * same span and a long first sync cannot leave a later account with a cursor ahead of an
   * earlier one's.
   */
  const runToMs = ports.nowMs();
  const rules = ports.rules();
  let lastRequestMs: number | undefined;

  /** The API's minimum gap, waited out rather than slept through: the wait is a port. */
  async function paced<T>(request: () => Promise<T>): Promise<T> {
    if (lastRequestMs !== undefined) {
      const since = ports.nowMs() - lastRequestMs;
      if (since < gap) {
        const ms = gap - since;
        report({ kind: 'waiting', ms });
        await ports.wait(ms);
      }
    }
    lastRequestMs = ports.nowMs();
    return request();
  }

  const results: AccountResult[] = [];
  const finish = (link: StoredMonobankLink, outcome: AccountOutcome, imported: number): void => {
    const result: AccountResult = {
      monobankAccountId: link.monobankAccountId,
      accountId: link.accountId,
      outcome,
      imported,
    };
    results.push(result);
    report({ kind: 'finished-account', result });
  };

  report({ kind: 'started', accounts: links.length });

  // One client-info answer for the whole run: it is what the balances committed with every page
  // come from, and asking again per account would spend the request budget on nothing new.
  const info = await paced(() => fetchClientInfo(ports.fetch, token));
  if (info.kind !== 'ok') {
    const outcome = outcomeOf(info);
    for (const link of links) {
      finish(link, outcome, 0);
    }
    return { kind: 'ran', imported: 0, accounts: results };
  }
  const fetched = new Map(info.value.map((a) => [a.id, a]));
  // When those balances were obtained, not when a page happens to be committed: a first sync
  // paced at one request a minute would otherwise stamp a figure from half an hour ago as fresh,
  // which is exactly what `obtained_at` exists to prevent.
  const obtainedAt = ports.now();
  try {
    ports.storage.upsertAccounts(info.value, obtainedAt);
  } catch {
    // A cache that would not take the fresh balances changes nothing about what can be imported:
    // every page commits its own balance, and the next opening refetches. Not a run failure.
  }

  let stopped: AccountOutcome | undefined;

  for (const [index, link] of links.entries()) {
    if (stopped) {
      // Everything after an invalid token or a cancellation, without a single further request.
      finish(link, stopped, 0);
      continue;
    }
    if (cancelled()) {
      stopped = 'cancelled';
      finish(link, stopped, 0);
      continue;
    }

    report({
      kind: 'account',
      monobankAccountId: link.monobankAccountId,
      index: index + 1,
      of: links.length,
    });

    const bankAccount = fetched.get(link.monobankAccountId);
    if (!bankAccount) {
      // The token no longer shows this account — revoked, or belonging to another owner. Nothing
      // is deleted and nothing is asked for: the link stays, visibly disconnected, and its
      // cursor, imported ids and транзакції are exactly where they were.
      finish(link, 'unavailable', 0);
      continue;
    }

    const account = await syncOneAccount({
      link,
      bankAccount,
      obtainedAt,
      token,
      runToMs,
      rules,
      ports,
      paced,
      cancelled,
    });
    if (account.outcome === 'invalid-token' || account.outcome === 'cancelled') {
      stopped = account.outcome;
    }
    finish(link, account.outcome, account.imported);
  }

  return {
    kind: 'ran',
    imported: results.reduce((total, result) => total + result.imported, 0),
    accounts: results,
  };
}

/**
 * One linked account, from its committed cursor to the run's end.
 *
 * The cursor rule lives here and nowhere else (design D4). A window's end becomes the committed
 * cursor only when that window's last answer came back short; while a full answer is being paged
 * backwards through `continueWindow`, every page still commits its own транзакції and item ids —
 * so a run that stops mid-window loses no work — but the cursor stays where it was. A repeated
 * page after a restart is then harmless: its ids are already remembered, so it maps to nothing.
 */
async function syncOneAccount(input: {
  readonly link: StoredMonobankLink;
  readonly bankAccount: MonobankAccount;
  /** When this run's client-info answer was obtained — the age of the balance it commits. */
  readonly obtainedAt: Date;
  readonly token: string;
  readonly runToMs: number;
  readonly rules: readonly Rule[];
  readonly ports: SyncPorts;
  readonly paced: <T>(request: () => Promise<T>) => Promise<T>;
  readonly cancelled: () => boolean;
}): Promise<{ outcome: AccountOutcome; imported: number }> {
  const { link, bankAccount, obtainedAt, token, runToMs, rules, ports, paced, cancelled } = input;

  let cursorMs = link.cursorMs;
  let seenIds: ReadonlySet<string> = ports.storage.importedIds(link.monobankAccountId);
  let imported = 0;

  for (const planned of planWindows(cursorMs, runToMs)) {
    let window: StatementWindow | undefined = planned;
    while (window) {
      if (cancelled()) {
        return { outcome: 'cancelled', imported };
      }
      const request: StatementWindow = window;
      const answer = await paced(() =>
        fetchStatement(ports.fetch, token, {
          accountId: link.monobankAccountId,
          fromMs: request.fromMs,
          toMs: request.toMs,
          context: { currency: bankAccount.currency, dateOf: ports.dateOf },
        }),
      );
      if (answer.kind !== 'ok') {
        // Nothing advances: the cursor, the imported ids and the транзакції are as they were, and
        // this exact window is what the next run asks for again.
        return { outcome: outcomeOf(answer), imported };
      }

      const items = answer.value;
      const full = isFullAnswer(items);
      const before = seenIds;
      const mapped = mapStatement(items, {
        accountId: link.accountId,
        currency: bankAccount.currency,
        rules,
        seenIds: before,
        newId: ports.newId,
      });
      // What this answer made known, taken from the mapper's own `seenNow` rather than derived a
      // second time here: "already seen" is one rule, and it lives in `sync.ts`.
      const newlySeenIds = [...mapped.seenNow].filter((id) => !before.has(id));
      // A full page leaves the cursor where it is; only a completed window moves it — and it
      // moves to the *planned* window's end, not to the narrowed request's. A continuation asks
      // for [start … oldest item received], so its own end is somewhere in the middle of the
      // window; committing that would leave everything between it and the window's end looking
      // unimported, and the next run would fetch it all again.
      const committedCursorMs = full ? cursorMs : planned.toMs;

      if (mapped.transactions.length > 0 || newlySeenIds.length > 0 || !full) {
        try {
          ports.storage.commitStatementAnswer({
            monobankAccountId: link.monobankAccountId,
            transactions: mapped.transactions,
            newlySeenIds,
            bankBalance: bankAccount.bankBalance,
            obtainedAt,
            cursorMs: committedCursorMs,
            storedAt: ports.now(),
          });
        } catch {
          // The answer stored nothing at all — that is what the one database transaction
          // guarantees — so this account simply did not finish, and the same window is retryable.
          return { outcome: 'unavailable', imported };
        }
        imported += mapped.transactions.length;
        seenIds = mapped.seenNow;
      }
      cursorMs = committedCursorMs;

      // A full answer means the API had more to say inside this window than it fit in one page.
      const continued = full ? continueWindow(request, oldestMs(items)) : undefined;
      if (full && !continued) {
        // Nothing narrower can be asked for: the window's oldest 500 items share the second the
        // URL is written in, which `sync.ts` documents as truncation preferable to a sync that
        // never ends. The window is therefore declared finished here, deliberately and once,
        // rather than left un-advanced for a later window's commit to step over — or, on the last
        // window of a run, left forever, re-reading the same page on every sync from now on.
        cursorMs = planned.toMs;
        commitCursor(ports, link, bankAccount, obtainedAt, cursorMs);
      }
      window = continued;
    }
  }

  return { outcome: 'complete', imported };
}

/**
 * Moves the cursor alone, for the one case that has nothing else to store: a window the API
 * cannot be asked about any more precisely. It goes through the same atomic commit as every other
 * write, with no транзакції and no new ids, and a failure simply leaves the cursor where it was.
 */
function commitCursor(
  ports: SyncPorts,
  link: StoredMonobankLink,
  bankAccount: MonobankAccount,
  obtainedAt: Date,
  cursorMs: number,
): void {
  try {
    ports.storage.commitStatementAnswer({
      monobankAccountId: link.monobankAccountId,
      transactions: [],
      newlySeenIds: [],
      bankBalance: bankAccount.bankBalance,
      obtainedAt,
      cursorMs,
      storedAt: ports.now(),
    });
  } catch {
    // The next run plans the same window again; nothing was lost.
  }
}

/** The oldest moment in an answer — where `continueWindow` narrows the next request to. */
function oldestMs(items: readonly StatementItem[]): number {
  return items.reduce((oldest, item) => Math.min(oldest, item.timeMs), Number.POSITIVE_INFINITY);
}
