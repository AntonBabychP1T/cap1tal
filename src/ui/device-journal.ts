import { journal } from './journal';

/**
 * What the device does to the app, as журнал entries — the decisions, not the calls.
 *
 * `src/platform/*-device.ts` is never loaded under `npm run verify`; that is what the `-device`
 * suffix is for. A journal write placed inside an adapter would therefore be a rule with no
 * runnable test, and three spec scenarios would be assertions nobody checks. So every `native`
 * entry is decided here, against synthetic facts, and the adapter's only new line is the call
 * (design D5). It is the same split `monobank-background.ts` already makes against
 * `src/platform/monobank-sync-task.ts`.
 *
 * Each entry's `detail` is the device's own enumerated answer — `granted`, `denied`, `connected`,
 * `background` — never a sentence the app composed about it. That is what makes the entries
 * greppable at the laptop, and it is the same rule the rest of the журнал follows.
 *
 * **Two of these three answer on a change of state, not on a read.** The app reads notification
 * access on every foreground and on every visit to «Сповіщення банків», and `AppState` fires for
 * changes that are not moves. An entry per read would rebuild, as `native` noise, exactly the
 * 200-of-208 problem the screen folding removes — and «the permission was withdrawn at 14:02»
 * would stop being a fact the репорт states once, where it is readable.
 */

/** What the журнал calls the permission FR-S3 rests on. */
export const NOTIFICATION_ACCESS = 'notification-access';

/** What the журнал calls the listener that does the hearing. */
export const NOTIFICATION_LISTENER = 'notification-listener';

/** What the журнал calls the app's own coming and going. */
export const APP_STATE = 'app-state';

/**
 * The state each permission was last recorded in, so a read that changed nothing writes nothing.
 *
 * Module state, like every other «there is exactly one of this device» fact in `src/ui/`. It is
 * deliberately not persisted: the first read after a launch is worth an entry, because a
 * permission the owner revoked while the app was closed is exactly the thing a репорт needs said.
 */
const recorded = new Map<string, string>();

/**
 * Records the state of something the device grants, when it differs from the state last recorded.
 *
 * Returns whether anything was written, which is what the tests read — the adapters ignore it.
 */
export function journalPermission(what: string, state: string): boolean {
  if (recorded.get(what) === state) {
    return false;
  }
  recorded.set(what, state);
  journal.record('native', what, state);
  return true;
}

/** Whether the app is in front of the owner. The root layout mounts because it is. */
let inFront = true;

/**
 * Records the app moving between the foreground and anything else — one entry per *move*.
 *
 * `AppState` fires for changes that are not moves: `inactive` on Android is a transient it passes
 * through, and the same state can arrive twice. A rule about that cannot be proven inside a
 * `.tsx`, which is the whole reason this function exists rather than three lines in `_layout.tsx`.
 *
 * Returns whether anything was written.
 */
export function journalAppState(state: string): boolean {
  const nowInFront = state === 'active';
  if (nowInFront === inFront) {
    return false;
  }
  inFront = nowInFront;
  // The device's own word — `active`, `background`, `inactive` — and not «пішов у фон».
  journal.record('native', APP_STATE, state);
  return true;
}

/** Only for tests: forgets what was last recorded, so each one starts from nothing. */
export function resetDeviceJournalForTests(): void {
  recorded.clear();
  inFront = true;
}
