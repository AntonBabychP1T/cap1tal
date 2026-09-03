import type { AccumulationGoal } from '@/domain/goals';
import type { Money } from '@/domain/money';
import {
  categories as categoriesRepo,
  goals as goalsRepo,
  limits as limitsRepo,
  progress as progressRepo,
  rates as ratesRepo,
} from '@/db/repos';
import { candidates, type Candidate, type GoalStanding } from '@/progress/catalogue';
import { accepted, offered, allChallenges, type Challenge } from '@/progress/challenges';
import { runEvaluation, type RunPorts } from '@/progress/run';
import type { ProgressSummary } from '@/progress/summary';
import type { EarnedAchievement } from '@/progress/earned';
import { todayIso } from '@/ui/dates';
import { reportFailure } from '@/ui/journal';
import { monthLabel } from '@/ui/months';
import { formatMoney } from '@/ui/amount-input';
import { goalProgress, type Contribution } from '@/ui/goal-progress';

/**
 * Everything the evaluation of досягнення needs of this device, in one place.
 *
 * It sits in `src/hooks/` for `monobank-ports.ts`'s reason rather than because it is a hook: it
 * reaches for the repositories and the device clock, and the ten places that evaluate live in
 * `.tsx` files `npm run verify` cannot load. Everything it is *for* is decided in
 * `src/progress/`, which is where the rules are proven.
 *
 * The one decision made here is design D6's seam: a ціль's progress is resolved **before** the
 * engine sees it, and only an exact one is passed on. An approximate progress — a склад that
 * needed a курс — and an unknown one both arrive as `null`, so no rate can decide a досягнення and
 * `src/progress/` never imports `src/ui/goal-progress.ts`.
 */
export function progressPorts(now: () => Date = () => new Date()): RunPorts {
  return {
    readProgressSummary: () => progressRepo.readProgressSummary(),
    nthTransactionDate: (n) => progressRepo.nthTransactionDate(n),
    firstTransferOntoKind: (kind) => progressRepo.firstTransferOntoKind(kind),
    goals: () => goalsRepo.list(),
    norms: () => progressRepo.norms(),
    earnedKeys: () => progressRepo.earnedKeys(),
    earn: (achievement: EarnedAchievement) => progressRepo.earn(achievement),
    exactGoalProgress: (goal: AccumulationGoal, summary: ProgressSummary): Money | null =>
      exactProgressOf(goal, summary),
    today: () => todayIso(now()),
    nowMs: () => now().getTime(),
  };
}

/**
 * A ціль's progress in its own currency, or `null`.
 *
 * The внески are read from the зведення's per-рахунок балансі, so evaluating loads no транзакція
 * for a ціль either — the same numbers the ціль screen shows, from a bounded reading rather than
 * from the history. A рахунок the зведення does not hold is left out of the внески rather than
 * counted as zero, exactly as «Звіти» does it.
 *
 * `null` for anything but `kind: 'exact'`: a приблизний progress is a number a курс moved, and the
 * achievements capability forbids a курс deciding a досягнення.
 */
function exactProgressOf(goal: AccumulationGoal, summary: ProgressSummary): Money | null {
  const balances = new Map(summary.accounts.map((row) => [row.id, row]));
  const contributions: Contribution[] = goal.accountIds.flatMap((id) => {
    const row = balances.get(id);
    return row === undefined
      ? []
      : [{ accountId: id, amount: { amount: row.balance, currency: row.currency } }];
  });
  const progress = goalProgress({
    currency: goal.target.currency,
    contributions,
    rates: ratesRepo.all(),
  });
  return progress.kind === 'exact' ? progress.total : null;
}

/**
 * Evaluate now, and return what was newly earned. The call every one of the named moments makes.
 *
 * It never throws into a caller: a досягнення is a nicety beside the транзакція that was just
 * stored, and a failure to notice one must never take down the запис that caused it. It is not
 * *silent* about it either — the failure goes to the журнал like every other one in this app, so
 * a свідчення this build cannot encode is visible in a репорт про помилку rather than invisible
 * forever.
 */
export function evaluateProgress(): EarnedAchievement[] {
  try {
    return runEvaluation(progressPorts());
  } catch (error) {
    reportFailure('progress-evaluate', error);
    return [];
  }
}

/** Everything «Прогрес» and the two detail screens read. Nothing here evaluates or writes. */
export interface ProgressScreenData {
  readonly candidates: readonly Candidate[];
  readonly earned: readonly EarnedAchievement[];
  readonly offered: readonly Challenge[];
  readonly accepted: readonly Challenge[];
  /** Every виклик the data can state, finished ones included — what a detail screen looks up. */
  readonly all: readonly Challenge[];
  readonly hasHistory: boolean;
  readonly summary: ProgressSummary;
}

/**
 * One bounded reading of storage, turned into everything the прогрес screens show.
 *
 * It is deliberately **read-only**: it calls neither `runEvaluation` nor any writer, so opening
 * «Прогрес» — or leaving it and coming back — cannot earn anything. The evaluation happens at the
 * named moments and nowhere else.
 */
export function progressScreenData(now: Date = new Date()): ProgressScreenData {
  const summary = progressRepo.readProgressSummary();
  const today = todayIso(now);
  const norms = progressRepo.norms();
  const standings: GoalStanding[] = goalsRepo
    .list()
    .map((goal) => ({ goal, progress: exactProgressOf(goal, summary) }));

  const named = candidates({
    summary,
    today,
    nthTransactionDate: (n) => progressRepo.nthTransactionDate(n),
    firstTransferOntoKind: (kind) => progressRepo.firstTransferOntoKind(kind),
    goals: standings,
    norms,
  });

  const challengeInput = {
    summary,
    today,
    goals: standings,
    limits: limitsRepo.list(),
    categoryNames: new Map(categoriesRepo.list().map((one) => [one.id, one.name])),
    norms,
    decisions: progressRepo.listDecisions(),
    monthLabel,
    formatMoney,
  };

  return {
    candidates: named,
    earned: progressRepo.listEarned(),
    offered: offered(challengeInput),
    accepted: accepted(challengeInput),
    all: allChallenges(challengeInput),
    hasHistory: summary.history.count > 0,
    summary,
  };
}
