import { scanFromURLAsync } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode, encode } from 'jpeg-js';

import { deviceTimer } from '../monobank/yielding';
import type { QrImagePickOutcome, QrImagePort } from './qr-image';
import { decodeImage, padWithMargin, type QuietZoneSteps, type RawImage } from './qr-quiet-zone';

/**
 * The device's own side of choosing a photo or file: the phone's own picker, filtered to images —
 * the same `DocumentPicker.getDocumentAsync({ type: 'image/*' })` call `bug-report-files-device.ts`
 * and `backup-file-device.ts` already make — and `expo-camera`'s own `scanFromURLAsync`, the same
 * decoder `CameraView` uses, run once over a still image instead of a live feed (design D14).
 *
 * When that whole-image decode finds nothing, a second look runs before giving up
 * (`openspec/changes/qr-image-quiet-zone/`, design D1–D8): a downscaled working copy locates the
 * QR's own light square even when its margin is narrow and the background around it is as dark as
 * its own modules (`qr-quiet-zone.ts`, pure and tested under `verify`), the manipulator crops that
 * square out of the *original* at full resolution, and the light margin the standard asks for is
 * added in plain TypeScript with `jpeg-js` — `expo-image-manipulator`'s own `.extent()` turns out
 * not to exist on Android (design D4; its Android native module registers only `resize`, `rotate`,
 * `flip` and `crop`). The cut-out is decoded the same way as the whole image, and every file this
 * makes — the working copy, every crop, every padded cut-out — is removed once the choice ends,
 * on every outcome (design D6).
 *
 * Needs no camera permission and touches no camera hardware: `scanFromURLAsync` loads the image
 * into a bitmap and hands it to ML Kit directly, confirmed against `expo-camera`'s own Android
 * source (`CameraViewModule.kt`), which is why this adapter never imports `qr-scan.ts` or asks
 * anything of it.
 *
 * Nothing under `npm run verify` loads this file — `decodeImage` and its steps double are what the
 * tests see (`qr-quiet-zone.ts`), and this side is typechecked here and proven on the emulator, the
 * same arrangement as `qr-scan-device.ts` and every other adapter in this directory.
 */

const MANIPULATOR_COMPRESS = 0.92;
const JPEG_JS_QUALITY = 92;

/**
 * `jpeg-js`'s own `encode()` has no `useTArray`-style escape the way `decode()` does — bundled
 * (Metro wraps every module, so `typeof module !== 'undefined'` is always true here), it
 * unconditionally returns `Buffer.from(byteout)`, and Hermes defines no global `Buffer` (design
 * D2). Every caller here only ever uses the result as a plain byte array
 * (`new Uint8Array(jpeg.data)`), so the smallest fix is a `Buffer.from` that returns one — not the
 * `buffer` npm package, which would pull in far more than this one call needs, and not a global
 * polyfill in the app's own entry, since nothing else in the app touches `Buffer` at all. Defined
 * once, only if nothing has defined a real `Buffer` first.
 */
if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as { Buffer?: { from(input: ArrayLike<number>): Uint8Array } }).Buffer = {
    from: (input) => Uint8Array.from(input),
  };
}

/** Reads an image file's pixels — the one round trip both `pixels` and `cutWithMargin` need. */
async function readPixels(uri: string): Promise<RawImage> {
  const bytes = await new File(uri).arrayBuffer();
  const decoded = decode(new Uint8Array(bytes), { useTArray: true });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

/** The real steps `decodeImage` is asked to run with, over one already-open `scan`. */
function realSteps(scan: (uri: string) => Promise<string | null>): QuietZoneSteps {
  return {
    scan,

    workingCopy: async (uri, width) => {
      // Rendered once to learn the original's own dimensions — never the picker's metadata, which
      // an EXIF-rotated photo could disagree with (design D3 Risks) — then resized from that same
      // render (never re-read from `uri`) only when it is wider than the working copy needs to be.
      const original = await ImageManipulator.manipulate(uri).renderAsync();
      const targetWidth = Math.min(width, original.width);
      const resized =
        targetWidth === original.width
          ? original
          : await ImageManipulator.manipulate(original).resize({ width: targetWidth }).renderAsync();
      const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: MANIPULATOR_COMPRESS });
      return {
        uri: saved.uri,
        width: saved.width,
        height: saved.height,
        originalWidth: original.width,
        originalHeight: original.height,
      };
    },

    pixels: readPixels,

    cutWithMargin: async (uri, rect, margin) => {
      const cropped = await ImageManipulator.manipulate(uri)
        .crop({ originX: rect.x, originY: rect.y, width: rect.width, height: rect.height })
        .renderAsync();
      const savedCrop = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: MANIPULATOR_COMPRESS });
      try {
        const image = await readPixels(savedCrop.uri);
        const padded = padWithMargin(image, margin);
        const jpeg = encode({ width: padded.width, height: padded.height, data: padded.data }, JPEG_JS_QUALITY);

        // The crop's own random cache name (expo-image-manipulator always ends it `.jpg`), with a
        // suffix — so the padded file needs no id generator of its own and still cannot collide.
        const paddedFile = new File(savedCrop.uri.replace(/\.jpg$/i, '-padded.jpg'));
        paddedFile.create({ intermediates: true, overwrite: true });
        paddedFile.write(new Uint8Array(jpeg.data));
        return paddedFile.uri;
      } finally {
        // The crop's own JPEG is an intermediate nobody but `padWithMargin` needed — `decodeImage`
        // only ever asked `cutWithMargin` for one URI back, so it never learns this one exists and
        // could not ask for it to be removed (design D6).
        try {
          new File(savedCrop.uri).delete();
        } catch {
          // A cache file that would not go is a few kilobytes the OS reclaims on its own.
        }
      }
    },

    remove: async (uri) => {
      new File(uri).delete();
    },

    setTimer: deviceTimer,
  };
}

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

      const scan = async (uri: string): Promise<string | null> => {
        const found = await scanFromURLAsync(uri, ['qr']);
        return found[0]?.data ?? null;
      };
      const outcome = await decodeImage(asset.uri, realSteps(scan));
      return outcome.kind === 'decoded' ? { kind: 'decoded', text: outcome.text } : { kind: 'no-qr' };
    } catch (error) {
      return { kind: 'failed', reason: reasonOf(error) };
    } finally {
      // `copyToCacheDirectory: true` leaves a copy behind so `scanFromURLAsync` and the working
      // copy have a `uri` to read — removed here on every branch so nothing about the chosen file
      // outlives the choice, the same promise the camera path keeps by never storing a frame at all
      // (specs/qr-scan/). Every file the second look made is `decodeImage`'s own responsibility
      // (design D6); this is only ever the picker's own cached copy.
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
