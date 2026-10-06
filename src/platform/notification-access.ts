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
 *
 * `not-listening` is the fourth, and it exists because Android's own answer is not the whole
 * truth. The system's list of enabled listeners says what the owner switched on in settings; it
 * says nothing about whether the listener is *bound*, and an app update, a reinstall or a «Force
 * stop» leaves one switched on and unbound — enabled, deaf, and reported as granted. That is not
 * a state the owner can be left to guess at: a чернетка that never appears looks exactly like a
 * day with no spending, so nothing on the phone contradicts a status line that says «надано»
 * while транзакції quietly stop arriving.
 */
export type NotificationAccess = 'granted' | 'denied' | 'unsupported' | 'not-listening';

/**
 * The four answers, from the two things a platform can actually tell us: whether a notification
 * listener is installed here at all and switched on, and whether it is bound and hearing.
 *
 * `enabled` `undefined` is "there is nothing to switch on" — no listener in this build, or a
 * platform with no such permission — and that is what makes `unsupported` a separate answer
 * rather than a pessimistic `denied`.
 *
 * `listening` `undefined` is the device declining to say, and it maps to `granted`, never to
 * `not-listening`: a build whose module resolved but threw has not reported silence, and an
 * unanswered question turned into a failure would announce a сповіщення про збій on every open of
 * a build that works. The same rule `installedAmong` keeps with `'unknown'` — an unanswered
 * question is not a "no".
 *
 * Pure, so the mapping the device adapter applies is proven under `verify` even though the
 * adapter itself can never be loaded there.
 */
export function notificationAccessFrom(
  enabled: boolean | undefined,
  listening: boolean | undefined = undefined,
): NotificationAccess {
  if (enabled === undefined) {
    return 'unsupported';
  }
  if (!enabled) {
    return 'denied';
  }
  return listening === false ? 'not-listening' : 'granted';
}

export interface NotificationAccessPort {
  /**
   * What the device says right now. Asked on opening the setup view, and after coming back.
   *
   * Asking is also what repairs: on the one path where the listener is switched on and not
   * hearing, this asks the system to bind it again before it answers, so an update or a reinstall
   * heals on the next open rather than waiting for the owner to notice weeks of silence. The only
   * question in `src/platform/` with a side effect, and it is written on the function rather than
   * hidden below it — every caller that wants to know also wants it working.
   */
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
