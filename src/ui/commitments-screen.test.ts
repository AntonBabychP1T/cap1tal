import { describe, expect, it } from 'vitest';

import { NO_COMMITMENT_FACTS, type Commitment } from '../domain/commitments';
import { money } from '../domain/money';
import { COMMITMENTS_EMPTY, MISSED_COMMITMENT_DEBIT, NEW_COMMITMENT, commitmentList, formatPlanMoney } from './commitments-screen';

const NBSP = ' ';
const today = new Date(2026, 9, 2, 12);

const rent: Commitment = {
  id: 'c-rent',
  name: 'Оренда',
  amount: 1_500_000,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-10',
  debitAccountId: 'black',
  recordedAt: 1,
};
const internet: Commitment = { ...rent, id: 'c-internet', name: 'Інтернет', amount: 30_000, firstDue: '2026-10-05', recordedAt: 2 };

describe('commitments-screen — the list', () => {
  it('Scenario: The nearest платіж leads', () => {
    const list = commitmentList([rent, internet], NO_COMMITMENT_FACTS, today);
    expect(list.active.map((r) => r.name)).toEqual(['Інтернет', 'Оренда']);
    expect(list.active[1]).toMatchObject({
      name: 'Оренда',
      amount: `15${NBSP}000,00${NBSP}₴`,
      periodicity: 'щомісяця',
      next: '10 жовт.',
    });
    expect(list.empty).toBeUndefined();
  });

  it('Scenario: A missed debit is visible from the list', () => {
    const list = commitmentList([rent], NO_COMMITMENT_FACTS, new Date(2026, 9, 20, 12));
    expect(list.active[0]).toMatchObject({ name: 'Оренда', missed: MISSED_COMMITMENT_DEBIT, next: '10 жовт.' });
    expect(MISSED_COMMITMENT_DEBIT).toBe('Списання не знайдено');
  });

  it('Scenario: Stopped ones are set apart', () => {
    const netflix: Commitment = { ...rent, id: 'c-netflix', name: 'Netflix', amount: 29_900, firstDue: '2026-09-15', stoppedOn: '2026-10-01' };
    const list = commitmentList([netflix, internet], NO_COMMITMENT_FACTS, today);
    expect(list.active.map((r) => r.name)).toEqual(['Інтернет']);
    expect(list.stopped).toEqual([
      expect.objectContaining({ name: 'Netflix', stopped: 'припинено 1 жовт.' }),
    ]);
  });

  it('Scenario: An empty screen explains itself', () => {
    const list = commitmentList([], NO_COMMITMENT_FACTS, today);
    expect(list).toEqual({ active: [], stopped: [], empty: COMMITMENTS_EMPTY });
    expect(COMMITMENTS_EMPTY.split('. ').length).toBe(1);
    expect(NEW_COMMITMENT).toBe("Нове зобов'язання");
  });

  it('skips past a платіж marked in advance to the next open one', () => {
    const marked = {
      ...NO_COMMITMENT_FACTS,
      marks: [{ commitmentId: internet.id, number: 1, kind: 'skipped' as const }],
    };
    expect(commitmentList([internet], marked, today).active[0]?.next).toBe('5 лист.');
  });

  it('shows a USD сума with its code', () => {
    expect(formatPlanMoney(money(2_000, 'USD'))).toBe('20,00 USD');
    expect(formatPlanMoney(money(30_000, 'UAH'))).toBe(`300,00${NBSP}₴`);
  });
});
