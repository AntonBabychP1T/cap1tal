import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { Category } from '../domain/category';
import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { monthSummaryOf, type MonthSummaryInput } from '../month-summary/summary';
import { ledgerBuilder, monthsFrom } from '../observations/test-fixtures';
import { monthSummaryRoute, monthSummaryScreen } from './month-summary-screen';

const TODAY = '2026-10-02';
const ACCOUNTS = [
  account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' }),
  account({ id: 'jar', name: 'Подушка', kind: 'savings', currency: 'UAH' }),
  account({ id: 'usd', name: 'USD', kind: 'spending', currency: 'USD' }),
];
const CATEGORIES: Category[] = [
  { id: 'food', name: 'Продукти', archived: false },
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'other', name: 'Інше', archived: false },
];
const NAMES = {
  categoryNames: new Map(CATEGORIES.map((c) => [c.id, c.name])),
  accountNames: new Map(ACCOUNTS.map((a) => [a.id, a.name])),
  now: new Date(2026, 9, 2, 12),
};
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const plain = (text: string | undefined) => (text ?? '').replace(NBSP, ' ');

/** March–August at 6 000 000 UAH, then a September with Продукти above typical and a дубль. */
function plainSeptember(): Transaction[] {
  const b = ledgerBuilder();
  const rows: Transaction[] = monthsFrom('2026-03', '2026-08').flatMap((m) => [
    b.expense(`${m}-05`, 'food', 1000000),
    b.expense(`${m}-06`, 'other', 5000000),
  ]);
  rows.push(
    b.expense('2026-09-05', 'food', 1380000),
    b.expense('2026-09-06', 'other', 5000000),
    b.expense('2026-09-12', 'cafe', 12500, { id: 'bank', description: 'Aroma Kava' }),
    b.expense('2026-09-13', 'cafe', 12500, { id: 'hand' }),
    b.transfer('2026-09-15', 'black', 'jar', 1000000),
  );
  return rows;
}

function screenOf(rows: readonly Transaction[], over: Partial<MonthSummaryInput> = {}) {
  const summary = monthSummaryOf({
    month: '2026-09',
    today: TODAY,
    transactions: rows,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    limits: [],
    goals: [{ id: 'g1', name: 'Подушка', target: money(10000000, 'UAH'), accountIds: ['jar'] }],
    waitingDrafts: 0,
    figures: new Map(),
    answers: [],
    ...over,
  });
  if (!summary) throw new Error('no підсумок');
  return monthSummaryScreen(summary, NAMES, TODAY);
}

const ACTIVE = new Set(['2026-08', '2026-09', '2026-10']);

describe('a month without a підсумок is said in words', () => {
  it('names the month in words with its year', () => {
    expect(monthSummaryRoute('2026-09', TODAY, ACTIVE)).toEqual({
      status: 'available',
      month: '2026-09',
      title: 'Підсумок вересня 2026',
    });
    expect(screenOf(plainSeptember()).title).toBe('Підсумок вересня 2026');
  });

  it('Scenario: The current month is not finished', () => {
    expect(monthSummaryRoute('2026-10', TODAY, ACTIVE)).toEqual({
      status: 'current',
      title: 'Підсумок жовтня 2026',
      sentence: 'Підсумок жовтня буде після 31 жовтня.',
    });
  });

  it('Scenario: A month with nothing in it', () => {
    expect(monthSummaryRoute('2026-07', TODAY, ACTIVE)).toMatchObject({
      status: 'empty',
      sentence: 'У липні нічого не записано — нема чого підсумовувати.',
    });
  });

  it('Scenario: A month that has not come yet', () => {
    expect(monthSummaryRoute('2026-12', TODAY, ACTIVE)).toMatchObject({
      status: 'future',
      sentence: 'Грудень 2026 ще не настав.',
    });
  });

  it('Scenario: Not a month at all', () => {
    for (const param of ['2026-13', 'вересень', '', undefined, '2026-9', '../etc']) {
      expect(() => monthSummaryRoute(param, TODAY, ACTIVE)).not.toThrow();
      expect(monthSummaryRoute(param, TODAY, ACTIVE)).toMatchObject({
        status: 'not-a-month',
        sentence: 'Такого місяця немає.',
      });
    }
  });
});

describe('the sections of a підсумок', () => {
  it('Scenario: A plain September', () => {
    const screen = screenOf(plainSeptember());
    expect(screen.sections.map((s) => s.title)).toEqual([
      'Витрачено',
      'Найбільше змінилися',
      'Спостереження',
      'Місячна картина',
      'Зміна статку',
      'Цілі й ліміти',
      'Що ще без відповіді',
      'Коригування',
      'AI-аналіз',
    ]);
    const section = (key: string) => screen.sections.find((s) => s.key === key)!;
    // One UAH reading in each section that reads per currency.
    for (const key of ['spent', 'changed', 'picture']) {
      expect(section(key).groups.map((g) => g.currency)).toEqual(['UAH']);
    }
    expect(section('observations').observations!.map((l) => l.kind)).toEqual([
      'possible-duplicate',
      'category-vs-typical',
    ]);
    expect(section('goals-limits').groups.flatMap((g) => g.rows.map((r) => [r.label, plain(r.value)]))).toEqual([
      ['Подушка', '+10 000,00 UAH'],
    ]);
    expect(section('corrections').empty).toBe('Коригувань не було.');
    // Every row is a control with a label a screen reader announces.
    for (const s of screen.sections) {
      for (const r of s.groups.flatMap((g) => g.rows)) expect(r.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  it('Scenario: Two currencies stay apart', () => {
    const b = ledgerBuilder();
    const rows = [
      ...plainSeptember(),
      b.expense('2026-08-05', 'food', 9000, { currency: 'USD', accountId: 'usd' }),
      b.expense('2026-09-05', 'food', 12000, { currency: 'USD', accountId: 'usd' }),
    ];
    const screen = screenOf(rows);
    for (const key of ['spent', 'changed', 'picture']) {
      const groups = screen.sections.find((s) => s.key === key)!.groups;
      expect(groups.map((g) => g.currency)).toEqual(['UAH', 'USD']);
      // No reading adds the two: every сума of a group is in that group's own currency.
      for (const group of groups) {
        for (const r of group.rows) {
          const codes = plain(r.value).match(/[A-Z]{3}/g) ?? [];
          expect(codes.every((code) => code === group.currency), `${key} ${r.label}`).toBe(true);
        }
      }
    }
  });

  it('Scenario: A changed категорія opens its month', () => {
    const changed = screenOf(plainSeptember()).sections.find((s) => s.key === 'changed')!;
    const food = changed.groups[0]!.rows.find((r) => r.label === 'Продукти')!;
    expect(food.route).toBe('/category/2026-09/food');
    expect(plain(food.value)).toBe('+3 800,00 UAH (+38 %)');
  });

  it('Scenario: Unanswered records open narrowed', () => {
    const b = ledgerBuilder();
    const rows = [...plainSeptember(), b.expense('2026-09-20', 'uncategorised', 45000)];
    const unanswered = screenOf(rows).sections.find((s) => s.key === 'unanswered')!;
    const [first] = unanswered.groups[0]!.rows;
    expect(first).toMatchObject({ label: '«Без категорії»', route: '/transactions?month=2026-09&only=uncategorised' });
    // A clean month leads to the month's транзакції unnarrowed.
    const clean = screenOf(plainSeptember()).sections.find((s) => s.key === 'unanswered')!;
    expect(clean.groups[0]!.rows[0]).toMatchObject({ label: 'Вересень — чистий місяць', route: '/transactions?month=2026-09' });
  });

  it('marks a частка of two per cent in words and opens the month’s коригування', () => {
    const b = ledgerBuilder();
    const rows = [...plainSeptember(), b.correction('2026-09-30', -200000)];
    const [correction] = screenOf(rows).sections.find((s) => s.key === 'corrections')!.groups[0]!.rows;
    expect(correction!.mark).toMatch(/2 % або більше/);
    expect(correction!.route).toBe('/category/2026-09/correction');
  });

  it('Scenario: September goes to AI-аналіз as one month', () => {
    const ai = screenOf(plainSeptember()).sections.at(-1)!;
    expect(ai.groups[0]!.rows[0]).toMatchObject({ label: 'AI-аналіз вересня', route: '/ai-analysis?month=2026-09' });
    // The screen builds no пакет and prepares no file: neither its model nor its route reaches them.
    for (const path of ['./month-summary-screen.ts', '../app/month-summary/[month].tsx']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source, path).not.toMatch(/analysis\/package|analysis\/document|analysis-share|buildAnalysisPackage/);
    }
  });
});
