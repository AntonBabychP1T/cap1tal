import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, transfer, type Correction } from '../domain/transaction';
import { mergeAccounts } from './account-merge-repo';
import { accountsRepo } from './accounts-repo';
import { entryDefaultsRepo } from './entry-defaults-repo';
import { installmentsRepo } from './installments-repo';
import { investmentsRepo } from './investments-repo';
import { monobankRepo, type FetchedMonobankAccount } from './monobank-repo';
import { notificationsRepo } from './notifications-repo';
import { openTestDb, seedReservedCategories, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/**
 * The owner's own case (report 2026-09-23): the monobank банка «На облігацію», linked on a рахунок
 * of its own, folded into «облігація $», which had held the same банка by hand since February.
 */

const card = account({ id: 'card', name: 'Monobank USD, Black', kind: 'spending', currency: 'USD' });
const jar = account({ id: 'jar', name: 'На облігацію', kind: 'savings', currency: 'USD' });
const bond = account({ id: 'bond', name: 'облігація $', kind: 'investment', currency: 'USD' });

const monoJar: FetchedMonobankAccount = {
  id: 'mono-jar',
  kind: 'jar',
  name: 'На облігацію',
  currency: 'USD',
  bankBalance: money(2086_99, 'USD'),
};

const storedAt = new Date('2026-09-23T18:00:00.000Z');

const topUp = transfer({
  id: 'top-up',
  date: '2026-02-09',
  fromAccountId: 'card',
  toAccountId: 'bond',
  left: money(1100_00, 'USD'),
  arrived: money(1100_00, 'USD'),
});
const fromJarToCard = transfer({
  id: 'jar-to-card',
  date: '2026-09-15',
  fromAccountId: 'jar',
  toAccountId: 'card',
  left: money(5_00, 'USD'),
  arrived: money(5_00, 'USD'),
});
const betweenThem = transfer({
  id: 'between',
  date: '2026-09-16',
  fromAccountId: 'bond',
  toAccountId: 'jar',
  left: money(1_00, 'USD'),
  arrived: money(1_00, 'USD'),
});
const reconciled: Correction = {
  type: 'correction',
  id: 'reconciled',
  date: '2026-09-23',
  accountId: 'jar',
  amount: money(2086_99, 'USD'),
};

let storage: TestStorage;

beforeEach(() => {
  storage = openTestDb();
  seedReservedCategories(storage.db);
  const accounts = accountsRepo(storage.db);
  accounts.save(card);
  accounts.save(account({ ...jar, openingBalance: money(10_00, 'USD') }));
  accounts.save(bond);
  const monobank = monobankRepo(storage.db);
  monobank.upsertAccounts([monoJar], storedAt);
  monobank.link({
    monobankAccountId: 'mono-jar',
    accountId: 'jar',
    syncStartDate: '2026-09-11',
    cursorMs: Date.UTC(2026, 8, 10, 21),
  });
});

afterEach(() => storage.close());

describe('mergeAccounts', () => {
  it('moves every leg, the monobank link and the remembered рахунок, and deletes the folded one', () => {
    const transactions = transactionsRepo(storage.db);
    for (const t of [topUp, fromJarToCard, betweenThem, reconciled]) {
      transactions.save(t, storedAt);
    }
    entryDefaultsRepo(storage.db).remember('jar');
    notificationsRepo(storage.db).addWatch({ packageName: 'com.ftband.mono', accountId: 'jar' });

    mergeAccounts(storage.db, { fromId: 'jar', intoId: 'bond' });

    expect(accountsRepo(storage.db).get('jar')).toBeUndefined();
    const merged = accountsRepo(storage.db).get('bond');
    expect(merged?.openingBalance).toEqual(money(10_00, 'USD'));
    expect(merged?.kind).toBe('investment');
    expect(merged?.name).toBe('облігація $');

    const onBond = transactions.listByAccount('bond');
    expect(onBond.map((t) => t.id).sort()).toEqual(['jar-to-card', 'reconciled', 'top-up']);
    expect(transactions.get('between')).toBeUndefined();
    expect(transactions.get('jar-to-card')).toMatchObject({ fromAccountId: 'bond', toAccountId: 'card' });
    expect(transactions.get('reconciled')).toMatchObject({ accountId: 'bond' });
    expect(transactions.listByAccount('jar')).toEqual([]);

    const link = monobankRepo(storage.db).linkOf('mono-jar');
    expect(link).toMatchObject({ accountId: 'bond', syncStartDate: '2026-09-11' });
    expect(entryDefaultsRepo(storage.db).remembered()).toBe('bond');
    expect(notificationsRepo(storage.db).watches().map((w) => w.accountId)).toEqual(['bond']);
  });

  it('leaves the folded рахунок\'s коригування behind when asked, and moves everything else', () => {
    const transactions = transactionsRepo(storage.db);
    for (const t of [topUp, fromJarToCard, reconciled]) {
      transactions.save(t, storedAt);
    }

    mergeAccounts(storage.db, { fromId: 'jar', intoId: 'bond', dropCorrections: true });

    expect(transactions.get('reconciled')).toBeUndefined();
    expect(transactions.listByAccount('bond').map((t) => t.id).sort()).toEqual(['jar-to-card', 'top-up']);
  });

  it('keeps the into-рахунок its own вартість, and moves the folded one only onto an investment without one', () => {
    const accounts = accountsRepo(storage.db);
    const other = account({ id: 'other', name: 'binance usdt', kind: 'investment', currency: 'USD' });
    accounts.save(other);
    const investments = investmentsRepo(storage.db);
    investments.set('other', { amount: money(700_00, 'USD'), asOf: '2026-09-20' });

    mergeAccounts(storage.db, { fromId: 'other', intoId: 'bond' });
    expect(investments.get('bond')).toEqual({ amount: money(700_00, 'USD'), asOf: '2026-09-20' });

    investments.set('bond', { amount: money(2086_00, 'USD'), asOf: '2026-09-21' });
    const third = account({ id: 'third', name: 'ще одна', kind: 'investment', currency: 'USD' });
    accounts.save(third);
    investments.set('third', { amount: money(1_00, 'USD'), asOf: '2026-09-22' });
    mergeAccounts(storage.db, { fromId: 'third', intoId: 'bond' });
    expect(investments.get('bond')).toEqual({ amount: money(2086_00, 'USD'), asOf: '2026-09-21' });
    expect(investments.get('third')).toBeUndefined();
  });

  it('Scenario: Merged рахунки keep the earlier дата', () => {
    const accounts = accountsRepo(storage.db);
    accounts.save(account({ ...bond, openingDate: '2026-08-30' }));
    accounts.save(account({ id: 'cash', name: 'готівка $', kind: 'cash', currency: 'USD', openingDate: '2026-06-08' }));
    mergeAccounts(storage.db, { fromId: 'cash', intoId: 'bond' });
    expect(accounts.get('bond')?.openingDate).toBe('2026-06-08');

    // Into one with no дата: the folded рахунок's дата is the only one, so it is kept.
    accounts.save(account({ id: 'cash2', name: 'гаманець $', kind: 'cash', currency: 'USD', openingDate: '2026-06-08' }));
    mergeAccounts(storage.db, { fromId: 'cash2', intoId: 'card' });
    expect(accounts.get('card')?.openingDate).toBe('2026-06-08');

    // Neither has one: none.
    accounts.save(account({ id: 'cash3', name: 'скарбничка $', kind: 'cash', currency: 'USD' }));
    mergeAccounts(storage.db, { fromId: 'cash3', intoId: 'jar' });
    expect(accounts.get('jar')?.openingDate).toBeUndefined();
  });

  it('refuses two linked рахунки and writes nothing', () => {
    const monobank = monobankRepo(storage.db);
    monobank.upsertAccounts(
      [{ ...monoJar, id: 'mono-card', kind: 'card', name: 'black ··7583' }],
      storedAt,
    );
    monobank.link({
      monobankAccountId: 'mono-card',
      accountId: 'bond',
      syncStartDate: '2026-09-11',
      cursorMs: Date.UTC(2026, 8, 10, 21),
    });
    transactionsRepo(storage.db).save(reconciled, storedAt);

    expect(() => mergeAccounts(storage.db, { fromId: 'jar', intoId: 'bond' })).toThrow(
      'обидва рахунки приєднано до monobank',
    );
    expect(accountsRepo(storage.db).get('jar')).toBeDefined();
    expect(transactionsRepo(storage.db).get('reconciled')).toMatchObject({ accountId: 'jar' });
  });

  it('refuses two currencies', () => {
    accountsRepo(storage.db).save(
      account({ id: 'uah', name: 'mono white', kind: 'spending', currency: 'UAH' }),
    );
    expect(() => mergeAccounts(storage.db, { fromId: 'uah', intoId: 'bond' })).toThrow('валюти різні');
    expect(accountsRepo(storage.db).get('uah')).toBeDefined();
  });

  it('Scenario: Merging the card of a розстрочка', () => {
    const saldoBlack = account({ id: 'saldo-black', name: 'mono black (Saldo)', kind: 'spending', currency: 'UAH' });
    const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
    accountsRepo(storage.db).save(saldoBlack);
    accountsRepo(storage.db).save(black);
    const installments = installmentsRepo(storage.db);
    installments.save({
      id: 'i-iphone',
      name: 'iPhone',
      total: 1_000_000,
      partsCount: 10,
      part: 100_000,
      firstDue: '2026-10-05',
      debitAccountId: 'saldo-black',
      paidBefore: 0,
      recordedAt: storedAt.getTime(),
    });
    transactionsRepo(storage.db).save(
      expenseByDefault({ id: 'debit', date: '2026-10-05', accountId: 'saldo-black', amount: money(100_000, 'UAH') }),
      storedAt,
    );
    installments.settle('2026-10-05');
    const links = installments.facts().links;
    expect(links).toHaveLength(1);

    mergeAccounts(storage.db, { fromId: 'saldo-black', intoId: 'black' });

    expect(installments.get('i-iphone')?.debitAccountId).toBe('black');
    expect(installments.facts().links).toEqual(links);
    expect(installments.settle('2026-10-06')).toBe(false);
  });
});
