import { describe, expect, it } from 'vitest';

import { compareReceiptToTransaction, identityKey, receiptIdentity } from './fiscal-receipt';
import { money } from './money';
import { isoDate, type Correction, type Expense, type Refund, type Transfer } from './transaction';

/**
 * The one rule the domain owns about a фіскальний чек. Everything here is a value in and a value
 * out: no storage, no parser, no screen — and, deliberately, no number the app computes anywhere
 * else is imported, because a чек changes none of them.
 */

const UAH = 'UAH';

function expense(amount: number, over: Partial<Expense> = {}): Expense {
  return {
    type: 'expense',
    id: 'tx-1',
    date: isoDate('2026-08-31'),
    accountId: 'acc-1',
    amount: money(amount, UAH),
    categoryId: 'groceries',
    ...over,
  };
}

function refundOf(amount: number, over: Partial<Refund> = {}): Refund {
  return {
    type: 'refund',
    id: 'tx-2',
    date: isoDate('2026-08-31'),
    accountId: 'acc-1',
    amount: money(amount, UAH),
    categoryId: 'groceries',
    ...over,
  };
}

function receipt(over: Partial<Parameters<typeof compareReceiptToTransaction>[0]['receipt']> = {}) {
  return {
    total: money(74230, UAH),
    kind: 'sale' as const,
    issuedDate: isoDate('2026-08-31'),
    ...over,
  };
}

describe('the identity of a чек', () => {
  it('is the реєстратор, the number and the date and nothing else', () => {
    const identity = receiptIdentity({
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: isoDate('2026-04-29'),
      // Deliberately passed and deliberately ignored: two чеки differing only in сума are one чек.
      ...({ total: money(1, UAH), transactionId: 'tx-1' } as object),
    });

    expect(identity).toEqual({
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: '2026-04-29',
    });
    expect(identityKey(identity)).toBe('3000909908/696582/2026-04-29');
  });

  it('tells two чеки of the same number on different days apart', () => {
    const first = receiptIdentity({
      registrarNumber: '3000909908',
      fiscalNumber: '45',
      issuedDate: isoDate('2026-04-29'),
    });
    const second = receiptIdentity({
      registrarNumber: '3000909908',
      fiscalNumber: '45',
      issuedDate: isoDate('2026-04-30'),
    });

    expect(identityKey(first)).not.toBe(identityKey(second));
  });
});

describe('the чек total against the транзакція сума', () => {
  it('Equal amounts attach without a warning', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(74230, UAH) }),
      transaction: expense(74230),
    });

    expect(comparison.amounts).toBe('match');
    expect(comparison.dateDiffersBy).toBeUndefined();
    expect(comparison.kindDiffers).toBeUndefined();
    expect(comparison.sellerHint).toBeUndefined();
  });

  it('A different amount warns and waits', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(74230, UAH) }),
      transaction: expense(70000),
    });

    expect(comparison.amounts).toBe('mismatch');
    // Both figures come back named, so the screen states them rather than re-deriving either.
    expect(comparison.receiptTotal).toEqual(money(74230, UAH));
    expect(comparison.transactionAmount).toEqual(money(70000, UAH));
  });

  it('applies no tolerance at all — one kopiyka is a mismatch', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(74230, UAH) }),
      transaction: expense(74231),
    });

    expect(comparison.amounts).toBe('mismatch');
  });

  it('A foreign-currency транзакція warns', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(9999, UAH) }),
      transaction: expense(9999, { amount: money(9999, 'USD') }),
    });

    expect(comparison.amounts).toBe('mismatch');
    expect(comparison.receiptTotal).toEqual(money(9999, 'UAH'));
    expect(comparison.transactionAmount).toEqual(money(9999, 'USD'));
  });

  it('A date difference is information only', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(74230, UAH), issuedDate: isoDate('2026-08-30') }),
      transaction: expense(74230, { date: isoDate('2026-08-31') }),
    });

    expect(comparison.amounts).toBe('match');
    expect(comparison.dateDiffersBy).toBe(1);
  });

  it('measures the date difference in whole days in either direction', () => {
    const later = compareReceiptToTransaction({
      receipt: receipt({ issuedDate: isoDate('2026-09-03') }),
      transaction: expense(74230, { date: isoDate('2026-08-31') }),
    });

    expect(later.dateDiffersBy).toBe(3);
  });

  it('A повернення matches a return чек by absolute amount', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(8000, UAH), kind: 'return' }),
      transaction: refundOf(8000),
    });

    expect(comparison.amounts).toBe('match');
    expect(comparison.kindDiffers).toBeUndefined();
  });

  it('A return чек on a витрата is information only', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(8000, UAH), kind: 'return' }),
      transaction: expense(8000),
    });

    expect(comparison.amounts).toBe('match');
    expect(comparison.kindDiffers).toBe(true);
  });

  it('reports a sale чек on a повернення the same way', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(8000, UAH), kind: 'sale' }),
      transaction: refundOf(8000),
    });

    expect(comparison.amounts).toBe('match');
    expect(comparison.kindDiffers).toBe(true);
  });

  it('ignores the sign of a коригування', () => {
    const correction: Correction = {
      type: 'correction',
      id: 'tx-3',
      date: isoDate('2026-08-31'),
      accountId: 'acc-1',
      amount: money(-8000, UAH),
    };

    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(8000, UAH) }),
      transaction: correction,
    });

    expect(comparison.amounts).toBe('match');
    // A коригування is neither a витрата nor a повернення, so nothing is claimed about its kind.
    expect(comparison.kindDiffers).toBeUndefined();
  });

  it('never matches a переказ, which has no single сума', () => {
    const transfer: Transfer = {
      type: 'transfer',
      id: 'tx-4',
      date: isoDate('2026-08-31'),
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      left: money(74230, UAH),
      arrived: money(74230, UAH),
    };

    const comparison = compareReceiptToTransaction({
      receipt: receipt({ total: money(74230, UAH) }),
      transaction: transfer,
    });

    expect(comparison.amounts).toBe('mismatch');
  });
});

describe('the seller beside the опис', () => {
  it('names the seller when the опис does not say it', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ sellerName: 'ТОВ "ФОЗЗІ-ФУД"' }),
      transaction: expense(74230, { description: 'АТБ' }),
    });

    expect(comparison.sellerHint).toBe('ТОВ "ФОЗЗІ-ФУД"');
  });

  it('stays quiet when the опис already says it', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ sellerName: 'СІЛЬПО' }),
      transaction: expense(74230, { description: 'Оплата СІЛЬПО 33' }),
    });

    expect(comparison.sellerHint).toBeUndefined();
  });

  it('names the seller when the транзакція has no опис at all', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt({ sellerName: 'СІЛЬПО' }),
      transaction: expense(74230),
    });

    expect(comparison.sellerHint).toBe('СІЛЬПО');
  });

  it('says nothing when the чек names no seller', () => {
    const comparison = compareReceiptToTransaction({
      receipt: receipt(),
      transaction: expense(74230, { description: 'АТБ' }),
    });

    expect(comparison.sellerHint).toBeUndefined();
  });
});

/**
 * The point of the whole file, asserted on the source rather than trusted: the domain's чек knows
 * about money and транзакції and about nothing that computes a total. An import of
 * `monthly-picture`, `account`, `limits`, `goals` or `reports` here would be the first step
 * towards a чек that moves a number, which the spec forbids outright.
 */
it('the чек reaches no number the app computes', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./fiscal-receipt.ts', import.meta.url), 'utf8');
  const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

  expect(imported.toSorted()).toEqual(['./money', './transaction']);
});
