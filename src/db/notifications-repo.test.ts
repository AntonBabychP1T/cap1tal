import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, isoDate, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { fingerprintOf, type CapturedNotification } from '../notifications/capture';
import { processCapture, type Draft } from '../notifications/draft';
import { accountsRepo } from './accounts-repo';
import { notificationsRepo, type NotificationsRepo } from './notifications-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const card = account({ id: 'card', name: 'Приват', kind: 'spending', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD картка', kind: 'spending', currency: 'USD' });

const purchase: CapturedNotification = {
  packageName: 'ua.privatbank.ap24',
  postedAt: Date.UTC(2026, 7, 26, 9, 30),
  title: 'Оплата',
  text: 'Оплата 250.00UAH. Сільпо',
};

const rawDraft: Draft = {
  id: 'd-raw',
  accountId: 'card',
  currency: 'UAH',
  date: isoDate('2026-08-26'),
  text: 'FOREIGN 10.00 USD',
  proposal: { kind: 'raw', original: money(1000, 'USD') },
};

const storedAt = new Date('2026-08-26T12:00:00.000Z');

/** The context `processCapture` needs when a test asks it what a capture comes to now. */
function contextOf(repo: NotificationsRepo) {
  return {
    watches: repo.watches(),
    seenFingerprints: repo.seenFingerprints(),
    rules: [],
    newId: () => 'generated',
    dateOf: () => isoDate('2026-08-26'),
  };
}

describe('notificationsRepo', () => {
  let storage: TestStorage;
  let repo: NotificationsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, { categories: [UNCATEGORISED_CATEGORY_ID] });
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(dollars);
    repo = notificationsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A watch carries its рахунок’s currency, read from the рахунок', () => {
    repo.addWatch({ packageName: 'ua.privatbank.ap24', accountId: 'card' });
    repo.addWatch({ packageName: 'ua.other.bank', accountId: 'usd' });

    // The currency is nowhere on the watch row: it is the рахунок's, joined on read, so it cannot
    // drift from the money the чернетка would land in.
    expect(repo.watches()).toEqual([
      { packageName: 'ua.other.bank', accountId: 'usd', currency: 'USD' },
      { packageName: 'ua.privatbank.ap24', accountId: 'card', currency: 'UAH' },
    ]);
  });

  it('Scenario: A failed draft stores no fingerprint', () => {
    const fingerprint = fingerprintOf(purchase);

    // A чернетка on a рахунок no row has — the storage refuses it, and the fingerprint must not
    // survive on its own, or the redelivered capture would be swallowed for good.
    expect(() =>
      repo.commitOutcome(
        {
          kind: 'drafted',
          draft: { ...rawDraft, accountId: 'gone' },
          fingerprint,
        },
        storedAt,
      ),
    ).toThrow();

    expect(repo.seenFingerprints().has(fingerprint)).toBe(false);
    expect(repo.pendingDrafts()).toEqual([]);

    // So the same capture can still draft: nothing was remembered about it.
    repo.addWatch({ packageName: 'ua.privatbank.ap24', accountId: 'card' });
    expect(processCapture(purchase, contextOf(repo)).kind).toBe('drafted');
  });

  it('An outcome that stores nothing writes nothing', () => {
    repo.commitOutcome({ kind: 'ignored' }, storedAt);
    repo.commitOutcome({ kind: 'duplicate' }, storedAt);

    expect(repo.seenFingerprints().size).toBe(0);
    expect(repo.pendingDrafts()).toEqual([]);
    expect(transactionsRepo(storage.db).listAll()).toEqual([]);
  });

  it('The newest чернетка is first, by when it was drafted', () => {
    const older: Draft = { ...rawDraft, id: 'd-older', date: isoDate('2026-08-27') };
    repo.commitOutcome(
      { kind: 'drafted', draft: older, fingerprint: 'f-older' },
      new Date('2026-08-26T08:00:00.000Z'),
    );
    repo.commitOutcome(
      { kind: 'drafted', draft: { ...rawDraft, id: 'd-newer' }, fingerprint: 'f-newer' },
      new Date('2026-08-26T09:00:00.000Z'),
    );

    // The one drafted later stands first, even though it carries the earlier calendar date: a
    // bank can post today about yesterday's purchase.
    expect(repo.pendingDrafts().map((draft) => draft.id)).toEqual(['d-newer', 'd-older']);
  });

  it('Confirming a чернетка that is already gone stores no транзакція', () => {
    repo.commitOutcome({ kind: 'drafted', draft: rawDraft, fingerprint: 'f' }, storedAt);
    repo.dismiss(rawDraft.id);

    const expense = expenseByDefault({
      id: 't-late',
      date: isoDate('2026-08-26'),
      accountId: 'card',
      amount: money(30000, 'UAH'),
    });
    expect(() => repo.confirm(rawDraft.id, expense, storedAt)).toThrow();
    expect(transactionsRepo(storage.db).listAll()).toEqual([]);
  });
});

describe('notificationsRepo across a restart', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-notifications-'));
    path = join(dir, 'cap1tal.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A new connection to the same file — the closest a test gets to launching the app again. */
  function reopened<T>(inspect: (storage: TestStorage) => T): T {
    const storage = openFileDb(path);
    try {
      return inspect(storage);
    } finally {
      storage.close();
    }
  }

  function withAccounts(write: (storage: TestStorage) => void): void {
    reopened((storage) => {
      seedReferences(storage.db, { categories: [UNCATEGORISED_CATEGORY_ID] });
      accountsRepo(storage.db).save(card);
      write(storage);
    });
  }

  it('Scenario: A watch round-trips', () => {
    withAccounts((storage) => {
      notificationsRepo(storage.db).addWatch({
        packageName: 'ua.privatbank.ap24',
        accountId: 'card',
      });
    });

    reopened((storage) => {
      expect(notificationsRepo(storage.db).watches()).toEqual([
        { packageName: 'ua.privatbank.ap24', accountId: 'card', currency: 'UAH' },
      ]);
    });
  });

  it('Scenario: A removed watch stays removed', () => {
    withAccounts((storage) => {
      const repo = notificationsRepo(storage.db);
      repo.addWatch({ packageName: 'ua.privatbank.ap24', accountId: 'card' });
      repo.addWatch({ packageName: 'ua.other.bank', accountId: 'card' });
      repo.removeWatch('ua.privatbank.ap24');
    });

    reopened((storage) => {
      // Only that one: every other watch is exactly as it was.
      expect(notificationsRepo(storage.db).watches()).toEqual([
        { packageName: 'ua.other.bank', accountId: 'card', currency: 'UAH' },
      ]);
    });
  });

  it('Scenario: A pending чернетка round-trips whole', () => {
    withAccounts((storage) => {
      notificationsRepo(storage.db).commitOutcome(
        { kind: 'drafted', draft: rawDraft, fingerprint: 'f-raw' },
        storedAt,
      );
    });

    reopened((storage) => {
      // Whole: the same рахунок, date, text and the foreign reference it was drafted with.
      expect(notificationsRepo(storage.db).pendingDrafts()).toEqual([rawDraft]);
    });
  });

  it('Scenario: A settled чернетка does not return', () => {
    withAccounts((storage) => {
      const repo = notificationsRepo(storage.db);
      repo.commitOutcome({ kind: 'drafted', draft: rawDraft, fingerprint: 'f-raw' }, storedAt);
      repo.commitOutcome(
        {
          kind: 'drafted',
          draft: { ...rawDraft, id: 'd-confirmed', proposal: { kind: 'raw' } },
          fingerprint: 'f-confirmed',
        },
        storedAt,
      );
      repo.dismiss(rawDraft.id);
      repo.confirm(
        'd-confirmed',
        expenseByDefault({
          id: 't-confirmed',
          date: isoDate('2026-08-26'),
          accountId: 'card',
          amount: money(30000, 'UAH'),
        }),
        storedAt,
      );
    });

    reopened((storage) => {
      expect(notificationsRepo(storage.db).pendingDrafts()).toEqual([]);
      // The confirmed one left a транзакція behind; the dismissed one left nothing.
      expect(transactionsRepo(storage.db).listAll().map((t) => t.id)).toEqual(['t-confirmed']);
    });
  });

  it('Scenario: A committed outcome survives restart whole', () => {
    const fingerprint = fingerprintOf(purchase);
    withAccounts((storage) => {
      notificationsRepo(storage.db).commitOutcome(
        {
          kind: 'auto-confirmed',
          transaction: expenseByDefault({
            id: 't-auto',
            date: isoDate('2026-08-26'),
            accountId: 'card',
            amount: money(25000, 'UAH'),
            description: 'Оплата Оплата 250.00UAH. Сільпо',
          }),
          fingerprint,
        },
        storedAt,
      );
    });

    reopened((storage) => {
      const repo = notificationsRepo(storage.db);
      expect(repo.seenFingerprints().has(fingerprint)).toBe(true);
      const stored = transactionsRepo(storage.db).listAll();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: 't-auto',
        type: 'expense',
        amount: money(25000, 'UAH'),
        accountId: 'card',
      });
    });
  });

  it('Scenario: A deleted транзакція keeps its fingerprint', () => {
    const fingerprint = fingerprintOf(purchase);
    withAccounts((storage) => {
      const repo = notificationsRepo(storage.db);
      repo.addWatch({ packageName: 'ua.privatbank.ap24', accountId: 'card' });
      repo.commitOutcome(
        {
          kind: 'drafted',
          draft: { ...rawDraft, id: 'd-purchase', proposal: { kind: 'expense', amount: money(25000, 'UAH') } },
          fingerprint,
        },
        storedAt,
      );
      repo.confirm(
        'd-purchase',
        expenseByDefault({
          id: 't-purchase',
          date: isoDate('2026-08-26'),
          accountId: 'card',
          amount: money(25000, 'UAH'),
        }),
        storedAt,
      );
      transactionsRepo(storage.db).remove('t-purchase');
    });

    reopened((storage) => {
      const repo = notificationsRepo(storage.db);
      expect(repo.seenFingerprints().has(fingerprint)).toBe(true);
      // And the memory still bites: the same captured notification yields nothing at all.
      expect(processCapture(purchase, contextOf(repo)).kind).toBe('duplicate');
      expect(transactionsRepo(storage.db).listAll()).toEqual([]);
    });
  });
});
