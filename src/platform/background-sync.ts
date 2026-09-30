/**
 * The seam between the monobank sync and what the phone does for it while the app is not in front
 * of the owner, beside the periodic chances `background-turn.ts` asks for (monobank-sync-freshness
 * design D5–D7): a one-off **дочитування**, the **поштовх** a monobank notification leaves, and
 * whether Android lets the app run in the background at all.
 *
 * The port and its test double only — the adapter is `background-sync-device.ts`, never imported
 * from here or from a test. Every call answers with a value: a phone that cannot do any of this is
 * a phone that syncs on the periodic chances and on opening, exactly as before.
 */

/**
 * Whether the phone lets the app run in the background — the three readings the monobank screen
 * states, and `unknown` for a platform that cannot tell.
 *
 * - `allowed`: exempt from battery optimisation, not restricted;
 * - `optimised`: Doze and App Standby may put its chances off for hours;
 * - `restricted`: the owner restricted its background activity in the phone's settings.
 */
export type BackgroundRestriction = 'allowed' | 'optimised' | 'restricted' | 'unknown';

export interface BackgroundSyncPort {
  /**
   * Asks the phone for a дочитування `delayMs` from now. Fire-and-forget; at most one is pending,
   * so asking while one is changes nothing.
   */
  continueLater(delayMs: number): void;
  /** The moment of the last поштовх the capture layer noted, or `undefined` for none. */
  nudgedAtMs(): number | undefined;
  /** Whether a monobank notification should be noted as a поштовх — while a рахунок is linked. */
  setNudgesWanted(wanted: boolean): void;
  /** How the phone treats the app's background work right now. */
  restriction(): BackgroundRestriction;
  /**
   * Opens the phone's own way out of `restriction`: the battery-optimisation request for
   * `optimised`, the app's settings page for `restricted`, nothing otherwise.
   */
  openRestrictionFix(restriction: BackgroundRestriction): Promise<void>;
}

/** The phone the tests use: it schedules nothing and remembers what it was asked. */
export function inMemoryBackgroundSync(
  initial: { readonly restriction?: BackgroundRestriction; readonly nudgedAtMs?: number } = {},
): BackgroundSyncPort & {
  readonly continuations: readonly number[];
  readonly opened: readonly BackgroundRestriction[];
  nudgesWanted(): boolean;
  setRestriction(restriction: BackgroundRestriction): void;
  nudge(atMs: number): void;
} {
  const continuations: number[] = [];
  const opened: BackgroundRestriction[] = [];
  let restriction: BackgroundRestriction = initial.restriction ?? 'unknown';
  let nudgedAtMs = initial.nudgedAtMs;
  let wanted = false;
  return {
    continueLater(delayMs) {
      continuations.push(delayMs);
    },
    nudgedAtMs: () => nudgedAtMs,
    setNudgesWanted(value) {
      wanted = value;
    },
    restriction: () => restriction,
    openRestrictionFix(value) {
      opened.push(value);
      return Promise.resolve();
    },
    continuations,
    opened,
    nudgesWanted: () => wanted,
    setRestriction(value) {
      restriction = value;
    },
    nudge(atMs) {
      // What the capture layer does on a monobank notification, and only while wanted.
      if (wanted) {
        nudgedAtMs = atMs;
      }
    },
  };
}
