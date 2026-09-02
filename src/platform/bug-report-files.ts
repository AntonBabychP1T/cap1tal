import type { AnalysisShareOutcome } from './analysis-share';

/**
 * The seam between a репорт про помилку and the phone's own files: the picker the owner chooses a
 * screenshot in, the copies kept beside the репорт, and the one file that goes out to the chooser.
 *
 * The port and its double only — the device adapter is `bug-report-files-device.ts`, and it is not
 * imported from here. That separation is the one every file in this directory keeps: nothing under
 * `npm run verify` may load a native module, so everything the screens decide is decided against
 * the double in `src/ui/bug-report-screen.ts`'s tests.
 *
 * **The share outcome is `analysis-share.ts`'s, unchanged.** Its three answers are exactly the
 * honest ones here too: `handed-over` says the chooser opened and closed and nothing more (the
 * phone does not tell the app what the owner did in it), `unavailable` is a build with no chooser,
 * `failed` is a file that could not be written. Reusing the type rather than declaring a twin is
 * also what keeps the two screens saying the same words about the same event.
 *
 * Failures are values, as everywhere in this directory. A picker the owner backs out of is
 * `cancelled` and never a failure — the spec says so in as many words.
 */

/** One file, ready to be handed over. The whole text as one string, images and all. */
export interface BugReportFile {
  readonly name: string;
  readonly text: string;
}

/** What the picker came to. `cancelled` is the owner changing their mind, not an error. */
export type ScreenshotPickOutcome =
  | { readonly kind: 'picked'; readonly uri: string; readonly mime: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: string };

/** A screenshot as it is kept beside its репорт: named, and read back when a file is made. */
export type ScreenshotKeepOutcome =
  | { readonly kind: 'kept'; readonly name: string }
  | { readonly kind: 'failed'; readonly reason: string };

export type ScreenshotReadOutcome =
  | { readonly kind: 'read'; readonly mime: string; readonly base64: string }
  | { readonly kind: 'failed'; readonly reason: string };

export interface BugReportFilesPort {
  /** Opens the phone's own file picker, filtered to images. */
  pickScreenshot(): Promise<ScreenshotPickOutcome>;
  /** Copies what was picked into the app's own storage, beside that репорт. */
  keep(
    reportId: string,
    picked: { readonly uri: string; readonly mime: string },
  ): Promise<ScreenshotKeepOutcome>;
  /** Reads one kept screenshot back as base64, for the file that is handed over. */
  read(reportId: string, name: string): Promise<ScreenshotReadOutcome>;
  /**
   * Where one kept screenshot actually is, as something an `<Image>` can load.
   *
   * On the port rather than rebuilt by the screen: the directory layout is this seam's own, and a
   * screen that concatenated its own path would break silently the day the adapter moved a folder.
   * A thumbnail is drawn from the file, never from the rendered text — the base64 is only ever in
   * the file that is handed over (design D7).
   */
  uriOf(reportId: string, name: string): string;
  /** Removes every screenshot of one репорт — the file half of removing the репорт. */
  removeAll(reportId: string): Promise<void>;
  /** Hands one file to the phone's chooser. */
  share(file: BugReportFile): Promise<AnalysisShareOutcome>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `handed()` is what actually left — every file the double really handed over, in order — so
 * «nothing leaves without the owner» is provable rather than assumed: an `unavailable`, a `failed`
 * or a save with no hand-over leaves it empty. `kept()` is the same for the images: what is
 * actually on the phone beside a репорт, so «backing out of the picker attaches nothing» and
 * «removing a репорт removes its screenshots» are both observations rather than hopes.
 */
export function inMemoryBugReportFiles(
  options: {
    readonly pick?: ScreenshotPickOutcome;
    readonly outcome?: AnalysisShareOutcome;
    /** A `keep` that fails — no room on the device, a directory that would not be created. */
    readonly keepFails?: string;
  } = {},
): BugReportFilesPort & {
  /** Every file that was actually handed over, in order — empty after a refusal. */
  readonly handed: () => readonly BugReportFile[];
  /** What is on the phone beside each репорт, in the order it was added. */
  readonly kept: (reportId: string) => readonly string[];
} {
  const handed: BugReportFile[] = [];
  const kept = new Map<string, string[]>();
  let next = 0;

  return {
    pickScreenshot: async () =>
      options.pick ?? { kind: 'picked', uri: 'file:///picked.png', mime: 'image/png' },

    keep: async (reportId, picked) => {
      if (options.keepFails !== undefined) {
        return { kind: 'failed', reason: options.keepFails };
      }
      next += 1;
      const name = `shot-${next}.${picked.mime === 'image/jpeg' ? 'jpg' : 'png'}`;
      kept.set(reportId, [...(kept.get(reportId) ?? []), name]);
      return { kind: 'kept', name };
    },

    uriOf: (reportId, name) => `memory://bug-reports/${reportId}/${name}`,

    read: async (reportId, name) =>
      (kept.get(reportId) ?? []).includes(name)
        ? { kind: 'read', mime: 'image/png', base64: `BASE64-${name}` }
        : { kind: 'failed', reason: 'Файл не знайдено' },

    removeAll: async (reportId) => {
      kept.delete(reportId);
    },

    share: async (file) => {
      const outcome = options.outcome ?? { kind: 'handed-over' };
      if (outcome.kind === 'handed-over') {
        handed.push(file);
      }
      return outcome;
    },

    handed: () => handed,
    kept: (reportId) => kept.get(reportId) ?? [],
  };
}
