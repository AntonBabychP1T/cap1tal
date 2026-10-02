import {
  commitmentDues,
  firstDueAfter,
  nearestDue,
  type Commitment,
  type CommitmentFacts,
  type Periodicity,
} from '../domain/commitments';
import type { Money } from '../domain/money';
import { formatMoney } from './amount-input';
import { shortCalendarLabel, todayIso } from './dates';
import { formatHryvnia } from './receipt-screen';

/**
 * The «Зобов'язання» screen, with none of its JSX (commitments-screen, "Зобов'язання opens on the
 * active ones, nearest платіж first"). The list, its order and what each row says are decided here,
 * where `verify` reaches them.
 */

/** What the screen says when there is no зобов'язання at all — one sentence, then «Нове зобов'язання». */
export const COMMITMENTS_EMPTY =
  'Запишіть платіж, який повторюється, — оренду, інтернет, підписку — і застосунок знатиме, ' +
  'що ще має списатися цього місяця і скільки після цього лишиться вільним.';

/** The one action above the list. */
export const NEW_COMMITMENT = "Нове зобов'язання";

/** The heading the stopped ones sit under. */
export const STOPPED_COMMITMENTS = 'Припинені';

/** «Списання не знайдено» — said on a row whose платіж passed three days ago with nothing linked. */
export const MISSED_COMMITMENT_DEBIT = 'Списання не знайдено';

/** How often, as a row reads it. */
export const PERIODICITY_LABELS: Readonly<Record<Periodicity, string>> = {
  monthly: 'щомісяця',
  quarterly: 'щокварталу',
  halfYearly: 'щопівроку',
  yearly: 'щороку',
};

/**
 * A plan's сума as the plan screens and «Платежі місяця» show it: гривні with «₴» like the
 * розстрочки always did, any other currency with its code — «20,00 USD» — and nothing converted.
 */
export function formatPlanMoney(m: Money): string {
  return m.currency === 'UAH' ? formatHryvnia(m) : formatMoney(m);
}

/** One зобов'язання as its row reads. */
export interface CommitmentRow {
  readonly id: string;
  readonly name: string;
  /** «15 000,00 ₴», «20,00 USD». */
  readonly amount: string;
  /** «щомісяця». */
  readonly periodicity: string;
  /** «10 жовт.» — the дата of the найближчий платіж; absent on a stopped one with none owed. */
  readonly next?: string;
  /** Said on the row when a платіж of it is списання не знайдено. */
  readonly missed?: string;
  /** «припинено 2 жовт.», on a stopped one. */
  readonly stopped?: string;
}

export interface CommitmentList {
  readonly active: readonly CommitmentRow[];
  /** The stopped ones, under «Припинені». */
  readonly stopped: readonly CommitmentRow[];
  /** The one sentence, when there is no зобов'язання at all. */
  readonly empty?: string;
}

/**
 * The bound the list reads a графік to: the second платіж after today. Only a платіж up to the first
 * after today can carry a mark (the detail offers no other), so one more is always open — the
 * найближчий платіж of an active зобов'язання always exists.
 */
function listBound(commitment: Commitment, today: string): string {
  return firstDueAfter(commitment, firstDueAfter(commitment, today));
}

/**
 * The active зобов'язання, nearest open платіж first (then the one recorded first), and the stopped
 * ones under «Припинені», most recently stopped first.
 */
export function commitmentList(
  commitments: readonly Commitment[],
  facts: CommitmentFacts,
  now: Date,
): CommitmentList {
  if (commitments.length === 0) {
    return { active: [], stopped: [], empty: COMMITMENTS_EMPTY };
  }
  const today = todayIso(now);
  const read = commitments.map((commitment) => {
    const dues = commitmentDues(commitment, facts, { until: listBound(commitment, today), today });
    return { commitment, dues, nearest: nearestDue(dues) };
  });
  const rowOf = ({ commitment, dues, nearest }: (typeof read)[number]): CommitmentRow => ({
    id: commitment.id,
    name: commitment.name,
    amount: formatPlanMoney({ amount: commitment.amount, currency: commitment.currency }),
    periodicity: PERIODICITY_LABELS[commitment.periodicity],
    ...(nearest ? { next: shortCalendarLabel(nearest.due, now) } : {}),
    ...(dues.some((due) => due.state === 'notFound') ? { missed: MISSED_COMMITMENT_DEBIT } : {}),
    ...(commitment.stoppedOn !== undefined
      ? { stopped: `припинено ${shortCalendarLabel(commitment.stoppedOn, now)}` }
      : {}),
  });
  const active = read
    .filter((r) => r.commitment.stoppedOn === undefined)
    .sort(
      (a, b) =>
        (a.nearest?.due ?? '9999-12-31').localeCompare(b.nearest?.due ?? '9999-12-31') ||
        a.commitment.recordedAt - b.commitment.recordedAt,
    );
  const stopped = read
    .filter((r) => r.commitment.stoppedOn !== undefined)
    .sort(
      (a, b) =>
        (b.commitment.stoppedOn ?? '').localeCompare(a.commitment.stoppedOn ?? '') ||
        b.commitment.recordedAt - a.commitment.recordedAt,
    );
  return { active: active.map(rowOf), stopped: stopped.map(rowOf) };
}
