import { isReached, type AccumulationGoal } from '../domain/goals';
import type { CurrencyCode, Money } from '../domain/money';
import { monthOf, type IsoDate } from '../domain/transaction';
import type { AccountKind } from '../domain/account';
import type { Evidence, SpendingNorms } from './earned';
import {
  activeMonths,
  cleanMonths,
  cleanRunCompletedAt,
  historySpanMonths,
  investedCapital,
  investmentMonths,
  longestCleanRun,
  monthEnd,
  reserve,
  type ProgressSummary,
} from './summary';

/**
 * The **catalogue**: every досягнення this build knows how to earn, as ordinary TypeScript.
 *
 * It lives in code and not in SQLite for the reason design D5 gives: a wording fix would otherwise
 * be a migration, the бекап would carry text the code already carries, and a template's condition
 * could not be unit-tested like any other pure function. SQLite holds keys and свідчення, and
 * nothing else about a досягнення.
 *
 * **Keys are permanent.** A template may be renamed, its Ukrainian text rewritten and its
 * explanation improved; its key never changes, because the key is what a stored row is. A template
 * that is retired is removed from this list and its earned rows are simply not shown — they are
 * never deleted.
 *
 * Every entry answers the one question this change holds itself to: *яку корисну фінансову
 * поведінку це підсилює, і чи можна отримати це, поводячись гірше?* Nothing counts витрати,
 * purchases, a категорія, a card or a credit, and nothing counts days on which the app was opened.
 */

export type Group = 'ledger' | 'quality' | 'goal' | 'reserve' | 'invest';

/**
 * How far a candidate has come, where that is a number at all. A досягнення with no measurable
 * progress carries none and is not listed «У процесі» — an unmeasurable thing shown as 0 % is a
 * nag, not information.
 */
export interface Progress {
  readonly reached: number;
  readonly target: number;
  /** The currency both numbers are in, when the progress is money rather than a count. */
  readonly currency?: CurrencyCode;
}

/**
 * One досягнення the catalogue can name right now: earned or not, and everything needed to say so.
 *
 * The **key** carries every parameter that makes the fact distinct — the tier, the currency, the
 * ціль — so two currencies are two досягнення and never one.
 */
export interface Candidate {
  readonly key: string;
  readonly template: string;
  readonly group: Group;
  /** The Ukrainian назва, with its parameters already in it: «500 транзакцій». */
  readonly name: string;
  /** One sentence stating the exact condition, which the owner can check against their own data. */
  readonly condition: string;
  readonly earned: boolean;
  /**
   * The дата досягнення when the history dates this condition. Absent means the history does not
   * date it and the day the app records it is the дата (design D4).
   */
  readonly achievedOn?: IsoDate;
  /** «досягнуто» when the history dated it, «помічено» when the day it was recorded did. */
  readonly dating: 'history' | 'recorded';
  /** The свідчення as it would be frozen the moment this is earned. */
  readonly evidence: Evidence;
  readonly progress?: Progress;
}

/**
 * A ціль-накопичення as the catalogue is handed it: the ціль itself, and one already-resolved
 * progress.
 *
 * `progress` is `null` when the `goals` capability could not give an **exact** number — a внесок
 * that had to be converted at a курс, or a курс that is missing altogether. That is the seam of
 * design D6: the engine never calls `goalProgress`, never reads a рахунок, a склад or a поточна
 * вартість, and a rate can therefore not decide a досягнення, because a rate-carried progress does
 * not arrive here at all. `src/progress/run.ts` is where the resolution happens.
 */
export interface GoalStanding {
  readonly goal: AccumulationGoal;
  readonly progress: Money | null;
}

/** What the catalogue is handed. Every value is already resolved: nothing here reads storage. */
export interface CatalogueInput {
  readonly summary: ProgressSummary;
  readonly today: IsoDate;
  /** The дата of the Nth транзакція of the history, дата then stored order. */
  readonly nthTransactionDate: (n: number) => IsoDate | undefined;
  /** The цілі-накопичення, each with its exact progress or `null`. A ліміт is not among them. */
  readonly goals: readonly GoalStanding[];
  /**
   * The confirmed місячні норми витрат, by currency. A currency with none has none: every
   * досягнення that needs one **does not exist** for it — not shown locked, not shown greyed, not
   * counted «У процесі» (design D7).
   */
  readonly norms: SpendingNorms;
  /** The дата of the earliest переказ onto a рахунок of a вид, where there is one. */
  readonly firstTransferOntoKind: (kind: AccountKind) => IsoDate | undefined;
}

export interface Template {
  readonly key: string;
  readonly group: Group;
  readonly dating: 'history' | 'recorded';
  readonly candidates: (input: CatalogueInput) => Candidate[];
}

/**
 * Ukrainian counts. 1 (but not 11) takes the singular, 2–4 (but not 12–14) the paucal, everything
 * else the genitive plural — written out because no rule of arithmetic produces «транзакція /
 * транзакції / транзакцій» from a number, and `Intl` would put Vitest on Node and Hermes at risk
 * of disagreeing about the owner's own language.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = Math.abs(n) % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const transactionsWord = (n: number) => plural(n, 'транзакція', 'транзакції', 'транзакцій');
const monthsWord = (n: number) => plural(n, 'місяць', 'місяці', 'місяців');
const activeWord = (n: number) => plural(n, 'активний', 'активні', 'активних');
const cleanWord = (n: number) => plural(n, 'чистий', 'чисті', 'чистих');

/** The count tiers of «N транзакцій», in the order they are crossed. */
export const TRANSACTION_TIERS: readonly number[] = [100, 500, 1000, 2000];
/** The tiers of «N активних місяців». */
export const ACTIVE_MONTH_TIERS: readonly number[] = [3, 6, 12, 18];
/** The tiers of «N чистих місяців поспіль». */
export const CLEAN_RUN_TIERS: readonly number[] = [3, 6];
/** How many calendar місяці the history must span for «Рік історії». */
export const HISTORY_SPAN_MONTHS = 12;

const ledgerFirstTransaction: Template = {
  key: 'ledger.first-transaction',
  group: 'ledger',
  dating: 'history',
  candidates: ({ summary }) => {
    const earliest = summary.history.earliest;
    return [
      {
        key: 'ledger.first-transaction',
        template: 'ledger.first-transaction',
        group: 'ledger',
        name: 'Перша транзакція',
        condition: 'Записано принаймні одну транзакцію.',
        earned: summary.history.count >= 1,
        ...(earliest === undefined ? {} : { achievedOn: earliest }),
        dating: 'history',
        evidence: { kind: 'count', count: 1 },
        // No progress: «щось або нічого» is not a number to fill up.
      },
    ];
  },
};

const ledgerTransactions: Template = {
  key: 'ledger.transactions',
  group: 'ledger',
  dating: 'history',
  candidates: ({ summary, nthTransactionDate }) => {
    const count = summary.history.count;
    return TRANSACTION_TIERS.map((tier) => {
      const earned = count >= tier;
      // The one row-level reading the spec allows, and only for a tier actually being crossed:
      // a tier the history has not reached needs no дата at all.
      const achievedOn = earned ? nthTransactionDate(tier) : undefined;
      return {
        key: `ledger.transactions:${tier}`,
        template: 'ledger.transactions',
        group: 'ledger' as const,
        name: `${tier} ${transactionsWord(tier)}`,
        condition: `Збережено щонайменше ${tier} ${transactionsWord(tier)}.`,
        earned,
        ...(achievedOn === undefined ? {} : { achievedOn }),
        dating: 'history' as const,
        evidence: { kind: 'count' as const, count: tier },
        progress: { reached: count, target: tier },
      };
    });
  },
};

const ledgerActiveMonths: Template = {
  key: 'ledger.active-months',
  group: 'ledger',
  dating: 'history',
  candidates: ({ summary }) => {
    const months = activeMonths(summary);
    return ACTIVE_MONTH_TIERS.map((tier) => {
      const completing = months[tier - 1];
      return {
        key: `ledger.active-months:${tier}`,
        template: 'ledger.active-months',
        group: 'ledger' as const,
        name: `${tier} ${activeWord(tier)} ${monthsWord(tier)}`,
        condition: `Транзакції є щонайменше у ${tier} календарних місяцях. Місяці не мусять бути поспіль.`,
        earned: completing !== undefined,
        // The fact happened when the tier's місяць ended, not when the app noticed.
        ...(completing === undefined ? {} : { achievedOn: monthEnd(completing) }),
        dating: 'history' as const,
        evidence: {
          kind: 'months' as const,
          months: tier,
          from: months[0] ?? '',
          to: completing ?? '',
        },
        progress: { reached: months.length, target: tier },
      };
    });
  },
};

const ledgerHistorySpan: Template = {
  key: 'ledger.history-span',
  group: 'ledger',
  dating: 'history',
  candidates: ({ summary }) => {
    const span = historySpanMonths(summary);
    const { earliest, latest } = summary.history;
    const earned = span >= HISTORY_SPAN_MONTHS;
    return [
      {
        key: 'ledger.history-span',
        template: 'ledger.history-span',
        group: 'ledger',
        name: 'Рік історії',
        // Named as the span of the history and never as a run of days the app was opened — a
        // gapped year is still a year of history, and the glossary keeps the two apart.
        condition:
          'Від найранішої до найпізнішої транзакції минуло щонайменше 12 календарних місяців.',
        earned,
        // Dated at the транзакція that carried the span over a year: the latest one.
        ...(earned && latest !== undefined ? { achievedOn: latest } : {}),
        dating: 'history',
        evidence: {
          kind: 'months',
          months: span,
          from: earliest === undefined ? '' : monthOf(earliest),
          to: latest === undefined ? '' : monthOf(latest),
        },
        progress: { reached: span, target: HISTORY_SPAN_MONTHS },
      },
    ];
  },
};

const qualityCleanMonth: Template = {
  key: 'quality.clean-month',
  group: 'quality',
  dating: 'history',
  candidates: ({ summary, today }) => {
    const clean = cleanMonths(summary, today);
    const first = clean[0];
    return [
      {
        key: 'quality.clean-month',
        template: 'quality.clean-month',
        group: 'quality',
        name: 'Чистий місяць',
        condition:
          'Є завершений місяць, у якому жодна витрата не «Без категорії» і жоден дохід не «Без джерела».',
        earned: first !== undefined,
        ...(first === undefined ? {} : { achievedOn: monthEnd(first) }),
        dating: 'history',
        evidence: { kind: 'month', month: first ?? '' },
        // No progress: a місяць is чистий or it is not, and «на 60 % чистий» means nothing.
      },
    ];
  },
};

const qualityCleanRun: Template = {
  key: 'quality.clean-months-streak',
  group: 'quality',
  dating: 'history',
  candidates: ({ summary, today }) => {
    const longest = longestCleanRun(summary, today);
    return CLEAN_RUN_TIERS.map((tier) => {
      const completing = cleanRunCompletedAt(summary, today, tier);
      const clean = cleanMonths(summary, today);
      const startIndex = completing === undefined ? -1 : clean.indexOf(completing) - (tier - 1);
      return {
        key: `quality.clean-months-streak:${tier}`,
        template: 'quality.clean-months-streak',
        group: 'quality' as const,
        name: `${tier} ${cleanWord(tier)} ${monthsWord(tier)} поспіль`,
        condition: `${tier} календарні місяці поспіль були чистими. Місяць без жодної транзакції розриває серію.`,
        earned: completing !== undefined,
        ...(completing === undefined ? {} : { achievedOn: monthEnd(completing) }),
        dating: 'history' as const,
        evidence: {
          kind: 'months' as const,
          months: tier,
          from: startIndex >= 0 ? (clean[startIndex] ?? '') : '',
          to: completing ?? '',
        },
        progress: { reached: longest, target: tier },
      };
    });
  },
};

/** The quarters of a ціль a досягнення exists at. There is no досягнення at any other fraction. */
export const GOAL_QUARTERS: readonly number[] = [25, 50, 75];

/**
 * The цілі whose progress is exact, in a stable order — id, so two devices holding the same data
 * say the same thing in the same sequence. A ціль whose progress is приблизний or unknown is not
 * here at all, and so earns nothing and unearns nothing.
 */
function exactGoals(input: CatalogueInput): { goal: AccumulationGoal; progress: Money }[] {
  return input.goals
    .filter(
      (standing): standing is { goal: AccumulationGoal; progress: Money } =>
        standing.progress !== null &&
        standing.progress.currency === standing.goal.target.currency,
    )
    .sort((a, b) => (a.goal.id < b.goal.id ? -1 : a.goal.id > b.goal.id ? 1 : 0));
}

/** The свідчення of a ціль досягнення: which ціль, and the назва it carried at that moment. */
function goalEvidence(goal: AccumulationGoal): Evidence {
  return { kind: 'goal', goalId: goal.id, name: goal.name };
}

const goalFirst: Template = {
  key: 'goal.first',
  group: 'goal',
  // A ціль's creation is nowhere in the транзакції, so the history cannot date it (design D4).
  dating: 'recorded',
  candidates: (input) => {
    const first = [...input.goals]
      .sort((a, b) => (a.goal.id < b.goal.id ? -1 : a.goal.id > b.goal.id ? 1 : 0))[0]?.goal;
    return [
      {
        key: 'goal.first',
        template: 'goal.first',
        group: 'goal',
        name: 'Перша ціль-накопичення',
        // A ліміт is a ціль витрат and is never «досягнута», so it is not one of these.
        condition: 'Створено принаймні одну ціль-накопичення.',
        earned: first !== undefined,
        dating: 'recorded',
        evidence:
          first === undefined ? { kind: 'count', count: 1 } : goalEvidence(first),
      },
    ];
  },
};

const goalProgressTemplate: Template = {
  key: 'goal.progress',
  group: 'goal',
  // A progress is a balance — a number about now — and the history does not date it.
  dating: 'recorded',
  candidates: (input) =>
    exactGoals(input).flatMap(({ goal, progress }) =>
      GOAL_QUARTERS.map((quarter) => ({
        key: `goal.progress:${goal.id}:${quarter}`,
        template: 'goal.progress',
        group: 'goal' as const,
        name: `Ціль «${goal.name}» — ${quarter} %`,
        condition: `Прогрес цілі «${goal.name}» — щонайменше ${quarter} % її суми.`,
        // Integer arithmetic throughout: a percentage of money is a comparison, never a division.
        earned: progress.amount * 100 >= goal.target.amount * quarter,
        dating: 'recorded' as const,
        evidence: goalEvidence(goal),
        progress: {
          reached: progress.amount,
          target: Math.ceil((goal.target.amount * quarter) / 100),
          currency: goal.target.currency,
        },
      })),
    ),
};

const goalReached: Template = {
  key: 'goal.reached',
  group: 'goal',
  dating: 'recorded',
  candidates: (input) =>
    exactGoals(input).map(({ goal, progress }) => ({
      key: `goal.reached:${goal.id}`,
      template: 'goal.reached',
      group: 'goal' as const,
      name: `Ціль «${goal.name}» досягнута`,
      condition: `Прогрес цілі «${goal.name}» дійшов до її суми.`,
      // `goals`' own rule, asked rather than restated: at the target counts.
      earned: isReached(goal, progress),
      dating: 'recorded' as const,
      evidence: goalEvidence(goal),
      progress: {
        reached: progress.amount,
        target: goal.target.amount,
        currency: goal.target.currency,
      },
    })),
};

const goalReachedInTime: Template = {
  key: 'goal.reached-in-time',
  group: 'goal',
  dating: 'recorded',
  candidates: (input) =>
    exactGoals(input)
      // A ціль with no дата is not a candidate at all: there was no date to be in time for, and
      // «У процесі» must not list a досягнення that cannot be earned.
      .filter(({ goal }) => goal.deadline !== undefined)
      .map(({ goal, progress }) => ({
        key: `goal.reached-in-time:${goal.id}`,
        template: 'goal.reached-in-time',
        group: 'goal' as const,
        name: `Ціль «${goal.name}» досягнута вчасно`,
        condition: `Ціль «${goal.name}» досягнута не пізніше за ${goal.deadline}.`,
        earned: isReached(goal, progress) && input.today <= goal.deadline!,
        dating: 'recorded' as const,
        evidence: goalEvidence(goal),
        progress: {
          reached: progress.amount,
          target: goal.target.amount,
          currency: goal.target.currency,
        },
      })),
};

/** The fractions of a місячна норма витрат the резерв is measured against. */
export const RESERVE_TIERS: readonly number[] = [25, 50, 100];
/** How many місяці of contribution «Внески у N місяцях» exists at. */
export const INVEST_MONTH_TIERS: readonly number[] = [3, 6, 12];
/** How many місячні норми витрат the інвестиційний капітал is measured against. */
export const INVEST_NORM_TIERS: readonly number[] = [1, 3, 6, 12];

/** The currencies that have a confirmed норма, sorted, so two devices agree on the order. */
function normedCurrencies(norms: SpendingNorms): CurrencyCode[] {
  return [...norms.keys()].sort();
}

/** «Чверть місяця», «Пів місяця», «Місяць» — the three the резерв is read out in. */
const RESERVE_NAMES: Readonly<Record<number, string>> = {
  25: 'Чверть місяця витрат у резерві',
  50: 'Пів місяця витрат у резерві',
  100: 'Місяць витрат у резерві',
};

/**
 * «Перше відкладення» and «Перший внесок в інвестиції» — the two досягнення the history dates by a
 * single переказ. Neither needs a норма: putting the first сума aside is the behaviour, and a
 * currency the owner has not yet measured is not a reason to stay silent about it.
 */
function firstTransferTemplate(input: {
  key: string;
  kind: AccountKind;
  group: Group;
  name: string;
  condition: string;
}): Template {
  return {
    key: input.key,
    group: input.group,
    dating: 'history',
    candidates: ({ firstTransferOntoKind }) => {
      const on = firstTransferOntoKind(input.kind);
      return [
        {
          key: input.key,
          template: input.key,
          group: input.group,
          name: input.name,
          condition: input.condition,
          earned: on !== undefined,
          ...(on === undefined ? {} : { achievedOn: on }),
          dating: 'history' as const,
          evidence: { kind: 'month' as const, month: on === undefined ? '' : monthOf(on) },
        },
      ];
    },
  };
}

const reserveFirst = firstTransferTemplate({
  key: 'reserve.first',
  kind: 'savings',
  group: 'reserve',
  name: 'Перше відкладення',
  condition: 'Є переказ на рахунок виду «Заощадження».',
});

const reserveNorm: Template = {
  key: 'reserve.norm',
  group: 'reserve',
  // The резерв is a balance — a number about now — so the day the app records it is its дата.
  dating: 'recorded',
  candidates: (input) =>
    normedCurrencies(input.norms).flatMap((currency) => {
      const norm = input.norms.get(currency)!.amount;
      const held = reserve(input.summary, currency);
      return RESERVE_TIERS.map((tier) => ({
        key: `reserve.norm:${tier}:${currency}`,
        template: 'reserve.norm',
        group: 'reserve' as const,
        name: `${RESERVE_NAMES[tier]} (${currency})`,
        condition: `Резерв у ${currency} — щонайменше ${tier} % місячної норми витрат у ${currency}.`,
        // One currency against its own норма. No курс, no приблизний еквівалент: two currencies
        // are two досягнення and are never added together to reach one.
        earned: held.amount * 100 >= norm.amount * tier,
        dating: 'recorded' as const,
        evidence: { kind: 'money' as const, money: held },
        progress: {
          reached: held.amount,
          target: Math.ceil((norm.amount * tier) / 100),
          currency,
        },
      }));
    }),
};

const investFirst = firstTransferTemplate({
  key: 'invest.first',
  kind: 'investment',
  group: 'invest',
  name: 'Перший внесок в інвестиції',
  condition: 'Є переказ на рахунок виду «Інвестиції».',
});

const investMonths: Template = {
  key: 'invest.months',
  group: 'invest',
  dating: 'history',
  candidates: ({ summary }) => {
    const months = investmentMonths(summary);
    return INVEST_MONTH_TIERS.map((tier) => {
      const completing = months[tier - 1];
      return {
        key: `invest.months:${tier}`,
        template: 'invest.months',
        group: 'invest' as const,
        name: `Внески у ${tier} ${plural(tier, 'місяці', 'місяцях', 'місяцях')}`,
        // Місяці are counted, not сум: a місяць with an інвестиція in any currency counts once,
        // and no two currencies are ever added together to decide it.
        condition: `Щонайменше у ${tier} різних місяцях щось було вкладено в інвестиції.`,
        earned: completing !== undefined,
        ...(completing === undefined ? {} : { achievedOn: monthEnd(completing) }),
        dating: 'history' as const,
        evidence: {
          kind: 'months' as const,
          months: tier,
          from: months[0] ?? '',
          to: completing ?? '',
        },
        progress: { reached: months.length, target: tier },
      };
    });
  },
};

const investNormMonths: Template = {
  key: 'invest.norm-months',
  group: 'invest',
  dating: 'recorded',
  candidates: (input) =>
    normedCurrencies(input.norms).flatMap((currency) => {
      const norm = input.norms.get(currency)!.amount;
      // The розрахункові баланси of the інвестиційні рахунки — what the owner *put in*. No поточна
      // вартість, no прибуток, no збиток: a market that moved is not a behaviour to reinforce.
      const capital = investedCapital(input.summary, currency);
      return INVEST_NORM_TIERS.map((tier) => ({
        key: `invest.norm-months:${tier}:${currency}`,
        template: 'invest.norm-months',
        group: 'invest' as const,
        name: `Інвестовано на ${tier} ${plural(tier, 'місяць', 'місяці', 'місяців')} витрат (${currency})`,
        condition: `Інвестиційний капітал у ${currency} — щонайменше ${tier} місячних норм витрат у ${currency}.`,
        earned: capital.amount >= norm.amount * tier,
        dating: 'recorded' as const,
        evidence: { kind: 'money' as const, money: capital },
        progress: { reached: capital.amount, target: norm.amount * tier, currency },
      }));
    }),
};

/**
 * The catalogue, in the order досягнення are grouped for the owner. The order is stable and part
 * of what makes two devices holding the same data say the same thing in the same sequence.
 */
export const CATALOGUE: readonly Template[] = [
  ledgerFirstTransaction,
  ledgerTransactions,
  ledgerActiveMonths,
  ledgerHistorySpan,
  qualityCleanMonth,
  qualityCleanRun,
  goalFirst,
  goalProgressTemplate,
  goalReached,
  goalReachedInTime,
  reserveFirst,
  reserveNorm,
  investFirst,
  investMonths,
  investNormMonths,
];

/** Every досягнення the catalogue can name for the given data, earned or not. */
export function candidates(input: CatalogueInput): Candidate[] {
  return CATALOGUE.flatMap((template) => template.candidates(input));
}
