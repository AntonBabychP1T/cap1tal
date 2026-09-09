import { attemptInput, needsOwner, syncDue, worstOutcome } from '../monobank/auto';
import type { AccountOutcome, SyncPorts } from '../monobank/coordinator';
import { chanceRun } from '../monobank/yielding';
import { clear as clearAlert, raise as raiseAlert, type AlertPorts } from './alerting';
import { journal } from './journal';
import { syncCoverage } from './monobank-screen';
import { startSync, type AttemptStorage } from './monobank-sync';

/**
 * One chance the phone gives, spent: whether to sync at all, how far the bank's minute lets it
 * get, and what — if anything — the owner is told afterwards.
 *
 * The whole of a background run's thinking is here rather than in the task file, and the module
 * imports nothing from `src/platform/*-device.ts` or `src/platform/background-turn.ts`: the ports
 * and the clock arrive as *inputs*, so `npm run verify` proves every decision against the in-memory
 * token store, a scripted bank and a real database, and `src/platform/monobank-sync-task.ts` is
 * left with a `defineTask` and a return value (design D7).
 *
 * Nothing about the run itself is new. It is the same `startSync` the opening, the pull and the
 * monobank screen call — the same one-run lock, the same quiet interval, the same order of turns,
 * the same attempt written around it — with two ports replaced: a `wait` that is never taken, and
 * the `postponed` that follows from it.
 *
 * What *is* this module's own is the announcing. `startSync`'s rule («a failure nobody is watching
 * posts one») is the rule for a run the owner started and walked away from; a run nobody asked for
 * follows the rule Головний already applies to the automatic one — silence unless monobank needs
 * the owner — so the row on the screen and the сповіщення in the shade read the same `needsOwner`
 * and can never disagree about whether something is wrong.
 */

/** Whether the phone should be asked for chances at all. The one rule registration follows. */
export function backgroundTurnsWanted(input: { readonly links: readonly unknown[] }): boolean {
  return input.links.length > 0;
}

/** What a background run needs of storage: the links it syncs, and the attempt around the run. */
export interface BackgroundTurnStorage extends AttemptStorage {
  listLinks(): readonly { readonly lastSyncedAtMs?: number | null }[];
}

export interface BackgroundTurnPorts {
  /** Everything a run needs of this device; its `wait` and `postponed` are replaced below. */
  readonly sync: SyncPorts;
  readonly storage: BackgroundTurnStorage;
  readonly alerts: AlertPorts;
  /**
   * Whether the app is in front of the owner *when the run ends*. A chance starts only while the
   * app is in the background, but the owner may open it while the chance runs, and a failure whose
   * screen is in front of them raises no сповіщення.
   */
  readonly attended: () => boolean;
  /** Read for the тихий інтервал and for whether monobank needs the owner; not for pacing. */
  readonly nowMs: () => number;
  /** Overridden in tests; the app always uses `QUIET_INTERVAL_MS`. */
  readonly quietIntervalMs?: number;
  /** Overridden in tests; the app always uses `STALE_AFTER_MS`. */
  readonly staleAfterMs?: number;
  /**
   * The mark this chance's entries carry — the same one the ports were built with, so the
   * `native` entry for the chance, the run's two ends and every request it made read as one
   * operation (design D4).
   */
  readonly run?: string;
}

/**
 * What one chance came to. Every answer the task has to tell apart is one of these — a chance
 * that changed nothing is not a failure, and reporting it as one would make WorkManager back the
 * whole worker off.
 */
export type BackgroundTurn =
  /** The quiet interval has not passed, so nothing was sent. */
  | { readonly kind: 'not-due' }
  /** A run was already going on — an opening, the pull, or the previous chance overrunning. */
  | { readonly kind: 'already-running' }
  /**
   * The run never reached the bank: no token kept, or storage unreadable. `no-links` is the third
   * shape the coordinator can answer and is all but unreachable from here — `syncDue` says
   * `not-due` for a phone with nothing linked before storage is ever read — but it is carried
   * because the run reads the links a second time and the answer belongs to whoever gets it.
   */
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'storage-unavailable' }
  | { readonly kind: 'no-links' }
  /** It ran: the outcome it is remembered by, and what it stored. */
  | {
      readonly kind: 'ran';
      readonly outcome: AccountOutcome | undefined;
      readonly imported: number;
    };

/** What the журнал calls one chance the system gave the app. */
export const BACKGROUND_CHANCE = 'background-chance';

/** What the журнал calls the app asking the phone for chances, or stopping. */
export const BACKGROUND_REGISTRATION = 'background-registration';

/**
 * What `reconcileTask` did about the registration, in the phone's own terms.
 *
 * `unchanged` is the ordinary case — the registration is re-asserted on every launch and every
 * foreground — and is deliberately not journaled: an entry each time would be `native` noise of
 * exactly the kind the screen folding exists to remove. `refused` is the phone declining, which is
 * the answer the spec asks for by name.
 */
export type TaskRegistration = 'registered' | 'unregistered' | 'unchanged' | 'refused';

/**
 * Records the chance the system gave, whether the app was in front of the owner when it ended, and
 * what the chance came to.
 *
 * Both halves of the `detail` are enumerated words — the device's `active`/`background` and the
 * turn's own kind and outcome — so nothing composed about the run enters the журнал. The counts
 * are what it stored, which is the number the reader wants when the question is «did the
 * background run actually do anything».
 */
export function journalChance(input: {
  readonly turn: BackgroundTurn;
  readonly attended: boolean;
  readonly run?: string;
}): void {
  const where = input.attended ? 'active' : 'background';
  const came = input.turn.kind === 'ran' ? (input.turn.outcome ?? 'ran') : input.turn.kind;
  journal.record('native', BACKGROUND_CHANCE, `${where} · ${came}`, {
    ...(input.run === undefined ? {} : { run: input.run }),
    ...(input.turn.kind === 'ran' ? { counts: { imported: input.turn.imported } } : {}),
  });
}

/** Records what the phone answered about the registration — everything but the ordinary no-op. */
export function journalRegistration(answer: TaskRegistration): boolean {
  if (answer === 'unchanged') {
    return false;
  }
  journal.record('native', BACKGROUND_REGISTRATION, answer);
  return true;
}

export async function runBackgroundTurn(ports: BackgroundTurnPorts): Promise<BackgroundTurn> {
  const links = ports.storage.listLinks();
  if (
    !syncDue({
      links: links.length,
      ...attemptInput(ports.storage.attempt()),
      nowMs: ports.nowMs(),
      ...(ports.quietIntervalMs === undefined ? {} : { quietIntervalMs: ports.quietIntervalMs }),
    })
  ) {
    return { kind: 'not-due' };
  }

  // Put *over* whatever wait the handed-in ports carried: the device's `syncPorts()` answers the
  // foreground pair, whose `postponed` in a headless process says yes at once, and a run left with
  // it would send nothing at all.
  //
  // A chance sends what the bank's minute already allows and stops at the first request it would
  // have to wait for. There is no budget because there is nothing to bound: with no wait, the
  // run ends in the second or two its requests take, and the phone's own quarter of an hour
  // between chances is the pacing. A chance that *did* wait held the single-run lock for twenty
  // minutes on the owner's phone, because Android stops JS timers along with the Activity.
  const pace = chanceRun();

  // No `alerts`, and `attended: false` — the announcing below is this module's, and it is a
  // different rule from the one a run the owner started and walked away from follows.
  const started = await startSync({
    sync: { ...ports.sync, ...pace },
    attempts: ports.storage,
    attended: false,
    ...(ports.run === undefined ? {} : { run: ports.run }),
  });
  if (started.kind === 'already-running') {
    return { kind: 'already-running' };
  }
  const run = started.run;
  if (run.kind !== 'ran') {
    // Nothing was tried, so nothing is announced and no attempt was left: `startSync` withdrew it.
    return { kind: run.kind };
  }

  const outcome = worstOutcome(run.accounts);
  await announce(ports, outcome);
  return { kind: 'ran', outcome, imported: run.imported };
}

/**
 * What the shade hears about a run nobody asked for.
 *
 * A completed run clears; every other outcome is put to `needsOwner`, which answers nothing for a
 * run that merely stopped and nothing for a failure over data that is still fresh. The already-
 * outstanding guard is before `raise` rather than inside it because `raise` journals first: a
 * phone whose token stays rejected would otherwise write a журнал line every quarter of an hour
 * and flush the журнал of everything a репорт needs within days.
 */
async function announce(
  ports: BackgroundTurnPorts,
  outcome: AccountOutcome | undefined,
): Promise<void> {
  if (outcome === 'complete') {
    await clearAlert('monobank-sync', ports.alerts);
    return;
  }
  // Read back after the run: the moments it moved are what «stale» is measured against.
  const coverage = syncCoverage(ports.storage.listLinks());
  const situation = needsOwner({
    attempt: ports.storage.attempt(),
    // The whole-bank moment, not the freshest рахунок's — the same reading Головний decides its
    // row from, so the two can never disagree about whether something is wrong.
    ...(coverage.oldestCompletedMs === undefined
      ? {}
      : { lastCompletedAtMs: coverage.oldestCompletedMs }),
    nowMs: ports.nowMs(),
    ...(ports.staleAfterMs === undefined ? {} : { staleAfterMs: ports.staleAfterMs }),
  });
  if (situation === undefined) {
    return;
  }
  if (ports.alerts.storage.outstandingKinds().includes('monobank-sync')) {
    return;
  }
  await raiseAlert('monobank-sync', { attended: ports.attended() }, ports.alerts);
}
