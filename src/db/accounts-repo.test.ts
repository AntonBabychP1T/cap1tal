import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account, activeAccounts, computeBalance } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, refund } from '../domain/transaction';
import { accountsRepo, type AccountsRepo } from './accounts-repo';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';
import { groupAccountsByKind } from '../ui/account-groups';
import { openFileDb, openTestDb, type TestStorage } from './test-db';

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(123456, 'UAH'),
});
const wallet = account({ id: 'wallet', name: 'гаманець', kind: 'cash', currency: 'UAH' });

const coffee = expenseByDefault({
  id: 'e1',
  date: '2026-03-10',
  accountId: 'card',
  amount: money(12550, 'UAH'),
  categoryId: 'food',
});
/** A fixed instant: storage recency is data these tests control, never the wall clock. */
const storedAt = new Date('2026-03-10T09:00:00.000Z');

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

  it('Scenario: Renaming keeps identity and history', () => {
    repo.save(card);
    txs.save(coffee, storedAt);

    repo.save(account({ ...card, name: 'mono чорна' }));

    const renamed = repo.get('card');
    expect(renamed?.id).toBe('card');
    expect(renamed?.name).toBe('mono чорна');
    expect(renamed?.kind).toBe('spending');
    expect(txs.listByAccount('card')).toEqual([coffee]);
    expect(computeBalance(renamed!, txs.listByAccount('card'))).toEqual(money(110906, 'UAH'));
  });

  it('Scenario: Editing the opening balance moves the computed balance', () => {
    const opened = account({ id: 'opened', name: 'нова', kind: 'spending', currency: 'UAH' });
    repo.save(opened);
    const expense = expenseByDefault({
      id: 'e-30000',
      date: '2026-03-10',
      accountId: 'opened',
      amount: money(30000, 'UAH'),
      categoryId: 'food',
    });
    txs.save(expense, storedAt);
    expect(computeBalance(repo.get('opened')!, txs.listByAccount('opened'))).toEqual(
      money(-30000, 'UAH'),
    );

    repo.save(account({ ...opened, openingBalance: money(100000, 'UAH') }));

    expect(computeBalance(repo.get('opened')!, txs.listByAccount('opened'))).toEqual(
      money(70000, 'UAH'),
    );
  });

  it('Scenario: Changing the kind is rejected', () => {
    repo.save(card);
    expect(card.kind).toBe('spending');

    expect(() => repo.save(account({ ...card, kind: 'savings' }))).toThrow();

    expect(repo.get('card')?.kind).toBe('spending');
  });

  it('Scenario: Changing the currency is rejected', () => {
    repo.save(card);
    expect(card.currency).toBe('UAH');

    expect(() =>
      repo.save(
        account({ ...card, currency: 'USD', openingBalance: money(123456, 'USD') }),
      ),
    ).toThrow();

    expect(repo.get('card')?.currency).toBe('UAH');
    expect(repo.get('card')?.openingBalance).toEqual(money(123456, 'UAH'));
  });

  it('Scenario: Archiving keeps history and balance', () => {
    // The scenario's account: opening 100000 + income 50000 - expense 30000 + refund 10000.
    const opened = account({
      id: 'opened',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    repo.save(opened);
    txs.save(
      {
        type: 'income',
        id: 'i1',
        date: '2026-03-05',
        accountId: 'opened',
        amount: money(50000, 'UAH'),
        sourceId: 'salary',
      },
      storedAt,
    );
    txs.save(
      expenseByDefault({
        id: 'e1',
        date: '2026-03-10',
        accountId: 'opened',
        amount: money(30000, 'UAH'),
        categoryId: 'food',
      }),
      storedAt,
    );
    txs.save(
      refund({
        id: 'r1',
        date: '2026-03-12',
        accountId: 'opened',
        amount: money(10000, 'UAH'),
        categoryId: 'clothes',
      }),
      storedAt,
    );
    const before = txs.listByAccount('opened');
    expect(computeBalance(repo.get('opened')!, before)).toEqual(money(130000, 'UAH'));

    repo.save(account({ ...opened, archived: true }));

    const archived = repo.get('opened');
    expect(archived?.archived).toBe(true);
    expect(txs.listByAccount('opened')).toEqual(before);
    expect(computeBalance(archived!, txs.listByAccount('opened'))).toEqual(money(130000, 'UAH'));
  });

  it('Scenario: An account shows its computed balance', () => {
    // The Рахунки screen's exact read path: computeBalance over listByAccount.
    const opened = account({
      id: 'opened',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    repo.save(opened);
    txs.save(
      expenseByDefault({
        id: 'e1',
        date: '2026-03-10',
        accountId: 'opened',
        amount: money(30000, 'UAH'),
        categoryId: 'food',
      }),
      storedAt,
    );

    expect(computeBalance(repo.get('opened')!, txs.listByAccount('opened'))).toEqual(
      money(70000, 'UAH'),
    );
  });

  it('Scenario: A created account is usable immediately', () => {
    const purse = account({ id: 'purse', name: 'гаманець', kind: 'cash', currency: 'UAH' });

    repo.save(purse);

    // Everything the Рахунки screen and the entry form read, straight after creation.
    expect(computeBalance(repo.get('purse')!, txs.listByAccount('purse'))).toEqual(
      money(0, 'UAH'),
    );
    expect(activeAccounts(repo.list()).map((a) => a.id)).toContain('purse');
    expect(
      groupAccountsByKind(repo.list()).find((g) => g.kind === 'cash')?.accounts.map((a) => a.id),
    ).toEqual(['purse']);
  });

  it('Re-saving an account that already has transactions keeps its history', () => {
    repo.save(card);
    txs.save(coffee, storedAt);

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

describe('accountsRepo on a file database', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-accounts-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: An archived account survives a restart', () => {
    const path = join(dir, 'cap1tal.db');
    const archivedJar = account({
      id: 'jar',
      name: 'стара банка',
      kind: 'savings',
      currency: 'UAH',
      archived: true,
    });

    const first = openFileDb(path);
    accountsRepo(first.db).save(archivedJar);
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(accountsRepo(reopened.db).get('jar')).toEqual(archivedJar);
      expect(accountsRepo(reopened.db).get('jar')?.archived).toBe(true);
    } finally {
      reopened.close();
    }
  });
});
