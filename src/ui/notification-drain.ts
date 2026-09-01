import type { Rule } from '../domain/rules';
import type { IsoDate } from '../domain/transaction';
import type { CapturedNotification } from '../notifications/capture';
import { processCapture, type CaptureOutcome, type Watch } from '../notifications/draft';
import type { NotificationCapturePort } from '../platform/notification-capture';

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
  /** Read once per drain: a правило created since the last one decides this batch. */
  readonly rules: () => readonly Rule[];
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
  const collected = await input.capture.collect();
  if (collected.length === 0) {
    return { collected: 0, acknowledged: 0, drafted: 0, autoConfirmed: 0 };
  }

  const watches = input.storage.watches();
  const rules = input.rules();
  const seen = new Set(input.storage.seenFingerprints());
  const storedAt = input.now();

  let acknowledged = 0;
  let drafted = 0;
  let autoConfirmed = 0;
  let failure: unknown;

  for (const [index, record] of collected.entries()) {
    const outcome = decide(record, { watches, rules, seen, input });
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

function decide(
  record: CapturedNotification,
  ctx: {
    readonly watches: readonly Watch[];
    readonly rules: readonly Rule[];
    readonly seen: ReadonlySet<string>;
    readonly input: DrainInput;
  },
): CaptureOutcome {
  return processCapture(record, {
    watches: ctx.watches,
    seenFingerprints: ctx.seen,
    rules: ctx.rules,
    newId: ctx.input.newId,
    dateOf: ctx.input.dateOf,
  });
}
