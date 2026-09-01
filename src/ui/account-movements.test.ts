import { describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { accountMovements, reconcileTyped } from './account-movements';

const wallet = account({
  id: 'wallet',
  name: 'гаманець',
  kind: 'cash',
  currency: 'UAH',
  openingBalance: money(50000, 'UAH'),
});
const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

const expense: Transaction = {
  type: 'expense',
  id: 'e1',
  date: '2026-03-10',
  accountId: 'wallet',
  amount: money(12000, 'UAH'),
  categoryId: 'groceries',
};

const arriving: Transaction = {
  type: 'transfer',
  id: 't1',
  date: '2026-03-12',
  fromAccountId: 'card',
  toAccountId: 'wallet',
  left: money(30000, 'UAH'),
  arrived: money(30000, 'UAH'),
};

describe('accountMovements', () => {
  it('Scenario: Both legs of a переказ belong to the рахунок', () => {
    const movements = accountMovements({
      account: wallet,
      transactions: [expense, arriving],
    });

    expect(movements.transactions.map((t) => t.id)).toEqual(['t1', 'e1']);
    // 500,00 opening − 120,00 spent + 300,00 arrived.
    expect(movements.balance).toBe('680,00 UAH');
    expect(movements.computed).toEqual(money(68000, 'UAH'));
  });

  it('A leaving leg belongs to the рахунок it left', () => {
    const movements = accountMovements({ account: card, transactions: [arriving] });

    expect(movements.transactions.map((t) => t.id)).toEqual(['t1']);
    expect(movements.balance).toBe('−300,00 UAH');
  });

  it('Scenario: A рахунок with no history says so', () => {
    const movements = accountMovements({ account: wallet, transactions: [] });

    expect(movements.transactions).toEqual([]);
    expect(movements.emptyMessage).toBe('На цьому рахунку ще нічого не записано.');
    // The розрахунковий баланс is still shown: an opening balance is money too.
    expect(movements.balance).toBe('500,00 UAH');
  });

  it('History leaves no empty message', () => {
    expect(accountMovements({ account: wallet, transactions: [expense] }).emptyMessage).toBeNull();
  });

  it('The рахунок is named as the owner named it', () => {
    expect(accountMovements({ account: wallet, transactions: [] }).name).toBe('гаманець');
  });

  it('Newest first, whatever order storage returned', () => {
    const older: Transaction = { ...expense, id: 'e0', date: '2026-02-01' };
    const sameDay: Transaction = { ...expense, id: 'e9', date: '2026-03-10' };

    const movements = accountMovements({
      account: wallet,
      transactions: [older, expense, arriving, sameDay],
    });

    expect(movements.transactions.map((t) => t.id)).toEqual(['t1', 'e9', 'e1', 'e0']);
  });

  it('The баланс банку is shown when a link feeds one', () => {
    const movements = accountMovements({
      account: wallet,
      transactions: [expense],
      bankBalance: money(38000, 'UAH'),
    });

    expect(movements.bankBalance).toBe('380,00 UAH');
  });

  it('No link, no баланс банку', () => {
    expect(accountMovements({ account: wallet, transactions: [] }).bankBalance).toBeUndefined();
  });

  it('A bank figure in another currency is ignored, not shown', () => {
    const movements = accountMovements({
      account: wallet,
      transactions: [],
      bankBalance: money(38000, 'USD'),
    });

    expect(movements.bankBalance).toBeUndefined();
  });

  it('Nothing given is changed: the input list is not reordered in place', () => {
    const given = [expense, arriving];

    accountMovements({ account: wallet, transactions: given });

    expect(given.map((t) => t.id)).toEqual(['e1', 't1']);
  });
});

describe('reconcileTyped', () => {
  const cash = account({ id: 'cash', name: 'гаманець', kind: 'cash', currency: 'UAH' });
  const newId = () => 'c1';

  it('Scenario: Cash is brought into line with a recount', () => {
    const answer = reconcileTyped({
      account: cash,
      computed: money(47000, 'UAH'),
      typed: '450,00',
      date: '2026-09-01',
      newId,
    });

    expect(answer).toEqual({
      kind: 'correction',
      correction: {
        type: 'correction',
        id: 'c1',
        date: '2026-09-01',
        accountId: 'cash',
        amount: money(-2000, 'UAH'),
      },
      confirmation: expect.stringContaining('−20,00 UAH'),
    });
    if (answer.kind !== 'correction') return;
    // Applying it makes the розрахунковий баланс exactly what was counted.
    const counted = account({ ...cash, openingBalance: money(47000, 'UAH') });
    expect(computeBalance(counted, [answer.correction])).toEqual(money(45000, 'UAH'));
  });

  it('Scenario: The difference is named before it is written', () => {
    const answer = reconcileTyped({
      account: cash,
      computed: money(47000, 'UAH'),
      typed: '500,00',
      date: '2026-09-01',
      newId,
    });

    expect(answer.kind).toBe('correction');
    if (answer.kind !== 'correction') return;
    expect(answer.correction.amount).toEqual(money(3000, 'UAH'));
    // The sign is written out: "+30,00" is thirty more, not thirty.
    expect(answer.confirmation).toContain('+30,00 UAH');
    expect(answer.confirmation).toContain('гаманець');
    expect(answer.confirmation).toContain('470,00 UAH');
    expect(answer.confirmation).toContain('500,00 UAH');
    // Nothing is stored by asking: the коригування is a value the caller may still drop.
  });

  it('Scenario: An equal фактичний залишок creates nothing', () => {
    const answer = reconcileTyped({
      account: cash,
      computed: money(47000, 'UAH'),
      typed: '470,00',
      date: '2026-09-01',
      newId,
    });

    expect(answer.kind).toBe('agree');
    if (answer.kind !== 'agree') return;
    expect(answer.message).toContain('коригувати нічого');
  });

  it('Scenario: A rejected entry writes nothing', () => {
    for (const typed of ['', 'abc']) {
      expect(() =>
        reconcileTyped({
          account: cash,
          computed: money(47000, 'UAH'),
          typed,
          date: '2026-09-01',
          newId,
        }),
      ).toThrow();
    }
  });

  it('A recount to zero is a recount, not an empty field', () => {
    const answer = reconcileTyped({
      account: cash,
      computed: money(47000, 'UAH'),
      typed: '0',
      date: '2026-09-01',
      newId,
    });

    expect(answer.kind).toBe('correction');
    if (answer.kind !== 'correction') return;
    expect(answer.correction.amount).toEqual(money(-47000, 'UAH'));
  });

  it('The фактичний залишок is read in the рахунок"s own currency', () => {
    const dollars = account({ id: 'usd', name: 'долари', kind: 'cash', currency: 'USD' });

    const answer = reconcileTyped({
      account: dollars,
      computed: money(20000, 'USD'),
      typed: '150,00',
      date: '2026-09-01',
      newId,
    });

    expect(answer.kind).toBe('correction');
    if (answer.kind !== 'correction') return;
    expect(answer.correction.amount).toEqual(money(-5000, 'USD'));
  });
});
