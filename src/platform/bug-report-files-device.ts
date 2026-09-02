import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { AnalysisShareOutcome } from './analysis-share';
import type {
  BugReportFile,
  BugReportFilesPort,
  ScreenshotKeepOutcome,
  ScreenshotPickOutcome,
  ScreenshotReadOutcome,
} from './bug-report-files';

/**
 * The device's own side of a репорт про помилку's files: the picker the owner chooses a screenshot
 * in, the copies kept in app-private storage beside the репорт, and the one Markdown file handed
 * to the phone's chooser.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`bug-report-files.ts`), and this side is typechecked here and proven on the emulator. Same
 * arrangement as `analysis-share-device.ts` and `backup-file-device.ts`, and the same reason: a
 * native module in the test run brings the whole suite down.
 *
 * Two directories, deliberately different. The screenshots live under the **document** directory,
 * because they belong to the репорт and must survive until the owner removes it; the outgoing file
 * lives in the **cache**, because it is rebuilt from the database every time and Android may purge
 * it whenever it likes. Neither is in a бекап.
 */

/** Where the kept screenshots of every репорт live, one folder per репорт. */
const KEPT = 'bug-reports';

/**
 * `text/plain` and not `text/markdown`, for `analysis-share-device.ts`'s reason: it is the widest
 * intent filter on Android, and a `.md` file is plain text.
 */
export const REPORT_MIME_TYPE = 'text/plain';

/** What the chooser is titled where Android shows a title. */
export const REPORT_DIALOG_TITLE = 'Передати репорт';

function keptDirectory(reportId: string): Directory {
  return new Directory(Paths.document, KEPT, reportId);
}

/** `image/png` → `png`. A mime the phone did not name at all is kept as a `.png`. */
function extensionOf(mime: string): string {
  const subtype = mime.split('/')[1] ?? 'png';
  return subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/gi, '') || 'png';
}

export const bugReportFiles: BugReportFilesPort = {
  async pickScreenshot(): Promise<ScreenshotPickOutcome> {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) {
        // The owner changed their mind. The spec calls this «attaches nothing», not a failure.
        return { kind: 'cancelled' };
      }
      return { kind: 'picked', uri: asset.uri, mime: asset.mimeType ?? 'image/png' };
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    }
  },

  async keep(reportId, picked): Promise<ScreenshotKeepOutcome> {
    try {
      const directory = keptDirectory(reportId);
      directory.create({ intermediates: true, idempotent: true });
      // Named by the moment rather than by what the picker called it: two screenshots taken on one
      // phone are very often both `Screenshot_20260902.png`, and one репорт cannot hold two files
      // of one name (the table's primary key says so).
      const name = `shot-${Date.now().toString(36)}.${extensionOf(picked.mime)}`;
      new File(picked.uri).copy(new File(directory, name));
      return { kind: 'kept', name };
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    }
  },

  async read(reportId, name): Promise<ScreenshotReadOutcome> {
    try {
      const file = new File(keptDirectory(reportId), name);
      if (!file.exists) {
        return { kind: 'failed', reason: 'Файл не знайдено' };
      }
      // `type` is `''` when the file system will not say, not `null` — so an empty answer falls
      // back to the extension the copy was saved under, which `keep` derived from the picker's.
      const mime = file.type.length > 0 ? file.type : `image/${name.split('.').pop() ?? 'png'}`;
      return { kind: 'read', mime, base64: await file.base64() };
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    }
  },

  uriOf(reportId, name): string {
    // Through `keptDirectory` and `File`, so the one place that knows the layout stays the one
    // place that knows it — the screen asks the port rather than rebuilding the path.
    return new File(keptDirectory(reportId), name).uri;
  },

  async removeAll(reportId): Promise<void> {
    try {
      const directory = keptDirectory(reportId);
      if (directory.exists) {
        directory.delete();
      }
    } catch {
      // A folder that would not go is a few kilobytes left behind, not something to stop the
      // removal of the репорт over — the rows are gone and nothing points at these files.
    }
  },

  async share(file: BugReportFile): Promise<AnalysisShareOutcome> {
    if (Platform.OS === 'web') {
      // No chooser to hand a file to. The screen offers «Скопіювати» instead, and says so.
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
      // One outgoing file at a time: the previous one goes before this exists. Deleting it *after*
      // a share would race the app the owner picked, which may still be reading the content URI.
      const directory = new Directory(Paths.cache, KEPT);
      if (directory.exists) {
        directory.delete();
      }
      directory.create({ intermediates: true, idempotent: true });

      written = new File(directory, file.name);
      written.write(file.text, { encoding: 'utf8' });
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    }

    try {
      await Sharing.shareAsync(written.uri, {
        mimeType: REPORT_MIME_TYPE,
        dialogTitle: REPORT_DIALOG_TITLE,
      });
    } catch (error) {
      // Includes `SharingInProgressException` — a second share started while one is still open.
      return { kind: 'failed', reason: reasonOf(error) };
    }

    // The promise resolves when the chooser returns, the same way whether the owner picked an app
    // or dismissed it. So this says the file reached the system, and the screen says exactly that.
    return { kind: 'handed-over' };
  },
};

/** What went wrong, as a sentence — never the object, which an Alert would print as `[object]`. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
