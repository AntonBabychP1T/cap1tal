import {
  commitmentDues,
  firstDueAfter,
  type Commitment,
  type CommitmentDue,
  type CommitmentFacts,
} from '../domain/commitments';
import { money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import { PERIODICITY_LABELS, formatPlanMoney } from './commitments-screen';
import { shortCalendarLabel, todayIso } from './dates';

/**
 * One зобов'язання's screen, with none of its JSX (commitments-screen, "One зобов'язання shows its
 * платежі with a verb per платіж"; "A зобов'язання offers its new сума when the bank charged
 * another"): what it is, and its платежі newest first — every one up to today and the first after
 * it — each with its state and the verbs that state allows.
 */

/** What a платіж row offers. */
export type DueVerb = 'unlink' | 'pick' | 'mark' | 'skip' | 'unmark';

export const DUE_VERB_LABELS: Readonly<Record<DueVerb, string>> = {
  unlink: "Відв'язати",
  pick: 'Обрати списання',
  mark: 'Позначити сплаченим',
  skip: 'Пропустити',
  unmark: 'Зняти позначку',
};

export interface DueRow {
  readonly number: number;
  /** «5 жовт.». */
  readonly date: string;
  /** The scheduled сума: «300,00 ₴». */
  readonly amount: string;
  /** «сплачено», «позначено сплаченим», «пропущено», «очікується», «списання не знайдено». */
  readonly state: string;
  /** For a linked платіж, its списання: «списання 5 жовт. · 300,00 ₴». */
  readonly debit?: string;
  readonly verbs: readonly DueVerb[];
  /** Whether the row is a warning — списання не знайдено. */
  readonly missed: boolean;
}

/** A linked транзакція as the row names it. */
export interface LinkedDebit {
  readonly date: IsoDate;
  /** Minor units of the зобов'язання's currency — a списання is in it by construction. */
  readonly amount: number;
}

/** «Оновити суму»: what the bank charged last, against the сума. */
export interface NewAmountOffer {
  /** «Останнє списання — 349,00 ₴, а сума зобовʼязання — 299,00 ₴.» */
  readonly message: string;
  /** The сума choosing it sets, minor units. */
  readonly amount: number;
}

export interface CommitmentDetail {
  readonly name: string;
  /** «299,00 ₴ щомісяця». */
  readonly amount: string;
  readonly account: string;
  readonly category?: string;
  /** «Текст в описі: netflix». */
  readonly marker?: string;
  readonly stopped: boolean;
  /** «Припинено 2 жовт.», once stopped. */
  readonly stoppedOn?: string;
  /** Newest first. */
  readonly dues: readonly DueRow[];
  readonly newAmount?: NewAmountOffer;
}

/** The verb that changes it: «Оновити суму». */
export const UPDATE_AMOUNT = 'Оновити суму';

function stateOf(due: CommitmentDue): string {
  switch (due.state) {
    case 'paid':
      return due.reason === 'marked' ? 'позначено сплаченим' : 'сплачено';
    case 'skipped':
      return 'пропущено';
    case 'expected':
      return 'очікується';
    case 'notFound':
      return 'списання не знайдено';
  }
}

function verbsOf(due: CommitmentDue): DueVerb[] {
  switch (due.state) {
    case 'paid':
      return due.reason === 'debit' ? ['unlink'] : ['unmark'];
    case 'skipped':
      return ['unmark'];
    case 'expected':
    case 'notFound':
      return ['pick', 'mark', 'skip'];
  }
}

/**
 * The платежі the screen lists: every one dated up to today and the first after it, where one
 * exists — after the дата припинення none does.
 */
export function shownDues(commitment: Commitment, facts: CommitmentFacts, today: IsoDate): CommitmentDue[] {
  return commitmentDues(commitment, facts, { until: firstDueAfter(commitment, today), today });
}

/**
 * «Оновити суму» (commitments-screen, "A зобов'язання offers its new сума when the bank charged
 * another"): only the latest платіж linked to a списання — latest by дата — is read, and only when
 * its списання's сума differs from the зобов'язання's.
 */
export function newAmountOffer(
  commitment: Commitment,
  dues: readonly CommitmentDue[],
  debits: ReadonlyMap<string, LinkedDebit>,
): NewAmountOffer | undefined {
  let latest: CommitmentDue | undefined;
  for (const due of dues) {
    if (due.reason === 'debit' && (latest === undefined || due.due > latest.due)) {
      latest = due;
    }
  }
  const debit = latest?.transactionId === undefined ? undefined : debits.get(latest.transactionId);
  if (debit === undefined || debit.amount === commitment.amount) {
    return undefined;
  }
  const as = (amount: number) => formatPlanMoney(money(amount, commitment.currency));
  return {
    message: `Останнє списання — ${as(debit.amount)}, а сума зобовʼязання — ${as(commitment.amount)}.`,
    amount: debit.amount,
  };
}

export function commitmentDetail(input: {
  readonly commitment: Commitment;
  readonly facts: CommitmentFacts;
  /** The linked транзакції, by id. */
  readonly debits: ReadonlyMap<string, LinkedDebit>;
  readonly accountName: string;
  readonly categoryName?: string;
  readonly now: Date;
}): CommitmentDetail {
  const { commitment, now } = input;
  const dues = shownDues(commitment, input.facts, todayIso(now));
  const as = (amount: number) => formatPlanMoney(money(amount, commitment.currency));
  const offer = newAmountOffer(commitment, dues, input.debits);
  return {
    name: commitment.name,
    amount: `${as(commitment.amount)} ${PERIODICITY_LABELS[commitment.periodicity]}`,
    account: input.accountName,
    ...(input.categoryName === undefined ? {} : { category: input.categoryName }),
    ...(commitment.marker === undefined ? {} : { marker: `Текст в описі: ${commitment.marker}` }),
    stopped: commitment.stoppedOn !== undefined,
    ...(commitment.stoppedOn === undefined
      ? {}
      : { stoppedOn: `Припинено ${shortCalendarLabel(commitment.stoppedOn, now)}` }),
    dues: [...dues].reverse().map((due) => {
      const debit = due.transactionId === undefined ? undefined : input.debits.get(due.transactionId);
      return {
        number: due.number,
        date: shortCalendarLabel(due.due, now),
        amount: as(due.amount),
        state: stateOf(due),
        ...(debit ? { debit: `списання ${shortCalendarLabel(debit.date, now)} · ${as(debit.amount)}` } : {}),
        verbs: verbsOf(due),
        missed: due.state === 'notFound',
      };
    }),
    ...(offer ? { newAmount: offer } : {}),
  };
}

/** «Припинити», or «Відновити» once stopped. */
export function stoppingVerb(stopped: boolean): string {
  return stopped ? 'Відновити' : 'Припинити';
}

/** What «Видалити» asks before anything is deleted — and that the транзакції stay. */
export function deleteCommitmentConfirmation(name: string): { readonly title: string; readonly message: string } {
  return {
    title: `Видалити зобовʼязання «${name}»?`,
    message: 'Зникне лише план і його платежі. Транзакції — списання — залишаться як є.',
  };
}

/** A candidate «Обрати списання» lists. */
export interface CommitmentChoiceRow {
  readonly id: string;
  /** «12 жовт. · 320,00 ₴ · Укртелеком». */
  readonly label: string;
}

export function commitmentChoiceRows(
  choices: readonly { readonly id: string; readonly date: IsoDate; readonly amount: number; readonly description?: string }[],
  currency: string,
  now: Date,
): CommitmentChoiceRow[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: [shortCalendarLabel(choice.date, now), formatPlanMoney(money(choice.amount, currency)), choice.description]
      .filter((part) => part !== undefined && part !== '')
      .join(' · '),
  }));
}

/** What «Обрати списання» says with nothing to offer. */
export const NO_COMMITMENT_DEBIT_CHOICES =
  'На рахунку списання немає вільних витрат за десять днів довкола дати платежу.';
