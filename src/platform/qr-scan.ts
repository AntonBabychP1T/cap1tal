/**
 * The seam between the app and the device's camera — permission only.
 *
 * The port and its double. The device adapter is `qr-scan-device.ts` and is not imported from
 * here: nothing under `npm run verify` may load a native module, so the whole of «what the app
 * does for each answer» is proven against the double, and the adapter is proven on the emulator.
 *
 * Why permission only, and not the scan itself: decoding happens inside `CameraView`, which is a
 * React component and cannot exist in a port. What *can* be a value — whether the camera may be
 * used, and what the owner is offered when it may not — is here. The rest of the scan's rules (the
 * first decode wins, leaving the scanner is a cancel) live in `src/ui/receipt-screen.ts`, where
 * they are equally testable and equally free of React.
 *
 * Failures are values, as everywhere in `src/platform`: a build with no camera is an answer the
 * screen shows, not an exception to catch.
 */

/**
 * What the device can say about the camera.
 *
 * `deniable` and `blocked` are deliberately different: the first means the system will ask if we
 * ask it to, the second that it will not, and only the app's own settings screen can change it.
 * Offering «дозвольте в налаштуваннях» to someone the system would simply ask is a dead end, and
 * asking again when the system will not is a button that does nothing.
 *
 * `unsupported` is neither: it is a build or a platform where no camera can be used at all, so
 * there is no dialog to show and no settings screen to open.
 */
export type CameraPermission = 'granted' | 'deniable' | 'blocked' | 'unsupported';

/** The shape `expo-camera` answers with, named here so the mapping below can be pure. */
export interface CameraPermissionAnswer {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
  readonly status: string;
}

/**
 * The device's answer → the app's four states.
 *
 * Pure, so the mapping the adapter applies is under `verify` even though the adapter can never be
 * loaded there — exactly as `notificationAccessFrom` is. `undefined` is «there is no camera
 * permission to have here»: no camera module in this build, or a platform without one.
 */
export function cameraPermissionFrom(
  answer: CameraPermissionAnswer | undefined,
): CameraPermission {
  if (answer === undefined) return 'unsupported';
  if (answer.granted) return 'granted';
  // Not granted and the system will not ask again: only the settings screen is left. `status` is
  // read as the tiebreak for the platforms that report `denied` with `canAskAgain` still true on
  // a second refusal — the flag is what decides, and the status is what confirms it.
  return answer.canAskAgain && answer.status !== 'denied-forever' ? 'deniable' : 'blocked';
}

export interface QrScanPort {
  /** What the device says right now. Asked when the owner starts a scan, and after coming back. */
  state(): Promise<CameraPermission>;
  /**
   * Asks the system for the permission, and answers with the state afterwards. Called only when
   * `state()` said `deniable` — the system shows nothing for the other three, and asking anyway
   * is how an app trains its owner that the button does nothing.
   */
  request(): Promise<CameraPermission>;
  /** Opens this app's system settings. Offered only when the state is `blocked`. */
  openSettings(): Promise<void>;
}

export interface InMemoryQrScan extends QrScanPort {
  /** How many times the system was asked — the whole of «asking happens on the owner's action». */
  readonly requested: () => number;
  /** How many times the settings screen was opened. */
  readonly opened: () => number;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `answers` is read in order: the first is what `state()` reports, and each `request()` moves to
 * the next — which is how «the owner is asked, and refuses» is written as a value rather than
 * mocked. A single answer simply never changes, which is what `granted`, `blocked` and
 * `unsupported` all do in reality.
 */
export function inMemoryQrScan(...answers: readonly CameraPermission[]): InMemoryQrScan {
  const sequence = answers.length > 0 ? answers : (['deniable'] as const);
  let at = 0;
  let requested = 0;
  let opened = 0;

  const current = (): CameraPermission =>
    sequence[Math.min(at, sequence.length - 1)] as CameraPermission;

  return {
    state: () => Promise.resolve(current()),
    request: () => {
      requested += 1;
      at += 1;
      return Promise.resolve(current());
    },
    openSettings: () => {
      opened += 1;
      return Promise.resolve();
    },
    requested: () => requested,
    opened: () => opened,
  };
}
