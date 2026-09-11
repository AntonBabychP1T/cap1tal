/**
 * The seam between the app and an existing photo or file on the phone — decoding a QR without the
 * camera (design D14, `openspec/changes/fiscal-receipts/`).
 *
 * The port and its double only. The device adapter is `qr-image-device.ts` and is not imported
 * from here, for the same reason as every port in this directory: nothing under `npm run verify`
 * may load a native module. Unlike `qr-scan.ts`'s camera permission, decoding here *is* the whole
 * job and can still be a port: `expo-camera`'s `scanFromURLAsync` is a plain async function, not a
 * component, so — unlike the live camera, which is `CameraView` and cannot exist off-screen — it
 * can be called from behind a value the same as any other file the app reads.
 *
 * Failures are values, as everywhere in `src/platform`. A picker the owner backs out of is
 * `cancelled`, never a failure. A photo that carries no QR code is its own outcome, `no-qr`, and
 * not folded into `failed`: the phone worked fine, there was simply nothing to find.
 */

/** What choosing a photo or file to decode came to. */
export type QrImagePickOutcome =
  | { readonly kind: 'decoded'; readonly text: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'no-qr' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface QrImagePort {
  /** Opens the phone's own picker, filtered to images, and decodes the first QR code found. */
  pickAndDecode(): Promise<QrImagePickOutcome>;
}

export interface InMemoryQrImage extends QrImagePort {
  /** How many times the picker was opened — the whole of «offered, and used». */
  readonly picked: () => number;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * One fixed outcome, the same way `granted`, `blocked` and `unsupported` never change in
 * `inMemoryQrScan`: a screen test asks «what does the flow do with a decoded text / a cancel / a
 * photo with nothing in it / a failure», not «what does a sequence of picks do».
 */
export function inMemoryQrImage(outcome?: QrImagePickOutcome): InMemoryQrImage {
  let picked = 0;
  return {
    pickAndDecode: () => {
      picked += 1;
      return Promise.resolve(outcome ?? { kind: 'cancelled' });
    },
    picked: () => picked,
  };
}
