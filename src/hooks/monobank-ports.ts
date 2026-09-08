import { AppState } from 'react-native';

import { monobank as monobankRepo, rules as rulesRepo } from '@/db/repos';
import type { SyncPorts } from '@/monobank/coordinator';
import { deviceTimer, foregroundRun, withRequestTimeout, REQUEST_TIMEOUT_MS } from '@/monobank/yielding';
import { monobankTokenStore } from '@/platform/monobank-token-store';
import { dateOfEpochMs } from '@/ui/dates';
import { newId } from '@/ui/id';

/**
 * Everything a monobank sync run needs of this device, in one place.
 *
 * Three things start a run — the app opening or returning to the foreground, the pull on
 * Головний, and «Синхронізувати» on the monobank screen — and each of them lives in a `.tsx`
 * that `npm run verify` cannot reach. Written out at each call site, the fourteen lines below
 * would be three hand-kept copies of a decision that matters: `dateOf` is what turns a statement
 * item's Unix seconds into the day the money moved, and therefore into the *month* an imported
 * витрата lands in. Three copies is how one trigger quietly starts dating транзакції differently
 * from another.
 *
 * It sits in `src/hooks/` for `use-alerting.ts`'s reason rather than because it is a hook: it
 * reaches for the platform adapters — secure storage, the device's `fetch` and its clock — and
 * nothing under `verify` may load those. Everything it is *for* is decided in
 * `src/monobank/coordinator.ts` and `src/ui/monobank-sync.ts`, which is where the rules are proven.
 *
 * `over` is for what one caller alone knows: the monobank screen's progress reporting and its
 * «Зупинити», which the automatic run deliberately has neither of (design D4). The background
 * task hands its own `wait` and `postponed` the same way, replacing the foreground pair below —
 * that pair says «not in front» at once in a headless process, which is exactly right for a run
 * the owner started and exactly wrong for the run a chance starts.
 */
export function syncPorts(over: Partial<SyncPorts> = {}): SyncPorts {
  const foreground = foregroundRun({
    setTimer: deviceTimer,
    inForeground: () => AppState.currentState === 'active',
    onLeaveForeground: (fn) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state !== 'active') {
          fn();
        }
      });
      return () => subscription.remove();
    },
  });
  return {
    tokenStore: monobankTokenStore,
    // Given up after the timeout, and given up with its socket: `fetchClientInfo` and
    // `fetchStatement` turn the rejection into `unavailable`, so the run goes on to its next
    // рахунок instead of holding the one-run lock on a request the bank will never answer
    // (design D8).
    fetch: withRequestTimeout(
      (url, headers, signal) => fetch(url, { headers, ...(signal ? { signal } : {}) }),
      { setTimer: deviceTimer, timeoutMs: REQUEST_TIMEOUT_MS },
    ),
    storage: monobankRepo,
    // Read once per run, so a правило created since the last one decides this one.
    rules: () => rulesRepo.list(),
    nowMs: () => Date.now(),
    now: () => new Date(),
    // The statement's own seconds turned into the day the money moved. `dateOfEpochMs` is shared
    // with the notification drain, so the two importers date a purchase alike.
    dateOf: (unixSeconds) => dateOfEpochMs(unixSeconds * 1000),
    // The wait ends on its timer *or* on the app leaving the foreground, and the question after it
    // answers «not in front». Android pauses every JS timer while the Activity is paused, so a
    // wait left to its timer alone would never resolve and the run would hold the lock — and with
    // it every background run — until the app was next opened (design D5).
    wait: foreground.wait,
    postponed: foreground.postponed,
    newId,
    ...over,
  };
}

