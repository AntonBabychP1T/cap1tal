/**
 * The seam between the app and Android's permission to read what other apps post as
 * notifications — the permission FR-S3's reading of other banks' push notifications rests on.
 *
 * The port and its double only. The device adapter is `notification-access-device.ts`, and it is
 * not imported from here: nothing under `npm run verify` may load a native module or React
 * Native, so every rule about the permission — what the setup step says for each answer, and
 * that an unavailable one offers nowhere to go — is proven against the double.
 *
 * Failures are values, as everywhere else in `src/platform`: a build with no way to grant the
 * permission is an answer the screen shows, not an exception to catch.
 */

/**
 * What the device can say about notification access.
 *
 * `unsupported` is not a refusal and not an error: it is a build in which the permission cannot
 * be granted at all, because no notification listener is installed for the owner to switch on.
 * It is a separate answer from `denied` precisely so the setup step can stop offering a system
 * screen the app does not appear on.
 */
export type NotificationAccess = 'granted' | 'denied' | 'unsupported';

/**
 * The three answers, from the one thing a platform can actually tell us: whether a notification
 * listener is installed here at all, and if it is, whether the owner has switched it on.
 *
 * `undefined` is "there is nothing to switch on" — no listener in this build, or a platform with
 * no such permission — and that is what makes `unsupported` a separate answer rather than a
 * pessimistic `denied`. Pure, so the mapping the device adapter applies is proven under `verify`
 * even though the adapter itself can never be loaded there.
 */
export function notificationAccessFrom(enabled: boolean | undefined): NotificationAccess {
  if (enabled === undefined) {
    return 'unsupported';
  }
  return enabled ? 'granted' : 'denied';
}

export interface NotificationAccessPort {
  /** What the device says right now. Asked on opening the setup view, and after coming back. */
  state(): Promise<NotificationAccess>;
  /**
   * Opens the system screen where the owner grants it. Called only when `state()` has answered
   * something other than `unsupported` — there is nowhere to send them otherwise.
   */
  openSettings(): Promise<void>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads. It records whether the
 * settings screen was opened, which is how the tests prove that an `unsupported` step offers
 * nothing rather than quietly opening something.
 */
export function inMemoryNotificationAccess(answer: NotificationAccess): NotificationAccessPort & {
  readonly opened: () => number;
} {
  let opened = 0;
  return {
    state: () => Promise.resolve(answer),
    openSettings: () => {
      opened += 1;
      return Promise.resolve();
    },
    opened: () => opened,
  };
}
