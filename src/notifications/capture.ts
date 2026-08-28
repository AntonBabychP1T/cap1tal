/**
 * What the phone hands the engine: one notification another bank's app posted, read on the device
 * and passed in as a plain record.
 *
 * The engine's only input from the platform is this record (design D1) — the same seam the
 * monobank token stood at. How notifications reach it (the Android listener service, its
 * permission, the queue that drains into here) is the `bank-notifications-screen` change's
 * problem; nothing in `src/notifications/` imports a platform, a database or a network.
 */
export interface CapturedNotification {
  /** The posting app's package name, e.g. "ua.privatbank.ap24". The watch is keyed on it. */
  readonly packageName: string;
  /** The moment Android posted it, epoch milliseconds. Turned into a calendar date by a port. */
  readonly postedAt: number;
  readonly title: string;
  readonly text: string;
}

/**
 * The identity of a captured notification: its four fields joined by spaces (design D3).
 *
 * Notifications carry no bank item id, so this string is the whole of "have we seen this one
 * before" — the answer that keeps Android re-posting an updated notification from doubling the
 * owner's money. It is the plain joined text rather than a hash on purpose: equality is the only
 * operation anyone needs, and a hash would trade shorter storage for a collision quietly
 * swallowing a real транзакція. (The join is ambiguous only if two notifications from the same app
 * in the same millisecond split the same characters differently between title and text — which a
 * re-post, the case this exists for, never does.)
 */
export function fingerprintOf(capture: CapturedNotification): string {
  return `${capture.packageName} ${capture.postedAt} ${capture.title} ${capture.text}`;
}
