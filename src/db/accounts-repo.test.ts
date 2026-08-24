import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { accountsRepo, type AccountsRepo } from './accounts-repo';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';
import { openTestDb, type TestStorage } from './test-db';

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(123456, 'UAH'),
});
const wallet = account({ id: 'wallet', name: 'гаманець', kind: 'cash', currency: 'UAH' });

describe('accountsRepo', () => {
  let storage: TestStorage;
  let repo: AccountsRepo;
  let txs: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = accountsRepo(storage.db);
    txs = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('An account round-trips through storage, opening balance included', () => {
    repo.save(card);
    expect(repo.get('card')).toEqual(card);
    expect(repo.get('card')?.openingBalance).toEqual(money(123456, 'UAH'));
  });

  it('An account created without an opening balance comes back with zero', () => {
    repo.save(wallet);
    expect(repo.get('wallet')?.openingBalance).toEqual(money(0, 'UAH'));
  });

  it('Loading an unknown account id returns nothing', () => {
    expect(repo.get('never-stored')).toBeUndefined();
  });

  it('Listing returns every stored account', () => {
    repo.save(card);
    repo.save(wallet);
    expect(repo.list().map((a) => a.id).sort()).toEqual(['card', 'wallet']);
  });

  it('Re-saving an account that already has transactions keeps its history', () => {
    repo.save(card);
    txs.save(
      expenseByDefault({
        id: 'e1',
        date: '2026-03-10',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: 'food',
      }),
    );

    const renamed = account({
      id: 'card',
      name: 'mono white',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(200000, 'UAH'),
    });
    expect(() => repo.save(renamed)).not.toThrow();

    expect(repo.get('card')).toEqual(renamed);
    expect(txs.get('e1')).toBeDefined();
    expect(repo.list()).toHaveLength(1);
  });
});
