import type { AccumulationGoal } from '../domain/goals';
import type { Money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import { evaluate } from './achievements';
import type { GoalStanding } from './catalogue';
import type { EarnedAchievement, SpendingNorms } from './earned';
import type { ProgressSummary } from './summary';

/**
 * When the evaluation runs, and what it is given.
 *
 * The moments are named in the achievements capability and nowhere else: app start, and after a
 * транзакція is recorded, edited or deleted; a monobank sync commits; a чернетка is settled; a
 * Saldo імпорт commits; a відновлення lands; a ціль-накопичення changes; a рахунок is created,
 * edited or archived; and a норма is confirmed. **Drawing a screen is not one of them** — no view
 * model imports this module, and every one of them takes stored rows as its input, so there is no
 * path by which looking at something earns it.
 *
 * Storing a транзакція *from* a screen does evaluate: that is the recording, not the drawing.
 *
 * The one impure thing here is the order of operations; the decisions are all in `achievements.ts`
 * and the catalogue. What this module owns is the seam of design D6: it is where a ціль's progress
 * is resolved, through `goalProgress`, so that `src/progress/` never imports `src/ui/` and no курс
 * can decide a досягнення — an approximate progress arrives at the engine as `null`.
 */

/** What `run` needs of storage and of the device, each as a plain function or value. */
export interface RunPorts {
  readonly readProgressSummary: () => ProgressSummary;
  readonly nthTransactionDate: (n: number) => IsoDate | undefined;
  readonly firstTransferOntoKind: (
    kind: 'spending' | 'savings' | 'investment' | 'cash' | 'debt',
  ) => IsoDate | undefined;
  readonly goals: () => readonly AccumulationGoal[];
  readonly norms: () => SpendingNorms;
  readonly earnedKeys: () => Set<string>;
  readonly earn: (achievement: EarnedAchievement) => void;
  /**
   * A ціль's progress **in its own currency**, or `null` when the `goals` capability cannot give an
   * exact one — a внесок that needed a курс, or a курс that is missing. Passed in so this module
   * stays free of `src/ui/goal-progress.ts` and of the rates it reads.
   */
  readonly exactGoalProgress: (goal: AccumulationGoal, summary: ProgressSummary) => Money | null;
  readonly today: () => IsoDate;
  readonly nowMs: () => number;
}

/**
 * Evaluate once, store what is new, and return it.
 *
 * Add-only, so calling it at a moment where nothing changed costs one bounded reading and writes
 * nothing. Calling it twice is calling it once.
 */
export function runEvaluation(ports: RunPorts): EarnedAchievement[] {
  const summary = ports.readProgressSummary();
  const goals: GoalStanding[] = ports
    .goals()
    .map((goal) => ({ goal, progress: ports.exactGoalProgress(goal, summary) }));

  const newly = evaluate({
    summary,
    today: ports.today(),
    nowMs: ports.nowMs(),
    earned: ports.earnedKeys(),
    goals,
    norms: ports.norms(),
    nthTransactionDate: ports.nthTransactionDate,
    firstTransferOntoKind: ports.firstTransferOntoKind,
  });

  for (const achievement of newly) {
    ports.earn(achievement);
  }
  return newly;
}
