import type { CapturedNotification } from '../notifications/capture';

/**
 * The seam between the app and the phone's own hearing: the watched set goes down, captured
 * notifications come up. The port, its one pure rule and its double only — the device adapter is
 * `notification-capture-device.ts`, and it is not imported from here.
 *
 * That separation is the same one `monobank-token.ts` keeps: nothing under `npm run verify` may
 * load a native module, so the port lives in a file no platform code touches and the rules that
 * can be proven without a phone are proven here. The one import is the engine's own record type —
 * pure TypeScript, and the whole point of the seam: what the platform produces is exactly what
 * `processCapture` consumes, with no second shape in between.
 *
 * Failures are values, as everywhere else in `src/platform`: a build with no listener in it, a
 * platform that has no such permission, a module that will not resolve — each is an answer the
 * caller reads, never an exception to catch. Collecting on such a build finds nothing waiting;
 * telling it a watched set says that capture cannot work here.
 */

/**
 * The monobank Android app family. Everything at or under this package is refused a watch:
 * monobank is read through its personal API with real ids, сума and balances, so a second and
 * weaker path over the same рахунки could only manufacture duplicates of what the sync already
 * knows. The exact production package is confirmed on the owner's phone (design open question) —
 * widening this constant is a change to a string and its test, never to the spec.
 */
export const MONOBANK_PACKAGE_PREFIX = 'com.ftband.mono';

/**
 * The packages in a proposed watched set that name monobank — empty when the set is allowed.
 *
 * A prefix rather than an equality, because the family posts under more than one package (a beta
 * flavour, a second product) and every one of them is the same duplicate-manufacturing path.
 * Pure, so both sides of the seam can hold the same rule: the port applies it before the native
 * call — the typed rejection the spec asks for — and the Kotlin service drops the same prefix
 * again on write, for the set that never came through here (design D6).
 */
export function monobankPackagesIn(packages: readonly string[]): readonly string[] {
  return packages.filter((name) => name.startsWith(MONOBANK_PACKAGE_PREFIX));
}

/**
 * What telling the capture layer a watched set can answer.
 *
 * `refused` names the offending packages and leaves the watched set exactly as it was — a
 * rejection the caller can show, not a silently filtered set that would make the screen and the
 * device disagree about what is watched. `unavailable` is the build or platform where capture
 * cannot work at all; it is a separate answer from `refused` so a screen can tell "we will not
 * watch this" from "nothing here can watch anything".
 */
export type WatchedSetOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'refused'; readonly packages: readonly string[] }
  | { readonly kind: 'unavailable' };

export interface NotificationCapturePort {
  /**
   * Replaces the watched set the capture layer applies. The whole set every time, not a delta:
   * the device is told what is watched now, so a set that was never written means watch nothing.
   */
  setWatched(packages: readonly string[]): Promise<WatchedSetOutcome>;
  /**
   * Every captured notification waiting on the device, oldest first. Removes nothing: what has
   * been handed over comes back on the next collection until it is acknowledged, so a crash
   * between collecting and storing loses nothing and a redelivery dies at the engine's
   * fingerprint dedup.
   */
  collect(): Promise<readonly CapturedNotification[]>;
  /**
   * Forgets the oldest `count` of what the last collection handed over — called only after those
   * records are safely stored. Never a blind line count on the device: a capture that arrived
   * after the collection is still waiting when the acknowledgement lands.
   */
  acknowledge(count: number): Promise<void>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `queue` seeds what is already waiting; `capture` posts one more, which is how a test says "a
 * watched app posted while the app was busy". Neither filters: this double stands in for the
 * platform, and the filtering the platform does — unwatched packages, the monobank prefix, the
 * bound — is Kotlin's side of the seam, proven on the emulator. What it does honour exactly is
 * the delivery contract, because that is what downstream code will be written against.
 *
 * `unavailable` makes every call answer as a build with no listener in it would.
 */
export function inMemoryNotificationCapture(
  options: {
    readonly queue?: readonly CapturedNotification[];
    readonly unavailable?: boolean;
  } = {},
): NotificationCapturePort & {
  /** The set as the device holds it now — unchanged by a refused call. */
  readonly watched: () => readonly string[];
  /** Every set the layer accepted, in order, so silence after a refusal can be proven. */
  readonly setWatchedCalls: () => readonly (readonly string[])[];
  /** A watched app posts one, from outside the app's own turn. */
  readonly capture: (notification: CapturedNotification) => void;
  /** What is still waiting, whether or not it has been collected. */
  readonly waiting: () => readonly CapturedNotification[];
} {
  const unavailable = options.unavailable ?? false;
  let queue: CapturedNotification[] = [...(options.queue ?? [])];
  let watched: readonly string[] = [];
  const calls: (readonly string[])[] = [];
  /** What the last collection handed over — the only records an acknowledgement may forget. */
  let collected: readonly CapturedNotification[] = [];

  return {
    setWatched: async (packages: readonly string[]) => {
      // The refusal is a rule about what may ever be watched, so it answers before the question
      // of whether this build could watch anything at all.
      const refused = monobankPackagesIn(packages);
      if (refused.length > 0) {
        return { kind: 'refused', packages: refused };
      }
      if (unavailable) {
        return { kind: 'unavailable' };
      }
      watched = [...packages];
      calls.push(watched);
      return { kind: 'ok' };
    },

    collect: async () => {
      if (unavailable) {
        return [];
      }
      collected = [...queue];
      return collected;
    },

    acknowledge: async (count: number) => {
      if (unavailable) {
        return;
      }
      // Only records of the remembered collection, and only while they are still at the head:
      // anything captured since stays waiting, and a queue that forgot its oldest in the meantime
      // cannot make this eat something that was never handed over.
      let remaining = Math.min(Math.max(count, 0), collected.length);
      let index = 0;
      while (remaining > 0 && queue[0] !== undefined && queue[0] === collected[index]) {
        queue.shift();
        index += 1;
        remaining -= 1;
      }
      collected = collected.slice(index);
    },

    watched: () => watched,
    setWatchedCalls: () => calls,
    capture: (notification: CapturedNotification) => {
      queue = [...queue, notification];
    },
    waiting: () => queue,
  };
}
