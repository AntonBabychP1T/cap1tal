import { syncLinkedAccounts, type SyncPorts, type SyncRun } from '../monobank/coordinator';
import { worstOutcome, type SyncAttempt } from '../monobank/auto';
import { clear as clearAlert, raise as raiseAlert, type AlertPorts } from './alerting';

/**
 * The one place a monobank sync is started, whoever asked for it: the app opening, the app coming
 * back to the foreground, the pull on Головний, and «Синхронізувати» on the monobank screen.
 *
 * It exists for one reason — monobank allows one request a minute, and there is exactly one of
 * that budget on the device. Two runs at once would race each other's cursors, spend the
 * allowance twice and each commit half a statement. So the lock is module state, the shape
 * `notification-drain.ts` already uses for the capture queue: three of the four callers live in
 * three different React trees, and what is being guarded belongs to none of them.
 *
 * Everything about *when* to start is `src/monobank/auto.ts`'s and is decided before calling here;
 * everything about how a run works is `coordinator.ts`'s and is untouched. What this module owns
 * is the lock, the attempt written around the run, and the one line about сповіщення.
 *
 * The token never reaches it. It goes into `SyncPorts.tokenStore`, is read inside the coordinator
 * and appears in no result — this module never sees the string.
 */

/** What the run needs of storage beyond the coordinator's own `SyncStorage`. */
export interface AttemptStorage {
  attempt(): SyncAttempt | undefined;
  beginAttempt(at: Date): void;
  finishAttempt(outcome: string): void;
  withdrawAttempt(): void;
}

export interface StartSyncPorts {
  /** Everything a run needs; handed straight to the coordinator, unchanged. */
  readonly sync: SyncPorts;
  readonly attempts: AttemptStorage;
  /** Where a сповіщення про збій is raised and cleared, or absent when nothing should be. */
  readonly alerts?: AlertPorts;
  /**
   * Whether the screen that explains a sync failure is in front of the owner.
   *
   * The automatic run passes `true` and it is a fact rather than a guess: that run exists
   * *because* the app was opened or foregrounded, and Головний says what happened in «Потребує
   * уваги» in more words than a notification may carry. The monobank screen passes its own
   * answer, because a run started there can outlive the owner's patience for watching it.
   */
  readonly attended: boolean;
}

/** What asking for a sync came to. */
export type SyncStart =
  /** This call started the run; here is what it came to. */
  | { readonly kind: 'ran'; readonly run: SyncRun }
  /**
   * A run was already going on, so this call started nothing and changed nothing. It waited for
   * the run in flight and reports what *that* one came to, which is what a pull-to-refresh needs
   * to know when to stop spinning.
   *
   * `run` is absent when the run in flight failed outright — a device whose storage threw, which
   * the coordinator's typed outcomes cannot express. A refused start reports; it never fails for
   * somebody else's run, so the rejection stops here (spec: «At most one sync run exists at a
   * time»).
   */
  | { readonly kind: 'already-running'; readonly run?: SyncRun };

/**
 * The run going on right now, or `undefined`. Module state, like the lock it is.
 */
let inFlight: Promise<SyncRun> | undefined;

/**
 * Everyone waiting to hear that a run began or ended — the same shape `onCapturesStored` has, and
 * for the same reason: what is being observed is one device's one sync, and the screens that care
 * are mounted independently of it.
 *
 * Fired on **start** as well as on finish. A finish-only signal would leave both screens unable to
 * say what they promise: a run begun by the foreground trigger while Головний is already open
 * would say nothing at all until it ended, so «синхронізація…» would never appear on the screen
 * the owner is looking at.
 */
const listeners = new Set<() => void>();

/** Subscribe to "a run began or ended". Returns the unsubscribe an effect cleans up with. */
export function onSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a run is going on now — what a screen reads to say «синхронізація…». */
export function syncInFlight(): boolean {
  return inFlight !== undefined;
}

function announce(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * The three answers that mean the run never reached monobank: no token kept, nothing linked, or
 * secure storage itself unreadable. Nothing was tried, so nothing is remembered as tried — without
 * this a phone with no token would wait out a quiet interval before each of its non-attempts.
 */
function reachedTheBank(run: SyncRun): run is Extract<SyncRun, { kind: 'ran' }> {
  return run.kind === 'ran';
}

/**
 * Starts a sync, unless one is already going on.
 *
 * The attempt's moment is written *before* the coordinator is called and its outcome after,
 * because force-closing an app that feels slow is exactly what an owner does: a moment written
 * only on success would let ten openings fire ten requests into an API that allows one a minute.
 * The window between the two writes is a token read; an app killed inside it leaves a moment with
 * no outcome, which `needsOwner` answers for by needing nobody.
 */
export async function startSync(ports: StartSyncPorts): Promise<SyncStart> {
  const running = inFlight;
  if (running) {
    // Waited for, never adopted: a refused start reports that a run is going on, and a run that
    // failed is that run's caller's problem and not this one's.
    const finished = await running.catch(() => undefined);
    return finished === undefined
      ? { kind: 'already-running' }
      : { kind: 'already-running', run: finished };
  }

  const run = (async (): Promise<SyncRun> => {
    ports.attempts.beginAttempt(ports.sync.now());
    const result = await syncLinkedAccounts(ports.sync);
    if (!reachedTheBank(result)) {
      ports.attempts.withdrawAttempt();
      return result;
    }
    const outcome = worstOutcome(result.accounts);
    if (outcome !== undefined) {
      ports.attempts.finishAttempt(outcome);
    }
    if (ports.alerts) {
      // Success clears, whoever asked for the run: a сповіщення left standing by a failure the
      // owner was away for must not outlive the sync that fixed it. A failure raises one only
      // when nobody is watching — `decideAlert` answers `attended` with silence, and the row on
      // Головний is what the owner meets instead.
      await (outcome === 'complete'
        ? clearAlert('monobank-sync', ports.alerts)
        : raiseAlert('monobank-sync', { attended: ports.attended }, ports.alerts));
    }
    return result;
  })();

  // Claimed and announced before the first `await` of the caller, so a second start landing in the
  // same tick is refused rather than racing this one.
  inFlight = run;
  announce();
  try {
    return { kind: 'ran', run: await run };
  } finally {
    inFlight = undefined;
    announce();
  }
}
