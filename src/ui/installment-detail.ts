import {
  installmentPartStates,
  type Installment,
  type InstallmentFacts,
  type InstallmentPart,
} from '../domain/installments';
import { money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import { formatMoney } from './amount-input';
import { calendarLabel, todayIso } from './dates';

/**
 * One розстрочка's screen, with none of its JSX (installments-screen, "One розстрочка shows its
 * графік with a verb per платіж"): what it is, how far it is paid, and every платіж with its state
 * and the verbs that state allows.
 */

/** What a платіж row offers. */
export type PartVerb = 'unlink' | 'pick' | 'mark' | 'unmark';

export const PART_VERB_LABELS: Readonly<Record<PartVerb, string>> = {
  unlink: "Відв'язати",
  pick: 'Обрати списання',
  mark: 'Позначити сплаченим',
  unmark: 'Зняти позначку',
};

export interface PartRow {
  readonly number: number;
  /** «Платіж 5». */
  readonly title: string;
  /** «5 жовтня · 1 000,00 UAH». */
  readonly scheduled: string;
  /** «сплачено раніше», «очікується», «списання не знайдено», … */
  readonly state: string;
  /** For a linked платіж, its списання: «списання 5 жовтня · 1 000,00 UAH». */
  readonly debit?: string;
  readonly verbs: readonly PartVerb[];
  /** Whether the row is a warning — списання не знайдено. */
  readonly missed: boolean;
}

/** A linked транзакція as the row names it. */
export interface LinkedDebit {
  readonly date: IsoDate;
  /** UAH minor units. */
  readonly amount: number;
}

export interface InstallmentDetail {
  readonly name: string;
  /** «Повна сума 10 000,00 UAH». */
  readonly total: string;
  /** «1 000,00 UAH на місяць», with «останній 550,00 UAH» when the last differs. */
  readonly part: string;
  readonly account: string;
  readonly category?: string;
  /** «4 з 10». */
  readonly progress: string;
  /** «Залишок 6 000,00 UAH». */
  readonly remaining: string;
  readonly closed: boolean;
  readonly parts: readonly PartRow[];
}

const uah = (amount: number) => formatMoney(money(amount, 'UAH'));

function stateOf(part: InstallmentPart): string {
  switch (part.state) {
    case 'paid':
      return part.reason === 'paidBefore'
        ? 'сплачено раніше'
        : part.reason === 'marked'
          ? 'позначено сплаченим'
          : 'сплачено';
    case 'closed':
      return 'закрито';
    case 'expected':
      return 'очікується';
    case 'notFound':
      return 'списання не знайдено';
  }
}

function verbsOf(part: InstallmentPart): PartVerb[] {
  if (part.state === 'paid') {
    return part.reason === 'debit' ? ['unlink'] : part.reason === 'marked' ? ['unmark'] : [];
  }
  return part.state === 'closed' ? [] : ['pick', 'mark'];
}

export function installmentDetail(input: {
  readonly installment: Installment;
  readonly facts: InstallmentFacts;
  /** The linked транзакції, by id. */
  readonly debits: ReadonlyMap<string, LinkedDebit>;
  readonly accountName: string;
  readonly categoryName?: string;
  readonly now: Date;
}): InstallmentDetail {
  const { installment, now } = input;
  const status = installmentPartStates(installment, input.facts, todayIso(now));
  const last = status.parts[status.parts.length - 1]!;
  return {
    name: installment.name,
    total: `Повна сума ${uah(installment.total)}`,
    part:
      last.amount === installment.part
        ? `${uah(installment.part)} на місяць`
        : `${uah(installment.part)} на місяць, останній ${uah(last.amount)}`,
    account: input.accountName,
    ...(input.categoryName === undefined ? {} : { category: input.categoryName }),
    progress: `${status.paidCount} з ${installment.partsCount}`,
    remaining: `Залишок ${uah(status.remaining)}`,
    closed: status.closed,
    parts: status.parts.map((part) => {
      const debit = part.transactionId === undefined ? undefined : input.debits.get(part.transactionId);
      return {
        number: part.number,
        title: `Платіж ${part.number}`,
        scheduled: `${calendarLabel(part.due, now)} · ${uah(part.amount)}`,
        state: stateOf(part),
        ...(debit ? { debit: `списання ${calendarLabel(debit.date, now)} · ${uah(debit.amount)}` } : {}),
        verbs: verbsOf(part),
        missed: part.state === 'notFound',
      };
    }),
  };
}

/** «Закрити достроково», or «Відновити» once closed. */
export function closingVerb(closed: boolean): string {
  return closed ? 'Відновити' : 'Закрити достроково';
}

/** What «Видалити» asks before anything is deleted — and that the транзакції stay. */
export function deleteInstallmentConfirmation(name: string): { readonly title: string; readonly message: string } {
  return {
    title: `Видалити розстрочку «${name}»?`,
    message: 'Зникне лише план і графік. Її транзакції — списання платежів — залишаться як є.',
  };
}

/** A candidate «Обрати списання» lists. */
export interface DebitChoiceRow {
  readonly id: string;
  /** «6 жовтня · 1 000,50 UAH · СІЛЬПО». */
  readonly label: string;
}

export function debitChoiceRows(
  choices: readonly { readonly id: string; readonly date: IsoDate; readonly amount: number; readonly description?: string }[],
  now: Date,
): DebitChoiceRow[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: [calendarLabel(choice.date, now), uah(choice.amount), choice.description]
      .filter((part) => part !== undefined && part !== '')
      .join(' · '),
  }));
}

/** What «Обрати списання» says with nothing to offer. */
export const NO_DEBIT_CHOICES =
  'На рахунку списання немає витрат у гривнях за десять днів довкола дати платежу.';
