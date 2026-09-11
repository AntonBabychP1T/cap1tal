import { scanFromURLAsync } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { QrImagePickOutcome, QrImagePort } from './qr-image';

/**
 * The device's own side of choosing a photo or file: the phone's own picker, filtered to images —
 * the same `DocumentPicker.getDocumentAsync({ type: 'image/*' })` call `bug-report-files-device.ts`
 * and `backup-file-device.ts` already make — and `expo-camera`'s own `scanFromURLAsync`, the same
 * decoder `CameraView` uses, run once over a still image instead of a live feed (design D14).
 *
 * Needs no camera permission and touches no camera hardware: `scanFromURLAsync` loads the image
 * into a bitmap and hands it to ML Kit directly, confirmed against `expo-camera`'s own Android
 * source (`CameraViewModule.kt`), which is why this adapter never imports `qr-scan.ts` or asks
 * anything of it.
 *
 * Nothing under `npm run verify` loads this file — the port and its double are what the tests see
 * (`qr-image.ts`), and this side is typechecked here and proven on the emulator, the same
 * arrangement as `qr-scan-device.ts` and every other adapter in this directory.
 */

export const qrImage: QrImagePort = {
  async pickAndDecode(): Promise<QrImagePickOutcome> {
    let pickedUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) {
        // The owner changed their mind. Not a failure — same as the camera scanner's «cancelled».
        return { kind: 'cancelled' };
      }
      pickedUri = asset.uri;

      const found = await scanFromURLAsync(asset.uri, ['qr']);
      const first = found[0];
      // The phone worked fine; there was simply no QR code in what was chosen.
      return first ? { kind: 'decoded', text: first.data } : { kind: 'no-qr' };
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    } finally {
      // `copyToCacheDirectory: true` leaves a copy behind so `scanFromURLAsync` has a `uri` to
      // read — removed here on every branch so nothing about the chosen file outlives the scan,
      // the same promise the camera path keeps by never storing a frame at all (specs/qr-scan/).
      if (pickedUri !== undefined) {
        try {
          new File(pickedUri).delete();
        } catch {
          // A cache file that would not go is a few kilobytes Android reclaims on its own — not
          // something to fail the scan over.
        }
      }
    }
  },
};

/** What went wrong, as a sentence — never the object, which an Alert would print as `[object]`. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
