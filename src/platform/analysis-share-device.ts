import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { AnalysisFile, AnalysisSharePort, AnalysisShareOutcome } from './analysis-share';

/**
 * The device's own side of handing a файл для аналізу over: write it into the app's private cache,
 * then let the phone open its own chooser of apps over it.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`analysis-share.ts`), and this side is typechecked here and proven on the emulator. That is the
 * same arrangement `backup-file-device.ts` and `notification-capture-device.ts` keep, and the
 * reason is the same: a native module in the test run brings the whole suite down.
 *
 * `expo-sharing` rather than the Storage Access Framework `backup-file-device.ts` uses. SAF asks
 * for a folder, which is the wrong gesture for «send this to an app», and its one advantage — a
 * dismissal it can report honestly — buys nothing here: this screen never claims more than «файл
 * передано системі», which is true whether the owner picked an app or backed out.
 *
 * expo-sharing's own Android manifest declares the `FileProvider`
 * (`${applicationId}.SharingFileProvider`, cache paths included) and the `<queries>` entry for
 * an `ACTION_SEND` intent of any MIME type, so prebuild merges both and `app.json` gains
 * nothing. Its config plugin
 * configures *receiving* shares — a share extension and intent filters, both disabled by default —
 * which this app does not do, so the plugin is deliberately not listed either.
 */

/**
 * Where the файл waits between being written and being read by the app the owner picks.
 *
 * App-private cache, so no other app can read it without the grant the chooser hands out, and
 * Android may purge it under storage pressure — which costs nothing, since it is rebuilt from the
 * database on the next run and is never part of a бекап.
 */
const DIRECTORY = 'ai-analysis';

/**
 * `text/plain` and not `text/markdown`: it is the widest intent filter on Android — many apps
 * register plain text or all text, and very few register `text/markdown` — and a `.md` file is
 * plain text. One constant to change if the owner's own phone shows otherwise.
 */
export const ANALYSIS_MIME_TYPE = 'text/plain';

/** What the chooser is titled where Android shows a title. */
export const ANALYSIS_DIALOG_TITLE = 'Поділитися з AI';

export const analysisShare: AnalysisSharePort = {
  async share(file: AnalysisFile): Promise<AnalysisShareOutcome> {
    if (Platform.OS === 'web') {
      // No chooser to hand a файл to. The screen offers «Скопіювати» instead, and says so.
      return { kind: 'unavailable' };
    }

    let available: boolean;
    try {
      available = await Sharing.isAvailableAsync();
    } catch {
      return { kind: 'unavailable' };
    }
    if (!available) {
      return { kind: 'unavailable' };
    }

    let written: File;
    try {
      // One файл at a time: the previous run's файл goes before this one exists. Deleting it
      // *after* a share would race the app the owner picked, which may still be reading the
      // content URI when the promise resolves — so the cleanup is the next run's first act.
      const directory = new Directory(Paths.cache, DIRECTORY);
      if (directory.exists) {
        directory.delete();
      }
      directory.create({ intermediates: true, idempotent: true });

      written = new File(directory, file.name);
      written.write(file.text, { encoding: 'utf8' });
    } catch (error) {
      // A full device, a directory that would not be created, a name the file system refuses —
      // each is a sentence the owner reads, never an exception that reaches them as a crash.
      return { kind: 'failed', reason: reasonOf(error) };
    }

    try {
      await Sharing.shareAsync(written.uri, {
        mimeType: ANALYSIS_MIME_TYPE,
        dialogTitle: ANALYSIS_DIALOG_TITLE,
      });
    } catch (error) {
      // Includes `SharingInProgressException` — a second share started while one is still open.
      return { kind: 'failed', reason: reasonOf(error) };
    }

    // The promise resolves when the chooser returns, the same way whether the owner picked an app
    // or dismissed it: Android ignores the result code and iOS resolves regardless of `completed`.
    // So this says the файл reached the system, and the screen says exactly that and nothing more.
    //
    // `messageIncluded: false`, always, and `file.message` is deliberately not read: expo-sharing's
    // `SharingOptions` is `mimeType`, `UTI`, `dialogTitle` and `anchor` — there is no text, message
    // or subject field to put the короткий запит in (design.md D2). Saying so honestly is what lets
    // the screen never claim a запит that did not travel; «Скопіювати запит» is what covers it, and
    // the файл opens with its own запит regardless.
    return { kind: 'handed-over', messageIncluded: false };
  },
};

/** What went wrong, as a sentence — never the object, which an Alert would print as `[object]`. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
