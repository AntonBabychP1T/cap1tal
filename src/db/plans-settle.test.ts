import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { commitmentDues, type Commitment } from '../domain/commitments';
import type { Installment } from '../domain/installments';
import { money } from '../domain/money';
import { monthlyPicture } from '../domain/monthly-picture';
import { expenseByDefault } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { commitmentsRepo } from './commitments-repo';
import { installmentsRepo } from './installments-repo';
import { settlePlans } from './plans-settle';
import { storageStamp } from './stored-history';
import { openTestDb, seedReferences, seedReservedCategories, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
const at = new Date(Date.UTC(2026, 9, 1));

const rent: Commitment = {
  id: 'c-rent',
  name: 'Оренда',
  amount: 1_500_000,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-10',
  debitAccountId: 'black',
  categoryId: 'housing',
  recordedAt: 10,
};

const debit = (id: string, date: string, amount: number, description?: string) =>
  expenseByDefault({ id, date, accountId: 'black', amount: money(amount, 'UAH'), ...(description ? { description } : {}) });

describe('commitments — settlePlans', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    seedReferences(storage.db, { categories: ['housing', 'tech', 'sport', 'subscriptions'] });
    accountsRepo(storage.db).save(black);
  });

  afterEach(() => {
    storage.close();
  });

  const tx = () => transactionsRepo(storage.db);
  const commitments = () => commitmentsRepo(storage.db);
  const spentIn = (month: string) =>
    monthlyPicture({ month, accounts: accountsRepo(storage.db).list(), transactions: tx().listAll() }).get('UAH')?.spent;

  it('Scenario: Each платіж is the витрата of its own month', () => {
    commitments().save(rent);
    tx().save(debit('oct', '2026-10-10', 1_500_000), at);
    tx().save(debit('nov', '2026-11-10', 1_500_000), at);
    expect(settlePlans(storage.db, '2026-11-10')).toEqual({ installments: false, commitments: true });
    expect(commitments().facts().links.map((l) => [l.number, l.transactionId])).toEqual([
      [1, 'oct'],
      [2, 'nov'],
    ]);
    expect(tx().get('oct')).toMatchObject({ categoryId: 'housing' });
    expect(spentIn('2026-10')).toEqual(money(1_500_000, 'UAH'));
    expect(spentIn('2026-11')).toEqual(money(1_500_000, 'UAH'));
  });

  it('Scenario: A платіж never debited is never spent', () => {
    commitments().save(rent);
    tx().save(debit('oct', '2026-10-10', 1_500_000), at);
    settlePlans(storage.db, '2026-12-01');
    const dues = commitmentDues(commitments().get(rent.id)!, commitments().facts(), {
      until: '2026-11-30',
      today: '2026-12-01',
    });
    expect(dues[1]).toMatchObject({ due: '2026-11-10', state: 'notFound' });
    expect(spentIn('2026-11')).toBeUndefined();
  });

  it('Scenario: A розстрочка is served first', () => {
    const iphone: Installment = {
      id: 'i-iphone',
      name: 'iPhone',
      total: 1_000_000,
      partsCount: 10,
      part: 100_000,
      firstDue: '2026-06-05',
      debitAccountId: 'black',
      paidBefore: 4,
      categoryId: 'tech',
      // Recorded after the зобов'язання: the order of the plans, not of recording, decides.
      recordedAt: 20,
    };
    const gym: Commitment = { ...rent, id: 'c-gym', name: 'Спортзал', amount: 100_000, firstDue: '2026-10-05', categoryId: 'sport' };
    commitments().save(gym);
    installmentsRepo(storage.db).save(iphone);
    tx().save(debit('t1', '2026-10-05', 100_000), at);
    expect(settlePlans(storage.db, '2026-10-05')).toEqual({ installments: true, commitments: false });
    expect(installmentsRepo(storage.db).facts().links).toEqual([
      { installmentId: iphone.id, number: 5, transactionId: 't1' },
    ]);
    expect(commitments().facts().links).toEqual([]);
  });

  it('Scenario: A розстрочка recorded later does not take a linked витрата', () => {
    const gym: Commitment = { ...rent, id: 'c-gym', name: 'Спортзал', amount: 100_000, firstDue: '2026-10-05' };
    commitments().save(gym);
    tx().save(debit('t1', '2026-10-05', 100_000), at);
    settlePlans(storage.db, '2026-10-05');
    installmentsRepo(storage.db).save({
      id: 'i-iphone',
      name: 'iPhone',
      total: 1_000_000,
      partsCount: 10,
      part: 100_000,
      firstDue: '2026-10-05',
      debitAccountId: 'black',
      paidBefore: 0,
      recordedAt: 1,
    });
    expect(settlePlans(storage.db, '2026-10-06')).toEqual({ installments: false, commitments: false });
    expect(commitments().facts().links).toEqual([{ commitmentId: gym.id, number: 1, transactionId: 't1' }]);
    expect(installmentsRepo(storage.db).facts().links).toEqual([]);
  });

  it('Scenario: With an ознака the сума may differ', () => {
    const netflix: Commitment = {
      ...rent,
      id: 'c-netflix',
      name: 'Netflix',
      amount: 29_900,
      firstDue: '2026-10-15',
      categoryId: 'subscriptions',
      marker: 'netflix',
    };
    commitments().save(netflix);
    tx().save(debit('silpo', '2026-10-15', 29_900, 'Сільпо'), at);
    tx().save(debit('nf', '2026-10-15', 34_900, 'NETFLIX.COM'), at);
    settlePlans(storage.db, '2026-10-15');
    expect(commitments().facts().links).toEqual([{ commitmentId: netflix.id, number: 1, transactionId: 'nf' }]);
  });

  it('reads candidates only inside the windows of open платежі, however old the first', () => {
    commitments().save({ ...rent, firstDue: '2016-01-10' });
    // Between two windows: never a candidate, even with the right сума.
    tx().save(debit('between', '2026-09-25', 1_500_000), at);
    tx().save(debit('in', '2026-09-11', 1_500_000), at);
    settlePlans(storage.db, '2026-10-01');
    expect(commitments().facts().links).toEqual([{ commitmentId: rent.id, number: 129, transactionId: 'in' }]);
  });

  it('links a платіж of a зобов\'язання whose first дата is a century back, and the розстрочки with it', () => {
    // A typo in the year («05.10.1926») leaves twelve hundred open платежі. One date window each,
    // OR'd into one query, is past SQLite's expression depth — and a settle that throws stops the
    // розстрочки' linking too, since both plans settle in one write (diff review, MAJOR).
    commitments().save({ ...rent, firstDue: '1926-10-10' });
    installmentsRepo(storage.db).save({
      id: 'i-iphone',
      name: 'iPhone',
      total: 1_000_000,
      partsCount: 10,
      part: 100_000,
      firstDue: '2026-10-05',
      debitAccountId: 'black',
      paidBefore: 0,
      recordedAt: 1,
    });
    tx().save(debit('rent', '2026-10-10', 1_500_000), at);
    tx().save(debit('iphone', '2026-10-05', 100_000), at);
    expect(settlePlans(storage.db, '2026-10-11')).toEqual({ installments: true, commitments: true });
    expect(commitments().facts().links).toEqual([{ commitmentId: rent.id, number: 1201, transactionId: 'rent' }]);
    expect(installmentsRepo(storage.db).facts().links).toEqual([
      { installmentId: 'i-iphone', number: 1, transactionId: 'iphone' },
    ]);
  });

  it('leaves the storage stamp unchanged when there is nothing to do', () => {
    commitments().save(rent);
    tx().save(debit('oct', '2026-10-10', 1_500_000), at);
    settlePlans(storage.db, '2026-10-10');
    const stamp = storageStamp(storage.db);
    expect(settlePlans(storage.db, '2026-10-11')).toEqual({ installments: false, commitments: false });
    expect(storageStamp(storage.db)).toBe(stamp);
  });
});
