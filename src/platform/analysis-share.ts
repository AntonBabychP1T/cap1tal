/**
 * The seam between the app and the phone's own chooser of apps: one файл для аналізу goes out, and
 * nothing comes back. The port and its double only — the device adapter is
 * `analysis-share-device.ts`, and it is not imported from here.
 *
 * That separation is the one `backup-file.ts` and `notification-capture.ts` keep, for the same
 * reason: nothing under `npm run verify` may load a native module, so the port lives in a file no
 * platform code touches, and everything the «AI-аналіз» screen decides is decided against the
 * double in `src/ui/ai-analysis-screen.ts`'s tests.
 *
 * **Why the outcomes are these three, and not `backup-file`'s four.** A бекап's screen may claim a
 * бекап was saved only where one actually was, so `backup-file` needed a `cancelled` the share
 * sheet cannot give it, and chose the Storage Access Framework instead (its design D8). Here the
 * claim is deliberately weaker: «файл передано системі». The phone does not tell the app whether
 * the owner picked an app or dismissed the chooser, and the app therefore says neither — so
 * `expo-sharing`'s semantics are the honest ones rather than a compromise, and a dismissed chooser
 * is a `handed-over` that claims nothing further.
 *
 * Failures are values, as everywhere in this directory. A platform with no chooser and a файл that
 * could not be written are each an answer the owner reads in their own words, never an exception.
 */

/**
 * What handing one файл to the system can come to.
 *
 * `handed-over` — the chooser opened and closed. What the owner did in it is unknown and unknowable
 * (Android ignores the result code, iOS resolves regardless of `completed`), so this says only that
 * the файл reached the system. `messageIncluded` says whether the короткий запит went with it —
 * a field on the outcome and not a variant of it, because the claim about the файл is the same
 * either way and only the one extra sentence about the запит is gated on it.
 *
 * `unavailable` — this platform or build has no chooser to hand a файл to. The web build is one;
 * the clipboard is what covers it.
 *
 * `failed` — the файл could not be prepared, and the reason is what to say about it: no room on
 * the device, a directory that would not be created, a second share started while one was open.
 */
export type AnalysisShareOutcome =
  | { readonly kind: 'handed-over'; readonly messageIncluded: boolean }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string };

/** One файл for one hand-off. The whole text as one string — the файл is tens of kilobytes. */
export interface AnalysisFile {
  readonly name: string;
  readonly text: string;
  /**
   * The короткий запит, offered to the platform beside the файл — best-effort and never
   * load-bearing.
   *
   * No adapter shipped today carries it: the phone's share sheet takes a file or text and not
   * both, and a receiver is free to drop text that arrives beside an attachment anyway. The файл
   * opens with its own запит and stays sufficient on its own; this is a hint, and the outcome's
   * `messageIncluded` is what says whether it travelled.
   */
  readonly message?: string;
}

export interface AnalysisSharePort {
  share(file: AnalysisFile): Promise<AnalysisShareOutcome>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `handed()` is what actually left — every файл the double really handed over, in order, the
 * `message` included — so «backing out claims nothing» is provable rather than assumed: an
 * `unavailable` or a `failed` leaves it empty, and a screen that claimed otherwise would be caught
 * by a test rather than by the owner. It is also how the screen's tests assert the exact text that
 * left, character for character.
 *
 * The default outcome is `handed-over` with no message carried, because that is what the phone
 * answers today whether the owner picked an app or dismissed the chooser. A test that wants the
 * other branch passes it in, which is the only way that branch is reachable at all until an
 * adapter exists that can carry text beside a file.
 */
export function inMemoryAnalysisShare(
  options: { readonly outcome?: AnalysisShareOutcome } = {},
): AnalysisSharePort & {
  /** Every файл that was actually handed over, in order — empty after a refusal. */
  readonly handed: () => readonly AnalysisFile[];
} {
  const handed: AnalysisFile[] = [];

  return {
    share: async (file: AnalysisFile) => {
      const outcome = options.outcome ?? { kind: 'handed-over', messageIncluded: false };
      if (outcome.kind === 'handed-over') {
        handed.push(file);
      }
      return outcome;
    },

    handed: () => handed,
  };
}
