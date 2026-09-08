import type { AccountOutcome, AccountResult } from './coordinator';

/**
 * When a sync may start on its own, what a finished run is remembered as, and whether what it
 * came to is something the owner has to do anything about.
 *
 * Four pure functions and two constants. Nothing here reads a clock, storage or the network: the
 * moments arrive as arguments, exactly as `src/domain/` requires and for the same reason —
 * «відкрив застосунок → тихо запустився sync» is a rule about time, and a rule about time that
 * reads its own clock cannot be tested. `src/ui/monobank-sync.ts` is the half that acts on these
 * answers, and `src/monobank/coordinator.ts` is what it acts with.
 *
 * The words the owner reads are deliberately not here. This module answers *whether* monobank
 * needs them and *which* of two situations it is; Головний says it in Ukrainian, because that is
 * the capability that owns what appears on a screen.
 */

/**
 * How long a sync the owner did not ask for waits after the last attempt.
 *
 * Fifteen minutes, and the arithmetic is the argument. monobank's personal API allows one request
 * a minute, and a run costs `1 + links` requests — three requests and about three minutes for a
 * two-account owner. A quarter of an hour keeps that at roughly a fifth of the bank's allowance
 * even for someone who opens the app constantly, while «оновлено 3 хв тому» stays true for most of
 * the day.
 *
 * Every open would be worse than useless: two openings a minute apart would each want a run, the
 * second would be refused by the one-run lock, and the owner would get nothing for the request the
 * first one spent. An hour would answer «повернувся після кількох годин» and fail «відкрив
 * застосунок», which is the case this exists for — the coffee bought at 9:10 would not be on the
 * screen at 9:40.
 *
 * Not a setting: a setting is a screen, a stored value, a бекап field and a migration, for a
 * number the owner has no way to choose well.
 */
export const QUIET_INTERVAL_MS = 15 * 60_000;

/**
 * How long the data may go unrefreshed before a failure is worth the owner's attention.
 *
 * A day. Below it, a failed run is a phone in a lift, and a row that appeared every time the metro
 * did would teach the owner to ignore the section that also holds their чернетки.
 */
export const STALE_AFTER_MS = 24 * 60 * 60_000;

/** The last run this phone attempted, as `src/db/monobank-repo.ts` remembers it. */
export interface SyncAttempt {
  readonly attemptedAtMs: number;
  /**
   * Absent while the run has not reported: one going on now, or one the phone did not survive.
   * A string rather than the union, because it comes back out of SQLite — `outcomeOf` is what
   * turns it into an outcome this module knows, and anything else reads as «not reported».
   */
  readonly outcome?: string;
}

/**
 * The account outcomes, worst first — worst meaning "most needs the owner", which is the only
 * ordering a single remembered outcome can usefully have.
 *
 * `cancelled` sits below every failure and above `complete` on purpose: the owner stopped the run
 * themselves, so it is not a failure to report, but it is not a completed sync either. `postponed`
 * sits between the two: neither needs the owner, and when both appear in one run — a run the owner
 * stopped that was also out of time — their own decision is the more informative word.
 */
const BY_URGENCY: readonly AccountOutcome[] = [
  'invalid-token',
  'rate-limited',
  'unavailable',
  'cancelled',
  'postponed',
  'complete',
];

/** A remembered string as an outcome this module knows, or `undefined` for anything else. */
function outcomeOf(stored: string | undefined): AccountOutcome | undefined {
  return BY_URGENCY.find((known) => known === stored);
}

/**
 * A remembered attempt as `syncDue` wants it: a moment and what it came to, or nothing at all on a
 * device that has attempted none.
 *
 * Spelled out because `attemptedAtMs: undefined` and an absent key are the same thing to `syncDue`
 * but not to `exactOptionalPropertyTypes` — and written once, because both callers that ask
 * whether a sync is due (the app shell and the background run) need exactly this shape.
 */
export function attemptInput(attempt: SyncAttempt | undefined): {
  attemptedAtMs?: number;
  outcome?: string;
} {
  if (attempt === undefined) {
    return {};
  }
  return {
    attemptedAtMs: attempt.attemptedAtMs,
    ...(attempt.outcome === undefined ? {} : { outcome: attempt.outcome }),
  };
}

/**
 * Whether a sync the owner did not ask for may start now.
 *
 * Deliberately does not ask whether a token is kept. That answer lives in secure storage, the
 * coordinator reads it anyway before it sends anything, and asking here would mean a second read
 * of the device's one secret on every opening. A device with links and no token starts a run,
 * learns there is no token, sends no request and withdraws its attempt — see
 * `src/ui/monobank-sync.ts`.
 */
export function syncDue(input: {
  /** How many рахунки are linked; nothing to sync without one. */
  readonly links: number;
  /** The moment of the last attempt, or `undefined` on a device that has attempted none. */
  readonly attemptedAtMs?: number;
  /**
   * What that attempt is remembered as, when it is remembered as anything. Only one word changes
   * the answer, and it is `postponed`.
   */
  readonly outcome?: string;
  readonly nowMs: number;
  /** Overridden in tests; the app always uses `QUIET_INTERVAL_MS`. */
  readonly quietIntervalMs?: number;
}): boolean {
  if (input.links === 0) {
    return false;
  }
  if (input.attemptedAtMs === undefined) {
    return true;
  }
  // The quiet interval exists to stop repeated openings spending the bank's budget on runs that
  // have nothing to do. A run that stopped for want of time or of foreground has, by definition,
  // something left to do, and the requests it did not spend are still owed.
  if (outcomeOf(input.outcome) === 'postponed') {
    return true;
  }
  // An attempt dated in the future — an NTP correction, a clock set by hand — is due rather than
  // never due. Waiting it out would disable automatic sync until the phone's own clock caught up,
  // which for a year-ahead clock is forever; running once costs one run and heals the attempt,
  // because the next `beginAttempt` writes the clock as it is now.
  if (input.attemptedAtMs > input.nowMs) {
    return true;
  }
  return input.nowMs - input.attemptedAtMs >= (input.quietIntervalMs ?? QUIET_INTERVAL_MS);
}

/**
 * Whether the run that just ended has to be finished at once by a full one.
 *
 * A second rule beside `syncDue` rather than a second reading of it, and deliberately so. Every
 * run announces its end, including one that never reached the bank and withdrew its attempt; on a
 * phone with links and no token — the state removing the token leaves — `syncDue` over a withdrawn
 * attempt is true again, so asking it here would be a run that withdraws, announces, starts,
 * withdraws, for as long as the app is open. Deciding from the finished run's own outcome cannot
 * loop: the follow-up runs in front of the owner without a budget, so it ends complete, failed,
 * or — if the app left meanwhile — postponed with the app no longer in front, and none of those is
 * followed by anything (design D6).
 */
export function followUpDue(input: {
  /** The attempt the run that just ended wrote, or `undefined` when it withdrew it. */
  readonly attempt: SyncAttempt | undefined;
  /** Whether the app is in front of the owner right now. */
  readonly inForeground: boolean;
}): boolean {
  return input.inForeground && outcomeOf(input.attempt?.outcome) === 'postponed';
}

/**
 * The one outcome a finished run is remembered as: the most urgent among its accounts.
 *
 * `undefined` for a run with no accounts at all, which the coordinator does not produce today —
 * it answers `no-links` before it gets there. Returning `'complete'` for it would be the one
 * answer that could lie, so the caller records no outcome instead.
 */
export function worstOutcome(results: readonly AccountResult[]): AccountOutcome | undefined {
  return BY_URGENCY.find((outcome) => results.some((result) => result.outcome === outcome));
}

/**
 * Which of the two situations the owner has to deal with, or `undefined` when there is nothing
 * for them to do. Головний turns this into a row; nothing else reads it.
 */
export type OwnerSituation =
  /** The token was rejected: no run can succeed until they supply another. */
  | 'token-rejected'
  /** Runs are failing and the data has gone stale — whosever fault it is. */
  | 'not-refreshed';

export function needsOwner(input: {
  readonly attempt: SyncAttempt | undefined;
  /** The most recent completed sync among the linked рахунки, or `undefined` if none ever has. */
  readonly lastCompletedAtMs?: number;
  readonly nowMs: number;
  /** Overridden in tests; the app always uses `STALE_AFTER_MS`. */
  readonly staleAfterMs?: number;
}): OwnerSituation | undefined {
  const outcome = outcomeOf(input.attempt?.outcome);
  // Nothing tried, nothing reported, or nothing wrong: three different situations, and in none of
  // them is there anything for the owner to do.
  if (outcome === undefined || outcome === 'complete') {
    return undefined;
  }
  if (outcome === 'invalid-token') {
    return 'token-rejected';
  }
  // The owner stopped it themselves, or the run ran out of the time it was given. Calling either a
  // problem — however old the data is by now — would blame the bank for it: nothing failed, and in
  // the postponed case the next run continues from where this one stopped.
  if (outcome === 'cancelled' || outcome === 'postponed') {
    return undefined;
  }
  const staleAfter = input.staleAfterMs ?? STALE_AFTER_MS;
  const stale =
    input.lastCompletedAtMs === undefined || input.nowMs - input.lastCompletedAtMs > staleAfter;
  return stale ? 'not-refreshed' : undefined;
}
