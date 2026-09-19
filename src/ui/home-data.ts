import type { IsoDate } from '../domain/transaction';
import { todayIso } from './dates';

/**
 * The dashboard's data lifecycle, in the two pieces `verify` can prove without a device:
 *
 * `hasDateRolledOver` decides the one reload trigger that has no event to subscribe to — the
 * device's own calendar advancing while Головний stays open or comes back from the background
 * (main-screen, "Rollover updates the month"). Every other trigger already has one: a navigation
 * focus (mutation, restore, valuation, opening-balance edit — each happens on a screen reached by
 * leaving Головний, and returning is a focus), a sync completion (`onSyncState`), or a captured
 * чернетка (`onCapturesStored`). `index.tsx` is where all of them are wired; this file is only the
 * one decision none of those events makes on their own.
 *
 * `makeCancelToken` is the one shape both of Головний's async reads (the monobank token, the rate
 * refresh) already used, by hand, in two slightly different forms. One tested primitive means a
 * result that arrives after the read that asked for it no longer matters cannot be applied twice
 * in two different ways.
 */

/** Whether the local calendar date has moved on since the reading that produced `lastToday`. */
export function hasDateRolledOver(lastToday: IsoDate, now: Date): boolean {
  return todayIso(now) !== lastToday;
}

/** Set by a `useEffect`'s cleanup; read before an async result is allowed to reach state. */
export interface CancelToken {
  readonly cancelled: () => boolean;
}

/**
 * A cancel flag and the token that reads it, separated so the token can be handed to an async
 * callback while only the effect that created it can ever trip it. `cancel()` is idempotent —
 * cleanup can run more than once in development without changing what the token reports.
 */
export function makeCancelToken(): { readonly token: CancelToken; readonly cancel: () => void } {
  let cancelled = false;
  return {
    token: { cancelled: () => cancelled },
    cancel: () => {
      cancelled = true;
    },
  };
}
