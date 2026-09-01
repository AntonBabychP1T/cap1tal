import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { BackupFilePort, BackupPickOutcome, BackupSaveOutcome } from './backup-file';

/**
 * The device's own side of the бекап file: Android's Storage Access Framework on the way out, the
 * document picker on the way back.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`backup-file.ts`), and this side is typechecked here and proven on the emulator. That is the
 * same arrangement `notification-capture-device.ts` keeps, and the reason is the same: a native
 * module in the test run brings the whole suite down.
 *
 * SAF rather than `expo-sharing` (design D8): the share sheet resolves the same way whether the
 * owner saved the file or dismissed it, which would make «backing out claims nothing» unprovable
 * and the screen's success message a guess. SAF asks for a folder, and a dismissed folder chooser
 * is a `cancelled` we can say honestly. It is deprecated in Expo's newer file-system surface; it
 * is reached only through the port, so replacing it later is this one file.
 */

/** `.json` because that is what a бекап is, and what Android's own chooser handles best. */
export const BACKUP_MIME_TYPE = 'application/json';

export const backupFiles: BackupFilePort = {
  /**
   * Asks the owner for a folder, creates the file in it and writes it whole.
   *
   * The permission dialog dismissed is `cancelled` — the owner backed out, nothing was written,
   * and the screen claims nothing. Anything the platform throws after that is `failed` with what
   * it said, because at that point something did go wrong and saying so is the honest answer.
   */
  async save(name: string, text: string): Promise<BackupSaveOutcome> {
    if (Platform.OS !== 'android') {
      // SAF is Android's. iOS keeps compiling and answers honestly rather than pretending.
      return { kind: 'unavailable' };
    }
    let directoryUri: string;
    try {
      const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) {
        return { kind: 'cancelled' };
      }
      directoryUri = permission.directoryUri;
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    }
    try {
      const fileUri = await StorageAccessFramework.createFileAsync(
        directoryUri,
        name,
        BACKUP_MIME_TYPE,
      );
      await StorageAccessFramework.writeAsStringAsync(fileUri, text);
      return { kind: 'ok' };
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    }
  },

  /**
   * The path `src/app/manage/saldo-import.tsx` already walks: the document picker, then the file's
   * own text. Nothing here judges what was picked — that is `readBackup`'s and no one else's.
   */
  async pick(): Promise<BackupPickOutcome> {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) {
        return { kind: 'cancelled' };
      }
      return { kind: 'ok', text: await new File(asset.uri).text() };
    } catch (error) {
      return { kind: 'unreadable', reason: reasonOf(error) };
    }
  },
};

/** What went wrong, as a sentence — never the object, which an Alert would print as `[object]`. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
