import { describe, expect, it } from 'vitest';

import { classifyTransfer, type Account } from './account';
import { money } from './money';

const card: Account = { id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' };
const otherCard: Account = { id: 'other-card', name: 'mono white', kind: 'spending', currency: 'UAH' };
const jar: Account = { id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' };
const bonds: Account = { id: 'bonds', name: 'military bonds', kind: 'investment', currency: 'UAH' };
const borrower: Account = { id: 'borrower', name: 'борг: Петро', kind: 'debt', currency: 'UAH' };
const wallet: Account = { id: 'wallet', name: 'гаманець', kind: 'cash', currency: 'UAH' };

const legs = { left: money(100000, 'UAH'), arrived: money(100000, 'UAH') };

describe('account', () => {
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
