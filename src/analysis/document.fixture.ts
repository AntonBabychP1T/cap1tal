import { account, type Account } from '../domain/account';
import type { Category, Source } from '../domain/category';
import type { Goal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import {
  CORRECTION_CATEGORY_ID,
  expenseByDefault,
  FEES_CATEGORY_ID,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { buildAnalysisPackage, type AnalysisInput, type AnalysisPackage } from './package';

/**
 * The one fixture the golden файл is rendered from, shared by `document.test.ts` and the script
 * that regenerates `document.golden.md`.
 *
 * It is deliberately a whole small life rather than a minimal case: two currencies, a ліміт that
 * was exceeded, a ціль with a pace, a переказ, a повернення and a коригування, a month with nothing
 * in it, and the month the пакет is built in still running. Every section of the файл therefore has
 * something to render, and a wording change anywhere shows up in the golden file.
 */

export const fixtureAccounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'cash', name: 'Готівка', kind: 'cash', currency: 'UAH' }),
  account({ id: 'jar', name: 'Банка на авто', kind: 'savings', currency: 'UAH' }),
  account({ id: 'bonds', name: 'Військові облігації', kind: 'investment', currency: 'UAH' }),
];

export const fixtureCategories: readonly Category[] = [
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'groceries', name: 'Продукти', archived: false },
  { id: 'home', name: 'Житло', archived: false },
  { id: 'car', name: 'Авто', archived: false },
  // The three reserved rows, under the назви they are seeded with: a коригування lands in
  // «Коригування» by the domain's own rule, and the пакет names it like any other категорія.
  { id: CORRECTION_CATEGORY_ID, name: 'Коригування', archived: false },
  { id: FEES_CATEGORY_ID, name: 'Комісія', archived: false },
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії', archived: false },
];

export const fixtureSources: readonly Source[] = [
  { id: 'salary', name: 'Зарплата', archived: false },
];

export const fixtureLimits: readonly CategoryLimit[] = [
  { categoryId: 'cafe', amount: money(80000, 'UAH') },
];

export const fixtureGoals: readonly Goal[] = [
  {
    id: 'goal-car',
    name: 'Авто',
    target: money(20_000_000, 'UAH'),
    deadline: '2026-12-31',
    accountId: 'jar',
  },
];

const spend = (
  id: string,
  date: string,
  amount: number,
  categoryId: string,
  currency = 'UAH',
): Transaction =>
  expenseByDefault({ id, date, accountId: 'card', amount: money(amount, currency), categoryId });

export const fixtureTransactions: readonly Transaction[] = [
  // June: the baseline month before the period.
  spend('b1', '2026-06-10', 250000, 'groceries'),
  // July.
  spend('t1', '2026-07-05', 1_500_000, 'home'),
  spend('t2', '2026-07-08', 50000, 'cafe'),
  spend('t3', '2026-07-12', 300000, 'groceries'),
  {
    type: 'income',
    id: 't4',
    date: '2026-07-01',
    accountId: 'card',
    amount: money(5_000_000, 'UAH'),
    sourceId: 'salary',
  },
  transfer({
    id: 't5',
    date: '2026-07-20',
    fromAccountId: 'card',
    toAccountId: 'jar',
    left: money(1_000_000, 'UAH'),
    arrived: money(1_000_000, 'UAH'),
  }),
  // August: «Кафе» goes over its ліміт, and a large ремонт explains the month.
  spend('t6', '2026-08-05', 1_510_000, 'home'),
  spend('t7', '2026-08-09', 100000, 'cafe'),
  spend('t8', '2026-08-14', 2_500_000, 'car'),
  {
    type: 'income',
    id: 't9',
    date: '2026-08-01',
    accountId: 'card',
    amount: money(5_000_000, 'UAH'),
    sourceId: 'salary',
  },
  {
    type: 'refund',
    id: 't10',
    date: '2026-08-18',
    accountId: 'card',
    amount: money(40000, 'UAH'),
    categoryId: 'groceries',
  },
  {
    type: 'correction',
    id: 't11',
    date: '2026-08-25',
    accountId: 'cash',
    amount: money(-20000, 'UAH'),
  },
  transfer({
    id: 't12',
    date: '2026-08-20',
    fromAccountId: 'card',
    toAccountId: 'bonds',
    left: money(800000, 'UAH'),
    arrived: money(800000, 'UAH'),
  }),
  // A USD витрата, so the fixture holds two currencies and an approximation.
  spend('t13', '2026-08-22', 12000, 'cafe', 'USD'),
  // September, still running.
  spend('t14', '2026-09-01', 1_500_000, 'home'),
];

export const fixtureInput: AnalysisInput = {
  kind: 'monthly-picture',
  period: { lastMonths: 3 },
  included: { descriptions: false, transactions: false },
  builtOn: '2026-09-02',
  accounts: fixtureAccounts,
  transactions: fixtureTransactions,
  categories: fixtureCategories,
  sources: fixtureSources,
  limits: fixtureLimits,
  goals: fixtureGoals,
  rates: [{ currency: 'USD', rateMillionths: 41_500_000, obtainedAt: new Date(2026, 7, 30, 9, 0) }],
};

export function fixturePackage(): AnalysisPackage {
  return buildAnalysisPackage(fixtureInput) as AnalysisPackage;
}
