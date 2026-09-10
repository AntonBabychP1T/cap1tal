import {
  syncLinkedAccounts,
  type AccountOutcome,
  type SyncPorts,
  type SyncProgress,
  type SyncRun,
} from '../monobank/coordinator';
import { worstOutcome, type SyncAttempt } from '../monobank/auto';
import { clear as clearAlert, raise as raiseAlert, type AlertPorts } from './alerting';
import { STEP_BEGAN, SYNC_ACCOUNTS, SYNC_STEP } from '../reporting/journal';
import { journal, type StepEnding } from './journal';

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
  /**
   * The mark this run's entries carry, minted by whoever built the ports.
   *
   * One id for the whole run rather than one per writer: the `network` entries `syncPorts()`
   * writes, the per-рахунок `step` entries `journalProgress` writes and the run's own two ends are
   * one operation, and a репорт that could not tell which request belonged to which run would
   * answer «which card is not syncing» no better than the one that prompted this change. Absent,
   * `journal.step` mints its own — a run recorded whole, with only its own entries tied together.
   */
  readonly run?: string;
}

/** The name every entry of one monobank sync run carries — the журнал's own vocabulary. */
export { SYNC_STEP };

/** The name a single рахунок's turn within a run carries, by the bank's own identifier for it. */
export function accountStepName(monobankAccountId: string): string {
  return `${SYNC_STEP}/${monobankAccountId}`;
}

/**
 * A `SyncProgress` listener that writes the run's timeline into the журнал.
 *
 * The coordinator has emitted these four events since it was written and only the monobank screen
 * ever listened; the automatic run and the background chance passed no listener at all, which is
 * why the репорт that prompted this change said nothing whatever about a sync. Composed onto
 * whatever listener the caller has rather than replacing it (design D4), so the screen keeps its
 * progress and every run keeps its record.
 *
 * Nothing here is decided: each event becomes one entry naming what it is about — a рахунок by the
 * bank's own identifier for it, which is the one identifier of the owner's this журнал admits and
 * the only thing that answers «which card».
 */
export function journalProgress(run: string): (progress: SyncProgress) => void {
  return (progress) => {
    switch (progress.kind) {
      case 'started':
        journal.record('step', SYNC_STEP, SYNC_ACCOUNTS, { run, counts: { accounts: progress.accounts } });
        return;
      case 'account':
        journal.record('step', accountStepName(progress.monobankAccountId), STEP_BEGAN, {
          run,
          counts: { index: progress.index, of: progress.of },
        });
        return;
      case 'waiting':
        journal.record('step', `${SYNC_STEP}/wait`, undefined, { run, counts: { ms: progress.ms } });
        return;
      case 'finished-account':
        journal.record(
          'step',
          accountStepName(progress.result.monobankAccountId),
          progress.result.outcome,
          { run, counts: { imported: progress.result.imported } },
        );
        // Why `unavailable` came to that, when the bank did answer and `api.ts` could name the
        // cause — one more entry rather than a second word on the one above, since `detail` is
        // one enumerated word and this one already has its own (bug-report spec.md).
        if (progress.result.reason !== undefined) {
          journal.record('step', accountStepName(progress.result.monobankAccountId), progress.result.reason, {
            run,
          });
        }
        return;
    }
  };
}

/**
 * The journaling progress listener with whatever listener the caller already had beside it.
 *
 * Composed, never replaced (design D4): the monobank screen's «2 з 3» is the owner's, and a
 * журнал that took it away to record the same events would trade a feature for a diagnostic. The
 * entry is written first, so a listener that throws — a screen's `setState` after unmount — costs
 * the screen its update and never the record.
 */
export function composeProgress(
  run: string,
  existing?: (progress: SyncProgress) => void,
): (progress: SyncProgress) => void {
  const write = journalProgress(run);
  return (progress) => {
    write(progress);
    existing?.(progress);
  };
}

/**
 * What the run's ending entry says: the one word the run is remembered by, and what it imported.
 *
 * The run's own two entries are what records a sync *at all*. `SyncProgress` has no run-finished
 * event, and its `started` fires only after the token has been read — so `not-configured`,
 * `storage-unavailable` and `no-links` emit nothing through the listener, and those are precisely
 * the three the репорт that prompted this change needed a word about (design D4).
 */
export function syncEnding(run: SyncRun): StepEnding {
  if (run.kind !== 'ran') {
    return { detail: run.kind };
  }
  return {
    detail: worstOutcome(run.accounts) ?? run.kind,
    counts: { imported: run.imported, accounts: run.accounts.length },
  };
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
 * Whether the one outcome a run is remembered by is a failure — something that did not arrive
 * because the bank or the token said no.
 *
 * `cancelled` and `postponed` are the two that are not, and `undefined` — a run with no accounts,
 * which the coordinator does not produce — is not one either.
 */
function failed(outcome: AccountOutcome | undefined): boolean {
  return outcome !== undefined && outcome !== 'cancelled' && outcome !== 'postponed';
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
    const result = await journal.step(SYNC_STEP, () => syncLinkedAccounts(ports.sync), {
      ...(ports.run === undefined ? {} : { run: ports.run }),
      ending: syncEnding,
    });
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
      // Головний is what the owner meets instead. A run that merely *stopped* — the owner's own
      // «Зупинити», or a run out of the time or the foreground it was given — raises nothing:
      // a run that stopped is not a run that failed, and the next one continues it.
      if (outcome === 'complete') {
        await clearAlert('monobank-sync', ports.alerts);
      } else if (failed(outcome)) {
        await raiseAlert('monobank-sync', { attended: ports.attended }, ports.alerts);
      }
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
