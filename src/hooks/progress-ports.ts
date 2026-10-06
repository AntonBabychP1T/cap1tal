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
import {
  accepted,
  allChallenges,
  dismissed,
  offered,
  type Challenge,
} from '@/progress/challenges';
import { judgeAfterSettle } from '@/progress/deferred-judgement';
import { runEvaluation, type RunPorts } from '@/progress/run';
import { deviceIdle } from '@/platform/idle-device';
import type { ProgressSummary } from '@/progress/summary';
import type { EarnedAchievement } from '@/progress/earned';
import { todayIso } from '@/ui/dates';
import { reportFailure } from '@/ui/journal';
import { monthAccusativeYearLabel, monthInYearLabel, monthLabel } from '@/ui/months';
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

/** Who hears that a judging earned something — the screens that show досягнення. */
const judgedListeners = new Set<() => void>();

/**
 * Subscribes to «a judging earned something»; returns the unsubscribe. Screens pass their
 * `reloadWhenSeen`, so the one in sight shows the new досягнення at once and the hidden ones on
 * their next focus (app-speed-pass design D5).
 */
export function onProgressJudged(listener: () => void): () => void {
  judgedListeners.add(listener);
  return () => {
    judgedListeners.delete(listener);
  };
}

function announceProgressJudged(): void {
  for (const listener of [...judgedListeners]) {
    listener();
  }
}

/**
 * What every screen calls at the named moments instead of `evaluateProgress()`: the same judging,
 * with the same verdict, run once the screen has settled rather than inside the tap that stored
 * something (app-shell, "Work that follows a save or the launch never holds up the screen"). When
 * it earns anything, `onProgressJudged` tells the screens.
 */
export function judgeProgressLater(): void {
  judgeAfterSettle({
    schedule: (work) => deviceIdle.afterScreenSettles(work),
    judge: evaluateProgress,
    announce: announceProgressJudged,
  });
}

/**
 * The same judging and announcement, now — for a caller that is itself already running after the
 * screen settled: the launch chores.
 */
export function judgeProgressNow(): void {
  judgeAfterSettle({ schedule: (work) => work(), judge: evaluateProgress, announce: announceProgressJudged });
}

/** Everything «Прогрес» and the two detail screens read. Nothing here evaluates or writes. */
export interface ProgressScreenData {
  readonly candidates: readonly Candidate[];
  readonly earned: readonly EarnedAchievement[];
  readonly offered: readonly Challenge[];
  readonly accepted: readonly Challenge[];
  /** The ones the owner dismissed — listed so «Повернути» is reachable, never proposed. */
  readonly dismissed: readonly Challenge[];
  /** Every виклик the data can state, finished ones included — what a detail screen looks up. */
  readonly all: readonly Challenge[];
  readonly hasHistory: boolean;
  readonly summary: ProgressSummary;
}

/** The named candidates one bounded reading produces, and everything they were named from. */
function namedCandidates(now: Date): {
  summary: ProgressSummary;
  today: string;
  standings: readonly GoalStanding[];
  norms: ReturnType<typeof progressRepo.norms>;
  named: readonly Candidate[];
} {
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

  return { summary, today, standings, norms, named };
}

/** What the quiet badge beside «Звіти» → «Прогрес» needs, and nothing a challenge needs. */
export interface UnseenAchievementsData {
  readonly candidates: readonly Candidate[];
  readonly earned: readonly EarnedAchievement[];
}

/**
 * The same bounded, read-only reading `progressScreenData` does, narrowed to what the Reports
 * badge shows: a досягнення's current name and which rows are unseen. It skips the виклик
 * classification — «Звіти» names a досягнення, never a виклик, beside its Прогрес entry.
 */
export function unseenAchievementsData(now: Date = new Date()): UnseenAchievementsData {
  const { named } = namedCandidates(now);
  return { candidates: named, earned: progressRepo.listEarned() };
}

/**
 * One bounded reading of storage, turned into everything the прогрес screens show.
 *
 * It is deliberately **read-only**: it calls neither `runEvaluation` nor any writer, so opening
 * «Прогрес» — or leaving it and coming back — cannot earn anything. The evaluation happens at the
 * named moments and nowhere else.
 */
export function progressScreenData(now: Date = new Date()): ProgressScreenData {
  const { summary, today, standings, norms, named } = namedCandidates(now);

  const challengeInput = {
    summary,
    today,
    goals: standings,
    limits: limitsRepo.list(),
    categoryNames: new Map(categoriesRepo.list().map((one) => [one.id, one.name])),
    norms,
    decisions: progressRepo.listDecisions(),
    monthLabel,
    monthAccusativeYearLabel,
    monthInYearLabel,
    formatMoney,
  };

  return {
    candidates: named,
    earned: progressRepo.listEarned(),
    offered: offered(challengeInput),
    accepted: accepted(challengeInput),
    dismissed: dismissed(challengeInput),
    all: allChallenges(challengeInput),
    hasHistory: summary.history.count > 0,
    summary,
  };
}
