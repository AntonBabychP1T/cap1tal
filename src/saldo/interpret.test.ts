import { describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { monthlyPicture } from '../domain/monthly-picture';
import { FEES_CATEGORY_ID, type Transaction } from '../domain/transaction';
import { interpret, type ImportPlan } from './interpret';
import {
  accountKey,
  NEW_CATEGORY_PREFIX,
  debtAccountId,
  NEW_SOURCE_PREFIX,
  survey,
} from './survey';
import {
  existingAccount,
  existingState,
  leg,
  pair,
  parseRows,
  planFrom,
  type FixtureRow,
} from './test-fixtures';

/** The plan's транзакції, unwrapped — most assertions are about the money, not the bookkeeping. */
const moves = (plan: ImportPlan): Transaction[] => plan.transactions.map((t) => t.transaction);

const accountNamed = (plan: ImportPlan, name: string) => {
  const found = plan.accounts.find((a) => a.name === name);
  if (!found) {
    throw new Error(`the plan holds no рахунок "${name}" (it holds ${plan.accounts.map((a) => a.name).join(', ')})`);
  }
  return found;
};

/** An expense from `account` against a counterparty leg — the export's commonest two-leg shape. */
const spend = (input: {
  id: string;
  account?: string;
  amount: string;
  other: string;
  otherType?: string;
  otherAmount?: string;
  otherCurrency?: string;
  datetime?: string;
}): FixtureRow[] =>
  pair({
    id: input.id,
    account: input.account ?? 'Monobank UAH, Black',
    journalType: 'CREDIT',
    amount: input.amount,
    other: input.other,
    otherType: input.otherType ?? 'EXPENSES',
    ...(input.otherAmount ? { otherAmount: input.otherAmount } : {}),
    ...(input.otherCurrency ? { otherCurrency: input.otherCurrency } : {}),
    ...(input.datetime ? { datetime: input.datetime } : {}),
  });

// ---------------------------------------------------------------- initial balances

describe('interpret — початковий залишок', () => {
  it('Scenario: An initial balance becomes the opening balance', () => {
    const plan = planFrom(
      pair({
        id: '41596243',
        account: 'mono black',
        journalType: 'DEBIT',
        amount: '123.00',
        other: 'Initial balance',
        otherType: 'EQUITY',
      }),
    );
    expect(plan.transactions).toEqual([]);
    expect(accountNamed(plan, 'mono black').openingBalance).toEqual({
      amount: 12300,
      currency: 'UAH',
    });
  });

  it('Scenario: Merged accounts sum their initial balances', () => {
    const rows = [
      ...pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '123.00', other: 'Initial balance', otherType: 'EQUITY' }),
      ...pair({ id: '2', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '50.00', other: 'Initial balance', otherType: 'EQUITY' }),
    ];
    const plan = planFrom(rows, {
      decisions: {
        accountRedirects: {
          [accountKey('mono black', 'UAH')]: {
            to: 'entry',
            key: accountKey('Monobank UAH, Black', 'UAH'),
          },
        },
      },
    });
    expect(plan.accounts).toHaveLength(1);
    expect(accountNamed(plan, 'Monobank UAH, Black').openingBalance).toEqual({
      amount: 17300,
      currency: 'UAH',
    });
  });

  it('Scenario: Mapping onto an existing рахунок proposes replacing its opening balance', () => {
    const plan = planFrom(
      pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '123.00', other: 'Initial balance', otherType: 'EQUITY' }),
      {
        decisions: {
          accountRedirects: {
            [accountKey('mono black', 'UAH')]: { to: 'account', accountId: 'black' },
          },
        },
        existing: {
          ...existingState(),
          accounts: [existingAccount({ id: 'black', name: 'Чорна', openingAmount: 5000 })],
        },
      },
    );
    const рахунок = accountNamed(plan, 'Чорна');
    expect(рахунок.openingBalance).toEqual({ amount: 12300, currency: 'UAH' });
    expect(рахунок.replacedOpeningBalance).toEqual({ amount: 5000, currency: 'UAH' });
    expect(рахунок.existingId).toBe('black');
  });

  it('subtracts an opening entry that credits the рахунок', () => {
    const plan = planFrom(
      pair({ id: '1', account: 'сенс', journalType: 'CREDIT', amount: '10.00', other: 'Initial balance', otherType: 'EQUITY' }),
    );
    expect(accountNamed(plan, 'сенс').openingBalance).toEqual({ amount: -1000, currency: 'UAH' });
  });
});

// ---------------------------------------------------------------- перекази

describe('interpret — перекази between two real рахунки', () => {
  it('Scenario: A same-currency move is one переказ', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'Monobank UAH, White',
        journalType: 'CREDIT',
        amount: '5000.00',
        other: 'Monobank UAH, Black',
        otherType: 'BANK_ACCOUNTS',
      }),
    );
    const white = accountNamed(plan, 'Monobank UAH, White');
    const black = accountNamed(plan, 'Monobank UAH, Black');
    expect(moves(plan)).toEqual([
      {
        type: 'transfer',
        id: 'saldo:1',
        date: '2024-10-27',
        fromAccountId: white.id,
        toAccountId: black.id,
        left: { amount: 500000, currency: 'UAH' },
        arrived: { amount: 500000, currency: 'UAH' },
      },
    ]);
  });

  it('Scenario: A cross-currency move carries two amounts and no rate', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'Monobank UAH, Black',
        journalType: 'CREDIT',
        amount: '4000.00',
        currency: 'UAH',
        other: 'binance usdt',
        otherType: 'OTHER_ASSETS',
        otherAmount: '100.00',
        otherCurrency: 'USD',
      }),
    );
    const переказ = moves(plan)[0];
    expect(переказ).toMatchObject({
      type: 'transfer',
      left: { amount: 400000, currency: 'UAH' },
      arrived: { amount: 10000, currency: 'USD' },
    });
    expect(Object.keys(переказ ?? {})).not.toContain('rate');
    expect(accountNamed(plan, 'binance usdt').kind).toBe('investment');
  });

  it('Scenario: A move whose two ends were merged into one рахунок is dropped', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'mono black',
        journalType: 'CREDIT',
        amount: '500.00',
        other: 'Monobank UAH, Black',
        otherType: 'BANK_ACCOUNTS',
      }),
      {
        decisions: {
          accountRedirects: {
            [accountKey('mono black', 'UAH')]: {
              to: 'entry',
              key: accountKey('Monobank UAH, Black', 'UAH'),
            },
          },
        },
      },
    );
    expect(plan.transactions).toEqual([]);
    const dropped = plan.unexplained.filter((row) => row.reason === 'merged-account-move');
    expect(dropped).toHaveLength(2);
    // The credit and the debit cancel, so the рахунок is not one kopiyka out of balance.
    expect(dropped.reduce((sum, row) => sum + (row.effect?.amount ?? 0), 0)).toBe(0);
  });
});

// ---------------------------------------------------------------- витрати and повернення

describe('interpret — витрати, повернення', () => {
  it('Scenario: A plain expense keeps its category and amount', () => {
    const plan = planFrom(spend({ id: '1', amount: '850.84', other: 'Groceries' }), {
      existing: {
        ...existingState(),
        categories: [{ id: 'groceries', name: 'Groceries', archived: false }],
      },
    });
    expect(moves(plan)[0]).toMatchObject({
      type: 'expense',
      accountId: accountNamed(plan, 'Monobank UAH, Black').id,
      amount: { amount: 85084, currency: 'UAH' },
      categoryId: 'groceries',
    });
  });

  it('proposes creating a category no existing row matches', () => {
    const plan = planFrom(spend({ id: '1', amount: '10.00', other: 'булка' }));
    expect(moves(plan)[0]).toMatchObject({ categoryId: `${NEW_CATEGORY_PREFIX}булка` });
    expect(plan.categories.map((c) => c.saldoName)).toEqual(['булка']);
  });

  it('Scenario: A foreign purchase keeps the original-currency amount', () => {
    const plan = planFrom(
      spend({
        id: '1',
        amount: '850.84',
        other: 'Eating out',
        otherAmount: '6370.00',
        otherCurrency: 'HUF',
      }),
    );
    expect(moves(plan)[0]).toMatchObject({
      type: 'expense',
      amount: { amount: 85084, currency: 'UAH' },
      originalAmount: { amount: 637000, currency: 'HUF' },
    });
  });

  it('Scenario: Fees map to the reserved row', () => {
    const plan = planFrom(spend({ id: '1', amount: '3.02', other: 'Fees' }));
    expect(moves(plan)[0]).toMatchObject({ type: 'expense', categoryId: FEES_CATEGORY_ID });
    expect(plan.categories).toEqual([]);
  });

  it('Scenario: A cancellation is a повернення in its category', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'Monobank UAH, Black',
        journalType: 'DEBIT',
        amount: '2214.82',
        other: 'Travel',
        otherType: 'EXPENSES',
        otherAmount: '186.36',
        otherCurrency: 'PLN',
      }),
      {
        existing: {
          ...existingState(),
          categories: [{ id: 'travel', name: 'Travel', archived: false }],
        },
      },
    );
    expect(moves(plan)).toEqual([
      {
        type: 'refund',
        id: 'saldo:1',
        date: '2024-10-27',
        accountId: accountNamed(plan, 'Monobank UAH, Black').id,
        amount: { amount: 221482, currency: 'UAH' },
        categoryId: 'travel',
      },
    ]);
    // A повернення carries no original-currency amount; the dropped figure is counted instead.
    expect(moves(plan)[0]).not.toHaveProperty('originalAmount');
    const dropped = plan.unexplained.filter((r) => r.reason === 'dropped-original-amount');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.detail).toContain('18636 PLN');
  });
});

// ---------------------------------------------------------------- доходи and коригування

describe('interpret — доходи and коригування', () => {
  it('Scenario: A salary arrival is a дохід with its source', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'Monobank UAH, Black',
        journalType: 'DEBIT',
        amount: '50000.00',
        other: 'Salary',
        otherType: 'INCOME',
      }),
      {
        existing: {
          ...existingState(),
          sources: [{ id: 'salary', name: 'Salary', archived: false }],
        },
      },
    );
    expect(moves(plan)[0]).toMatchObject({
      type: 'income',
      amount: { amount: 5000000, currency: 'UAH' },
      sourceId: 'salary',
    });
  });

  it('Scenario: An income debit is a negative дохід', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'mono black',
        journalType: 'CREDIT',
        amount: '271.00',
        other: 'Other income',
        otherType: 'INCOME',
      }),
    );
    expect(moves(plan)).toHaveLength(1);
    expect(moves(plan)[0]).toMatchObject({
      type: 'income',
      amount: { amount: -27100, currency: 'UAH' },
      sourceId: `${NEW_SOURCE_PREFIX}Other income`,
    });
  });

  it('Scenario: An income handed back is a negative дохід', () => {
    const plan = planFrom([
      ...pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '500.00', other: 'Other income', otherType: 'INCOME' }),
      ...pair({ id: '2', account: 'mono black', journalType: 'CREDIT', amount: '271.00', other: 'Other income', otherType: 'INCOME' }),
    ]);
    const рахунок = account({
      id: accountNamed(plan, 'mono black').id,
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
    });
    const transactions = moves(plan);
    // The negative amount flows through the domain untouched: balance and month both drop by it.
    expect(computeBalance(рахунок, transactions)).toEqual({ amount: 22900, currency: 'UAH' });
    expect(monthlyPicture({ month: '2024-10', accounts: [рахунок], transactions }).get('UAH'))
      .toMatchObject({ income: { amount: 22900, currency: 'UAH' }, spent: { amount: 0, currency: 'UAH' } });
  });

  it('Scenario: A correction expense is a negative коригування', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'гаманець',
        accountType: 'CASH',
        journalType: 'CREDIT',
        amount: '42.00',
        other: 'Balance correction',
        otherType: 'EXPENSES',
      }),
    );
    expect(moves(plan)).toEqual([
      {
        type: 'correction',
        id: 'saldo:1',
        date: '2024-10-27',
        accountId: accountNamed(plan, 'гаманець').id,
        amount: { amount: -4200, currency: 'UAH' },
      },
    ]);
    expect(plan.categories).toEqual([]);
  });

  it('Scenario: A correction income is a positive коригування', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'гаманець',
        accountType: 'CASH',
        journalType: 'DEBIT',
        amount: '42.00',
        other: 'Balance correction',
        otherType: 'INCOME',
      }),
    );
    expect(moves(plan)[0]).toMatchObject({ type: 'correction', amount: { amount: 4200, currency: 'UAH' } });
    expect(plan.sources).toEqual([]);
  });
});

// ---------------------------------------------------------------- in transit

/** The two (or three) legs of a MONEY_ON_THE_WAY departure and its arrival. */
const departure = (input: {
  id: string;
  datetime: string;
  source: string;
  destination: string;
  amount: string;
  inTransit?: string;
  fee?: string;
}): FixtureRow[] => [
  leg({ 'Transaction ID': input.id, 'Transaction Date': input.datetime, Account: input.source, 'Journal Type': 'CREDIT', Amount: input.amount }),
  leg({ 'Transaction ID': input.id, 'Transaction Date': input.datetime, Account: input.destination, 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'DEBIT', Amount: input.inTransit ?? input.amount }),
  ...(input.fee
    ? [leg({ 'Transaction ID': input.id, 'Transaction Date': input.datetime, Account: 'Fees', 'Account Type': 'EXPENSES', 'Journal Type': 'DEBIT', Amount: input.fee })]
    : []),
];

const arrival = (input: {
  id: string;
  datetime: string;
  source: string;
  destination: string;
  amount: string;
  currency?: string;
  inTransit?: string;
}): FixtureRow[] => [
  leg({ 'Transaction ID': input.id, 'Transaction Date': input.datetime, Account: input.destination, 'Journal Type': 'DEBIT', Amount: input.amount, Currency: input.currency ?? 'UAH' }),
  leg({ 'Transaction ID': input.id, 'Transaction Date': input.datetime, Account: input.source, 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'CREDIT', Amount: input.inTransit ?? input.amount }),
];

describe('interpret — MONEY_ON_THE_WAY', () => {
  it('Scenario: A same-currency pair collapses into one переказ', () => {
    const plan = planFrom([
      ...departure({ id: '103740755', datetime: '2026-02-09T15:39:49', source: 'Monobank UAH, White', destination: 'Monobank UAH, Black', amount: '5000.00' }),
      ...arrival({ id: '103740736', datetime: '2026-02-09T15:39:49', source: 'Monobank UAH, White', destination: 'Monobank UAH, Black', amount: '5000.00' }),
    ]);
    expect(moves(plan)).toEqual([
      {
        type: 'transfer',
        id: 'saldo:103740755+103740736',
        date: '2026-02-09',
        fromAccountId: accountNamed(plan, 'Monobank UAH, White').id,
        toAccountId: accountNamed(plan, 'Monobank UAH, Black').id,
        left: { amount: 500000, currency: 'UAH' },
        arrived: { amount: 500000, currency: 'UAH' },
      },
    ]);
    expect(plan.unexplained.filter((r) => r.reason === 'unpaired-in-transit')).toEqual([]);
  });

  it('Scenario: A cross-currency pair carries both amounts', () => {
    const plan = planFrom([
      ...departure({ id: '103740737', datetime: '2026-02-09T15:44:13', source: 'Monobank UAH, Black', destination: 'Monobank USD, Black', amount: '34624.54' }),
      ...arrival({ id: '103740761', datetime: '2026-02-09T15:44:13', source: 'Monobank UAH, Black', destination: 'Monobank USD, Black', amount: '800.00', currency: 'USD', inTransit: '34624.54' }),
    ]);
    expect(moves(plan)[0]).toMatchObject({
      type: 'transfer',
      left: { amount: 3462454, currency: 'UAH' },
      arrived: { amount: 80000, currency: 'USD' },
      date: '2026-02-09',
    });
  });

  it('Scenario: The three-legged fee departure yields переказ plus комісія', () => {
    const plan = planFrom([
      ...departure({ id: '108821128', datetime: '2026-03-21T10:25:54', source: 'Monobank UAH, Black', destination: 'Monobank UAH, MadeInUkraine', amount: '125.00', inTransit: '121.98', fee: '3.02' }),
      ...arrival({ id: '109753877', datetime: '2026-03-28T07:46', source: 'Monobank UAH, Black', destination: 'Monobank UAH, MadeInUkraine', amount: '121.98' }),
    ]);
    const black = accountNamed(plan, 'Monobank UAH, Black');
    expect(moves(plan)).toEqual([
      {
        type: 'transfer',
        id: 'saldo:108821128+109753877',
        date: '2026-03-21',
        fromAccountId: black.id,
        toAccountId: accountNamed(plan, 'Monobank UAH, MadeInUkraine').id,
        left: { amount: 12198, currency: 'UAH' },
        arrived: { amount: 12198, currency: 'UAH' },
      },
      {
        type: 'expense',
        id: 'saldo:108821128/fee',
        date: '2026-03-21',
        accountId: black.id,
        amount: { amount: 302, currency: 'UAH' },
        categoryId: FEES_CATEGORY_ID,
      },
    ]);
    // The Black рахунок is down exactly the 12500 minor units its own real leg says.
    const рахунок = account({ id: black.id, name: black.name, kind: 'spending', currency: 'UAH' });
    expect(computeBalance(рахунок, moves(plan))).toEqual({ amount: -12500, currency: 'UAH' });
  });

  it('Scenario: An unpaired in-transit leg is reported, not imported', () => {
    const plan = planFrom(
      departure({ id: '1', datetime: '2026-02-09T15:39:49', source: 'Monobank UAH, White', destination: 'Monobank UAH, Black', amount: '121.98' }),
    );
    expect(plan.transactions).toEqual([]);
    const unpaired = plan.unexplained.filter((r) => r.reason === 'unpaired-in-transit');
    expect(unpaired).toHaveLength(1);
    expect(unpaired[0]).toMatchObject({
      accountId: accountNamed(plan, 'Monobank UAH, White').id,
      effect: { amount: -12198, currency: 'UAH' },
    });
  });

  it('pairs each side with its own counterpart when two moves cross between one pair of рахунки', () => {
    // The real export holds exactly this at 2026-03-29: White→Black and Black→White, same amount.
    const plan = planFrom([
      ...departure({ id: '109923997', datetime: '2026-03-29T11:34:30', source: 'Monobank UAH, White', destination: 'Monobank UAH, Black', amount: '768.00' }),
      ...arrival({ id: '109923998', datetime: '2026-03-29T11:34:30', source: 'Monobank UAH, Black', destination: 'Monobank UAH, White', amount: '768.00' }),
      ...arrival({ id: '109923991', datetime: '2026-03-29T11:35:42', source: 'Monobank UAH, White', destination: 'Monobank UAH, Black', amount: '768.00' }),
      ...departure({ id: '109923992', datetime: '2026-03-29T11:35:42', source: 'Monobank UAH, Black', destination: 'Monobank UAH, White', amount: '768.00' }),
    ]);
    expect(plan.transactions.map((t) => t.saldoIds)).toEqual([
      ['109923997', '109923991'],
      ['109923992', '109923998'],
    ]);
    expect(plan.unexplained.filter((r) => r.reason === 'unpaired-in-transit')).toEqual([]);
  });
});

// ---------------------------------------------------------------- борг

const борг = (input: {
  id: string;
  description: string;
  amount: string;
  lending: boolean;
  account?: string;
  datetime?: string;
}): FixtureRow[] =>
  pair({
    id: input.id,
    description: input.description,
    account: input.account ?? 'Monobank UAH, Black',
    journalType: input.lending ? 'CREDIT' : 'DEBIT',
    amount: input.amount,
    other: 'Борг',
    otherType: 'EXPENSES',
    ...(input.datetime ? { datetime: input.datetime } : {}),
  });

describe('interpret — «Борг»', () => {
  it('Scenario: Lending lands on «Борги»', () => {
    const plan = planFrom(борг({ id: '1', description: 'борг яріку', amount: '1000.00', lending: true }));
    const борги = accountNamed(plan, 'Борги');
    expect(борги).toMatchObject({ id: debtAccountId('UAH'), kind: 'debt', currency: 'UAH' });
    expect(moves(plan)[0]).toMatchObject({
      type: 'transfer',
      fromAccountId: accountNamed(plan, 'Monobank UAH, Black').id,
      toAccountId: борги.id,
      left: { amount: 100000, currency: 'UAH' },
      arrived: { amount: 100000, currency: 'UAH' },
    });
    const рахунокБорг = account({ id: борги.id, name: 'Борги', kind: 'debt', currency: 'UAH' });
    expect(computeBalance(рахунокБорг, moves(plan))).toEqual({ amount: 100000, currency: 'UAH' });
  });

  it('Scenario: A repayment is the переказ back', () => {
    const plan = planFrom([
      ...борг({ id: '1', description: 'борг яріку', amount: '1000.00', lending: true }),
      ...борг({ id: '2', description: 'ярік борг повернення', amount: '1000.00', lending: false, datetime: '2024-11-05T10:00:00.000' }),
    ]);
    const борги = accountNamed(plan, 'Борги');
    const black = accountNamed(plan, 'Monobank UAH, Black');
    expect(moves(plan)[1]).toMatchObject({
      type: 'transfer',
      fromAccountId: борги.id,
      toAccountId: black.id,
      left: { amount: 100000, currency: 'UAH' },
    });
    const рахунокБорг = account({ id: борги.id, name: 'Борги', kind: 'debt', currency: 'UAH' });
    expect(computeBalance(рахунокБорг, moves(plan))).toEqual({ amount: 0, currency: 'UAH' });
  });

  it('Scenario: Every «Борг» row lands, whatever its description', () => {
    const plan = planFrom([
      ...борг({ id: '1', description: 'борг', amount: '100.00', lending: true }),
      ...борг({ id: '2', description: 'борг', amount: '200.00', lending: true, datetime: '2024-11-05T10:00:00.000' }),
      ...борг({ id: '3', description: '', amount: '300.00', lending: true, datetime: '2024-11-06T10:00:00.000' }),
      ...борг({ id: '4', description: '', amount: '400.00', lending: true, account: 'гаманець', datetime: '2024-11-07T10:00:00.000' }),
    ]);
    const борги = accountNamed(plan, 'Борги');
    expect(moves(plan)).toHaveLength(4);
    expect(moves(plan).map((t) => (t.type === 'transfer' ? t.toAccountId : ''))).toEqual([
      борги.id,
      борги.id,
      борги.id,
      борги.id,
    ]);
    expect(plan.accounts.filter((a) => a.kind === 'debt')).toHaveLength(1);
    expect(plan.unexplained).toEqual([]);
  });

  it('Scenario: Two currencies get two рахунки-борги', () => {
    const plan = planFrom([
      ...борг({ id: '1', description: 'борг', amount: '100.00', lending: true }),
      ...pair({ id: '2', description: 'борг', account: 'валюта моно', journalType: 'CREDIT', amount: '50.00', currency: 'USD', other: 'Борг', otherType: 'EXPENSES', otherCurrency: 'USD' }),
    ]);
    const борги = plan.accounts.filter((a) => a.kind === 'debt');
    expect(борги).toHaveLength(2);
    expect(борги.map((a) => [a.name, a.currency, a.id])).toEqual([
      ['Борги', 'UAH', debtAccountId('UAH')],
      ['Борги', 'USD', debtAccountId('USD')],
    ]);
    const [uah, usd] = moves(plan);
    expect(uah).toMatchObject({ type: 'transfer', toAccountId: debtAccountId('UAH'), left: { currency: 'UAH' } });
    expect(usd).toMatchObject({ type: 'transfer', toAccountId: debtAccountId('USD'), left: { currency: 'USD' } });
  });

  it('Scenario: An export with no «Борг» row creates no рахунок-борг', () => {
    const plan = planFrom(spend({ id: '1', amount: '10.00', other: 'Groceries' }));
    expect(plan.accounts.filter((a) => a.kind === 'debt')).toEqual([]);
  });
});

// ---------------------------------------------------------------- unknown shapes and order

describe('interpret — unknown shapes', () => {
  it('Scenario: An unknown shape becomes a visible difference', () => {
    const plan = planFrom(
      pair({
        id: '1',
        account: 'гаманець',
        accountType: 'CASH',
        journalType: 'CREDIT',
        amount: '42.00',
        other: 'Something else',
        otherType: 'LIABILITIES',
      }),
    );
    expect(plan.transactions).toEqual([]);
    const unknown = plan.unexplained.filter((r) => r.reason === 'unrecognised-shape');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({
      transactionId: '1',
      accountId: accountNamed(plan, 'гаманець').id,
      effect: { amount: -4200, currency: 'UAH' },
    });
  });

  it('reports a shape the domain itself rejects, rather than planning it', () => {
    // A переказ's legs are positive and a повернення's amount is positive — the domain owns those
    // invariants, and the import must not restate them or slip past them.
    const zeroTransfer = planFrom(
      pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '0.00', other: 'гаманець', otherType: 'CASH' }),
    );
    expect(zeroTransfer.transactions).toEqual([]);
    expect(zeroTransfer.unexplained[0]?.detail).toContain('the domain rejects this shape');

    const zeroRefund = planFrom(
      pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '0.00', other: 'Groceries', otherType: 'EXPENSES' }),
    );
    expect(zeroRefund.transactions).toEqual([]);
    expect(zeroRefund.unexplained[0]?.detail).toContain('the domain rejects this shape');

    // And the рахунок-борг of a «Борг» переказ that did not survive is in no plan: the report
    // states a balance for every рахунок-борг it lists, and one nothing explains has none.
    const zeroDebt = planFrom(борг({ id: '1', description: 'борг', amount: '0.00', lending: true }));
    expect(zeroDebt.transactions).toEqual([]);
    expect(zeroDebt.accounts.filter((a) => a.kind === 'debt')).toEqual([]);
  });

  it('reports rather than storing a raw Saldo name where a category or джерело id belongs', () => {
    // A survey taken from a different export knows none of these names. Nothing may reach the
    // plan carrying a name in an id field — the commit step would store a dangling reference.
    // The same рахунки, none of the same category or джерело names.
    const elsewhere = survey(
      parseRows([
        ...spend({ id: '9', amount: '1.00', other: 'Home' }),
        ...pair({ id: '10', account: 'mono black', journalType: 'DEBIT', amount: '1.00', other: 'Freelance', otherType: 'INCOME' }),
      ]),
    );
    const transactions = parseRows([
      ...spend({ id: '1', amount: '10.00', other: 'булка' }),
      ...pair({ id: '2', account: 'mono black', journalType: 'DEBIT', amount: '10.00', other: 'Salary', otherType: 'INCOME' }),
    ]);
    const plan = interpret({ transactions, survey: elsewhere });
    expect(plan.transactions).toEqual([]);
    expect(plan.unexplained.map((row) => row.detail)).toEqual([
      'no категорія is mapped for "булка"',
      'no джерело is mapped for "Salary"',
    ]);
  });

  it('notes a row whose Accrual Month is not its own month, and keeps the date', () => {
    const plan = planFrom(
      spend({ id: '1', amount: '10.00', other: 'Groceries', datetime: '2025-09-08T10:00:00.000' }).map(
        (row) => ({ ...row, 'Accrual Month': '2025-11-06' }),
      ),
    );
    expect(moves(plan)[0]?.date).toBe('2025-09-08');
    const noted = plan.unexplained.filter((r) => r.reason === 'accrual-month-divergence');
    expect(noted).toHaveLength(2);
    expect(noted[0]?.detail).toContain('2025-11');
  });

  it('notes a pair that carries nothing but zero opening rows', () => {
    const plan = planFrom([
      ...pair({ id: '1', account: 'валюта моно', journalType: 'DEBIT', amount: '100.00', currency: 'USD', other: 'Initial balance', otherType: 'EQUITY' }),
      ...pair({ id: '2', account: 'валюта моно', journalType: 'DEBIT', amount: '0.00', other: 'Initial balance', otherType: 'EQUITY' }),
    ]);
    expect(plan.accounts.map((a) => a.currency)).toEqual(['USD']);
    expect(plan.unexplained.filter((r) => r.reason === 'zero-only-pair')).toHaveLength(1);
  });
});

describe('interpret — order and determinism', () => {
  const mixed: FixtureRow[] = [
    ...spend({ id: 'b', amount: '20.00', other: 'Groceries', datetime: '2026-01-02T12:00:00.000' }),
    ...spend({ id: 'a', amount: '10.00', other: 'Groceries', datetime: '2026-01-01T09:00:00.000' }),
    ...spend({ id: 'd', amount: '40.00', other: 'Groceries', datetime: '2026-01-02T08:30:00.000' }),
    ...spend({ id: 'c', amount: '30.00', other: 'Groceries', datetime: '2026-01-02T08:30:00.000' }),
  ];

  it('Scenario: The same inputs replay into the same plan', () => {
    expect(planFrom(mixed)).toEqual(planFrom(mixed));
  });

  it('Scenario: Same-date transactions keep their intra-day order', () => {
    expect(planFrom(mixed).transactions.map((t) => t.saldoIds)).toEqual([
      ['a'],
      // 08:30 before 12:00; the two 08:30 rows keep the export's own order, d before c.
      ['d'],
      ['c'],
      ['b'],
    ]);
  });
});
