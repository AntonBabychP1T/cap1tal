import type { AuthFetchLike } from './api';
import type { SyncPorts } from './coordinator';

/**
 * How a run gives up — its wait, or a request the bank never answers — as three small port
 * builders, so the coordinator knows nothing about budgets, foregrounds or clocks beyond the
 * pacing it already does.
 *
 * The coordinator asks two things of the outside world between requests: `wait(ms)` before a
 * request, and `postponed()` after the wait and before the request. Everything here is a policy
 * for those two, written over an injected timer so every path runs under `npm run verify` with
 * no real millisecond waited:
 *
 * - `budgetedRun` — a background run at the end of its budget declines to start a wait that would
 *   outlast it, and says so;
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
 * A run given a time budget: the ports of a background run.
 *
 * The budget is enforced where the run spends time — the wait before a request — and nowhere
 * else. A wait that would end past the deadline is not started: it resolves at once and is
 * remembered, so the question that follows it answers yes and the run stops before sending. A
 * request already sent is never interrupted here: the budget is asked before a request, and an
 * answer that arrives after the deadline is stored whole, because that is what the coordinator
 * does with every answer it gets.
 */
export function budgetedRun(input: {
  readonly nowMs: () => number;
  readonly setTimer: SetTimer;
  /** Epoch milliseconds past which no wait may end and no request may be sent. */
  readonly deadlineMs: number;
}): YieldingPorts {
  let gaveUp = false;
  return {
    wait: (ms) => {
      if (input.nowMs() + ms > input.deadlineMs) {
        gaveUp = true;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        input.setTimer(resolve, ms);
      });
    },
    postponed: () => gaveUp || input.nowMs() >= input.deadlineMs,
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
 */
export function foregroundRun(input: {
  readonly setTimer: SetTimer;
  /** Whether the app is in front of the owner right now. */
  readonly inForeground: () => boolean;
  /** Called once when the app leaves the foreground; answers with how to stop listening. */
  readonly onLeaveForeground: (fn: () => void) => () => void;
}): YieldingPorts {
  return {
    wait: (ms) => {
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
    postponed: () => !input.inForeground(),
  };
}

/**
 * How long a request may go unanswered before it is given up.
 *
 * Thirty seconds: generous for a 500-item page and short against a background run's eight-minute
 * budget. React Native's Android client sets no timeout of its own, so without this a request the
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
 * A request that does not answer within `timeoutMs` is given up: the promise rejects, and
 * `fetchClientInfo` / `fetchStatement` turn a rejection into `unavailable` exactly as they do a
 * network failure — nothing stored, the cursor untouched, the turn taken, the run going on.
 *
 * React Native's Android client sets no timeout of its own, and a request the bank never answers
 * would be a run that never ends: the one-run lock held, every later start waiting on it, and a
 * background run's worker killed and retried into the same wait. The timeout is generous for a
 * 500-item page and short against a background run's budget.
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
        reject(new Error(`monobank did not answer within ${input.timeoutMs} ms`));
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
