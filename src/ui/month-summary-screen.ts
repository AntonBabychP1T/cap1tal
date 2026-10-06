import { capitalised } from '../domain/fold';
import { CORRECTION_CATEGORY_ID, type IsoDate, type Month } from '../domain/transaction';
import type { CurrencyCode, Money } from '../domain/money';
import {
  summaryAvailability,
  type Comparison,
  type MonthSummary,
  type SummaryAvailability,
} from '../month-summary/summary';
import { monthEnd } from '../progress/summary';
import { plural } from '../progress/plural';
import { formatMoney, formatSignedMoney } from './amount-input';
import { categoryLabel } from './labels';
import { monthAccusativeLabel, monthGenitiveLabel, monthInLabel, monthLabel, prevMonth } from './months';
import {
  categoryRoute,
  foldedObservationLines,
  noObservationsSentence,
  observationLines,
  type ObservationLine,
  type ObservationNames,
  type ObservationsMore,
} from './observations';
import { percentText } from './net-worth';
import { answersRoute } from './answer-queue';
import { narrowedMonthRoute } from './transaction-search';

/**
 * The pushed «Підсумок <місяця>» screen, as strings (month-summary-screen): which month it is for,
 * why a month has none, and its nine sections in their fixed order — every row with what it leads
 * to and what a screen reader says. The screen lays these out and adds no decision of its own.
 *
 * Nothing here builds a пакет or prepares a file: «AI-аналіз <місяця>» is a route, and only
 * «Поділитися з AI» on that screen ever hands anything over.
 */

export type MonthSummaryRoute =
  | { readonly status: 'available'; readonly month: Month; readonly title: string }
  | {
      readonly status: Exclude<SummaryAvailability, 'available'>;
      readonly title: string;
      /** Why there is no підсумок, in one sentence. */
      readonly sentence: string;
    };

/** «Підсумок вересня 2026». */
export function summaryTitle(month: Month): string {
  return `Підсумок ${monthGenitiveLabel(month)} ${month.slice(0, 4)}`;
}

/**
 * What the route param opens (month-summary-screen, "A month without a підсумок is said in words,
 * never an exception"): the month, or one of the four refusals as a sentence.
 */
export function monthSummaryRoute(
  param: string | undefined,
  today: IsoDate,
  activeMonths: ReadonlySet<Month>,
): MonthSummaryRoute {
  const month = param ?? '';
  const status = summaryAvailability(month, today, activeMonths);
  switch (status) {
    case 'available':
      return { status, month, title: summaryTitle(month) };
    case 'not-a-month':
      return { status, title: 'Підсумок', sentence: 'Такого місяця немає.' };
    case 'current':
      return {
        status,
        title: summaryTitle(month),
        sentence: `Підсумок ${monthGenitiveLabel(month)} буде після ${Number(monthEnd(month).slice(8))} ${monthGenitiveLabel(month)}.`,
      };
    case 'future':
      return { status, title: summaryTitle(month), sentence: `${monthLabel(month)} ще не настав.` };
    case 'empty':
      return {
        status,
        title: summaryTitle(month),
        sentence: `${capitalised(monthInLabel(month))} нічого не записано — нема чого підсумовувати.`,
      };
  }
}

/** One line of a section: what it says, what it leads to, and what a screen reader announces. */
export interface SummaryRow {
  readonly key: string;
  readonly label: string;
  readonly value?: string;
  readonly detail?: string;
  /** A mark stated in words — never a colour alone. */
  readonly mark?: string;
  readonly route?: string;
  readonly accessibilityLabel: string;
}

/** One currency's reading of a section, or a section's single reading when it has no currency. */
export interface SummaryGroup {
  readonly key: string;
  readonly currency?: CurrencyCode;
  readonly rows: readonly SummaryRow[];
  /** A sentence instead of, or before, the rows. */
  readonly note?: string;
}

export type SummarySectionKey =
  | 'spent'
  | 'changed'
  | 'observations'
  | 'picture'
  | 'net-worth'
  | 'goals-limits'
  | 'unanswered'
  | 'corrections'
  | 'ai';

export interface SummarySection {
  readonly key: SummarySectionKey;
  readonly title: string;
  readonly groups: readonly SummaryGroup[];
  /** The observations section's own lines, with «Не дубль» where it applies. */
  readonly observations?: readonly ObservationLine[];
  /** The observations section's «Ще N» past the first five (design D11); `null` when all are shown. */
  readonly observationsMore?: ObservationsMore | null;
  /** The one sentence a section with nothing to state says instead of disappearing. */
  readonly empty: string | null;
}

export interface MonthSummaryScreen {
  readonly month: Month;
  readonly title: string;
  readonly sections: readonly SummarySection[];
}

function row(input: Omit<SummaryRow, 'accessibilityLabel'>): SummaryRow {
  const spoken = [input.label, input.value, input.detail, input.mark].filter(Boolean).join(', ');
  return { ...input, accessibilityLabel: input.route ? `${spoken}. Відкрити` : spoken };
}

/** «+4 200,00 UAH (+9 %)». */
function signedWithPercent(comparison: Comparison): string {
  const percent =
    comparison.percent === null
      ? ''
      : ` (${comparison.percent > 0 ? '+' : comparison.percent < 0 ? '−' : ''}${Math.abs(comparison.percent)} %)`;
  return `${formatSignedMoney(comparison.difference)}${percent}`;
}

/** «1,2 %» — tenths of a percent, already rounded toward zero. */
function tenthsText(tenths: number): string {
  return `${Math.trunc(tenths / 10)},${tenths % 10} %`;
}

const PICTURE_LABELS = [
  ['spent', 'Витрачено'],
  ['invested', 'Інвестовано'],
  ['saved', 'Відкладено'],
  ['lent', 'Позичено'],
  ['income', 'Дохід'],
  ['left', 'Залишилось'],
] as const;

const BREAKDOWN_LABELS = [
  ['income', 'Дохід'],
  ['spending', 'Витрати'],
  ['correction', 'Коригування'],
  ['transfer', 'Перекази й обмін'],
  ['entered', 'Нові рахунки'],
] as const;

export function monthSummaryScreen(
  summary: MonthSummary,
  names: ObservationNames,
  today: IsoDate,
  /** `observationsExpanded`: the owner chose «Ще N», and every спостереження is listed. */
  options: { readonly observationsExpanded?: boolean } = {},
): MonthSummaryScreen {
  const { month } = summary;
  const previous = prevMonth(month);
  const of = monthGenitiveLabel(month);
  const before = monthGenitiveLabel(previous);
  const nameOf = (categoryId: string) => categoryLabel(categoryId, names.categoryNames);

  const spent: SummarySection = {
    key: 'spent',
    title: 'Витрачено',
    empty: null,
    groups: summary.spent.map((reading) => ({
      key: reading.currency,
      currency: reading.currency,
      rows: [
        row({
          key: 'spent',
          label: 'Витрачено',
          value: formatMoney(reading.spent),
          ...(reading.corrections ? { detail: `з них коригування ${formatMoney(reading.corrections)}` } : {}),
        }),
        row({
          key: 'previous',
          label: `Проти ${before}`,
          value: signedWithPercent(reading.previous),
          detail: `${monthInLabel(previous)} ${formatMoney(reading.previous.before)}`,
        }),
        reading.typical.status === 'available'
          ? row({
              key: 'typical',
              label: 'Проти типового місяця',
              value: signedWithPercent(reading.typical),
              detail: `типова сума ${formatMoney(reading.typical.before)}, за ${reading.typical.months} ${plural(reading.typical.months, 'місяць', 'місяці', 'місяців')}`,
            })
          : row({
              key: 'typical',
              label: 'Типова сума',
              detail:
                reading.typical.status === 'too-little-history'
                  ? 'Замало історії для типової суми'
                  : 'Типових витрат, з якими порівняти, немає',
            }),
      ],
    })),
  };

  const changed: SummarySection = {
    key: 'changed',
    title: 'Найбільше змінилися',
    empty: null,
    groups: summary.changed.map((group) => {
      if (!group.comparable) {
        return {
          key: group.currency,
          currency: group.currency,
          rows: [],
          note: `${capitalised(monthInLabel(previous))} не було транзакцій у ${group.currency} — нема з чим порівняти категорії ${of}.`,
        };
      }
      return {
        key: group.currency,
        currency: group.currency,
        rows: group.rows.map((r) =>
          row({
            key: r.categoryId,
            label: nameOf(r.categoryId),
            value:
              r.status === 'new'
                ? formatMoney(r.current)
                : signedWithPercent({ before: r.previous, difference: r.difference, percent: r.percent }),
            detail:
              r.status === 'new'
                ? `${monthInLabel(previous)} не було`
                : `${formatMoney(r.current)}, було ${formatMoney(r.previous)}`,
            ...(r.status === 'new' ? { mark: 'нова' } : r.status === 'absent' ? { mark: 'цього місяця немає' } : {}),
            route: categoryRoute(month, r.categoryId),
          }),
        ),
        ...(group.rows.length === 0 ? { note: 'Жодна категорія не змінилася.' } : {}),
      };
    }),
  };

  const folded = foldedObservationLines(
    observationLines(summary.observations, names),
    options.observationsExpanded ?? false,
  );
  const observations: SummarySection = {
    key: 'observations',
    title: 'Спостереження',
    groups: [],
    observations: folded.lines,
    observationsMore: folded.more,
    empty: summary.observations.length === 0 ? noObservationsSentence(month, today) : null,
  };

  const picture: SummarySection = {
    key: 'picture',
    title: 'Місячна картина',
    empty: summary.picture.length === 0 ? `${capitalised(monthInLabel(month))} гроші лише переходили між рахунками.` : null,
    groups: summary.picture.map((reading) => ({
      key: reading.currency,
      currency: reading.currency,
      rows: [
        ...PICTURE_LABELS.map(([key, label]) => row({ key, label, value: formatMoney(reading.numbers[key]) })),
        row({
          key: 'income-previous',
          label: `Дохід проти ${before}`,
          value: signedWithPercent(reading.incomeAgainstPrevious),
        }),
      ],
    })),
  };

  const netWorth: SummarySection = {
    key: 'net-worth',
    title: 'Зміна статку',
    empty: summary.netWorth.length === 0 ? 'Рахунків немає — статку нема з чим порівнювати.' : null,
    groups: summary.netWorth.map((reading) => {
      const money = (amount: number): Money => ({ amount, currency: reading.currency });
      if (reading.status === 'overflow') {
        return {
          key: reading.currency,
          currency: reading.currency,
          rows: [],
          note: `Рівень статку в ${reading.currency} не вдається представити — зміни немає.`,
        };
      }
      if (reading.status === 'first-month') {
        return {
          key: reading.currency,
          currency: reading.currency,
          note: `До ${of} статку в ${reading.currency} не було — зміну нема з чим порівняти.`,
          rows: reading.figure
            ? [
                row({
                  key: 'entered',
                  label: 'Нові рахунки',
                  value: formatSignedMoney(money(reading.figure.breakdown.entered)),
                  route: '/net-worth',
                }),
              ]
            : [],
        };
      }
      const change = reading.figure.change;
      const absolute = change.status === 'available' ? change.absolute : 0;
      const percent = change.status === 'available' && change.percent !== undefined ? ` (${percentText(change.percent)})` : '';
      return {
        key: reading.currency,
        currency: reading.currency,
        rows: [
          row({
            key: 'change',
            label: 'Зміна статку',
            value: `${formatSignedMoney(money(absolute))}${percent}`,
            route: '/net-worth',
          }),
          ...BREAKDOWN_LABELS.filter(
            ([key]) => key === 'income' || key === 'spending' || reading.figure.breakdown[key] !== 0,
          ).map(([key, label]) =>
            row({ key, label, value: formatSignedMoney(money(reading.figure.breakdown[key])), route: '/net-worth' }),
          ),
        ],
      };
    }),
  };

  const goalRows = summary.goals.map((goal) =>
    row({
      key: `goal-${goal.goalId}`,
      label: goal.name,
      value: goal.moved.length === 0 ? 'без змін' : goal.moved.map((m) => formatSignedMoney(m)).join(' · '),
      route: `/goal/${goal.goalId}`,
    }),
  );
  const limitRows = summary.limits.map((limit) =>
    row({
      key: `limit-${limit.categoryId}`,
      label: nameOf(limit.categoryId),
      value: formatMoney(limit.spent),
      detail: `ліміт ${formatMoney(limit.limit)}`,
      mark: limit.overBy ? `перевищено на ${formatMoney(limit.overBy)}` : 'у межах ліміту',
      route: categoryRoute(month, limit.categoryId),
    }),
  );
  const goalsAndLimits: SummarySection = {
    key: 'goals-limits',
    title: 'Цілі й ліміти',
    empty: goalRows.length + limitRows.length === 0 ? 'Цілей і лімітів немає.' : null,
    groups: [
      ...(goalRows.length > 0 ? [{ key: 'goals', rows: goalRows }] : []),
      ...(limitRows.length > 0 ? [{ key: 'limits', rows: limitRows }] : []),
    ],
  };

  const u = summary.unanswered;
  // Each count leads to where it is answered: the queue «Що потребує відповіді» narrowed to the
  // month, which holds the «Без категорії» records, the «Без джерела» доходи and the waiting
  // чернетки of it, each answerable in place (month-summary-screen, design D10). A clean month
  // leads to its транзакції, as before.
  const answerRoute = answersRoute(month);
  const uncategorisedRoute = answerRoute;
  const unsourcedRoute = answerRoute;
  const cleanRoute = narrowedMonthRoute(month);
  const sums = (list: readonly Money[]) => list.map((m) => formatMoney(m)).join(' · ');
  const unanswered: SummarySection = {
    key: 'unanswered',
    title: 'Що ще без відповіді',
    empty: null,
    groups: [
      {
        key: 'unanswered',
        rows: [
          ...(u.clean
            ? [row({ key: 'clean', label: `${capitalised(monthAccusativeLabel(month))} — чистий місяць`, route: cleanRoute })]
            : [
                ...(u.uncategorised.count > 0
                  ? [row({ key: 'uncategorised', label: '«Без категорії»', value: `${u.uncategorised.count} · ${sums(u.uncategorised.sums)}`, route: uncategorisedRoute })]
                  : []),
                ...(u.unsourced.count > 0
                  ? [row({ key: 'unsourced', label: '«Без джерела»', value: `${u.unsourced.count} · ${sums(u.unsourced.sums)}`, route: unsourcedRoute })]
                  : []),
              ]),
          ...(u.waitingDrafts > 0
            ? [
                row({
                  key: 'drafts',
                  label: `${u.waitingDrafts} ${plural(u.waitingDrafts, 'чернетка чекає', 'чернетки чекають', 'чернеток чекають')}`,
                  detail: 'окремо від чистого місяця',
                  route: answerRoute,
                }),
              ]
            : []),
        ],
      },
    ],
  };

  const correctionGroups = summary.corrections.filter((c) => c.count > 0);
  const corrections: SummarySection = {
    key: 'corrections',
    title: 'Коригування',
    empty: correctionGroups.length === 0 ? 'Коригувань не було.' : null,
    groups: correctionGroups.map((c) => ({
      key: c.currency,
      currency: c.currency,
      rows: [
        row({
          key: 'corrections',
          label: `${c.count} ${plural(c.count, 'коригування', 'коригування', 'коригувань')}`,
          value: formatMoney(c.total),
          detail:
            c.shareTenths === null
              ? `частки немає: у ${c.currency} нічого не витрачено`
              : `частка ${tenthsText(c.shareTenths)} від витраченого`,
          ...(c.atMeasure ? { mark: '2 % або більше — вище міри місяця, якому можна довіряти' } : {}),
          route: categoryRoute(month, CORRECTION_CATEGORY_ID),
        }),
      ],
    })),
  };

  const ai: SummarySection = {
    key: 'ai',
    title: 'AI-аналіз',
    empty: null,
    groups: [
      {
        key: 'ai',
        rows: [
          row({
            key: 'ai',
            label: `AI-аналіз ${of}`,
            detail: 'Відкриє AI-аналіз лише цього місяця. Нічого не передається, доки ви не оберете «Поділитися з AI».',
            route: `/ai-analysis?month=${month}`,
          }),
        ],
      },
    ],
  };

  return {
    month,
    title: summaryTitle(month),
    sections: [spent, changed, observations, picture, netWorth, goalsAndLimits, unanswered, corrections, ai],
  };
}
