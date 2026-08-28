import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Income,
  type Transaction,
} from '../domain/transaction';
import { suggestKind } from '../monobank/link';
import { accountsRepo } from './accounts-repo';
import { monobankRepo, type FetchedMonobankAccount, type MonobankRepo } from './monobank-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

/**
 * The storage half of monobank sync: links that survive a restart, item ids that outlive the
 * транзакції they made, and one statement answer that lands whole or not at all.
 *
 * Every bank answer here is synthetic — nothing in this file reaches the network, and no token
 * exists anywhere near it.
 */

const VOCABULARY = {
  categories: [UNCATEGORISED_CATEGORY_ID, 'food'],
  sources: [UNSOURCED_SOURCE_ID],
} as const;

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jarAccount = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });

const monoCard: FetchedMonobankAccount = {
  id: 'mono-card',
  kind: 'card',
  name: 'black ··1234',
  currency: 'UAH',
  bankBalance: money(5_000_00, 'UAH'),
};
const monoJar: FetchedMonobankAccount = {
  id: 'mono-jar',
  kind: 'jar',
  name: 'На відпустку',
  currency: 'USD',
  bankBalance: money(1_234_50, 'USD'),
};

const obtainedAt = new Date('2026-08-28T08:00:00.000Z');
const storedAt = new Date('2026-08-28T08:00:01.000Z');
/** 2026-08-01 as a device-local midnight would produce it; a number, as the cursor is. */
const boundaryMs = Date.UTC(2026, 7, 1, 21, 0, 0);

describe('monobankRepo — accounts and links', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(jarAccount);
    accountsRepo(storage.db).save(dollars);
    repo = monobankRepo(storage.db);
    repo.upsertAccounts([monoCard, monoJar], obtainedAt);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: An existing same-currency рахунок is linked', () => {
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-28',
      cursorMs: boundaryMs,
    });

    expect(repo.listLinks()).toEqual([
      {
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      },
    ]);
    // The link is what makes the account take part in sync; the boundary is where it starts.
    expect(repo.linkForAccount('card')?.syncStartDate).toBe('2026-08-28');
  });

  it('Scenario: A different-currency рахунок is not a link choice', () => {
    // The USD банка onto a UAH рахунок: refused in the owner's words, before any constraint.
    expect(() =>
      repo.link({
        monobankAccountId: 'mono-jar',
        accountId: 'card',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/валюти різні/);
    expect(repo.listLinks()).toEqual([]);
  });

  it('Scenario: A second active link is rejected', () => {
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-28',
      cursorMs: boundaryMs,
    });
    repo.upsertAccounts([{ ...monoCard, id: 'mono-white', name: 'white ··9999' }], obtainedAt);

    // The same monobank account onto a second рахунок…
    expect(() =>
      repo.link({
        monobankAccountId: 'mono-card',
        accountId: 'jar',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/уже приєднано/);
    // …and a second monobank account onto the same рахунок.
    expect(() =>
      repo.link({
        monobankAccountId: 'mono-white',
        accountId: 'card',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/до цього рахунку вже приєднано/);
    // The existing link is untouched by either attempt.
    expect(repo.listLinks()).toEqual([
      {
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      },
    ]);
  });

  it('Scenario: Creating for a банка starts from a suggestion', () => {
    // The вид the link module suggests for a банка, the bank's own name and its currency — and
    // the рахунок and the link arrive together or not at all.
    const created = account({
      id: 'new-jar',
      name: monoJar.name,
      kind: suggestKind({ kind: monoJar.kind }),
      currency: monoJar.currency,
    });
    repo.createAccountAndLink({
      account: created,
      monobankAccountId: 'mono-jar',
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });

    expect(accountsRepo(storage.db).get('new-jar')).toEqual(
      account({ id: 'new-jar', name: 'На відпустку', kind: 'savings', currency: 'USD' }),
    );
    expect(repo.linkOf('mono-jar')).toEqual({
      monobankAccountId: 'mono-jar',
      accountId: 'new-jar',
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });
  });

  it('A рахунок created for a link that fails is not left behind', () => {
    repo.link({
      monobankAccountId: 'mono-jar',
      accountId: 'usd',
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });
    const orphan = account({ id: 'orphan', name: 'ще одна', kind: 'savings', currency: 'USD' });

    expect(() =>
      repo.createAccountAndLink({
        account: orphan,
        monobankAccountId: 'mono-jar',
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/уже приєднано/);
    expect(accountsRepo(storage.db).get('orphan')).toBeUndefined();
  });

  it('Refreshing client-info updates the bank balance and disturbs no link', () => {
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-28',
      cursorMs: boundaryMs,
    });
    const later = new Date('2026-08-28T12:00:00.000Z');

    repo.upsertAccounts([{ ...monoCard, bankBalance: money(4_900_00, 'UAH') }], later);

    expect(repo.getAccount('mono-card')).toEqual({
      ...monoCard,
      bankBalance: money(4_900_00, 'UAH'),
      obtainedAt: later,
    });
    expect(repo.listLinks()).toHaveLength(1);
    // The account the new answer did not mention keeps its own last known figure.
    expect(repo.getAccount('mono-jar')?.bankBalance).toEqual(money(1_234_50, 'USD'));
  });

  it('A balance in another currency than its account is refused', () => {
    expect(() =>
      repo.upsertAccounts([{ ...monoCard, bankBalance: money(100, 'USD') }], obtainedAt),
    ).toThrow(/у USD, а сам рахунок у UAH/);
  });

  it('Unlinking keeps the bank identity, its balance and its imported ids', () => {
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-28',
      cursorMs: boundaryMs,
    });
    repo.commitStatementAnswer({
      monobankAccountId: 'mono-card',
      transactions: [],
      newlySeenIds: ['item-1'],
      bankBalance: money(4_900_00, 'UAH'),
      obtainedAt,
      cursorMs: boundaryMs + 1000,
      storedAt,
    });

    repo.unlink('mono-card');

    expect(repo.listLinks()).toEqual([]);
    expect(repo.getAccount('mono-card')?.bankBalance).toEqual(money(4_900_00, 'UAH'));
    expect(repo.importedIds('mono-card')).toEqual(new Set(['item-1']));
  });

  it('Linking an unknown monobank account or an unknown рахунок is refused', () => {
    expect(() =>
      repo.link({
        monobankAccountId: 'nope',
        accountId: 'card',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/невідомий/);
    expect(() =>
      repo.link({
        monobankAccountId: 'mono-card',
        accountId: 'nope',
        syncStartDate: '2026-08-28',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/не існує/);
  });

  it('A boundary that is not a calendar date never reaches storage', () => {
    expect(() =>
      repo.link({
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-02-31',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/not a calendar date/);
    expect(repo.listLinks()).toEqual([]);
  });
});

describe('monobankRepo — across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-monobank-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A link resumes after restart', () => {
    const path = join(dir, 'cap1tal.db');
    const cursorMs = Date.UTC(2026, 7, 27, 21, 0, 0);

    const first = openFileDb(path);
    seedReferences(first.db, VOCABULARY);
    accountsRepo(first.db).save(card);
    const firstRepo = monobankRepo(first.db);
    firstRepo.upsertAccounts([monoCard], obtainedAt);
    firstRepo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-01',
      cursorMs,
    });
    first.close();

    const reopened = openFileDb(path);
    try {
      const repo = monobankRepo(reopened.db);
      expect(repo.listLinks()).toEqual([
        {
          monobankAccountId: 'mono-card',
          accountId: 'card',
          syncStartDate: '2026-08-01',
          cursorMs,
        },
      ]);
      expect(repo.getAccount('mono-card')).toEqual({ ...monoCard, obtainedAt });
    } finally {
      reopened.close();
    }
  });
});

describe('monobankRepo — one statement answer', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;
  let txs: TransactionsRepo;

  const spent = (id: string, amount: number, description: string): Transaction =>
    expenseByDefault({
      id,
      date: '2026-08-27',
      accountId: 'card',
      amount: money(amount, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      description,
    });

  const arrived = (id: string, amount: number): Income => ({
    type: 'income',
    id,
    date: '2026-08-27',
    accountId: 'card',
    amount: money(amount, 'UAH'),
    sourceId: UNSOURCED_SOURCE_ID,
  });

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    repo = monobankRepo(storage.db);
    txs = transactionsRepo(storage.db);
    repo.upsertAccounts([monoCard], obtainedAt);
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A complete answer survives restart whole', () => {
    const three = [spent('t1', 12550, 'СІЛЬПО'), spent('t2', 8900, 'Uklon'), arrived('t3', 30000)];
    const later = new Date('2026-08-28T09:00:00.000Z');

    repo.commitStatementAnswer({
      monobankAccountId: 'mono-card',
      transactions: three,
      // The zero-amount item mapped to no транзакція and is remembered all the same.
      newlySeenIds: ['item-1', 'item-2', 'item-3', 'item-zero'],
      bankBalance: money(4_800_00, 'UAH'),
      obtainedAt: later,
      cursorMs: boundaryMs + 86_400_000,
      storedAt,
    });

    for (const t of three) {
      expect(txs.get(t.id)).toEqual(t);
    }
    expect(repo.importedIds('mono-card')).toEqual(
      new Set(['item-1', 'item-2', 'item-3', 'item-zero']),
    );
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundaryMs + 86_400_000);
    expect(repo.getAccount('mono-card')).toEqual({
      ...monoCard,
      bankBalance: money(4_800_00, 'UAH'),
      obtainedAt: later,
    });
    // The answer's own order is the feed's order within the day: stored a millisecond apart.
    expect(txs.listLatest(10).map((t) => t.id)).toEqual(['t3', 't2', 't1']);
  });

  it('Scenario: A transaction failure rolls back sync metadata', () => {
    const rejected = expenseByDefault({
      id: 't2',
      date: '2026-08-27',
      accountId: 'card',
      amount: money(8900, 'UAH'),
      // A категорія no row has: the foreign key refuses it, halfway through the answer.
      categoryId: 'no-such-category',
    });

    expect(() =>
      repo.commitStatementAnswer({
        monobankAccountId: 'mono-card',
        transactions: [spent('t1', 12550, 'СІЛЬПО'), rejected],
        newlySeenIds: ['item-1', 'item-2'],
        bankBalance: money(4_800_00, 'UAH'),
        obtainedAt: new Date('2026-08-28T09:00:00.000Z'),
        cursorMs: boundaryMs + 86_400_000,
        storedAt,
      }),
    ).toThrow(/FOREIGN KEY constraint failed/);

    // Neither транзакція, neither item id, and the cursor and баланс банку as they were.
    expect(txs.get('t1')).toBeUndefined();
    expect(txs.get('t2')).toBeUndefined();
    expect(repo.importedIds('mono-card')).toEqual(new Set());
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundaryMs);
    expect(repo.getAccount('mono-card')).toEqual({ ...monoCard, obtainedAt });
  });

  it('Scenario: Deleting a transaction keeps its imported id', () => {
    repo.commitStatementAnswer({
      monobankAccountId: 'mono-card',
      transactions: [spent('t1', 12550, 'СІЛЬПО')],
      newlySeenIds: ['item-1'],
      bankBalance: money(4_800_00, 'UAH'),
      obtainedAt,
      cursorMs: boundaryMs + 1000,
      storedAt,
    });

    txs.remove('t1');

    // The memory is of the *item*, not of the транзакція it made, so the item is still imported…
    expect(repo.hasImported('mono-card', 'item-1')).toBe(true);
    // …and offering it again is refused rather than quietly recreating the витрата.
    expect(() =>
      repo.commitStatementAnswer({
        monobankAccountId: 'mono-card',
        transactions: [spent('t1-again', 12550, 'СІЛЬПО')],
        newlySeenIds: ['item-1'],
        bankBalance: money(4_800_00, 'UAH'),
        obtainedAt,
        cursorMs: boundaryMs + 2000,
        storedAt,
      }),
    ).toThrow(/UNIQUE constraint failed/);
    expect(txs.get('t1-again')).toBeUndefined();
  });

  it('Scenario: Relinking does not resurrect a deleted transaction', () => {
    repo.commitStatementAnswer({
      monobankAccountId: 'mono-card',
      transactions: [spent('t1', 12550, 'СІЛЬПО')],
      newlySeenIds: ['item-1'],
      bankBalance: money(4_800_00, 'UAH'),
      obtainedAt,
      cursorMs: boundaryMs + 1000,
      storedAt,
    });
    txs.remove('t1');

    repo.unlink('mono-card');
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });

    // The same statement item arrives again on the fresh link: still remembered, so a sync that
    // asks `importedIds` for its seen set maps it to nothing at all.
    expect(repo.importedIds('mono-card').has('item-1')).toBe(true);
    expect(txs.get('t1')).toBeUndefined();
  });

  it('Scenario: The same item id belongs separately to each bank account', () => {
    repo.upsertAccounts([{ ...monoCard, id: 'mono-white', name: 'white ··9999' }], obtainedAt);
    accountsRepo(storage.db).save(jarAccount);
    repo.link({
      monobankAccountId: 'mono-white',
      accountId: 'jar',
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });

    const commitX = (monobankAccountId: string) =>
      repo.commitStatementAnswer({
        monobankAccountId,
        transactions: [],
        newlySeenIds: ['X'],
        bankBalance: money(1, 'UAH'),
        obtainedAt,
        cursorMs: boundaryMs + 1000,
        storedAt,
      });

    // Both pairs store…
    commitX('mono-card');
    commitX('mono-white');
    expect(repo.hasImported('mono-card', 'X')).toBe(true);
    expect(repo.hasImported('mono-white', 'X')).toBe(true);

    // …and either one a second time is refused.
    expect(() => commitX('mono-card')).toThrow(/UNIQUE constraint failed/);
    expect(() => commitX('mono-white')).toThrow(/UNIQUE constraint failed/);
  });

  it('An answer for an account that was unlinked mid-run stores nothing', () => {
    repo.unlink('mono-card');

    expect(() =>
      repo.commitStatementAnswer({
        monobankAccountId: 'mono-card',
        transactions: [spent('t1', 12550, 'СІЛЬПО')],
        newlySeenIds: ['item-1'],
        bankBalance: money(4_800_00, 'UAH'),
        obtainedAt,
        cursorMs: boundaryMs + 1000,
        storedAt,
      }),
    ).toThrow(/уже відʼєднано/);
    expect(txs.get('t1')).toBeUndefined();
    expect(repo.importedIds('mono-card')).toEqual(new Set());
  });

  it('A balance in another currency than the bank account is refused', () => {
    expect(() =>
      repo.commitStatementAnswer({
        monobankAccountId: 'mono-card',
        transactions: [],
        newlySeenIds: [],
        bankBalance: money(100, 'USD'),
        obtainedAt,
        cursorMs: boundaryMs + 1000,
        storedAt,
      }),
    ).toThrow(/USD не належить рахунку monobank у UAH/);
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundaryMs);
  });
});

describe('monobankRepo.linkMany — a reviewed set, whole or not at all', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;

  const secondCard: FetchedMonobankAccount = {
    id: 'mono-white',
    kind: 'card',
    name: 'white ··9999',
    currency: 'UAH',
    bankBalance: money(150_00, 'UAH'),
  };
  /** The рахунок a `new` proposal would create for the USD банка. */
  const madeForJar = account({
    id: 'made-jar',
    name: 'На відпустку',
    kind: 'savings',
    currency: 'USD',
  });

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(jarAccount);
    accountsRepo(storage.db).save(dollars);
    repo = monobankRepo(storage.db);
    repo.upsertAccounts([monoCard, monoJar, secondCard], obtainedAt);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Accepting the set links every proposal at once', () => {
    repo.linkMany({
      accepted: [
        { kind: 'existing', monobankAccountId: 'mono-card', accountId: 'card' },
        { kind: 'new', monobankAccountId: 'mono-jar', account: madeForJar },
        { kind: 'existing', monobankAccountId: 'mono-white', accountId: 'jar' },
      ],
      syncStartDate: '2026-08-01',
      cursorMs: boundaryMs,
    });

    expect(repo.listLinks()).toEqual([
      {
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      },
      {
        monobankAccountId: 'mono-jar',
        accountId: 'made-jar',
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      },
      {
        monobankAccountId: 'mono-white',
        accountId: 'jar',
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      },
    ]);
    // The рахунок a proposal promised to create exists, with the currency the link demands.
    const created = accountsRepo(storage.db)
      .list()
      .find((a) => a.id === 'made-jar');
    expect(created?.currency).toBe('USD');
    expect(created?.kind).toBe('savings');
  });

  it('Scenario: A refused member leaves nothing behind', () => {
    // The second member joins a USD банка to a UAH рахунок — the one thing a link may never be.
    expect(() =>
      repo.linkMany({
        accepted: [
          { kind: 'existing', monobankAccountId: 'mono-card', accountId: 'card' },
          { kind: 'existing', monobankAccountId: 'mono-jar', accountId: 'jar' },
          { kind: 'new', monobankAccountId: 'mono-white', account: madeForJar },
        ],
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/валюти різні/);

    expect(repo.listLinks()).toEqual([]);
    expect(
      accountsRepo(storage.db)
        .list()
        .map((a) => a.id),
    ).not.toContain('made-jar');
  });

  it('The one-to-one rule holds inside the set, not only against what is stored', () => {
    // Two cards onto one рахунок: refused before a single row is written, rather than after the
    // owner has already accepted the set and the first half of it is on disk.
    expect(() =>
      repo.linkMany({
        accepted: [
          { kind: 'existing', monobankAccountId: 'mono-card', accountId: 'card' },
          { kind: 'existing', monobankAccountId: 'mono-white', accountId: 'card' },
        ],
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/вже приєднано/);
    expect(repo.listLinks()).toEqual([]);

    // And one card onto two рахунки is refused the same way.
    expect(() =>
      repo.linkMany({
        accepted: [
          { kind: 'existing', monobankAccountId: 'mono-card', accountId: 'card' },
          { kind: 'existing', monobankAccountId: 'mono-card', accountId: 'jar' },
        ],
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/уже приєднано/);
    expect(repo.listLinks()).toEqual([]);
  });

  it('A рахунок that does not exist is refused, and nothing is written', () => {
    expect(() =>
      repo.linkMany({
        accepted: [
          { kind: 'existing', monobankAccountId: 'mono-card', accountId: 'card' },
          { kind: 'existing', monobankAccountId: 'mono-white', accountId: 'ghost' },
        ],
        syncStartDate: '2026-08-01',
        cursorMs: boundaryMs,
      }),
    ).toThrow(/не існує/);
    expect(repo.listLinks()).toEqual([]);
  });

  it('An empty set writes nothing and refuses nothing', () => {
    repo.linkMany({ accepted: [], syncStartDate: '2026-08-01', cursorMs: boundaryMs });
    expect(repo.listLinks()).toEqual([]);
  });
});
