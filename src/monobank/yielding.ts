import type { AuthFetchLike } from './api';
import type { SyncPorts } from './coordinator';

/**
 * How a run gives up — its wait, or a request the bank never answers — as three small port
 * builders, so the coordinator knows nothing about chances, foregrounds or clocks beyond the
 * pacing it already does.
 *
 * The coordinator asks two things of the outside world between requests: `wait(ms)` before a
 * request, and `postponed()` after the wait and before the request. Everything here is a policy
 * for those two, written over an injected timer so every path runs under `npm run verify` with
 * no real millisecond waited:
 *
 * - `chanceRun` — a run on a chance the phone gives sends what the pace already allows and never
 *   waits, so nothing it decides can be frozen with the app;
 * - `foregroundRun` — a run in front of the owner whose app has left the foreground ends its wait
 *   at once and says so;
 * - `withRequestTimeout` — a request the bank has not answered within the timeout is given up, so
 *   no run can wait on the bank indefinitely.
 *
 * The first two both answer `postponed`, and the word is the same because the meaning is: the run
 * stopped for want of time or of foreground, nothing is wrong, and the next run continues it.
 */

/**
 * A timer as a port: schedule `fn` after `ms`, and answer with how to cancel it. `setTimeout` on
 * the device, a hand-driven queue in a test.
 */
export type SetTimer = (fn: () => void, ms: number) => () => void;

/** The two ports a policy answers. Everything else in `SyncPorts` is the caller's. */
export type YieldingPorts = Pick<SyncPorts, 'wait' | 'postponed'>;

/** The obvious `SetTimer`, over whatever `setTimeout` this platform has. */
export const deviceTimer: SetTimer = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

/**
 * A run on a chance the phone gives: it sends what the pace already allows, and never waits.
 *
 * No clock, no deadline, no timer — the whole policy is that a wait asked for is a wait not taken.
 * The coordinator asks `wait(ms)` only when it owes part of the API's minimum gap, and asks
 * `postponed()` immediately after, so «was a wait asked for» *is* «this run owes a gap it has not
 * sat out», and answering from that alone is enough.
 *
 * It replaces a version that gave a chance eight minutes and let it sleep through the gap on a
 * `setTimeout`. Android stops JS timers along with the Activity, so on the owner's phone one such
 * wait of fifty-nine seconds lasted twenty minutes: the run held the single-run lock the whole
 * time, the two chances that followed found a run already going and did nothing, and across two
 * days not one statement request was sent. What paces the app instead is WorkManager's own quarter
 * of an hour between chances — longer than the gap the bank asks for, and the one timer Android
 * does not freeze.
 *
 * A request already sent is never interrupted: the pace is asked before a request, and an answer
 * that arrives is stored whole, because that is what the coordinator does with every answer.
 */
export function chanceRun(): YieldingPorts {
  let owed = false;
  return {
    wait: () => {
      owed = true;
      return Promise.resolve();
    },
    postponed: () => owed,
  };
}

/**
 * A run in front of the owner: the ports of the app shell's run, the pull's and the monobank
 * screen's.
 *
 * The wait ends on the timer or on the app leaving the foreground, whichever comes first, and the
 * other is let go. Ending early is the whole point, not an optimisation: on Android every JS timer
 * is paused while the app is not in front, so a wait left to its timer would never resolve and the
 * run would hold the one-run lock — and with it every background run — until the app was next
 * opened. The foreground event, unlike a timer, reaches a paused JS thread, and it is what wakes
 * the wait. A request already in flight answers through a native callback, which is not paused
 * either, and its page commits before the run asks and stops.
 *
 * The phone answers «in front» or «away» and nothing finer — a dialog drawn over the app reads
 * exactly as the owner leaving — so this policy does not guess at the difference. What it refuses
 * to do is spend a whole run on the answer: a run that has been asked for no wait yet does not
 * yield, so a phone already answering «away» when a run starts costs that run one request instead
 * of all of it (design D12).
 *
 * The wait is the only thing the coordinator tells this port, so it is what «the run has begun
 * spending» is read from. The pace asks for one before every request but the run's first — *unless
 * the device already owes the bank the minute between requests*, in which case a wait comes before
 * the first request too and this port yields with nothing sent. That is not a miss: such a run has
 * nothing it may send. The wait it owes is the pace's, no timer will run it out with the app away,
 * and a request sent regardless would be refused rather than answered. The spec names that case
 * rather than letting this rule sound broader than it is.
 */
export function foregroundRun(input: {
  readonly setTimer: SetTimer;
  /** Whether the app is in front of the owner right now. */
  readonly inForeground: () => boolean;
  /** Called once when the app leaves the foreground; answers with how to stop listening. */
  readonly onLeaveForeground: (fn: () => void) => () => void;
}): YieldingPorts {
  let began = false;
  return {
    wait: (ms) => {
      began = true;
      if (!input.inForeground()) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let cancelTimer: (() => void) | undefined;
        let stopListening: (() => void) | undefined;
        const done = () => {
          cancelTimer?.();
          stopListening?.();
          resolve();
        };
        cancelTimer = input.setTimer(done, ms);
        stopListening = input.onLeaveForeground(done);
      });
    },
    postponed: () => began && !input.inForeground(),
  };
}

/**
 * How long a request may go unanswered before it is given up.
 *
 * Thirty seconds: generous for a 500-item page and short against a background run's eight-minute
 * chance. React Native's Android client sets no timeout of its own, so without this a request the
 * bank never answers is a run that never ends — the one-run lock held, every later start waiting
 * on it, and a background worker killed at ten minutes and retried into the same wait.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The device `fetch` as the personal API sees it, with the one thing this module adds: a signal
 * the request can be abandoned through, so a timed-out request also releases its socket.
 */
export type AbortableFetch = (
  url: string,
  headers: Readonly<Record<string, string>>,
  signal?: AbortSignal,
) => ReturnType<AuthFetchLike>;

/**
 * The rejection a request that was never answered carries — the message unchanged, and a `name`
 * beside it.
 *
 * The name is what `journal.watchFetch` reads to write «не відповів» rather than «зірвався». It
 * has to be a name and not the message: the журнал writes the app's own enumerated word for a
 * rejected request and never the caught error's text, because a platform's rejection may quote the
 * whole URL it was given and undo the path shaping `describeRequest` applies.
 */
export const REQUEST_TIMEOUT_NAME = 'RequestTimeout';

function requestTimeout(timeoutMs: number): Error {
  const error = new Error(`monobank did not answer within ${timeoutMs} ms`);
  error.name = REQUEST_TIMEOUT_NAME;
  return error;
}

/**
 * A request that does not answer within `timeoutMs` is given up: the promise rejects, and
 * `fetchClientInfo` / `fetchStatement` turn a rejection into `unavailable` exactly as they do a
 * network failure — nothing stored, the cursor untouched, the turn taken, the run going on.
 *
 * React Native's Android client sets no timeout of its own, and a request the bank never answers
 * would be a run that never ends: the one-run lock held, every later start waiting on it, and a
 * background run's worker killed and retried into the same wait. The timeout is generous for a
 * 500-item page and short against the ten minutes WorkManager allows a worker.
 *
 * An `AbortController` is used when the platform has one, so the socket goes with the promise; a
 * platform without one still gets the rejection, which is what the run needs.
 */
export function withRequestTimeout(
  fetch: AbortableFetch,
  input: { readonly setTimer: SetTimer; readonly timeoutMs: number },
): AuthFetchLike {
  return (url, headers) => {
    const controller =
      typeof AbortController === 'undefined' ? undefined : new AbortController();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cancelTimer = input.setTimer(() => {
        if (settled) {
          return;
        }
        settled = true;
        controller?.abort();
        reject(requestTimeout(input.timeoutMs));
      }, input.timeoutMs);
      fetch(url, headers, controller?.signal).then(
        (response) => {
          if (settled) {
            return;
          }
          settled = true;
          cancelTimer();
          resolve(response);
        },
        (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          cancelTimer();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  };
}
