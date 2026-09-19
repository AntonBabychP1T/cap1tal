import { money, type Money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import type { Candidate, Progress } from '../progress/catalogue';
import { plural } from '../progress/plural';
import { newestFirst, type EarnedAchievement, type Evidence } from '../progress/earned';
import type { Challenge, ChallengeAction, ChallengeProgress } from '../progress/challenges';
import { formatMoney } from './amount-input';
import { calendarLabel, todayIso } from './dates';

/**
 * What «Прогрес», the «Прогрес» section of Головний and the two detail screens say.
 *
 * Pure TypeScript, no React: every rule below is a decision `npm run verify` can check, and the
 * `.tsx` files are wiring. **Nothing here can earn anything** — the view models take stored rows
 * as their input and have no way to reach the engine, which is what makes «drawing a screen never
 * evaluates» a property of the code rather than a promise.
 *
 * Every number this module produces is a сума in integer minor units with its currency, a count,
 * or a share of a stated target. There is no score, no level, no coin and no rank anywhere, and no
 * two currencies are ever summed or converted into one figure for display.
 */

/** The heading of each section, in the order «Прогрес» shows them. */
export const CHALLENGES_TITLE = 'Виклики';
export const IN_PROGRESS_TITLE = 'У процесі';
export const EARNED_TITLE = 'Отримані';

export const NOTHING_TO_DO = 'Зараз немає чого запропонувати.';
export const NOTHING_IN_PROGRESS = 'Поки що нічого не в процесі.';
export const NOTHING_EARNED = 'Ще нічого не отримано.';
/** A device holding no транзакція: what the screen is for, and that there is nothing yet. */
export const NOTHING_YET =
  'Тут буде видно, що вже вийшло і що варто зробити далі, — щойно з’явиться перша транзакція.';

export interface ChallengeRow {
  readonly key: string;
  readonly name: string;
  readonly reason: string;
  /** «900 000,00 UAH з 3 000 000,00 UAH», «2 з 3», or «залишилось 3 записи». */
  readonly progress: string;
  readonly criterion: string;
  /** Whether the owner accepted this one; an offered виклик is not accepted until they say so. */
  readonly accepted: boolean;
  /** Whether they dismissed it. A dismissed виклик is listed, never proposed — see below. */
  readonly dismissed: boolean;
  readonly route: string;
}

export interface InProgressRow {
  readonly key: string;
  readonly name: string;
  readonly progress: string;
  readonly route: string;
}

export interface EarnedRow {
  readonly key: string;
  readonly name: string;
  /** «досягнуто 3 грудня» or «помічено 2 вересня» — never one wearing the other's word. */
  readonly when: string;
  readonly route: string;
}

export interface ProgressViewModel {
  readonly challengesTitle: string;
  readonly challenges: readonly ChallengeRow[];
  readonly challengesEmpty: string | null;
  readonly inProgressTitle: string;
  readonly inProgress: readonly InProgressRow[];
  readonly inProgressEmpty: string | null;
  readonly earnedTitle: string;
  readonly earned: readonly EarnedRow[];
  readonly earnedEmpty: string | null;
  /**
   * The one sentence a device with nothing shows instead of the three sections. Not `null` means
   * no list, no bar and no placeholder is drawn at all.
   */
  readonly nothingYet: string | null;
}

export interface ProgressInput {
  /** Every досягнення the catalogue can name for the current data, earned or not. */
  readonly candidates: readonly Candidate[];
  /** The earned rows as storage holds them. */
  readonly earned: readonly EarnedAchievement[];
  readonly offered: readonly Challenge[];
  readonly accepted: readonly Challenge[];
  /** The ones the owner dismissed, so bringing one back is reachable at all. */
  readonly dismissed: readonly Challenge[];
  /** Whether any транзакція is stored at all. */
  readonly hasHistory: boolean;
  readonly now: Date;
}

/** «12 досягнень», «1 досягнення», «3 досягнення» — the count as Ukrainian writes it. */
export function achievementsCount(n: number): string {
  return `${n} ${plural(n, 'досягнення', 'досягнення', 'досягнень')}`;
}

/** How a досягнення's progress reads: a share of a count, or one сума against another. */
export function progressLabel(progress: Progress): string {
  if (progress.currency === undefined) {
    return `${progress.reached} з ${progress.target}`;
  }
  return `${formatMoney(money(progress.reached, progress.currency))} з ${formatMoney(
    money(progress.target, progress.currency),
  )}`;
}

/** The same for a виклик, whose progress may instead be a count of what is still left to do. */
export function challengeProgressLabel(progress: ChallengeProgress): string {
  if (progress.kind === 'remaining') {
    const left = progress.remaining;
    return `залишилось ${left} ${plural(left, 'запис', 'записи', 'записів')}`;
  }
  return progressLabel({
    reached: progress.reached,
    target: progress.target,
    ...(progress.currency === undefined ? {} : { currency: progress.currency }),
  });
}

/** How a свідчення reads: what was true then, labelled as such and never as a current number. */
export function evidenceLabel(evidence: Evidence): string {
  switch (evidence.kind) {
    case 'count':
      return `${evidence.count} ${plural(evidence.count, 'транзакція', 'транзакції', 'транзакцій')}`;
    case 'months':
      return `${evidence.months} ${plural(evidence.months, 'місяць', 'місяці', 'місяців')}: ${evidence.from} — ${evidence.to}`;
    case 'money':
      return formatMoney(evidence.money);
    case 'month':
      return evidence.month;
    case 'goal':
      return `ціль «${evidence.name}»`;
  }
}

/**
 * The назва of an earned досягнення.
 *
 * The catalogue is asked first, so a template whose wording was improved reads the new way. A key
 * the current catalogue does not name — a retired template, or a ціль the owner has since deleted
 * — falls back to what the свідчення froze, which is exactly why a ціль's свідчення carries the
 * назва it had. A row is never dropped for being unnameable: earned rows are not deleted by a code
 * change, and they are not hidden by one either.
 */
export function earnedName(
  earned: EarnedAchievement,
  candidates: readonly Candidate[],
): string {
  const named = candidates.find((one) => one.key === earned.key);
  if (named) {
    return named.name;
  }
  return earned.evidence.kind === 'goal'
    ? `Ціль «${earned.evidence.name}»`
    : evidenceLabel(earned.evidence);
}

/**
 * «досягнуто 3 грудня» or «помічено 2 вересня».
 *
 * The two words are not decoration. A досягнення the history dated says «досягнуто»: it happened
 * on that day and the транзакції prove it. One dated by the day the app recorded it says
 * «помічено», because a розрахунковий баланс is a number about now and the app is only reporting
 * when it noticed.
 */
export function whenLabel(
  earned: EarnedAchievement,
  candidates: readonly Candidate[],
  now: Date,
): string {
  const dating = candidates.find((one) => one.key === earned.key)?.dating ?? 'history';
  const verb = dating === 'history' ? 'досягнуто' : 'помічено';
  return `${verb} ${calendarLabel(shownDate(earned.achievedOn, now), now)}`;
}

/**
 * The дата a досягнення is **stated** with: its own, or today where its own is later.
 *
 * The engine already refuses to write a future дата, and that is where the rule belongs — but a
 * стored row can carry one anyway, by two roads the engine never travels. A бекап restores
 * `achieved_on` verbatim, so a file made on a phone whose clock ran ahead brings one in; and a row
 * written by an older build stays exactly as it was, because earning is add-only and a key already
 * stored is never re-dated (persistence: «storing a досягнення under a key already stored SHALL
 * leave the stored row exactly as it was»).
 *
 * So the rule is kept twice: once when writing, and once here, where the app opens its mouth. The
 * stored row is the record and is not rewritten to make a screen right; what the screen must never
 * do is state a fact as reached on a day that has not happened.
 */
export function shownDate(achievedOn: IsoDate, now: Date): IsoDate {
  const today = todayIso(now);
  return achievedOn > today ? today : achievedOn;
}

/** Where a досягнення's detail lives. The key carries `:` and `.`, so it is encoded for the route. */
export function achievementRoute(key: string): string {
  return `/achievement/${encodeURIComponent(key)}`;
}

/** Where a виклик's detail lives. */
export function challengeRoute(key: string): string {
  return `/challenge/${encodeURIComponent(key)}`;
}

/**
 * «Прогрес»: the three sections, in order.
 *
 * A section with nothing in it says so in one plain sentence rather than being shown empty. A
 * досягнення with **no measurable progress** is not listed «У процесі» at all — «Ціль досягнута
 * вчасно» with no ціль to reach is not at 0 %, it simply has no number, and showing one would be a
 * nag rather than information.
 */
export function progressViewModel(input: ProgressInput): ProgressViewModel {
  if (!input.hasHistory) {
    return {
      challengesTitle: CHALLENGES_TITLE,
      challenges: [],
      challengesEmpty: null,
      inProgressTitle: IN_PROGRESS_TITLE,
      inProgress: [],
      inProgressEmpty: null,
      earnedTitle: EARNED_TITLE,
      earned: [],
      earnedEmpty: null,
      nothingYet: NOTHING_YET,
    };
  }

  const acceptedKeys = new Set(input.accepted.map((one) => one.key));
  const dismissedKeys = new Set(input.dismissed.map((one) => one.key));
  // Accepted first, then what is offered now, and last — quietly, at the end — what the owner
  // dismissed. A dismissed виклик is **not** proposed again; it is listed so that «Повернути» is
  // reachable, because the screen that carries it opens only from this list.
  const challenges: ChallengeRow[] = [
    ...input.accepted,
    ...input.offered.filter((one) => !acceptedKeys.has(one.key)),
    ...input.dismissed.filter((one) => !acceptedKeys.has(one.key)),
  ].map((one) => ({
    key: one.key,
    name: one.name,
    reason: one.reason,
    progress: challengeProgressLabel(one.progress),
    criterion: one.criterion,
    accepted: acceptedKeys.has(one.key),
    dismissed: dismissedKeys.has(one.key),
    route: challengeRoute(one.key),
  }));

  const earnedKeys = new Set(input.earned.map((one) => one.key));
  const inProgress: InProgressRow[] = input.candidates
    .filter((one) => !one.earned && !earnedKeys.has(one.key) && one.progress !== undefined)
    .map((one) => ({
      key: one.key,
      name: one.name,
      progress: progressLabel(one.progress!),
      route: achievementRoute(one.key),
    }));

  const earned: EarnedRow[] = newestFirst(input.earned).map((one) => ({
    key: one.key,
    name: earnedName(one, input.candidates),
    when: whenLabel(one, input.candidates, input.now),
    route: achievementRoute(one.key),
  }));

  return {
    challengesTitle: CHALLENGES_TITLE,
    challenges,
    challengesEmpty: challenges.length === 0 ? NOTHING_TO_DO : null,
    inProgressTitle: IN_PROGRESS_TITLE,
    inProgress,
    inProgressEmpty: inProgress.length === 0 ? NOTHING_IN_PROGRESS : null,
    earnedTitle: EARNED_TITLE,
    earned,
    earnedEmpty: earned.length === 0 ? NOTHING_EARNED : null,
    nothingYet: null,
  };
}

/** Where «Прогрес» itself lives. */
export const PROGRESS_ROUTE = '/progress';

/**
 * The quiet badge beside the existing Звіти → Прогрес entry — one name for one unseen
 * досягнення, one count line for several, `null` for none (progress-screen: "New досягнення are
 * announced once, quietly, and in one group"). Reading Звіти never marks anything seen — only
 * opening «Прогрес» itself does, which is `progressViewModel`'s own concern, not this one's.
 *
 * Головний held a second line here once — the accepted виклик closest to finishing — but that
 * was specific to a home widget which main-screen's redesign removed outright; no replacement
 * for it exists on Звіти, so it is not carried over.
 */
export function unseenAchievementsBadge(
  earned: readonly EarnedAchievement[],
  candidates: readonly Candidate[],
): string | null {
  const unseen = earned.filter((one) => one.seenAtMs === undefined);
  if (unseen.length === 0) {
    return null;
  }
  // Exactly one: name it, because there is a name worth reading. Two or more: one line, never
  // one line each — after the first evaluation on an existing phone that would be twelve
  // announcements of the same quiet moment.
  return unseen.length === 1
    ? earnedName(newestFirst(unseen)[0]!, candidates)
    : `Ви вже маєте ${achievementsCount(unseen.length)}`;
}

/** A досягнення's detail: the exact condition, the свідчення, and the current number beside it. */
export interface AchievementDetail {
  readonly name: string;
  readonly condition: string;
  /** «досягнуто 3 грудня» / «помічено 2 вересня», or `null` while it is not earned. */
  readonly when: string | null;
  /** What was true then, labelled as such. `null` while it is not earned. */
  readonly evidence: string | null;
  /** The live number, recomputed — shown **beside** the свідчення and never in its place. */
  readonly current: string | null;
  readonly earned: boolean;
}

/**
 * What opening a досягнення shows.
 *
 * The свідчення and the current number sit side by side on purpose (design D2): «1000 транзакцій»
 * is what was true when it was earned, and the count beside it is what is stored now. A drift
 * between them is the honest state of a history that has since been edited, and hiding it by
 * showing only one of the two would be the app quietly telling the owner something untrue.
 */
export function achievementDetail(input: {
  readonly key: string;
  readonly candidates: readonly Candidate[];
  readonly earned: readonly EarnedAchievement[];
  readonly now: Date;
}): AchievementDetail | null {
  const candidate = input.candidates.find((one) => one.key === input.key);
  const stored = input.earned.find((one) => one.key === input.key);
  if (!candidate && !stored) {
    return null;
  }
  return {
    name: stored ? earnedName(stored, input.candidates) : candidate!.name,
    condition: candidate?.condition ?? '',
    when: stored ? whenLabel(stored, input.candidates, input.now) : null,
    evidence: stored ? evidenceLabel(stored.evidence) : null,
    current: candidate?.progress === undefined ? null : progressLabel(candidate.progress),
    earned: stored !== undefined,
  };
}

/** A виклик's detail: why it was proposed, how far it has come, when it is done, and one action. */
export interface ChallengeDetail {
  readonly name: string;
  readonly reason: string;
  readonly progress: string;
  readonly criterion: string;
  readonly accepted: boolean;
  readonly dismissed: boolean;
  readonly finished: boolean;
  /** The first step, where one must be settled before the виклик can begin. */
  readonly firstStep: { readonly kind: 'confirm-norm'; readonly currency: string } | null;
}

export function challengeDetail(input: {
  readonly key: string;
  readonly challenges: readonly Challenge[];
  readonly accepted: readonly Challenge[];
  readonly dismissed: readonly Challenge[];
  readonly now: Date;
}): ChallengeDetail | null {
  const challenge = input.challenges.find((one) => one.key === input.key);
  if (!challenge) {
    return null;
  }
  return {
    name: challenge.name,
    reason: challenge.reason,
    progress: challengeProgressLabel(challenge.progress),
    criterion: challenge.criterion,
    accepted: input.accepted.some((one) => one.key === input.key),
    dismissed: input.dismissed.some((one) => one.key === input.key),
    finished: challenge.finished,
    firstStep: challenge.firstStep ?? null,
  };
}

/**
 * Where a виклик's one action leads, as a route.
 *
 * The action is the виклик's own — «recording a переказ onto a рахунок of вид `savings`» is not
 * «open the entry form», and a form that opens on a витрата is not the work the criterion
 * measures. So a `record-transfer` action opens the form **as a переказ, with the destination
 * already chosen**: the first unarchived рахунок of that вид, in the order storage lists them.
 *
 * When no unarchived рахунок of that вид exists there is nothing to pre-choose, and the form opens
 * as a переказ with the destination empty — the owner has one to create, and the form is where
 * that is said, not here.
 */
export function challengeStart(
  action: ChallengeAction,
  accounts: readonly { readonly id: string; readonly kind: string; readonly archived: boolean }[],
): string | null {
  switch (action.kind) {
    case 'answer-month':
      return `/transactions?month=${action.month}`;
    case 'record-transfer': {
      const onto = accounts.find((one) => one.kind === action.accountKind && !one.archived);
      return onto === undefined
        ? '/transaction/new?type=transfer'
        : `/transaction/new?type=transfer&to=${encodeURIComponent(onto.id)}`;
    }
    case 'open-goal':
      return `/goal/${action.goalId}`;
    case 'open-category-month':
      return `/category/${action.month}/${action.categoryId}`;
    case 'confirm-norm':
      // The question is asked on the виклик's own screen; there is nowhere to go.
      return null;
  }
}

/**
 * The норма confirmation step of «Фінансова подушка»: the proposal, the місяці it came from, and
 * what the owner may type instead.
 *
 * A currency with too little history gets no proposal and an empty field — the app asks rather
 * than misleads. A non-positive сума is refused in the owner's own words, as every other refusal
 * in this app is; nothing is stored until they confirm.
 */
export interface NormStep {
  readonly currency: string;
  /** «3 050 000,00 UAH», or `null` when fewer than six завершені активні місяці exist. */
  readonly proposal: string | null;
  /** The місяці the proposal was read from, oldest first. Empty when there is no proposal. */
  readonly months: readonly string[];
  readonly question: string;
  readonly hint: string;
}

export const NORM_QUESTION = 'Скільки коштує місяць?';
export const NORM_REFUSAL = 'Норма має бути більшою за нуль.';

export function normStep(input: {
  readonly currency: string;
  readonly proposal: { readonly amount: Money; readonly months: readonly string[] } | null;
}): NormStep {
  return {
    currency: input.currency,
    proposal: input.proposal === null ? null : formatMoney(input.proposal.amount),
    months: input.proposal?.months ?? [],
    question: NORM_QUESTION,
    hint:
      input.proposal === null
        ? `Замало історії у ${input.currency}, щоб запропонувати число, — впишіть своє.`
        : `Медіана «витрачено» за останні ${input.proposal.months.length} завершених місяців у ${input.currency}.`,
  };
}

/** Whether a typed норма may be confirmed; the refusal is the owner's own words. */
export function normRefusal(amount: Money): string | null {
  return amount.amount > 0 ? null : NORM_REFUSAL;
}
