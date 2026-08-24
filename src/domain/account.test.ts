import { describe, expect, it } from 'vitest';

import { account, activeAccounts, classifyTransfer, computeBalance } from './account';
import { money } from './money';
import {
  CORRECTION_CATEGORY_ID,
  expenseByDefault,
  refund,
  transfer,
  type Correction,
  type Income,
} from './transaction';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const otherCard = account({
  id: 'other-card',
  name: 'mono white',
  kind: 'spending',
  currency: 'UAH',
});
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const bonds = account({ id: 'bonds', name: 'military bonds', kind: 'investment', currency: 'UAH' });
const borrower = account({ id: 'borrower', name: 'борг: Петро', kind: 'debt', currency: 'UAH' });
const wallet = account({ id: 'wallet', name: 'гаманець', kind: 'cash', currency: 'UAH' });

const legs = { left: money(100000, 'UAH'), arrived: money(100000, 'UAH') };

describe('account', () => {
  it('Scenario: The opening balance defaults to zero', () => {
    const fresh = account({ id: 'fresh', name: 'нова картка', kind: 'spending', currency: 'UAH' });
    expect(fresh.openingBalance).toEqual(money(0, 'UAH'));
    expect(computeBalance(fresh, [])).toEqual(money(0, 'UAH'));
  });

  it('A new account is unarchived', () => {
    const fresh = account({ id: 'fresh', name: 'нова картка', kind: 'spending', currency: 'UAH' });
    expect(fresh.archived).toBe(false);
  });

  it('Scenario: A mismatched opening-balance currency is rejected', () => {
    expect(() =>
      account({
        id: 'card',
        name: 'mono black',
        kind: 'spending',
        currency: 'UAH',
        openingBalance: money(10000, 'USD'),
      }),
    ).toThrow();
  });

  it('An opening balance in the account currency is kept', () => {
    const opened = account({
      id: 'opened',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    expect(opened.openingBalance).toEqual(money(100000, 'UAH'));
  });

  it('A jar is a savings account in UAH', () => {
    expect(jar.kind).toBe('savings');
    expect(jar.currency).toBe('UAH');
  });

  it('Jar top-up is saved, not invested', () => {
    expect(classifyTransfer({ from: card, to: jar, ...legs })).toEqual([
      { bucket: 'saved', amount: money(100000, 'UAH') },
    ]);
  });

  it('Transfer to an investment account is invested', () => {
    expect(classifyTransfer({ from: card, to: bonds, ...legs })).toEqual([
      { bucket: 'invested', amount: money(100000, 'UAH') },
    ]);
  });

  it('Lending is lent', () => {
    expect(classifyTransfer({ from: card, to: borrower, ...legs })).toEqual([
      { bucket: 'lent', amount: money(100000, 'UAH') },
    ]);
  });

  it('Withdrawing from a jar subtracts from saved', () => {
    expect(classifyTransfer({ from: jar, to: card, ...legs })).toEqual([
      { bucket: 'saved', amount: money(-100000, 'UAH') },
    ]);
  });

  it('ATM withdrawal is only a move', () => {
    expect(classifyTransfer({ from: card, to: wallet, ...legs })).toEqual([]);
  });

  it('Card to card is only a move', () => {
    expect(classifyTransfer({ from: card, to: otherCard, ...legs })).toEqual([]);
  });
});

const income = (accountId: string, amount: number, currency: string, sourceId: string): Income => ({
  type: 'income',
  id: `in-${accountId}-${amount}`,
  date: '2026-03-05',
  accountId,
  amount: money(amount, currency),
  sourceId,
});

const correction = (accountId: string, amount: number, currency: string): Correction => ({
  type: 'correction',
  id: `corr-${accountId}-${amount}`,
  date: '2026-03-28',
  accountId,
  amount: money(amount, currency),
});

describe('computeBalance', () => {
  it('Scenario: Expenses, income and refunds move the balance', () => {
    const opened = account({
      id: 'card',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    const transactions = [
      income('card', 50000, 'UAH', 'salary'),
      expenseByDefault({
        id: 'e1',
        date: '2026-03-10',
        accountId: 'card',
        amount: money(30000, 'UAH'),
        categoryId: 'food',
      }),
      refund({
        id: 'r1',
        date: '2026-03-12',
        accountId: 'card',
        amount: money(10000, 'UAH'),
        categoryId: 'clothes',
      }),
    ];
    expect(computeBalance(opened, transactions)).toEqual(money(130000, 'UAH'));
  });

  it('Scenario: A correction moves the balance by its signed amount', () => {
    const opened = account({
      id: 'wallet',
      name: 'гаманець',
      kind: 'cash',
      currency: 'UAH',
      openingBalance: money(50000, 'UAH'),
    });
    const negative = correction('wallet', -3000, 'UAH');
    expect(negative.amount).toEqual(money(-3000, 'UAH'));
    expect(CORRECTION_CATEGORY_ID).toBe('correction');
    expect(computeBalance(opened, [negative])).toEqual(money(47000, 'UAH'));
  });

  it('Scenario: A cross-currency transfer moves both balances in their own currencies', () => {
    const uahCard = account({
      id: 'card',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(500000, 'UAH'),
    });
    const usdAccount = account({
      id: 'usd',
      name: 'долари',
      kind: 'savings',
      currency: 'USD',
      openingBalance: money(2000, 'USD'),
    });
    const t = transfer({
      id: 't1',
      date: '2026-03-15',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    expect(computeBalance(uahCard, [t])).toEqual(money(90000, 'UAH'));
    expect(computeBalance(usdAccount, [t])).toEqual(money(12000, 'USD'));
  });

  it('Scenario: A foreign-currency amount on the account is rejected', () => {
    const uahCard = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
    const foreign = expenseByDefault({
      id: 'e2',
      date: '2026-03-11',
      accountId: 'card',
      amount: money(10000, 'USD'),
      categoryId: 'food',
    });
    expect(() => computeBalance(uahCard, [foreign])).toThrow();
  });

  it('Transactions of other accounts do not move the balance', () => {
    const uahCard = account({
      id: 'card',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    const elsewhere = expenseByDefault({
      id: 'e3',
      date: '2026-03-11',
      accountId: 'other',
      amount: money(10000, 'UAH'),
      categoryId: 'food',
    });
    const between = transfer({
      id: 't2',
      date: '2026-03-16',
      fromAccountId: 'other',
      toAccountId: 'third',
      left: money(5000, 'UAH'),
      arrived: money(5000, 'UAH'),
    });
    expect(computeBalance(uahCard, [elsewhere, between])).toEqual(money(100000, 'UAH'));
  });
});

describe('activeAccounts', () => {
  const archivedJar = account({
    id: 'old-jar',
    name: 'стара банка',
    kind: 'savings',
    currency: 'UAH',
    archived: true,
  });

  it('Scenario: An archived account is not offered for new transactions', () => {
    expect(activeAccounts([card, archivedJar])).toEqual([card]);
  });

  it('Scenario: Editing pickers also offer only unarchived accounts', () => {
    // One list serves recording, editing and retyping, so an archived account is offered as a
    // destination nowhere; the transactions it already carries are unaffected.
    const offered = activeAccounts([card, archivedJar, jar]);
    expect(offered.map((a) => a.id)).toEqual(['card', 'jar']);
    const itsOwnTransfer = transfer({
      id: 't-old',
      date: '2026-03-15',
      fromAccountId: 'card',
      toAccountId: 'old-jar',
      ...legs,
    });
    expect(itsOwnTransfer.toAccountId).toBe('old-jar');
    expect(computeBalance(archivedJar, [itsOwnTransfer])).toEqual(money(100000, 'UAH'));
  });

  it('Scenario: Unarchiving restores the account', () => {
    const restored = account({ ...archivedJar, archived: false });
    expect(activeAccounts([card, restored]).map((a) => a.id)).toEqual(['card', 'old-jar']);
  });
});
