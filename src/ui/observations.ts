import { capitalised } from '../domain/fold';
import type { Money } from '../domain/money';
import { monthOf, type IsoDate, type Month } from '../domain/transaction';
import type { Observation, TxRef } from '../observations/observation';
import { HOME_LIMIT, HOME_SUMMARY_DAYS, LIST_LIMIT } from '../observations/thresholds';
import { plural } from '../progress/plural';
import { formatMoney } from './amount-input';
import { calendarLabel } from './dates';
import { categoryLabel } from './labels';
import { monthAccusativeLabel, monthGenitiveLabel, monthInLabel, prevMonth } from './months';

/**
 * How an спостереження states itself (observations, "An спостереження states itself in one sentence
 * and leads to its records"; design D4): one Ukrainian sentence carrying its own сум, written the
 * way the app writes every сума, and where choosing it leads.
 *
 * The words are this module's alone — the domain holds numbers — so polishing a sentence at the
 * emulator is never a change to `src/observations/`. No sentence advises, praises, blames or
 * projects: a test renders every kind and searches them for the words that would.
 */

/** One half of a можливий дубль: a line of its own, leading to that транзакція's editing. */
export interface DuplicateHalf {
  readonly id: string;
  /** «3 жовтня · Aroma Kava», «4 жовтня · без опису». */
  readonly label: string;
  readonly route: string;
  readonly accessibilityLabel: string;
}

export interface ObservationLine {
  readonly key: string;
  readonly kind: Observation['kind'];
  readonly sentence: string;
  /** Where choosing the sentence leads; absent for a можливий дубль, whose halves lead. */
  readonly route?: string;
  /** A можливий дубль only: its two транзакції, each tappable. */
  readonly halves?: readonly [DuplicateHalf, DuplicateHalf];
  /** A можливий дубль only: the pair «Не дубль» answers. */
  readonly answer?: { readonly first: string; readonly second: string };
  /** A можливий дубль only: «Видалити одну», asking which of the two to delete. */
  readonly deleteOne?: DeleteOneView;
}

/** One of the two транзакції «Видалити одну» offers, named by its дата, сума and опис. */
export interface DeleteOneChoice {
  readonly id: string;
  /** «4 жовтня · 125,00 UAH · без опису». */
  readonly label: string;
  readonly accessibilityLabel: string;
}

/**
 * «Видалити одну» on a можливий дубль (observations, "A можливий дубль is answered with «Не
 * дубль», and nothing else is dismissed"; design D10): the owner's own delete, asked which of the
 * two first. The app deletes nothing on its own.
 */
export interface DeleteOneView {
  readonly label: string;
  readonly title: string;
  readonly sentence: string;
  readonly choices: readonly [DeleteOneChoice, DeleteOneChoice];
}

/** The confirmation that follows the choice — the one the editing screen asks before a delete. */
export interface DeleteOneConfirmation {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly cancel: string;
  readonly confirm: string;
}

export interface ObservationNames {
  /** The категорії by id, as the screen loaded them — a renamed one reads its current назва. */
  readonly categoryNames: ReadonlyMap<string, string>;
  /** The рахунки by id; a gone one shows its id, as every other surface does. */
  readonly accountNames: ReadonlyMap<string, string>;
  /** For «12 жовтня» against «12 жовтня 2025». */
  readonly now: Date;
}

/** The words that would turn a fact into advice, praise, blame or a forecast — never said. */
export const BANNED_WORDS: readonly string[] = ['варто', 'слід', 'молодець', 'якщо так піде'];

const ORDINALS: readonly string[] = [
  'перший',
  'другий',
  'третій',
  'четвертий',
  'пʼятий',
  'шостий',
  'сьомий',
  'восьмий',
  'девʼятий',
  'десятий',
  'одинадцятий',
  'дванадцятий',
];

/** «третій» for 3; past a year of rises, «13-й». */
export function ordinalMonth(n: number): string {
  return ORDINALS[n - 1] ?? `${n}-й`;
}

/**
 * «у 4,2 раза», «у 3 рази», «у 5 разів»: a fractional ratio takes the genitive singular, a whole one
 * the integer plural, and a whole one drops its «,0».
 */
export function ratioPhrase(tenths: number): string {
  if (tenths % 10 !== 0) {
    return `у ${Math.trunc(tenths / 10)},${Math.abs(tenths % 10)} раза`;
  }
  const whole = tenths / 10;
  return `у ${whole} ${plural(whole, 'раз', 'рази', 'разів')}`;
}

/** «38 %» with a typographic space, as the app writes a share. */
function percent(n: number): string {
  return `${Math.abs(n)} %`;
}

/** «+17 %», «−25 %». */
function signedPercent(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} %`;
}

/** A транзакція named the way its transaction line names it: its опис, or its категорія. */
function nameOf(t: TxRef, names: ObservationNames): string {
  const description = t.description?.trim();
  if (description) return description;
  return t.categoryId ? categoryLabel(t.categoryId, names.categoryNames) : 'Без опису';
}

/** «2 100,00 UAH → 2 600,00 UAH → 3 900,00 UAH»: each сума written as the app writes every one. */
function series(amounts: readonly Money[]): string {
  return amounts.map((m) => formatMoney(m)).join(' → ');
}

export const transactionRoute = (id: string): string => `/transaction/${id}`;
export const categoryRoute = (month: Month, categoryId: string): string =>
  `/category/${month}/${categoryId}`;

function half(t: TxRef, names: ObservationNames): DuplicateHalf {
  const day = calendarLabel(t.date, names.now);
  const text = t.description?.trim() || 'без опису';
  return {
    id: t.id,
    label: `${day} · ${text}`,
    route: transactionRoute(t.id),
    accessibilityLabel: `Відкрити транзакцію ${formatMoney(t.amount)}, ${day}, ${text}`,
  };
}

function deleteChoice(t: TxRef, names: ObservationNames): DeleteOneChoice {
  const day = calendarLabel(t.date, names.now);
  const text = t.description?.trim() || 'без опису';
  const label = `${day} · ${formatMoney(t.amount)} · ${text}`;
  return { id: t.id, label, accessibilityLabel: `Видалити ${label}` };
}

/** What the editing screen says before it deletes a транзакція (`src/app/transaction/[id].tsx`). */
const DELETE_TITLE = 'Видалити транзакцію?';
const DELETE_MESSAGE = 'Її не буде ні у стрічці, ні в історії рахунку.';

/** The confirmation of «Видалити одну»'s choice: the editing screen's own, naming the транзакція. */
export function deleteOneConfirmation(choice: DeleteOneChoice): DeleteOneConfirmation {
  return {
    id: choice.id,
    title: DELETE_TITLE,
    message: `${choice.label}. ${DELETE_MESSAGE}`,
    cancel: 'Скасувати',
    confirm: 'Видалити',
  };
}

export function observationLine(o: Observation, names: ObservationNames): ObservationLine {
  const common = { key: o.key, kind: o.kind };
  switch (o.kind) {
    case 'category-vs-typical': {
      const name = categoryLabel(o.categoryId, names.categoryNames);
      // A zero is an absence, not «100 % менше» (design D11).
      if (o.amount.amount === 0) {
        return {
          ...common,
          sentence: `${name}: цього місяця не було, зазвичай ${formatMoney(o.typical)}`,
          route: categoryRoute(o.month, o.categoryId),
        };
      }
      const direction = o.changePercent >= 0 ? 'більше' : 'менше';
      return {
        ...common,
        sentence: `${name}: ${formatMoney(o.amount)} — на ${percent(o.changePercent)} ${direction} за типові ${formatMoney(o.typical)}`,
        route: categoryRoute(o.month, o.categoryId),
      };
    }
    case 'category-early': {
      const name = categoryLabel(o.categoryId, names.categoryNames);
      const days = `${o.daysElapsed} ${plural(o.daysElapsed, 'день', 'дні', 'днів')}`;
      const previous = monthAccusativeLabel(prevMonth(o.month));
      const compared =
        o.soFar.amount === o.previousWhole.amount
          ? `уже стільки ж, скільки за весь ${previous}`
          : `уже більше, ніж за весь ${previous}`;
      return {
        ...common,
        sentence: `За ${days} ${monthGenitiveLabel(o.month)} на ${name} пішло ${formatMoney(o.soFar)} — ${compared} (${formatMoney(o.previousWhole)})`,
        route: categoryRoute(o.month, o.categoryId),
      };
    }
    case 'category-run': {
      const name = categoryLabel(o.categoryId, names.categoryNames);
      return {
        ...common,
        sentence: `${name}: ${ordinalMonth(o.run)} місяць поспіль більше — ${series(o.series)}`,
        route: categoryRoute(o.month, o.categoryId),
      };
    }
    case 'price-change':
      return {
        ...common,
        sentence: `${nameOf(o.transaction, names)}: ${formatMoney(o.transaction.amount)} замість звичних ${formatMoney(o.usual)} (${signedPercent(o.changePercent)})`,
        route: transactionRoute(o.transaction.id),
      };
    case 'merchant-outlier':
      return {
        ...common,
        sentence: `${nameOf(o.transaction, names)}, ${calendarLabel(o.transaction.date, names.now)}: ${formatMoney(o.transaction.amount)} — ${ratioPhrase(o.ratioTenths)} більше, ніж зазвичай там (${formatMoney(o.usual)})`,
        route: transactionRoute(o.transaction.id),
      };
    case 'possible-duplicate': {
      const account = names.accountNames.get(o.accountId) ?? o.accountId;
      return {
        ...common,
        sentence: `Схоже на дубль: ${formatMoney(o.amount)} на ${account}`,
        halves: [half(o.first, names), half(o.second, names)],
        answer: { first: o.first.id, second: o.second.id },
        deleteOne: {
          label: 'Видалити одну',
          title: 'Видалити одну?',
          sentence: 'Яку з двох транзакцій видалити? Друга залишиться як є.',
          choices: [deleteChoice(o.first, names), deleteChoice(o.second, names)],
        },
      };
    }
  }
}

export function observationLines(list: readonly Observation[], names: ObservationNames): ObservationLine[] {
  return list.map((o) => observationLine(o, names));
}

/** «Ще 5»: what shows the спостереження past the first five, in place. */
export interface ObservationsMore {
  readonly label: string;
  readonly accessibilityLabel: string;
}

/**
 * Місяць's and the підсумок's list (design D11): the first `LIST_LIMIT` lines and «Ще N» for the
 * rest, or every line once the screen has expanded it.
 */
export function foldedObservationLines(
  lines: readonly ObservationLine[],
  expanded: boolean,
): { readonly lines: readonly ObservationLine[]; readonly more: ObservationsMore | null } {
  const rest = lines.length - LIST_LIMIT;
  if (expanded || rest <= 0) return { lines, more: null };
  return {
    lines: lines.slice(0, LIST_LIMIT),
    more: {
      label: `Ще ${rest}`,
      accessibilityLabel: `Показати ще ${rest} ${plural(rest, 'спостереження', 'спостереження', 'спостережень')}`,
    },
  };
}

/**
 * A pair the owner has just answered «Не дубль» on this screen, remembered where its row stood so
 * the answer can be taken back from there (design D10) until the list is read anew.
 */
export interface AnsweredDuplicate {
  readonly key: string;
  readonly index: number;
  readonly pair: { readonly first: string; readonly second: string };
}

/** A row of a list of спостереження: a line, or the mark a just-answered pair leaves in its place. */
export type ObservationRow =
  | { readonly kind: 'line'; readonly key: string; readonly line: ObservationLine }
  | {
      readonly kind: 'answered';
      readonly key: string;
      /** «Позначено: не дубль». */
      readonly sentence: string;
      /** «Скасувати» — forgets the answer, which brings the pair back as it was stated. */
      readonly undoLabel: string;
      readonly undoAccessibilityLabel: string;
      readonly pair: { readonly first: string; readonly second: string };
    };

/** What answering `line`, shown at `index`, leaves to remember; nothing for a line that is no дубль. */
export function answeredDuplicate(line: ObservationLine, index: number): AnsweredDuplicate | undefined {
  return line.answer ? { key: line.key, index, pair: line.answer } : undefined;
}

/**
 * The rows a list shows: `lines` as read, with each just-answered pair's mark back where its row
 * stood — unless the list holds that pair again, its answer taken back, when the pair itself is
 * shown and the mark is not.
 */
export function observationRows(
  lines: readonly ObservationLine[],
  answered: readonly AnsweredDuplicate[],
): ObservationRow[] {
  const rows: ObservationRow[] = lines.map((line) => ({ kind: 'line', key: line.key, line }));
  const shown = new Set(lines.map((line) => line.key));
  for (const a of [...answered].sort((x, y) => x.index - y.index)) {
    if (shown.has(a.key)) continue;
    rows.splice(Math.min(a.index, rows.length), 0, {
      kind: 'answered',
      key: a.key,
      sentence: 'Позначено: не дубль',
      undoLabel: 'Скасувати',
      undoAccessibilityLabel: 'Скасувати «Не дубль»',
      pair: a.pair,
    });
  }
  return rows;
}

/** The one sentence a month with no спостереження gets, on every surface that shows them. */
export function noObservationsSentence(month: Month, today: IsoDate): string {
  return month === monthOf(today)
    ? 'Цього місяця поки нічого незвичного'
    : `${capitalised(monthInLabel(month))} нічого незвичного`;
}

/** The route of a month's підсумок. */
export const monthSummaryPath = (month: Month): string => `/month-summary/${month}`;

/** «Підсумок вересня» — what offers a month's підсумок, everywhere it is offered. */
export function summaryOfferLabel(month: Month): string {
  return `Підсумок ${monthGenitiveLabel(month)}`;
}

/**
 * The previous month, to be offered on Головний — only in the first seven days of a month, and
 * only when that month is a завершений активний місяць (main-screen, "The «Спостереження» widget
 * points at what is notable this month"). From the eighth day it is gone; nothing remembers it as
 * seen.
 */
export function homeSummaryOffer(today: IsoDate, activeMonths: ReadonlySet<Month>): Month | null {
  if (Number(today.slice(8, 10)) > HOME_SUMMARY_DAYS) return null;
  const previous = prevMonth(monthOf(today));
  return activeMonths.has(previous) ? previous : null;
}

export interface SummaryOffer {
  readonly month: Month;
  readonly label: string;
  readonly route: string;
  readonly accessibilityLabel: string;
}

export function summaryOffer(month: Month): SummaryOffer {
  const label = summaryOfferLabel(month);
  return { month, label, route: monthSummaryPath(month), accessibilityLabel: `${label}, відкрити` };
}

export interface ObservationsWidgetModel {
  /** «Підсумок вересня», in the first seven days of October; `null` otherwise. */
  readonly summary: SummaryOffer | null;
  /** The first three, in the observations capability's order. */
  readonly lines: readonly ObservationLine[];
  /** «Усі (5)», opening Місяць on the current month, when there are more than three. */
  readonly more: { readonly label: string; readonly route: string } | null;
  /** The one sentence for a month with none so far; `null` when there are some. */
  readonly empty: string | null;
}

export function observationsWidgetModel(input: {
  readonly observations: readonly Observation[];
  readonly today: IsoDate;
  readonly activeMonths: ReadonlySet<Month>;
  readonly names: ObservationNames;
}): ObservationsWidgetModel {
  const month = monthOf(input.today);
  const offered = homeSummaryOffer(input.today, input.activeMonths);
  const count = input.observations.length;
  return {
    summary: offered ? summaryOffer(offered) : null,
    lines: observationLines(input.observations.slice(0, HOME_LIMIT), input.names),
    more: count > HOME_LIMIT ? { label: `Усі (${count})`, route: `/month?month=${month}` } : null,
    empty: count === 0 ? noObservationsSentence(month, input.today) : null,
  };
}
