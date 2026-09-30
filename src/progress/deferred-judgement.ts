/**
 * Judging досягнення and виклики after a save, once the screen has settled — and telling the
 * screens when that judging changed anything (app-shell, "Work that follows a save or the launch
 * never holds up the screen"; app-speed-pass design D5).
 *
 * Pure: the three ports are the caller's. `src/hooks/progress-ports.ts` binds `schedule` to the
 * device idle, `judge` to `evaluateProgress` and `announce` to the `onProgressJudged` event.
 */
export function judgeAfterSettle<E>(ports: {
  /** Runs the work once the screen has finished changing. */
  readonly schedule: (work: () => void) => void;
  /** Judges now; returns what was newly earned. */
  readonly judge: () => readonly E[];
  /** Tells the screens that judging earned something, so the one in sight shows it. */
  readonly announce: () => void;
}): void {
  ports.schedule(() => {
    const earned = ports.judge();
    if (earned.length > 0) {
      ports.announce();
    }
  });
}
