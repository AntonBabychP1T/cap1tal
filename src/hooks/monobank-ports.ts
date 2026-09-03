import { monobank as monobankRepo, rules as rulesRepo } from '@/db/repos';
import type { SyncPorts } from '@/monobank/coordinator';
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
 * «Зупинити», which the automatic run deliberately has neither of (design D4).
 */
export function syncPorts(over: Partial<SyncPorts> = {}): SyncPorts {
  return {
    tokenStore: monobankTokenStore,
    fetch: (url, headers) => fetch(url, { headers }),
    storage: monobankRepo,
    // Read once per run, so a правило created since the last one decides this one.
    rules: () => rulesRepo.list(),
    nowMs: () => Date.now(),
    now: () => new Date(),
    // The statement's own seconds turned into the day the money moved. `dateOfEpochMs` is shared
    // with the notification drain, so the two importers date a purchase alike.
    dateOf: (unixSeconds) => dateOfEpochMs(unixSeconds * 1000),
    wait: (ms) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
    newId,
    ...over,
  };
}
