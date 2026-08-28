import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Goal } from '../domain/goals';
import { money } from '../domain/money';
import {
  deleteGoalConfirmation,
  goalAccountChoices,
  goalFromDraft,
  goalRows,
  targetAfterRelink,
} from './goals-section';

const jar = account({ id: 'jar', name: 'Подушка', kind: 'savings', currency: 'UAH' });
const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD банка', kind: 'savings', currency: 'USD' });
const ACCOUNTS: readonly Account[] = [jar, card, dollars];

const car: Goal = {
  id: 'g-car',
  name: 'Авто',
  target: money(20000000, 'UAH'),
  deadline: '2026-12-31',
  accountId: 'jar',
};

const draft = (over: Partial<Parameters<typeof goalFromDraft>[0]> = {}) => ({
  name: 'Авто',
  target: '200000',
  deadline: '2026-12-31',
  accountId: 'jar',
  ...over,
});

describe('goalFromDraft', () => {
  it('Scenario: A created ціль exists with its fields', () => {
    const created = goalFromDraft(draft(), { id: 'g-car', accounts: ACCOUNTS });

    expect(created).toEqual(car);
  });

  it('Scenario: An empty назва is rejected', () => {
    expect(() => goalFromDraft(draft({ name: '   ' }), { id: 'g1', accounts: ACCOUNTS })).toThrow(
      /назв/i,
    );
    expect(() => goalFromDraft(draft({ name: '' }), { id: 'g1', accounts: ACCOUNTS })).toThrow();
  });

  it('Scenario: A non-positive target is rejected', () => {
    expect(() => goalFromDraft(draft({ target: '0' }), { id: 'g1', accounts: ACCOUNTS })).toThrow();
    expect(() => goalFromDraft(draft({ target: '-5' }), { id: 'g1', accounts: ACCOUNTS })).toThrow();
    expect(() => goalFromDraft(draft({ target: '' }), { id: 'g1', accounts: ACCOUNTS })).toThrow();
  });

  it('A ціль without a рахунок, or with a дата that is not one, is refused', () => {
    expect(() =>
      goalFromDraft(draft({ accountId: undefined }), { id: 'g1', accounts: ACCOUNTS }),
    ).toThrow(/рахунк/i);
    expect(() =>
      goalFromDraft(draft({ accountId: 'ghost' }), { id: 'g1', accounts: ACCOUNTS }),
    ).toThrow();
    expect(() =>
      goalFromDraft(draft({ deadline: '31.12.2026' }), { id: 'g1', accounts: ACCOUNTS }),
    ).toThrow();
    expect(() =>
      goalFromDraft(draft({ deadline: '2026-02-31' }), { id: 'g1', accounts: ACCOUNTS }),
    ).toThrow();
  });

  it('The target is parsed in the linked рахунок’s currency, never in another', () => {
    const onDollars = goalFromDraft(draft({ accountId: 'usd', target: '5000.00' }), {
      id: 'g-usd',
      accounts: ACCOUNTS,
    });

    expect(onDollars.target).toEqual(money(500000, 'USD'));
  });

  it('Scenario: An edited target persists', () => {
    // Editing is the same write under the same id: the draft carries the new figure, nothing else.
    const edited = goalFromDraft(draft({ target: '250000' }), { id: 'g-car', accounts: ACCOUNTS });

    expect(edited).toEqual({ ...car, target: money(25000000, 'UAH') });
  });

  it('Scenario: Re-linking to another currency asks the target anew', () => {
    // The typed target is cleared when the currency changes …
    expect(targetAfterRelink('200000', jar, dollars)).toBe('');
    // … and kept when it does not.
    expect(targetAfterRelink('200000', jar, card)).toBe('200000');
    expect(targetAfterRelink('200000', undefined, jar)).toBe('200000');

    // …and what the owner types next is the ціль, in the new рахунок's currency, with no UAH left.
    const relinked = goalFromDraft(draft({ accountId: 'usd', target: '5000.00' }), {
      id: 'g-car',
      accounts: ACCOUNTS,
    });
    expect(relinked).toEqual({
      ...car,
      target: money(500000, 'USD'),
      accountId: 'usd',
    });
  });

  it('Scenario: Two цілі may share one рахунок', () => {
    const first = goalFromDraft(draft(), { id: 'g1', accounts: ACCOUNTS });
    const second = goalFromDraft(draft({ name: 'Відпустка', target: '50000', deadline: '2026-09-30' }), {
      id: 'g2',
      accounts: ACCOUNTS,
    });

    expect(first.accountId).toBe('jar');
    expect(second.accountId).toBe('jar');
    expect(goalRows([first, second], ACCOUNTS).map((row) => row.name)).toEqual(['Авто', 'Відпустка']);
  });
});

describe('goalRows', () => {
  it('Scenario: A created ціль appears in the list', () => {
    expect(goalRows([car], ACCOUNTS)).toEqual([
      {
        id: 'g-car',
        name: 'Авто',
        target: '200000,00 UAH',
        deadline: '2026-12-31',
        accountName: 'Подушка',
        accountArchived: false,
      },
    ]);
  });

  it('Scenario: An archived рахунок is not offered for a new ціль', () => {
    const archivedJar = account({ ...jar, archived: true });
    const accounts = [archivedJar, card, dollars];

    // Nothing is being edited, so the archived рахунок is simply absent.
    expect(goalAccountChoices(accounts, undefined).map((a) => a.id)).toEqual(['card', 'usd']);
    // A ціль already on it keeps it, both in the picker and in the list.
    expect(goalAccountChoices(accounts, 'jar').map((a) => a.id)).toEqual(['card', 'usd', 'jar']);
    expect(goalRows([car], accounts)[0]).toMatchObject({
      accountName: 'Подушка',
      accountArchived: true,
    });
  });

  it('A ціль whose рахунок row is gone shows the id rather than an empty gap', () => {
    expect(goalRows([car], [])[0]!.accountName).toBe('jar');
  });
});

describe('deleteGoalConfirmation', () => {
  it('Scenario: A deletion is confirmed first', () => {
    // There is a sentence to confirm, and it names the ціль being deleted — the screen has
    // something to put in front of the owner before anything is removed.
    expect(deleteGoalConfirmation('Авто')).toContain('«Авто»');
    expect(deleteGoalConfirmation('Авто').length).toBeGreaterThan(0);
  });

  it('Scenario: Deleting a ціль touches no money', () => {
    // And what it says is that the money stays: the ціль reads a рахунок, it never owns one.
    expect(deleteGoalConfirmation('Авто')).toContain('Рахунок');
    expect(deleteGoalConfirmation('Авто')).toContain('транзакції лишаться');
  });
});
