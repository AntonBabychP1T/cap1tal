/**
 * The launch chores — the work that follows opening the app but does not draw its first screen —
 * started together once that screen is drawn and ready for a tap (app-shell, "Work that follows a
 * save or the launch never holds up the screen"; app-speed-pass design D5).
 *
 * Only the moment they start moves. The order is the caller's list; the synchronous ones run one
 * after another, and the asynchronous ones are *started* in that order and left to run side by
 * side, exactly as the separate launch effects started them before — none waits for another that
 * did not wait before. A chore that throws is reported and the rest still start, as they did when
 * each had an effect of its own.
 */
export interface LaunchChore {
  /** Where a failure is journaled — `reportFailure`'s `where`. */
  readonly name: string;
  /** Anything but a promise is finished when it returns; a promise is started and not awaited. */
  readonly run: () => unknown;
}

export function startLaunchChores(ports: {
  /** Runs the work once the first screen has settled. */
  readonly schedule: (work: () => void) => void;
  readonly chores: readonly LaunchChore[];
  readonly report: (name: string, error: unknown) => void;
}): void {
  ports.schedule(() => {
    for (const chore of ports.chores) {
      try {
        const started = chore.run();
        if (started instanceof Promise) {
          started.catch((error: unknown) => ports.report(chore.name, error));
        }
      } catch (error) {
        ports.report(chore.name, error);
      }
    }
  });
}
