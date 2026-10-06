import type { RuleTiers } from '../domain/rules';
import type { IsoDate } from '../domain/transaction';
import type { CapturedNotification } from '../notifications/capture';
import { processCapture, type CaptureOutcome, type Watch } from '../notifications/draft';
import {
  monobankPackagesIn,
  type NotificationCapturePort,
} from '../platform/notification-capture';
import { STEP_FAILED } from '../reporting/journal';
import { journal } from './journal';

/**
 * The loop that joins the phone's hearing to the owner's storage: collect what is waiting, decide
 * each notification through the engine, store each outcome, and acknowledge only what is stored.
 *
 * It lives in `src/ui/` with no React import for the reason every rule in this app does: the order
 * things happen in here is the whole of "nothing is lost and nothing is doubled", and that has to
 * be provable under `npm run verify` rather than on a device. The React side is four lines in
 * `src/app/_layout.tsx` — run this on open and on returning to the foreground — and holds no logic
 * of its own.
 */

/** What the drain needs of storage. The real one is `src/db/notifications-repo.ts`. */
export interface DrainStorage {
  watches(): readonly Watch[];
  seenFingerprints(): ReadonlySet<string>;
  commitOutcome(outcome: CaptureOutcome, storedAt: Date): void;
}

export interface DrainInput {
  readonly capture: NotificationCapturePort;
  readonly storage: DrainStorage;
  /**
   * The правила and the шаблон категоризації, read once per drain: a правило created — or a
   * mapping changed — since the last one decides this batch.
   */
  readonly categorisation: () => RuleTiers;
  readonly newId: () => string;
  readonly dateOf: (epochMs: number) => IsoDate;
  /** When the outcomes count as stored — the feed's tie-break, passed in as everywhere. */
  readonly now: () => Date;
}

/**
 * Everyone waiting to be told that a drain stored something. Module state, like the one flag
 * Головний already keeps, because the thing being observed is the device's own queue and there is
 * exactly one of it.
 *
 * Without it the чернетки would be invisible in the very session that created them: Головний reads
 * on navigation focus, and neither opening the app nor returning to the foreground is one — the
 * drain finishes after the first paint and nothing would ask storage again until the owner left
 * the tab and came back. "Step 8 is built but invisible" is the problem this change exists for, so
 * the surface has to hear about it.
 */
const listeners = new Set<() => void>();

/** Subscribe to "a drain stored something". Returns the unsubscribe an effect cleans up with. */
export function onCapturesStored(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What one drain came to. Nothing here is shown to the owner; it is what the tests read. */
export interface DrainReport {
  readonly collected: number;
  /** How many were acknowledged — the contiguous prefix whose outcomes are safely stored. */
  readonly acknowledged: number;
  readonly drafted: number;
  readonly autoConfirmed: number;
  /** The first storage failure, when one stopped the batch. */
  readonly failure?: unknown;
}

/**
 * One collection, decided and stored.
 *
 * The order is the safety property. Each record is decided against the watches, the fingerprints
 * already seen *and every fingerprint this batch has just committed* — Android hands the same
 * notification over twice within one collection often enough, and a seen set read once at the top
 * would let the second copy through. Each outcome is committed on its own, and the count
 * acknowledged is the contiguous prefix of records whose outcomes are committed: a storage failure
 * stops the loop there, the tail redelivers on the next collection, and anything committed but not
 * acknowledged dies at the fingerprint dedup. Worst case is deciding a notification twice; never
 * losing one, and never doubling the money.
 *
 * An outcome that stores nothing — an unwatched app, a fingerprint already remembered — still
 * counts towards the prefix: there is nothing to lose by forgetting it, and leaving it on the
 * queue forever would be the only way this could fill up.
 */
export async function drainCaptures(input: DrainInput): Promise<DrainReport> {
  // Recorded at both ends with the numbers it measured, and with none of what it read: the counts
  // are numbers, so no part of a bank's notification can enter the журнал through them (design D2).
  return journal.step('collection', () => drained(input), {
    ending: (report) => ({
      counts: {
        collected: report.collected,
        acknowledged: report.acknowledged,
        drafted: report.drafted,
        autoConfirmed: report.autoConfirmed,
      },
      ...(report.failure === undefined ? {} : { detail: STEP_FAILED }),
    }),
  });
}

async function drained(input: DrainInput): Promise<DrainReport> {
  // Read once, before anything else: this one list is both the set the device is given and the set
  // each notification is judged against, so the two cannot come apart.
  const watches = input.storage.watches();
  await applyWatchedSet(input.capture, watches);

  const collected = await input.capture.collect();
  if (collected.length === 0) {
    return { collected: 0, acknowledged: 0, drafted: 0, autoConfirmed: 0 };
  }

  const categorisation = input.categorisation();
  const seen = new Set(input.storage.seenFingerprints());
  const storedAt = input.now();

  let acknowledged = 0;
  let drafted = 0;
  let autoConfirmed = 0;
  let failure: unknown;

  for (const [index, record] of collected.entries()) {
    const outcome = decide(record, { watches, categorisation, seen, input });
    try {
      // One millisecond apart in the order the phone handed them over, for the reason
      // `commitStatementAnswer` gives: `createdAt` is what "newest first" orders by, so a whole
      // batch under one instant would leave the arrival order to the random suffix of an id.
      input.storage.commitOutcome(outcome, new Date(storedAt.getTime() + index));
    } catch (error) {
      // The prefix ends here. Everything from this record on stays waiting, and the fingerprints
      // of what did commit make the redelivery harmless.
      failure = error;
      break;
    }
    if (outcome.kind === 'drafted' || outcome.kind === 'auto-confirmed') {
      // Only after it is committed: a fingerprint the storage refused must not silence the
      // redelivery of the very notification it failed to store.
      seen.add(outcome.fingerprint);
      if (outcome.kind === 'drafted') drafted += 1;
      else autoConfirmed += 1;
    }
    acknowledged += 1;
  }

  if (acknowledged > 0) {
    await input.capture.acknowledge(acknowledged);
  }

  if (drafted > 0 || autoConfirmed > 0) {
    // Only when something was actually stored: a drain that found nothing must not make every
    // screen re-query on every foreground transition.
    for (const listener of [...listeners]) {
      listener();
    }
  }

  return {
    collected: collected.length,
    acknowledged,
    drafted,
    autoConfirmed,
    ...(failure !== undefined ? { failure } : {}),
  };
}

/**
 * The device's watched set made to follow storage, before a single notification is collected.
 *
 * Nothing else keeps the two in step. `addWatchedApp` and `removeWatchedApp` tell the capture layer
 * when the owner changes a watch, and every other path that writes watch rows — a відновлення above
 * all, which replaces the whole database inside one transaction and knows of no port — leaves the
 * device holding whatever it was last told. The section then lists «Приват24» as read while the
 * phone drops everything it posts: no чернетка, no сповіщення про збій (that alert answers withheld
 * access and a storage failure, and this is neither), and «Залишилось» too high in the one
 * direction that matters, with nothing for the owner to point at.
 *
 * Before `collect`, and before the early return for an empty collection, because after a
 * відновлення the queue is empty *precisely because* the device has been dropping everything — a
 * reconciliation that only ran when something was waiting would never run in the one case it is
 * for. And unconditionally on every drain, never once per run: what the device holds is the very
 * thing this cannot trust, so a memo of "already told" would be the belief that just proved wrong.
 *
 * The monobank family is dropped rather than left to be refused. `setWatched` rejects the *whole*
 * set when any package matches — deliberately, so a screen can show the owner what they typed was
 * rejected instead of silently ignoring it — but the drain has no owner watching and nothing to
 * show, so a single stored monobank row (a бекап written under a narrower reading of the prefix)
 * would make every collection refuse for good and leave every other відстежуваний застосунок
 * unapplied. That is this bug back again, made permanent. The rule is pure and exported for exactly
 * this: apply it here, and ask the port a question it can answer.
 *
 * The answer is then ignored, and both of its unhappy values are ones nothing here can act on.
 * `refused` is unreachable past the filter. `unavailable` is a build with no listener in it — where
 * access reports `unsupported` and no drain starts at all — or a native write that threw, and that
 * one costs nothing: the set is told again on the next foreground transition, and until then the
 * device holds no worse a set than it held before this existed. Neither is worth a сповіщення про
 * збій, whose whole meaning is «the транзакції you expect stopped arriving».
 */
async function applyWatchedSet(
  capture: NotificationCapturePort,
  watches: readonly Watch[],
): Promise<void> {
  const packages = watches.map((watch) => watch.packageName);
  const refusable = new Set(monobankPackagesIn(packages));
  await capture.setWatched(packages.filter((name) => !refusable.has(name)));
}

function decide(
  record: CapturedNotification,
  ctx: {
    readonly watches: readonly Watch[];
    readonly categorisation: RuleTiers;
    readonly seen: ReadonlySet<string>;
    readonly input: DrainInput;
  },
): CaptureOutcome {
  return processCapture(record, {
    watches: ctx.watches,
    seenFingerprints: ctx.seen,
    ...ctx.categorisation,
    newId: ctx.input.newId,
    dateOf: ctx.input.dateOf,
  });
}
