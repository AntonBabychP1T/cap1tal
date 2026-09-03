/**
 * The seam between a репорт про помилку and the phone's own pixels: one picture of the app's own
 * window, written into the cache, and the two ways it is thrown away again.
 *
 * The port and its double only — the device adapter is `screen-capture-device.ts`, and it is not
 * imported from here. That is the separation every file in this directory keeps: nothing under
 * `npm run verify` may load a native module, so everything the sheet decides is decided against
 * the double in `src/ui/bug-report-here.test.ts`.
 *
 * **Failures are values, and this one has two of them for a reason.** `unavailable` is a platform
 * that cannot capture at all — iOS today, a build with no module in it — and `failed` is a capture
 * this platform could have made and did not: a window marked secure, a surface the compositor
 * would not read, no room in the cache. The sheet says a different Ukrainian sentence for each,
 * and the репорт *stores* which it was, because a saved репорт is read again after a restart and
 * «скріншота немає» without the reason is the one line of a репорт that cannot be reproduced.
 *
 * **Neither failure refuses the репорт.** A capture that did not happen is a репорт with no
 * picture and an honest sentence about why, never a door that will not open — the spec says so in
 * as many words, and it is the whole difference between a diagnostic tool and one more thing that
 * breaks when things are already broken.
 *
 * The captured file lives in the cache and belongs to nobody until the репорт is stored: `keep` on
 * `bug-report-files.ts` copies it beside the репорт, and `discard` removes it. `discardAll` is the
 * launch sweep — the process that died between the capture and the save is exactly when litter
 * would otherwise accumulate, and it is the one call that makes «leaves nothing behind» true
 * rather than merely intended.
 */

/**
 * What a capture came to.
 *
 * `captured` carries the size as well as the uri because the sheet draws a thumbnail from it and
 * an `<Image>` with no aspect ratio to work from lays out at the wrong shape for one frame. The
 * `mime` is the port's own answer rather than the caller's guess: the adapter decides the encoding
 * (PNG today, design D2) and a caller that hard-coded `image/png` would be wrong the day it did
 * not.
 */
export type CaptureOutcome =
  | {
      readonly kind: 'captured';
      readonly uri: string;
      readonly mime: string;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface ScreenCapturePort {
  /**
   * One picture of the app's own current window, written into the cache.
   *
   * The app's own window and nothing else: this needs no permission and shows the owner no consent
   * dialog precisely because it is not reading the device's screen, it is reading a surface the app
   * already owns. Anything wider would be `MediaProjection` and a different capability entirely.
   */
  capture(): Promise<CaptureOutcome>;
  /** Removes exactly one captured file — the репорт it was taken for was stored, or abandoned. */
  discard(uri: string): Promise<void>;
  /** Empties the whole capture cache. The launch sweep, and nothing else calls it. */
  discardAll(): Promise<void>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `captured()` is what makes «nothing is left behind» an observation rather than a hope — every
 * file the double has handed out and not yet been asked to discard, in order. It is `handed()`'s
 * counterpart on `bug-report-files.ts`, and it exists for the same reason: a promise about what is
 * *not* on the phone can only be tested by something that can be asked what is.
 *
 * `outcome` fixes what every capture answers, so the failure paths are ordinary tests and not
 * ceremony: an `unavailable` port is a platform that cannot, a `failed` one is a capture that did
 * not, and neither ever throws.
 */
export function inMemoryScreenCapture(
  options: { readonly outcome?: CaptureOutcome } = {},
): ScreenCapturePort & {
  /** Every captured file still on the phone, oldest first. */
  readonly captured: () => readonly string[];
  /** How many captures were asked for, including the ones that answered nothing. */
  readonly attempts: () => number;
} {
  const live: string[] = [];
  let attempts = 0;
  let next = 0;

  return {
    capture: async () => {
      attempts += 1;
      const outcome = options.outcome ?? null;
      if (outcome !== null && outcome.kind !== 'captured') {
        return outcome;
      }
      next += 1;
      // A uri per call even when `outcome` fixed one, so two captures are two files and
      // «ten cancelled reports leave ten nothings» counts ten of them rather than one.
      const captured: CaptureOutcome = {
        kind: 'captured',
        uri: outcome?.uri ?? `memory://capture/${next}.png`,
        mime: outcome?.mime ?? 'image/png',
        width: outcome?.width ?? 576,
        height: outcome?.height ?? 1280,
      };
      live.push(captured.uri);
      return captured;
    },

    // Total, like every `discard` in this directory: removing a file that is already gone is the
    // ordinary outcome of a save racing the launch sweep, not a failure anyone can act on.
    discard: async (uri) => {
      const at = live.indexOf(uri);
      if (at >= 0) {
        live.splice(at, 1);
      }
    },

    discardAll: async () => {
      live.length = 0;
    },

    captured: () => [...live],
    attempts: () => attempts,
  };
}
