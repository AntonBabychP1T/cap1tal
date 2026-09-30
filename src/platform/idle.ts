/**
 * The seam between the app and "once the screen has settled": work that does not decide what the
 * next screen shows runs after the tap's transition or the first frame, not inside it (app-shell,
 * "Work that follows a save or the launch never holds up the screen"; app-speed-pass design D5).
 * The port and its test double only — the adapter is `idle-device.ts`, never imported from here.
 */
export interface IdlePort {
  /** Runs `work` once, after the screen has finished changing. Never inline, never twice. */
  afterScreenSettles(work: () => void): void;
}

/**
 * The idle the tests use: it queues, and runs nothing until `flush()`. That is what lets a test
 * show that nothing ran inline, and that everything ran exactly once, in order, afterwards.
 */
export function queuedIdle(): IdlePort & { flush(): void; readonly pending: number } {
  const queue: (() => void)[] = [];
  return {
    afterScreenSettles(work) {
      queue.push(work);
    },
    flush() {
      while (queue.length > 0) {
        queue.shift()!();
      }
    },
    get pending() {
      return queue.length;
    },
  };
}
