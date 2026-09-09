import type { Rule } from '../domain/rules';
import type { IsoDate } from '../domain/transaction';
import type { PagingPosition, StatementAnswer, StoredMonobankLink } from '../db/monobank-repo';
import {
  fetchClientInfo,
  fetchStatement,
  type AuthFetchLike,
  type MonobankAccount,
  type Outcome,
  type StatementItem,
} from './api';
import type { MonobankTokenStore } from '../platform/monobank-token';
import {
  continueWindow,
  isFullAnswer,
  mapStatement,
  planWindows,
  syncOrder,
  usableAccounts,
  type RememberedAccount,
  type StatementWindow,
} from './sync';

/**
 * One foreground sync run: the effectful half that `api.ts` and `sync.ts` deliberately are not.
 *
 * Everything that is not a pure decision is a port — the token, the authenticated fetch, storage,
 * the правила, the clock, the device's calendar, the wait between requests and id generation — so
 * every path below runs under `npm run verify` against synthetic answers, with no network, no
 * timer and no emulator (design D5). What the coordinator itself owns is the sequence: one run end
 * captured at the start, links processed one after another in the order `syncOrder` gives — taken
 * once and never recomputed — windows oldest first, a page committed the moment it is read, and a
 * cursor that moves only when the whole window behind it is done.
 *
 * The token is read into a local variable and goes no further: it is not in a progress event, not
 * in a result, not in an error. An `invalid-token` answer stops the run rather than offering the
 * same rejected secret to every remaining account.
 */

/** monobank's personal API allows one request a minute; the run paces itself to that. */
export const MIN_REQUEST_GAP_MS = 60_000;

/**
 * What a paced call answers when the run stopped while it was waiting out the gap, and why.
 *
 * A value rather than an exception: every failure in this module is a value, and this one is not
 * even a failure. Nothing was sent, so there is nothing to report to the bank's account. It
 * carries the reason because the two reasons are not the same word to the owner — `cancelled` is
 * their own decision, `postponed` is a run out of time or out of foreground — and the account the
 * wait belonged to is reported under whichever it was.
 */
const STOPPED = Symbol('sync stopped while waiting');

/** Why a run stopped between requests: the two outcomes that are not the bank's answer. */
type StoppedOutcome = Extract<AccountOutcome, 'cancelled' | 'postponed'>;

interface Stopped {
  readonly kind: typeof STOPPED;
  readonly outcome: StoppedOutcome;
}

function stoppedWith(outcome: StoppedOutcome): Stopped {
  return { kind: STOPPED, outcome };
}

function isStopped<T>(answer: T | Stopped): answer is Stopped {
  return (
    typeof answer === 'object' &&
    answer !== null &&
    (answer as { readonly kind?: unknown }).kind === STOPPED
  );
}

/**
 * What a run reads of one monobank account: the currency every транзакція of its statement is in,
 * and the баланс банку committed with every page. Deliberately narrower than `MonobankAccount` —
 * an answer the run fetched carries more, an answer it already held carries exactly this, and
 * nothing below wants the difference.
 */
type RunAccount = Pick<MonobankAccount, 'currency' | 'bankBalance'>;

/** What storage has to offer a run. `src/db/monobank-repo.ts` is the implementation. */
export interface SyncStorage {
  listLinks(): readonly StoredMonobankLink[];
  importedIds(monobankAccountId: string): Set<string>;
  upsertAccounts(accounts: readonly MonobankAccount[], obtainedAt: Date): void;
  commitStatementAnswer(answer: StatementAnswer): void;
  /** Records that a sync completed for this link. Called for a `complete` account and no other. */
  markSynced(monobankAccountId: string, at: Date): void;
  /**
   * Records that this link has had its turn — that a request about it was sent, whatever the
   * answer. What `syncOrder` rations the next run by, and deliberately not `markSynced`.
   */
  noteTurn(monobankAccountId: string, at: Date): void;
  /**
   * The client-info answer this phone last stored, as rows with the moment each was obtained.
   * `usableAccounts` decides from them whether this run may skip its client-info request — which is
   * the difference between a run that can afford one request importing nothing and one importing.
   */
  rememberedAccounts(): readonly RememberedAccount[];
  /**
   * The moment this device last sent a request to the personal API, or `undefined` if it never
   * has. Seeds the pacing, so the minute between requests belongs to the phone and not to one run.
   */
  lastRequestAtMs(): number | undefined;
  /** A request was sent. Called for every request, ok or refused alike. */
  noteRequest(at: Date): void;
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
  /**
   * Asked wherever `cancelled` is, and answered after it: whether the run has run out of the time
   * it was given, or out of the foreground it was started in. A yes ends the run exactly as a
   * cancellation does, under the word `postponed` — nothing is wrong and the next run continues
   * from the cursors this one committed. Absent for a run that may take as long as it needs
   * (design D3, D5).
   */
  readonly postponed?: () => boolean;
  /**
   * Whether the owner asked for this run — «Синхронізувати» on the monobank screen, or the pull on
   * Головний. The same division the тихий інтервал draws, and there is one of it in this app.
   *
   * A run they asked for always fetches client-info, however fresh the answer this phone holds:
   * both triggers are the owner saying «now», and answering «now» with balances up to an hour old
   * would take away the one control they have for exactly that. It can afford the request — they
   * are watching it, it may wait out the minute, and one client-info request is a tenth of a
   * nine-рахунок sweep rather than the whole of a chance.
   */
  readonly asked?: boolean;
  /** Overridden in tests, which must never wait a real minute. */
  readonly minRequestGapMs?: number;
  /** Overridden in tests; the app always uses `CLIENT_INFO_FRESH_MS`. */
  readonly clientInfoFreshMs?: number;
}

/**
 * How one linked account finished. The four the screen spec names, plus `cancelled` for an
 * account the owner stopped the run before and `postponed` for one the run itself stopped before:
 * calling either «недоступно» would blame the bank for a decision that was not the bank's.
 *
 * `cancelled` and `postponed` are two words because they are two facts. The owner pressing
 * «Зупинити» is a decision; a background run stopping at a request the bank's minute does not yet
 * allow, or a run in front of the owner losing the foreground, is the app running out of time. Only the second means "nothing
 * is wrong, the next run continues from here", and that is what the screen, the remembered
 * attempt and the сповіщення про збій each have to tell apart.
 *
 * A storage failure is `unavailable` on purpose. From where the owner stands it is the same
 * answer — nothing was imported, the cursor did not move, try again — and inventing another word
 * for it would ask them to care which side of the device failed.
 */
export type AccountOutcome =
  | 'complete'
  | 'invalid-token'
  | 'rate-limited'
  | 'unavailable'
  | 'cancelled'
  | 'postponed';

/**
 * Every outcome, as data — so a caller that has to be total over them (the screen's legend, the
 * urgency order) reads the list rather than keeping its own copy of it.
 *
 * Derived from a record keyed by the union, so adding an outcome breaks the build here until this
 * line is updated, rather than quietly leaving a word the screen never names.
 */
const EVERY_OUTCOME: Readonly<Record<AccountOutcome, true>> = {
  complete: true,
  'invalid-token': true,
  'rate-limited': true,
  unavailable: true,
  cancelled: true,
  postponed: true,
};

export const ACCOUNT_OUTCOMES = Object.keys(EVERY_OUTCOME) as readonly AccountOutcome[];

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
function outcomeOf(
  answer: Outcome<unknown>,
): Exclude<AccountOutcome, 'complete' | 'cancelled' | 'postponed'> {
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
  /**
   * Whether the run stops here, and under which word. The owner is asked first, so a run that is
   * both stopped and out of time is reported as the owner's decision: it is the more informative
   * of the two, and the one they will look for on the screen.
   */
  const stopping = (): StoppedOutcome | undefined => {
    if (ports.cancelled?.()) {
      return 'cancelled';
    }
    return ports.postponed?.() ? 'postponed' : undefined;
  };
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

  // Longest since its turn first (`sync.ts`), taken once here and never recomputed: an order that
  // followed the run's own progress would be a priority queue over state the loop is mutating,
  // and a run over N accounts could no longer be said to make N requests.
  const links = syncOrder(ports.storage.listLinks());
  if (links.length === 0) {
    return { kind: 'no-links' };
  }

  const rules = ports.rules();
  /**
   * Seeded from storage, not from `undefined`: the gap belongs to the device, so a run started
   * seconds after the last one ended waits out the rest of it instead of firing at once and being
   * refused. A device that has never sent a request has no moment and does not wait.
   */
  let lastRequestMs: number | undefined = remembered(() => ports.storage.lastRequestAtMs());

/**
   * The API's minimum gap, waited out rather than slept through: the wait is a port.
   *
   * Answers `STOPPED` for a run the owner stopped *while it was waiting*. A gap is a whole minute
   * — long enough to leave the screen and press «Зупинити» — and a request sent after that is one
   * nobody asked for: it spends the device's one-a-minute allowance and, being a request, would take
   * the account's turn with it.
   */
  async function paced<T>(request: () => Promise<T>): Promise<T | Stopped> {
    if (lastRequestMs !== undefined) {
      const since = ports.nowMs() - lastRequestMs;
      if (since < gap) {
        // Never longer than one gap. A remembered moment in the future — an NTP correction, a
        // clock set by hand — would otherwise stall sync until the phone's own clock caught up,
        // which for a year-ahead clock is forever. `syncDue` guards the same hazard the same way.
        const ms = Math.min(gap, gap - since);
        report({ kind: 'waiting', ms });
        await ports.wait(ms);
      }
    }
    const stop = stopping();
    if (stop) {
      return stoppedWith(stop);
    }
    const sentAt = ports.nowMs();
    lastRequestMs = sentAt;
    // Remembered before the answer, because a request that comes back 429 was still sent — and
    // wrapped, because a storage hiccup must not become a sync that will not start.
    remember(() => ports.storage.noteRequest(ports.now()));
    return request();
  }

  const results: AccountResult[] = [];
  const finish = (
    link: StoredMonobankLink,
    outcome: AccountOutcome,
    imported: number,
    /** The moment of the answer this account was synced up to; absent before one is settled. */
    syncedToMs?: number,
  ): void => {
    // Only a completed account moves its moment. An account that ends invalid-token, rate-limited,
    // unavailable, cancelled or postponed keeps whatever moment it had, so the screen never dates a
    // sync that did not happen. Here rather than inside `commitStatementAnswer`: that call is one page of a
    // paginated sync, and an account stopped halfway would otherwise have committed pages and
    // claimed a finished sync (design D9).
    //
    // The moment recorded is the answer's, not the clock's, for the reason `runToMs` is: a sync is
    // as recent as the span it covered. With a span that can end in the past, the clock would date
    // a синхронізація over minutes the bank was never asked about — and an account whose cursor
    // already stands at the answer's moment asks nothing at all, so `markSynced` would otherwise
    // move its moment forward every run for as long as the answer stayed fresh.
    if (outcome === 'complete' && syncedToMs !== undefined) {
      ports.storage.markSynced(link.monobankAccountId, new Date(syncedToMs));
    }
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

  /**
   * The client-info answer this run works from — the one it already holds, or the one it fetches.
   *
   * A run nobody asked for does not buy balances it has. The bank allows one request a minute and
   * there is one of that allowance on the device, so a client-info request at the head of every run
   * is a run that owes a whole minute before the statement request that actually imports — a
   * minute a chance cannot sit out and an opening rarely can. Reusing what the phone already knows
   * is what turns «one request, nothing imported» into «one request, транзакції».
   *
   * A run the owner asked for skips this and asks the bank; `asked` says why.
   */
  const held = ports.asked
    ? undefined
    : remembered(() =>
        usableAccounts(
          ports.storage.rememberedAccounts(),
          links,
          ports.nowMs(),
          ports.clientInfoFreshMs,
        ),
      );

  let fetched: ReadonlyMap<string, RunAccount>;
  let obtainedAt: Date;

  if (held) {
    fetched = held.accounts;
    obtainedAt = held.obtainedAt;
  } else {
    const info = await paced(() => fetchClientInfo(ports.fetch, token));
    if (isStopped(info)) {
      // Stopped before a single request went out: nothing was asked, no turn was taken by anybody,
      // and nothing is blamed on the bank for a decision that was not the bank's. Every рахунок
      // keeps its place at the head of the next run's order.
      for (const link of links) {
        finish(link, info.outcome, 0);
      }
      return { kind: 'ran', imported: 0, accounts: results };
    }
    if (info.kind !== 'ok') {
      const outcome = outcomeOf(info);
      for (const link of links) {
        finish(link, outcome, 0);
      }
      return { kind: 'ran', imported: 0, accounts: results };
    }
    fetched = new Map(info.value.map((a) => [a.id, a]));
    // When those balances were obtained, not when a page happens to be committed: a first sync
    // paced at one request a minute would otherwise stamp a figure from half an hour ago as fresh,
    // which is exactly what `obtained_at` exists to prevent.
    obtainedAt = ports.now();
    // Stored before the first рахунок is worked, and that ordering is the whole cadence: a run
    // that spends its entire allowance on this request leaves the run after it able to send a
    // statement request instead of buying the same balances again.
    try {
      ports.storage.upsertAccounts(info.value, obtainedAt);
    } catch {
      // A cache that would not take the fresh balances changes nothing about what can be imported:
      // every page commits its own balance, and the next opening refetches. Not a run failure.
    }
  }

  /**
   * One run end for every account, and it is the moment of the client-info answer this run is
   * working from — not the clock.
   *
   * Taken once, so two accounts synced in the same run cover the same span and a long first sync
   * cannot leave a later account with a cursor ahead of an earlier one's. Taken from the *answer*,
   * so the баланс банку committed with every page and the транзакції committed beside it describe
   * the same instant. Рахунки offers «Звірити» — a коригування for the difference between a
   * рахунок's розрахунковий баланс and its баланс банку — and a run that imported an hour of
   * транзакції against an hour-old balance would make that difference an hour of the owner's real
   * spending. Ending here costs nothing: the span between this moment and now is imported by the
   * next run, from the cursor this one commits.
   *
   * For a run that fetched, this is what `ports.nowMs()` already was to within one round trip.
   */
  const runToMs = obtainedAt.getTime();

  let stopped: AccountOutcome | undefined;

  for (const [index, link] of links.entries()) {
    if (stopped) {
      // Everything after an invalid token, a cancellation or a run out of time, without a single
      // further request.
      finish(link, stopped, 0);
      continue;
    }
    const stop = stopping();
    if (stop) {
      stopped = stop;
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
      stopping,
    });
    if (
      account.outcome === 'invalid-token' ||
      account.outcome === 'cancelled' ||
      account.outcome === 'postponed'
    ) {
      stopped = account.outcome;
    }
    // A рахунок whose cursor already stands at the answer's moment has nothing to ask about, and
    // `complete` is right for it: it is complete, up to that moment. The case that would *not* be
    // — a рахунок no sync has ever completed, whose boundary lies after the answer — never reaches
    // here, because `usableAccounts` refuses to hand a run an answer that cannot serve it.
    //
    // Solved there and deliberately not by relabelling the outcome here. `postponed` means the run
    // has requests still owed, and `followUpDue` starts a run at once on it; a run that could only
    // report the same thing again would follow itself for as long as the app stayed open.
    finish(link, account.outcome, account.imported, runToMs);
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
 *
 * Where that narrowing has got to is written beside the cursor and read back here (design D11), so
 * a run that stops mid-window leaves the next one able to continue rather than to repeat: a
 * рахунок whose window needs more pages than one прогін affords is finished by several instead of
 * by none.
 */
async function syncOneAccount(input: {
  readonly link: StoredMonobankLink;
  readonly bankAccount: RunAccount;
  /** When this run's client-info answer was obtained — the age of the balance it commits. */
  readonly obtainedAt: Date;
  readonly token: string;
  readonly runToMs: number;
  readonly rules: readonly Rule[];
  readonly ports: SyncPorts;
  readonly paced: <T>(request: () => Promise<T>) => Promise<T | Stopped>;
  readonly stopping: () => StoppedOutcome | undefined;
}): Promise<{ outcome: AccountOutcome; imported: number }> {
  const { link, bankAccount, obtainedAt, token, runToMs, rules, ports, paced, stopping } = input;

  let cursorMs = link.cursorMs;
  let seenIds: ReadonlySet<string> = ports.storage.importedIds(link.monobankAccountId);
  let imported = 0;
  /**
   * What storage holds for this link's paging position right now. Kept so a page that moves
   * nothing else — a full answer whose every item was already imported — still writes the
   * position it moved, and so a page that moves nothing at all writes nothing.
   */
  let storedPaging: PagingPosition | null = link.paging;

  for (const { planned, first } of windowsOf(link, cursorMs, runToMs)) {
    let window: StatementWindow | undefined = first;
    while (window) {
      const stop = stopping();
      if (stop) {
        // Between windows: whatever this account committed stays committed, its cursor stays where
        // those pages moved it, and its turn — taken with the request that fetched them — stays
        // taken. Its moment does not move, because it did not complete.
        return { outcome: stop, imported };
      }
      const request: StatementWindow = window;
      const answer = await paced(() => {
        // This link's turn, written inside the paced call and therefore *after* the gap has been
        // waited out: a run stopped during that wait spends no request, and the spec says a turn
        // is not taken when no request is spent. The next run's order is rationed by this and not
        // by whether the account goes on to complete.
        remember(() => ports.storage.noteTurn(link.monobankAccountId, ports.now()));
        return fetchStatement(ports.fetch, token, {
          accountId: link.monobankAccountId,
          fromMs: request.fromMs,
          toMs: request.toMs,
          context: { currency: bankAccount.currency, dateOf: ports.dateOf },
        });
      });
      if (isStopped(answer)) {
        // Stopped while this account sat out the gap. No request was sent, so no turn was taken
        // and the next run finds this рахунок exactly where it was in the order.
        return { outcome: answer.outcome, imported };
      }
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
      // A full answer means the API had more to say inside this window than it fit in one page.
      // Decided before the commit, because where narrowing has got to is part of what the commit
      // stores: the position and the pages it describes land in one database transaction or in
      // none, so a position can never outlive an answer that did not store.
      const continued = full ? continueWindow(request, oldestMs(items)) : undefined;
      const paging: PagingPosition | undefined = continued
        ? { windowToMs: planned.toMs, requestToMs: continued.toMs }
        : undefined;

      if (
        mapped.transactions.length > 0 ||
        newlySeenIds.length > 0 ||
        !full ||
        moved(storedPaging, paging)
      ) {
        try {
          ports.storage.commitStatementAnswer({
            monobankAccountId: link.monobankAccountId,
            transactions: mapped.transactions,
            newlySeenIds,
            bankBalance: bankAccount.bankBalance,
            obtainedAt,
            cursorMs: committedCursorMs,
            storedAt: ports.now(),
            paging,
          });
        } catch {
          // The answer stored nothing at all — that is what the one database transaction
          // guarantees — so this account simply did not finish, and the same window is retryable.
          return { outcome: 'unavailable', imported };
        }
        imported += mapped.transactions.length;
        seenIds = mapped.seenNow;
        storedPaging = paging ?? null;
      }
      cursorMs = committedCursorMs;

      if (full && !continued) {
        // Nothing narrower can be asked for: the window's oldest 500 items share the second the
        // URL is written in, which `sync.ts` documents as truncation preferable to a sync that
        // never ends. The window is therefore declared finished here, deliberately and once,
        // rather than left un-advanced for a later window's commit to step over — or, on the last
        // window of a run, left forever, re-reading the same page on every sync from now on.
        cursorMs = planned.toMs;
        if (commitCursor(ports, link, bankAccount, obtainedAt, cursorMs)) {
          storedPaging = null;
        }
      }
      window = continued;
    }
  }

  return { outcome: 'complete', imported };
}

/**
 * Moves the cursor alone, for the one case that has nothing else to store: a window the API
 * cannot be asked about any more precisely. It goes through the same atomic commit as every other
 * write, with no транзакції, no new ids and no paging position — the window is over — and a
 * failure simply leaves the cursor where it was. Answers whether it stored, so the caller knows
 * whether the position it remembered is really gone.
 */
function commitCursor(
  ports: SyncPorts,
  link: StoredMonobankLink,
  bankAccount: RunAccount,
  obtainedAt: Date,
  cursorMs: number,
): boolean {
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
    return true;
  } catch {
    // The next run plans the same window again; nothing was lost.
    return false;
  }
}

/** One planned window and the request a run starts it at — the same thing, unless it is resumed. */
interface PlannedWindow {
  /** The window itself: what the cursor moves to when it finally answers short. */
  readonly planned: StatementWindow;
  /** The first request to send about it — narrowed, for a window a previous run left half-read. */
  readonly first: StatementWindow;
}

/**
 * The windows this account works this run, oldest first.
 *
 * A link half-way through a window works that window first and resumes it at the request the run
 * before stopped short of, rather than asking its first page again — that is the whole point of
 * remembering the position (design D11). Everything after it is planned from that window's end,
 * because that is where the cursor lands the moment it answers short; the span between it and the
 * run's own, later end is a window of its own and is planned as one.
 *
 * A remembered position is trusted only while it still describes work left to do: a window end at
 * or below the cursor — which a boundary the owner moved, or a бекап restored over this phone's
 * progress, can leave behind — describes none, and is discarded rather than trusted. The window is
 * then planned afresh, which is what a link that never had a position does anyway.
 */
function windowsOf(
  link: StoredMonobankLink,
  cursorMs: number,
  runToMs: number,
): readonly PlannedWindow[] {
  const resumed = resumedWindow(link.paging, cursorMs);
  const planned = planWindows(resumed ? resumed.planned.toMs : cursorMs, runToMs).map(
    (window) => ({ planned: window, first: window }),
  );
  return resumed ? [resumed, ...planned] : planned;
}

/**
 * The half-read window a position describes, or nothing when it describes no work left.
 *
 * Only the two ends are stored, because the start is rebuilt from the cursor: the cursor cannot
 * move while a window is being paged, and every narrowed request keeps the window's start. It is
 * rebuilt exactly for the first window of a run and one millisecond wider for any later one —
 * `planWindows` starts those at the previous window's end plus one while the cursor lands on that
 * end itself — and a millisecond wider costs nothing: both ends of a window are inclusive by
 * design, the URL floors both to seconds, and an item read twice imports once.
 *
 * The request end needs no check of its own. It is `continueWindow`'s answer about this very
 * window, so it is after the window's start and at or before its end, and it was stored in the
 * same transaction as the cursor it is compared against.
 */
function resumedWindow(
  position: PagingPosition | null,
  cursorMs: number,
): PlannedWindow | undefined {
  if (!position || position.windowToMs <= cursorMs) {
    return undefined;
  }
  return {
    planned: { fromMs: cursorMs, toMs: position.windowToMs },
    first: { fromMs: cursorMs, toMs: position.requestToMs },
  };
}

/** Whether an answer leaves the link's paging position somewhere other than where it found it. */
function moved(stored: PagingPosition | null, next: PagingPosition | undefined): boolean {
  return (
    (stored?.windowToMs ?? null) !== (next?.windowToMs ?? null) ||
    (stored?.requestToMs ?? null) !== (next?.requestToMs ?? null)
  );
}

/**
 * A write whose only job is to make the *next* run better paced or better ordered.
 *
 * Wrapped for the reason `upsertAccounts` and `commitStatementAnswer` are: storage that refuses a
 * write must not end a run. A refused `noteRequest` costs at most one unpaced first request next
 * time and a refused `noteTurn` at most one repeated turn — while an unwrapped throw here would
 * cost the whole sync, which is the failure this change exists to remove.
 */
function remember(write: () => void): void {
  try {
    write();
  } catch {
    // Nothing to do and nothing to say: the run carries on and imports what it can.
  }
}

/**
 * The same for a read: a device whose storage will not answer simply paces as a fresh one does —
 * and, for the client-info answer it holds, simply asks the bank as a phone with none would.
 */
function remembered<T>(read: () => T | undefined): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** The oldest moment in an answer — where `continueWindow` narrows the next request to. */
function oldestMs(items: readonly StatementItem[]): number {
  return items.reduce((oldest, item) => Math.min(oldest, item.timeMs), Number.POSITIVE_INFINITY);
}
