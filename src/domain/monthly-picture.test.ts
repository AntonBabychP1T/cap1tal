import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { account, type Account, type AccountKind } from './account';
import { money, type CurrencyCode, type Money } from './money';
import { categoryBreakdown, monthlyPicture, type MonthlyNumbers } from './monthly-picture';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Expense,
  type Income,
  type Refund,
  type Transaction,
} from './transaction';

const acc = (id: string, kind: AccountKind, currency: CurrencyCode): Account =>
  account({ id, name: id, kind, currency });

const card = acc('card', 'spending', 'UAH');
const usdCard = acc('usd-card', 'spending', 'USD');
const jar = acc('jar', 'savings', 'UAH');
const usdJar = acc('usd-jar', 'savings', 'USD');
const bonds = acc('bonds', 'investment', 'UAH');
const borrower = acc('borrower', 'debt', 'UAH');
const wallet = acc('wallet', 'cash', 'UAH');
const accounts = [card, usdCard, jar, usdJar, bonds, borrower, wallet];

let n = 0;
const nextId = () => `t${(n += 1)}`;

const expenseTx = (
  amount: number,
  currency: CurrencyCode,
  date = '2026-03-10',
  categoryId = 'food',
): Expense => ({
  type: 'expense',
  id: nextId(),
  date,
  accountId: 'card',
  amount: money(amount, currency),
  categoryId,
});

const incomeTx = (amount: number, currency: CurrencyCode, date = '2026-03-05'): Income => ({
  type: 'income',
  id: nextId(),
  date,
  accountId: 'card',
  amount: money(amount, currency),
  sourceId: 'salary',
});

const refundTx = (
  amount: number,
  currency: CurrencyCode,
  date = '2026-03-20',
  categoryId = 'food',
): Refund => ({
  type: 'refund',
  id: nextId(),
  date,
  accountId: 'card',
  amount: money(amount, currency),
  categoryId,
});

const correctionTx = (amount: number, currency: CurrencyCode, date = '2026-03-15'): Correction => ({
  type: 'correction',
  id: nextId(),
  date,
  accountId: 'card',
  amount: money(amount, currency),
});

const transferTx = (fromAccountId: string, toAccountId: string, left: Money, arrived: Money) =>
  transfer({ id: nextId(), date: '2026-03-10', fromAccountId, toAccountId, left, arrived });

const pictureOf = (transactions: Transaction[], month = '2026-03') =>
  monthlyPicture({ month, accounts, transactions });

const row = (picture: Map<CurrencyCode, MonthlyNumbers>, currency: CurrencyCode): MonthlyNumbers => {
  const numbers = picture.get(currency);
  if (!numbers) {
    throw new Error(`no ${currency} numbers in the picture`);
  }
  return numbers;
};

describe('monthly picture', () => {
  it('Transactions fall into the month of their date', () => {
    const transactions = [expenseTx(100, 'UAH', '2026-03-31'), expenseTx(200, 'UAH', '2026-04-01')];
    expect(row(pictureOf(transactions, '2026-03'), 'UAH').spent).toEqual(money(100, 'UAH'));
    expect(row(pictureOf(transactions, '2026-04'), 'UAH').spent).toEqual(money(200, 'UAH'));
  });

  it('Two currencies stay apart', () => {
    const picture = pictureOf([expenseTx(100, 'UAH'), expenseTx(50, 'USD')]);
    expect(picture.size).toBe(2);
    expect(row(picture, 'UAH').spent).toEqual(money(100, 'UAH'));
    expect(row(picture, 'USD').spent).toEqual(money(50, 'USD'));
  });

  it('Refund reduces spent', () => {
    const picture = pictureOf([expenseTx(500000, 'UAH'), refundTx(80000, 'UAH')]);
    expect(row(picture, 'UAH').spent).toEqual(money(420000, 'UAH'));
  });

  it('Negative correction is spent', () => {
    const picture = pictureOf([correctionTx(-3000, 'UAH')]);
    expect(row(picture, 'UAH').spent).toEqual(money(3000, 'UAH'));
    expect(row(picture, 'UAH').income).toEqual(money(0, 'UAH'));
  });

  it('Return exceeds contributions', () => {
    const picture = pictureOf([
      transferTx('card', 'bonds', money(100000, 'UAH'), money(100000, 'UAH')),
      transferTx('bonds', 'card', money(150000, 'UAH'), money(150000, 'UAH')),
    ]);
    expect(row(picture, 'UAH').invested).toEqual(money(-50000, 'UAH'));
  });

  it('Jar top-up and withdrawal', () => {
    const picture = pictureOf([
      transferTx('card', 'jar', money(200000, 'UAH'), money(200000, 'UAH')),
      transferTx('jar', 'card', money(50000, 'UAH'), money(50000, 'UAH')),
    ]);
    expect(row(picture, 'UAH').saved).toEqual(money(150000, 'UAH'));
  });

  it('Lending and partial repayment', () => {
    const picture = pictureOf([
      transferTx('card', 'borrower', money(300000, 'UAH'), money(300000, 'UAH')),
      transferTx('borrower', 'card', money(100000, 'UAH'), money(100000, 'UAH')),
    ]);
    expect(row(picture, 'UAH').lent).toEqual(money(200000, 'UAH'));
  });

  it('Positive correction joins income', () => {
    const picture = pictureOf([incomeTx(5000000, 'UAH'), correctionTx(3000, 'UAH')]);
    expect(row(picture, 'UAH').income).toEqual(money(5003000, 'UAH'));
  });

  it('Money moved into a jar or lent out is not available', () => {
    const picture = pictureOf([
      incomeTx(5000000, 'UAH'),
      expenseTx(2000000, 'UAH'),
      transferTx('card', 'bonds', money(500000, 'UAH'), money(500000, 'UAH')),
      transferTx('card', 'jar', money(1000000, 'UAH'), money(1000000, 'UAH')),
      transferTx('card', 'borrower', money(300000, 'UAH'), money(300000, 'UAH')),
    ]);
    expect(row(picture, 'UAH').left).toEqual(money(1200000, 'UAH'));
  });

  it('UAH top-up of a USD jar is saved in UAH', () => {
    const picture = pictureOf([transferTx('card', 'usd-jar', money(410000, 'UAH'), money(10000, 'USD'))]);
    expect(row(picture, 'UAH').saved).toEqual(money(410000, 'UAH'));
    expect(picture.get('USD')).toBeUndefined();
  });

  it('Jar top-up arriving short is saved at what arrived', () => {
    const picture = pictureOf([
      transferTx('card', 'jar', money(100000, 'UAH'), money(99500, 'UAH')),
      expenseTx(500, 'UAH', '2026-03-10', FEES_CATEGORY_ID),
    ]);
    expect(row(picture, 'UAH').saved).toEqual(money(99500, 'UAH'));
    expect(row(picture, 'UAH').spent).toEqual(money(500, 'UAH'));
    expect(row(picture, 'UAH').left).toEqual(money(-100000, 'UAH'));
  });

  it('Money back from a USD jar reduces saved in UAH', () => {
    const picture = pictureOf([transferTx('usd-jar', 'card', money(10000, 'USD'), money(400000, 'UAH'))]);
    expect(row(picture, 'UAH').saved).toEqual(money(-400000, 'UAH'));
    expect(picture.get('USD')).toBeUndefined();
  });

  it('Negative correction counts as spent', () => {
    const picture = pictureOf([correctionTx(-3000, 'UAH')]);
    expect(row(picture, 'UAH').spent).toEqual(money(3000, 'UAH'));
  });

  it('Positive correction counts as income', () => {
    const picture = pictureOf([correctionTx(3000, 'UAH')]);
    expect(row(picture, 'UAH').income).toEqual(money(3000, 'UAH'));
    expect(row(picture, 'UAH').spent).toEqual(money(0, 'UAH'));
  });

  it('Returned purchase', () => {
    const transactions = [
      expenseTx(80000, 'UAH', '2026-03-10', 'clothes'),
      refundTx(80000, 'UAH', '2026-04-02', 'clothes'),
    ];
    expect(row(pictureOf(transactions, '2026-03'), 'UAH').spent).toEqual(money(80000, 'UAH'));
    const april = pictureOf(transactions, '2026-04');
    expect(row(april, 'UAH').spent).toEqual(money(-80000, 'UAH'));
    expect(row(april, 'UAH').income).toEqual(money(0, 'UAH'));
  });

  it('USD purchase from a UAH card', () => {
    const picture = pictureOf([
      { ...expenseTx(420000, 'UAH', '2026-03-10', 'travel'), originalAmount: money(10000, 'USD') },
    ]);
    expect(picture.size).toBe(1);
    expect(row(picture, 'UAH').spent).toEqual(money(420000, 'UAH'));
    expect(picture.get('USD')).toBeUndefined();
  });

  it('An unrecognised import is an expense', () => {
    const picture = pictureOf([expenseTx(12550, 'UAH', '2026-03-10', UNCATEGORISED_CATEGORY_ID)]);
    expect(row(picture, 'UAH').spent).toEqual(money(12550, 'UAH'));
  });
});

// ---------------------------------------------------------------------------
// Property tests (task 5.2). The five nets are recomputed here independently
// of monthlyPicture and classifyTransfer, so the identity assertion can fail.
// ---------------------------------------------------------------------------

const pool = [...accounts, acc('eur-bonds', 'investment', 'EUR')];
const poolById = new Map(pool.map((account) => [account.id, account]));

interface ReferenceNets {
  spent: number;
  invested: number;
  saved: number;
  lent: number;
  income: number;
}

function referenceNets(
  month: string,
  transactions: readonly Transaction[],
): Map<CurrencyCode, ReferenceNets> {
  const nets = new Map<CurrencyCode, ReferenceNets>();
  const at = (currency: CurrencyCode): ReferenceNets => {
    let net = nets.get(currency);
    if (!net) {
      net = { spent: 0, invested: 0, saved: 0, lent: 0, income: 0 };
      nets.set(currency, net);
    }
    return net;
  };
  const bucketOf = (kind: AccountKind): 'saved' | 'invested' | 'lent' | null =>
    kind === 'savings' ? 'saved' : kind === 'investment' ? 'invested' : kind === 'debt' ? 'lent' : null;

  for (const t of transactions) {
    if (!t.date.startsWith(`${month}-`)) {
      continue;
    }
    if (t.type === 'expense') {
      at(t.amount.currency).spent += t.amount.amount;
    } else if (t.type === 'refund') {
      at(t.amount.currency).spent -= t.amount.amount;
    } else if (t.type === 'income') {
      at(t.amount.currency).income += t.amount.amount;
    } else if (t.type === 'correction') {
      if (t.amount.amount < 0) {
        at(t.amount.currency).spent -= t.amount.amount;
      } else if (t.amount.amount > 0) {
        at(t.amount.currency).income += t.amount.amount;
      }
    } else {
      const from = poolById.get(t.fromAccountId);
      const to = poolById.get(t.toAccountId);
      if (!from || !to) {
        throw new Error('reference nets need pool accounts');
      }
      const cross = t.left.currency !== t.arrived.currency;
      const toBucket = bucketOf(to.kind);
      if (toBucket) {
        const measured = cross ? t.left : t.arrived;
        at(measured.currency)[toBucket] += measured.amount;
      }
      const fromBucket = bucketOf(from.kind);
      if (fromBucket) {
        const measured = cross ? t.arrived : t.left;
        at(measured.currency)[fromBucket] -= measured.amount;
      }
    }
  }
  return nets;
}

const arbDate = fc.constantFrom('2026-02-28', '2026-03-01', '2026-03-15', '2026-03-31', '2026-04-01');
const arbCurrency = fc.constantFrom<CurrencyCode>('UAH', 'USD', 'EUR');
const arbAmount = fc.integer({ min: 1, max: 1_000_000 });

const arbExpense: fc.Arbitrary<Transaction> = fc
  .record({
    amount: arbAmount,
    currency: arbCurrency,
    date: arbDate,
    categoryId: fc.constantFrom('food', UNCATEGORISED_CATEGORY_ID, FEES_CATEGORY_ID),
    originalCurrency: fc.option(arbCurrency, { nil: undefined }),
    originalAmount: arbAmount,
  })
  .map(({ amount, currency, date, categoryId, originalCurrency, originalAmount }) => ({
    ...expenseTx(amount, currency, date, categoryId),
    ...(originalCurrency && originalCurrency !== currency
      ? { originalAmount: money(originalAmount, originalCurrency) }
      : {}),
  }));

const arbIncome: fc.Arbitrary<Transaction> = fc
  .record({ amount: arbAmount, currency: arbCurrency, date: arbDate })
  .map(({ amount, currency, date }) => incomeTx(amount, currency, date));

const arbRefund: fc.Arbitrary<Transaction> = fc
  .record({ amount: arbAmount, currency: arbCurrency, date: arbDate })
  .map(({ amount, currency, date }) => refundTx(amount, currency, date));

const arbCorrection: fc.Arbitrary<Transaction> = fc
  .record({ amount: fc.integer({ min: -1_000_000, max: 1_000_000 }), currency: arbCurrency, date: arbDate })
  .map(({ amount, currency, date }) => correctionTx(amount, currency, date));

const arbTransfer: fc.Arbitrary<Transaction> = fc
  .record({
    from: fc.constantFrom(...pool),
    to: fc.constantFrom(...pool),
    leftAmount: arbAmount,
    arrivedAmount: arbAmount,
    date: arbDate,
  })
  .filter(({ from, to }) => from.id !== to.id)
  .map(({ from, to, leftAmount, arrivedAmount, date }) =>
    transfer({
      id: nextId(),
      date,
      fromAccountId: from.id,
      toAccountId: to.id,
      left: money(leftAmount, from.currency),
      arrived: money(arrivedAmount, to.currency),
    }),
  );

const arbTransactions = fc.array(fc.oneof(arbExpense, arbIncome, arbRefund, arbCorrection, arbTransfer), {
  maxLength: 25,
});

describe('monthly picture properties', () => {
  it('The identity holds for any transactions', () => {
    fc.assert(
      fc.property(arbTransactions, (transactions) => {
        const picture = monthlyPicture({ month: '2026-03', accounts: pool, transactions });
        const reference = referenceNets('2026-03', transactions);
        const currencies = new Set([...picture.keys(), ...reference.keys()]);
        for (const currency of currencies) {
          const numbers = picture.get(currency);
          const net = reference.get(currency) ?? { spent: 0, invested: 0, saved: 0, lent: 0, income: 0 };
          expect(numbers?.spent.amount ?? 0).toBe(net.spent);
          expect(numbers?.invested.amount ?? 0).toBe(net.invested);
          expect(numbers?.saved.amount ?? 0).toBe(net.saved);
          expect(numbers?.lent.amount ?? 0).toBe(net.lent);
          expect(numbers?.income.amount ?? 0).toBe(net.income);
          expect(numbers?.left.amount ?? 0).toBe(
            net.income - net.spent - net.invested - net.saved - net.lent,
          );
        }
      }),
    );
  });

  it('No cross-currency amount ever mixes', () => {
    fc.assert(
      fc.property(arbTransactions, (transactions) => {
        const picture = monthlyPicture({ month: '2026-03', accounts: pool, transactions });
        const legCurrencies = new Set(
          transactions.flatMap((t) =>
            t.type === 'transfer' ? [t.left.currency, t.arrived.currency] : [t.amount.currency],
          ),
        );
        for (const [currency, numbers] of picture) {
          expect(legCurrencies.has(currency)).toBe(true);
          for (const field of [
            numbers.spent,
            numbers.invested,
            numbers.saved,
            numbers.lent,
            numbers.income,
            numbers.left,
          ]) {
            expect(field.currency).toBe(currency);
          }
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// The category breakdown (task 2.1). Same fixtures as above; `categoryBreakdown`
// takes no accounts, so the transfers here exist only to prove they stay out.
// ---------------------------------------------------------------------------

const breakdownOf = (transactions: Transaction[], month = '2026-03') =>
  categoryBreakdown({ month, transactions });

/** The categories of one currency, as a plain object of minor units — easier to assert on. */
const minorUnitsOf = (
  breakdown: Map<CurrencyCode, Map<string, Money>>,
  currency: CurrencyCode,
): Record<string, number> => {
  const row = breakdown.get(currency);
  if (!row) {
    throw new Error(`no ${currency} categories in the breakdown`);
  }
  return Object.fromEntries([...row].map(([categoryId, m]) => [categoryId, m.amount]));
};

describe('category breakdown', () => {
  it('Scenario: The breakdown sums to spent', () => {
    const transactions = [
      expenseTx(300000, 'UAH', '2026-03-05', 'food'),
      expenseTx(200000, 'UAH', '2026-03-06', 'clothes'),
      refundTx(50000, 'UAH', '2026-03-20', 'food'),
    ];
    expect(minorUnitsOf(breakdownOf(transactions), 'UAH')).toEqual({
      food: 250000,
      clothes: 200000,
    });
    expect(row(pictureOf(transactions), 'UAH').spent).toEqual(money(450000, 'UAH'));
  });

  it('Scenario: A refund can push its category negative', () => {
    const transactions = [
      expenseTx(40000, 'UAH', '2026-03-10', 'clothes'),
      refundTx(100000, 'UAH', '2026-03-20', 'clothes'),
    ];
    expect(minorUnitsOf(breakdownOf(transactions), 'UAH')).toEqual({ clothes: -60000 });
  });

  it('Scenario: A negative correction lands in the correction category', () => {
    const breakdown = breakdownOf([correctionTx(-3000, 'UAH')]);
    expect(minorUnitsOf(breakdown, 'UAH')).toEqual({ [CORRECTION_CATEGORY_ID]: 3000 });
    expect(breakdown.get('UAH')?.get(CORRECTION_CATEGORY_ID)).toEqual(money(3000, 'UAH'));
  });

  it('Scenario: A positive correction stays out of the breakdown', () => {
    const breakdown = breakdownOf([correctionTx(3000, 'UAH')]);
    expect(breakdown.get('UAH')).toBeUndefined();
  });

  it('Scenario: One category keeps its currencies apart', () => {
    const breakdown = breakdownOf([
      expenseTx(100000, 'UAH', '2026-03-10', 'travel'),
      expenseTx(10000, 'USD', '2026-03-11', 'travel'),
    ]);
    expect(minorUnitsOf(breakdown, 'UAH')).toEqual({ travel: 100000 });
    expect(minorUnitsOf(breakdown, 'USD')).toEqual({ travel: 10000 });
    expect(breakdown.get('UAH')?.get('travel')).toEqual(money(100000, 'UAH'));
    expect(breakdown.get('USD')?.get('travel')).toEqual(money(10000, 'USD'));
  });

  it('Only the shown month is broken down', () => {
    const transactions = [
      expenseTx(100, 'UAH', '2026-03-31', 'food'),
      expenseTx(200, 'UAH', '2026-04-01', 'food'),
    ];
    expect(minorUnitsOf(breakdownOf(transactions, '2026-03'), 'UAH')).toEqual({ food: 100 });
    expect(minorUnitsOf(breakdownOf(transactions, '2026-04'), 'UAH')).toEqual({ food: 200 });
  });

  it('Scenario: A transfer gets no row, whatever it reached', () => {
    const transactions = [
      incomeTx(5000000, 'UAH'),
      transferTx('card', 'jar', money(200000, 'UAH'), money(200000, 'UAH')),
      transferTx('card', 'bonds', money(100000, 'UAH'), money(100000, 'UAH')),
      transferTx('card', 'borrower', money(300000, 'UAH'), money(300000, 'UAH')),
    ];

    // Not one row: no expense happened, so nothing was spent on anything.
    expect(breakdownOf(transactions).size).toBe(0);

    // …and yet the money moved, which is exactly what the monthly numbers beside the breakdown
    // are for. This is the distinction the Місяць screen exists to make visible.
    const picture = pictureOf(transactions);
    expect(row(picture, 'UAH').saved).toEqual(money(200000, 'UAH'));
    expect(row(picture, 'UAH').invested).toEqual(money(100000, 'UAH'));
    expect(row(picture, 'UAH').lent).toEqual(money(300000, 'UAH'));
    expect(row(picture, 'UAH').spent).toEqual(money(0, 'UAH'));
  });

  it('Scenario: A category that nets to zero keeps its place', () => {
    const breakdown = breakdownOf([
      expenseTx(80000, 'UAH', '2026-03-10', 'clothes'),
      refundTx(80000, 'UAH', '2026-03-20', 'clothes'),
    ]);
    expect(minorUnitsOf(breakdown, 'UAH')).toEqual({ clothes: 0 });
  });
});

describe('category breakdown properties', () => {
  it('The breakdown sums to spent, per currency, for any transactions', () => {
    fc.assert(
      fc.property(arbTransactions, (transactions) => {
        const picture = monthlyPicture({ month: '2026-03', accounts: pool, transactions });
        const breakdown = categoryBreakdown({ month: '2026-03', transactions });
        const currencies = new Set([...picture.keys(), ...breakdown.keys()]);
        for (const currency of currencies) {
          let sum = 0;
          for (const m of breakdown.get(currency)?.values() ?? []) {
            expect(m.currency).toBe(currency);
            sum += m.amount;
          }
          expect(sum).toBe(picture.get(currency)?.spent.amount ?? 0);
        }
      }),
    );
  });

  it('No category of one currency ever carries another currency', () => {
    fc.assert(
      fc.property(arbTransactions, (transactions) => {
        const breakdown = categoryBreakdown({ month: '2026-03', transactions });
        const spentCurrencies = new Set(
          transactions.flatMap((t) =>
            t.type === 'expense' || t.type === 'refund' || t.type === 'correction'
              ? [t.amount.currency]
              : [],
          ),
        );
        for (const [currency, row] of breakdown) {
          expect(spentCurrencies.has(currency)).toBe(true);
          for (const m of row.values()) {
            expect(m.currency).toBe(currency);
          }
        }
      }),
    );
  });
});
