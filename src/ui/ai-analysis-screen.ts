import { renderDocument, type AnalysisDocument } from '../analysis/document';
import {
  buildAnalysisPackage,
  type AnalysisKind,
  type AnalysisPackage,
  type DatedRate,
  type PeriodChoice,
} from '../analysis/package';
import { isMonth, refusesRange, type AnalysisPeriod } from '../analysis/period';
import type { Account } from '../domain/account';
import type { Category, Source } from '../domain/category';
import type { AccumulationGoal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import type { CurrencyCode } from '../domain/money';
import type { IsoDate, Month, Transaction } from '../domain/transaction';
import type { AnalysisFile, AnalysisShareOutcome } from '../platform/analysis-share';
import { plural } from './labels';
import { monthLabel } from './months';

/**
 * Everything the «AI-аналіз» screen decides, as values: which period the choices mean, what the
 * preview says, what state a run is in, and every word the screen shows.
 *
 * The screen itself (`src/app/ai-analysis.tsx`) maps over this and decides nothing — which is what
 * lets `npm run verify` prove the whole of «nothing leaves the phone before the owner says so»
 * without a device, a build or a chooser.
 *
 * **The preview is the very пакет that would be handed over.** Not a description of it, not a
 * count taken a second way: the model builds the пакет and the документ, counts them, and hands
 * back the same `document` the share action passes to the port. So the preview and the файл cannot
 * disagree — there is only one of them.
 *
 * **The options live here and nowhere else.** Nothing is stored: no setting, no preference, no
 * migration. Every opening starts from `defaultChoices`, with both switches off, because a switch
 * that remembered itself would eventually hand описи over on a run the owner did not think about.
 */

export type PeriodChoiceId = 'this-month' | 'last-3' | 'last-6' | 'last-12' | 'custom';

export const PERIOD_CHOICES: readonly { readonly id: PeriodChoiceId; readonly label: string }[] = [
  { id: 'this-month', label: 'Цей місяць' },
  { id: 'last-3', label: 'Останні 3 місяці' },
  { id: 'last-6', label: 'Останні 6 місяців' },
  { id: 'last-12', label: 'Останні 12 місяців' },
  { id: 'custom', label: 'Свій діапазон' },
];

/** «Місячна картина» — the glossary's own term. `'investments'` joins it in a later change. */
export const KIND_CHOICES: readonly { readonly id: AnalysisKind; readonly label: string }[] = [
  { id: 'monthly-picture', label: 'Місячна картина' },
];

export interface AiAnalysisChoices {
  readonly kind: AnalysisKind;
  readonly period: PeriodChoiceId;
  /** Read only when `period` is `'custom'`. */
  readonly from: Month;
  readonly to: Month;
  /** «Продавці» — the описи of транзакції. Off unless the owner turns it on for this run. */
  readonly descriptions: boolean;
  /** «Окремі транзакції». Off unless the owner turns it on for this run. */
  readonly transactions: boolean;
}

/**
 * What the screen opens with, every time: the monthly picture, the last three months, and both
 * switches off — the least that can leave the phone while still answering «куди пішли гроші».
 *
 * The custom range is seeded with the current month at both ends, so «Свій діапазон» starts from a
 * valid range the owner narrows rather than from an empty pair that refuses itself.
 */
export function defaultChoices(today: IsoDate): AiAnalysisChoices {
  const month = today.slice(0, 7);
  return {
    kind: 'monthly-picture',
    period: 'last-3',
    from: month,
    to: month,
    descriptions: false,
    transactions: false,
  };
}

/** The stored values the model reads — the repositories' own plain rows, nothing more. */
export interface StoredForAnalysis {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly categories: readonly Category[];
  readonly sources: readonly Source[];
  readonly limits: readonly CategoryLimit[];
  readonly goals: readonly AccumulationGoal[];
  readonly rates: readonly DatedRate[];
}

export interface AiAnalysisPreview {
  /** «Ці дані буде передано застосунку, який ви оберете.» — said before anything can leave. */
  readonly handOver: string;
  /**
   * That a запит to the assistant is already inside the файл, beside the numbers, so the owner
   * need write nothing themselves. The whole point of the hand-off, said before it happens.
   */
  readonly requestIncluded: string;
  /**
   * Why «Скопіювати запит» is there, said from the moment it is offered and before it is used:
   * the chosen застосунок may take the файл alone. It names no assistant — the app has no
   * preference and knows nothing about what the owner picked.
   */
  readonly requestHint: string;
  readonly periodLabel: string;
  readonly monthsWithData: number;
  readonly transactions: number;
  readonly categories: number;
  readonly currencies: readonly CurrencyCode[];
  readonly descriptions: boolean;
  readonly transactionsIncluded: boolean;
  /** The файл's size as the UTF-8 bytes that actually leave, rounded to whole kilobytes. */
  readonly sizeKb: number;
  /** The one line the card shows: counts, the two switches and the size. */
  readonly summary: string;
}

export type AiAnalysisState = 'preview' | 'empty-period' | 'empty-history' | 'invalid-range';

export interface AiAnalysisModel {
  readonly state: AiAnalysisState;
  readonly period: AnalysisPeriod | null;
  readonly preview: AiAnalysisPreview | null;
  /** The файл as it would be handed over — the same text «Показати файл» shows. */
  readonly document: AnalysisDocument | null;
  readonly package: AnalysisPackage | null;
  /** «Один місяць не показує тренду» — a warning, never a refusal. */
  readonly warning: string | null;
  /** What the screen says instead of a preview, when there is nothing to preview. */
  readonly message: string | null;
  readonly canShare: boolean;
  readonly canCopy: boolean;
}

export const HAND_OVER_SENTENCE = 'Ці дані буде передано застосунку, який ви оберете.';
/** What the «Що буде передано» card says about the запит that is already inside the файл. */
export const REQUEST_INCLUDED_SENTENCE =
  'Разом із числами у файлі вже є запит до асистента: що зробити з даними і що означає кожен ' +
  'термін. Писати нічого не треба.';
/**
 * The standing sentence beside «Скопіювати запит».
 *
 * «Застосунок, який ви оберете» and never a name: the app neither knows nor prefers which
 * assistant the owner uses, and the spec forbids it from singling one out anywhere on the screen.
 */
export const REQUEST_HINT_SENTENCE =
  'Застосунок, який ви оберете, може взяти лише файл — тоді надішліть йому цей запит окремим ' +
  'повідомленням.';
export const SHORT_HISTORY_WARNING = 'Один місяць не показує тренду.';
export const EMPTY_PERIOD_MESSAGE = 'За цей період транзакцій немає — нема чого аналізувати.';
export const EMPTY_HISTORY_MESSAGE = 'Ще немає жодної транзакції.';
export const INVALID_RANGE_MESSAGE = 'Кінець діапазону раніше за його початок.';
/**
 * What a half-typed month says. The «Від» and «До» fields are text, so every keystroke passes
 * through a month that is not one yet — «2026-0» on the way to «2026-08» — and the screen answers
 * with the shape it wants rather than with an exception out of the month arithmetic.
 */
export const MALFORMED_MONTH_MESSAGE = 'Місяць пишеться як РРРР-ММ, напр. 2026-08.';
/** What «Завжди включено» says: the aggregates never need a switch. */
export const ALWAYS_INCLUDED = 'Завжди: місячна картина, категорії, тренди, ліміти, цілі.';

/** The choice as the builder's own `PeriodChoice`. */
export function periodChoiceOf(choices: AiAnalysisChoices): PeriodChoice {
  switch (choices.period) {
    case 'this-month':
      return 'this-month';
    case 'last-3':
      return { lastMonths: 3 };
    case 'last-6':
      return { lastMonths: 6 };
    case 'last-12':
      return { lastMonths: 12 };
    case 'custom':
      return { from: choices.from, to: choices.to };
  }
}

function labelOf(period: AnalysisPeriod): string {
  return period.from === period.to
    ? monthLabel(period.from)
    : `${monthLabel(period.from)} — ${monthLabel(period.to)}`;
}

const yesNo = (on: boolean): string => (on ? 'так' : 'ні');

/**
 * The файл's size in whole kilobytes, from the UTF-8 bytes that actually leave.
 *
 * `text.length` counts UTF-16 code units, and the файл is mostly Cyrillic — two bytes each — so it
 * would understate what leaves by about 40 %. The one number the owner uses to judge «how much is
 * this» must not be the flattering one.
 */
export function sizeInKb(text: string): number {
  return Math.round(new TextEncoder().encode(text).length / 1024);
}

/**
 * The whole screen, from the choices and the stored rows: the period, the пакет, the файл, the
 * preview, the warning and whether there is anything to share.
 *
 * Built fresh on every change of a choice, in memory. Nothing is written, nothing is cached and no
 * app is offered anything — the chooser opens only on the owner's own action, and this function
 * cannot open one.
 */
export function aiAnalysisModel(input: {
  readonly choices: AiAnalysisChoices;
  readonly stored: StoredForAnalysis;
  /** The device's calendar day, read once by the screen. */
  readonly today: IsoDate;
}): AiAnalysisModel {
  const nothing = {
    period: null,
    preview: null,
    document: null,
    package: null,
    warning: null,
    canShare: false,
    canCopy: false,
  } as const;

  // Nothing stored at all is its own answer, and it comes before the period: «нема чого
  // аналізувати за цей період» would send the owner off to try other periods for a history that
  // does not exist yet.
  if (input.stored.transactions.length === 0) {
    return { ...nothing, state: 'empty-history', message: EMPTY_HISTORY_MESSAGE };
  }

  // Both asked before anything is built, so neither a month still being typed nor a range that
  // ends before it starts can reach the month arithmetic — each is a sentence the owner reads,
  // and the spec is explicit that the screen never shows an exception.
  if (input.choices.period === 'custom') {
    if (!isMonth(input.choices.from) || !isMonth(input.choices.to)) {
      return { ...nothing, state: 'invalid-range', message: MALFORMED_MONTH_MESSAGE };
    }
    if (refusesRange(input.choices.from, input.choices.to)) {
      return { ...nothing, state: 'invalid-range', message: INVALID_RANGE_MESSAGE };
    }
  }

  const built = buildAnalysisPackage({
    kind: input.choices.kind,
    period: periodChoiceOf(input.choices),
    included: {
      descriptions: input.choices.descriptions,
      transactions: input.choices.transactions,
    },
    builtOn: input.today,
    ...input.stored,
  });

  // By the value of `kind` and not by `'kind' in built`: a пакет has a `kind` too — the kind of
  // AI-аналіз it is — so the presence of the field discriminates nothing.
  if (built.kind === 'empty-period') {
    return { ...nothing, state: 'empty-period', message: EMPTY_PERIOD_MESSAGE };
  }

  const document = renderDocument(built, 'external-advanced');

  return {
    state: 'preview',
    period: built.period,
    package: built,
    document,
    preview: {
      handOver: HAND_OVER_SENTENCE,
      requestIncluded: REQUEST_INCLUDED_SENTENCE,
      requestHint: REQUEST_HINT_SENTENCE,
      periodLabel: labelOf(built.period),
      monthsWithData: built.counts.monthsWithData,
      transactions: built.counts.transactions,
      categories: built.counts.categories,
      currencies: built.counts.currencies,
      descriptions: built.included.descriptions,
      transactionsIncluded: built.included.transactions,
      sizeKb: sizeInKb(document.text),
      summary: [
        `${built.counts.monthsWithData} ${plural(built.counts.monthsWithData, 'місяць', 'місяці', 'місяців')}`,
        `${built.counts.transactions} ${plural(built.counts.transactions, 'транзакція', 'транзакції', 'транзакцій')}`,
        `${built.counts.categories} ${plural(built.counts.categories, 'категорія', 'категорії', 'категорій')}`,
        built.counts.currencies.join(', '),
        `продавці: ${yesNo(built.included.descriptions)}`,
        `окремі транзакції: ${yesNo(built.included.transactions)}`,
        `≈ ${sizeInKb(document.text)} КБ`,
      ].join(' · '),
    },
    // A single month is still worth explaining; it is only a trend that one month cannot show.
    warning: built.history === 'short' ? SHORT_HISTORY_WARNING : null,
    message: null,
    canShare: true,
    canCopy: true,
  };
}

/**
 * Where a run is. The preview is live from the moment the screen opens — the model above is
 * recomputed on every change of a choice — so there is no `choosing` state distinct from it and no
 * «Переглянути» action to reach it.
 *
 * `sharing` is the chooser being open. It has no timeout by design: a promise that never resolves
 * is a defect in the adapter to be fixed, not something to paper over with a timer that would then
 * claim an outcome nobody observed.
 */
export type RunState =
  | { readonly kind: 'preview' }
  | { readonly kind: 'sharing' }
  /** `messageIncluded` is the port's own answer, carried through so no word is invented here. */
  | { readonly kind: 'handed-over'; readonly messageIncluded: boolean }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'copied' }
  | { readonly kind: 'copied-request' };

export type RunEvent =
  | { readonly kind: 'share' }
  | { readonly kind: 'outcome'; readonly outcome: AnalysisShareOutcome }
  | { readonly kind: 'copy' }
  | { readonly kind: 'copy-request' }
  | { readonly kind: 'choices-changed' };

/**
 * The port's answer as a state of the screen.
 *
 * Spelled out case by case rather than flattened with `{ kind: outcome.kind }`, which is what this
 * used to be: the flattening dropped every field an outcome carried, and it did so silently. Now
 * the next outcome that grows one is caught by the compiler and not by a reviewer.
 */
function stateOfOutcome(outcome: AnalysisShareOutcome): RunState {
  switch (outcome.kind) {
    case 'failed':
      return { kind: 'failed', reason: outcome.reason };
    case 'handed-over':
      return { kind: 'handed-over', messageIncluded: outcome.messageIncluded };
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}

export function nextState(state: RunState, event: RunEvent): RunState {
  switch (event.kind) {
    case 'share':
      // Only from a settled state: a second share while the chooser is open is what
      // `SharingInProgressException` is, and the screen does not start one.
      return state.kind === 'sharing' ? state : { kind: 'sharing' };
    case 'outcome':
      return stateOfOutcome(event.outcome);
    case 'copy':
      return state.kind === 'sharing' ? state : { kind: 'copied' };
    case 'copy-request':
      // The same rule as «Скопіювати»: refused only while a chooser is open.
      return state.kind === 'sharing' ? state : { kind: 'copied-request' };
    case 'choices-changed':
      // A changed choice makes the previous outcome about a файл that no longer exists, so the
      // screen goes back to showing what would leave now — but never out of an open chooser.
      return state.kind === 'sharing' ? state : { kind: 'preview' };
  }
}

/**
 * What the screen says about each outcome, in the owner's own words.
 *
 * «Файл передано системі» and not «надіслано», «отримано» or «проаналізовано»: the phone does not
 * tell the app whether the owner picked an app or dismissed the chooser, so this is the whole of
 * what the app knows. Anything warmer would be a claim it cannot make.
 */
export function runOutcomeWords(state: RunState): string | null {
  switch (state.kind) {
    case 'preview':
    case 'sharing':
      return null;
    case 'handed-over':
      // The one further thing the spec permits when the phone says the запит travelled: the same
      // sentence with «Файл» widened to «Файл і запит». Never «надіслано», «доставлено»,
      // «отримано» or «прочитано» — the app learns none of that about the запит, for exactly the
      // reason it learns none of it about the файл. When it did not travel, nothing is said of it.
      return state.messageIncluded
        ? 'Файл і запит передано системі. Що з ними сталося далі, знає лише обраний застосунок.'
        : 'Файл передано системі. Що з ним сталося далі, знає лише обраний застосунок.';
    case 'unavailable':
      return 'На цій платформі поділитися файлом не вийде.';
    case 'failed':
      return `Не вдалося підготувати файл: ${state.reason}`;
    case 'copied':
      return 'Скопійовано.';
    case 'copied-request':
      // Its own words, not «Скопійовано.»: the owner who taps one of two copy actions has to be
      // able to tell which one they tapped. And nothing about what happens to it next.
      return 'Запит у буфері обміну.';
  }
}

/**
 * The файл as the port takes it — and the one place the text that leaves is decided.
 *
 * It is `document.text` unchanged, so the text previewed, the text copied and the text handed over
 * are one string and not three that agree.
 */
export function fileToShare(model: AiAnalysisModel): AnalysisFile | null {
  return model.document
    ? {
        name: model.document.name,
        text: model.document.text,
        // Offered beside the файл, best-effort: the platform carries it or it does not, and the
        // outcome says which. The файл is whole either way — it opens with its own запит.
        message: model.document.shortRequest,
      }
    : null;
}

/** What «Скопіювати» puts on the clipboard: the same файл, character for character. */
export function textToCopy(model: AiAnalysisModel): string | null {
  return model.document?.text ?? null;
}

/**
 * What «Скопіювати запит» puts on the clipboard: the короткий запит alone, and never the файл.
 *
 * The same constant that is offered to the phone beside the файл, read from the same place, so the
 * запит the owner pastes after a hand-off is the запит that hand-off offered. `null` where there is
 * no пакет — nothing to preview is nothing to copy.
 */
export function shortRequestToCopy(model: AiAnalysisModel): string | null {
  return model.document?.shortRequest ?? null;
}
