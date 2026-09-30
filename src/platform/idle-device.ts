import type { IdlePort } from './idle';

/**
 * How long a busy JS thread may hold settled work back before it runs anyway, in milliseconds.
 * Half a second: past any tab or push transition, short enough that a досягнення earned by a save
 * appears while the owner is still looking at the screen the save returned to.
 */
const SETTLE_TIMEOUT_MS = 500;

/**
 * `requestIdleCallback`, which React Native's runtime provides — `InteractionManager` is deprecated
 * in RN 0.86 (app-speed-pass design D5). With a timeout, so the work runs at the latest half a
 * second later even on a thread that never goes idle.
 *
 * Never imported by a test: `verify` loads `queuedIdle` from `idle.ts` instead.
 */
export const deviceIdle: IdlePort = {
  afterScreenSettles(work) {
    requestIdleCallback(() => work(), { timeout: SETTLE_TIMEOUT_MS });
  },
};
