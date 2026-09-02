import { Camera } from 'expo-camera';
import { Linking, Platform } from 'react-native';

import { cameraPermissionFrom, type CameraPermission, type QrScanPort } from './qr-scan';

/**
 * The device's own answer about the camera, over `expo-camera`.
 *
 * Never imported from a test: this file loads a native module, and `verify` runs none. The
 * mapping it applies — `cameraPermissionFrom` — is pure and lives in the port beside its tests, so
 * what is left here is genuinely only the call to the device.
 *
 * The camera itself is not here. Decoding happens inside `CameraView` on
 * `src/app/transaction/scan.tsx`, mounted on that screen and nowhere else, and no frame is stored
 * or sent anywhere: the permission is the only part of the camera that can be a value.
 */

/**
 * A build or platform where no camera can be used.
 *
 * `Platform.OS === 'web'` is one: the web bundle exists to keep `expo start --web` working and has
 * no scanner. A missing or half-linked `expo-camera` is the other — a development build made
 * before the dependency was added resolves the import to something without these functions, and
 * answering `unsupported` is what stops the screen offering a dialog that cannot appear.
 */
function unavailable(): boolean {
  return (
    Platform.OS === 'web' ||
    typeof Camera?.getCameraPermissionsAsync !== 'function' ||
    typeof Camera?.requestCameraPermissionsAsync !== 'function'
  );
}

async function state(): Promise<CameraPermission> {
  if (unavailable()) return cameraPermissionFrom(undefined);
  try {
    return cameraPermissionFrom(await Camera.getCameraPermissionsAsync());
  } catch {
    // A module that resolved but cannot answer is a build the camera cannot be used in: the
    // honest answer is the one that stops offering a dialog and a settings screen.
    return cameraPermissionFrom(undefined);
  }
}

/**
 * Asks the system. Called only when the state is `deniable`; on anything else the system shows
 * nothing, and the port's contract says so.
 */
async function request(): Promise<CameraPermission> {
  if (unavailable()) return cameraPermissionFrom(undefined);
  try {
    return cameraPermissionFrom(await Camera.requestCameraPermissionsAsync());
  } catch {
    return cameraPermissionFrom(undefined);
  }
}

/**
 * This app's own settings screen — the only place a blocked camera permission can be changed.
 * `Linking.openSettings` is the cross-platform one and needs no extra dependency; on web there is
 * no such screen and the call is a no-op, which is the honest answer where the permission does
 * not exist.
 */
async function openSettings(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Linking.openSettings();
}

export const qrScan: QrScanPort = { state, request, openSettings };
