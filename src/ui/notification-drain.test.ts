import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { Rule } from '../domain/rules';
import { isoDate, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { accountsRepo } from '../db/accounts-repo';
import { notificationsRepo, type NotificationsRepo } from '../db/notifications-repo';
import { openTestDb, seedReferences, type TestStorage } from '../db/test-db';
import { transactionsRepo, type TransactionsRepo } from '../db/transactions-repo';
import type { CapturedNotification } from '../notifications/capture';
import {
  inMemoryNotificationCapture,
  type NotificationCapturePort,
  type WatchedSetOutcome,
} from '../platform/notification-capture';
import { drainCaptures, onCapturesStored, type DrainStorage } from './notification-drain';

const card = account({ id: 'card', name: 'Приват', kind: 'spending', currency: 'UAH' });

const PRIVAT = 'ua.privatbank.ap24';

function posted(overrides: Partial<CapturedNotification> = {}): CapturedNotification {
  return {
    packageName: PRIVAT,
    postedAt: new Date(2026, 7, 26, 9, 30).getTime(),
    title: 'Оплата',
    text: 'Оплата 250.00UAH. Сільпо. Баланс: 1234.56UAH',
    ...overrides,
  };
}

const groceries: Rule = {
  id: 'r-groceries',
  merchant: 'сільпо',
  categoryId: 'groceries',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('drainCaptures', () => {
  let storage: TestStorage;
  let repo: NotificationsRepo;
  let transactions: TransactionsRepo;
  let ids: number;

  const drain = (capture: NotificationCapturePort, rules: readonly Rule[] = []) =>
    drainCaptures({
      capture,
      storage: repo,
      rules: () => rules,
      newId: () => `id-${(ids += 1)}`,
      // The device's own mapping, fixed here so the date a чернетка carries is the test's to say.
      dateOf: () => isoDate('2026-08-26'),
      now: () => new Date('2026-08-26T12:00:00.000Z'),
    });

  beforeEach(() => {
    ids = 0;
    storage = openTestDb();
    seedReferences(storage.db, { categories: [UNCATEGORISED_CATEGORY_ID, 'groceries'] });
    accountsRepo(storage.db).save(card);
    repo = notificationsRepo(storage.db);
    transactions = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A notification captured while the app was closed becomes a чернетка', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    // Waiting on the device before the app ran at all — the queue the capture layer kept.
    const capture = inMemoryNotificationCapture({ queue: [posted()] });

    const report = await drain(capture);

    expect(report).toMatchObject({ collected: 1, acknowledged: 1, drafted: 1 });
    expect(repo.pendingDrafts()).toEqual([
      {
        id: 'id-1',
        accountId: 'card',
        currency: 'UAH',
        date: '2026-08-26',
        text: 'Оплата Оплата 250.00UAH. Сільпо. Баланс: 1234.56UAH',
        proposal: { kind: 'expense', amount: money(25000, 'UAH') },
      },
    ]);
    // Acknowledged, so the phone stops offering it.
    expect(capture.waiting()).toEqual([]);
  });

  it('Scenario: A crash before acknowledgement does not double the чернетка', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const notification = posted();
    const capture = inMemoryNotificationCapture({ queue: [notification] });

    // The чернетка was stored and the app died before the acknowledgement landed: everything the
    // drain did happened, except forgetting the record.
    await drain({ ...capture, acknowledge: () => Promise.resolve() });
    expect(repo.pendingDrafts()).toHaveLength(1);
    expect(capture.waiting()).toEqual([notification]);

    const second = await drain(capture);

    expect(second).toMatchObject({ collected: 1, acknowledged: 1, drafted: 0 });
    // Exactly one чернетка, and the redelivery is acknowledged with nothing new stored.
    expect(repo.pendingDrafts()).toHaveLength(1);
    expect(capture.waiting()).toEqual([]);
  });

  it('Scenario: A правило match lands in the feed without waiting', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const capture = inMemoryNotificationCapture({ queue: [posted()] });

    const report = await drain(capture, [groceries]);

    expect(report).toMatchObject({ collected: 1, acknowledged: 1, drafted: 0, autoConfirmed: 1 });
    // In the feed as an ordinary витрата, in the правило's категорія…
    expect(transactions.listAll()).toMatchObject([
      {
        type: 'expense',
        accountId: 'card',
        amount: money(25000, 'UAH'),
        categoryId: 'groceries',
        date: '2026-08-26',
      },
    ]);
    // …and nothing awaits the owner on Головний.
    expect(repo.pendingDrafts()).toEqual([]);
  });

  it('Scenario: Outcomes that store nothing still drain the queue', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const notification = posted();
    const capture = inMemoryNotificationCapture({ queue: [notification] });
    await drain(capture);
    expect(repo.pendingDrafts()).toHaveLength(1);

    // The phone posts the very same notification again — its fingerprint is already remembered.
    capture.capture(notification);
    const report = await drain(capture);

    expect(report).toMatchObject({ collected: 1, acknowledged: 1, drafted: 0, autoConfirmed: 0 });
    expect(repo.pendingDrafts()).toHaveLength(1);
    // Acknowledged all the same, so the next collection hands over nothing for it.
    expect(capture.waiting()).toEqual([]);
    expect(await capture.collect()).toEqual([]);
  });

  it('An unwatched app leaves no trace and does not clog the queue', async () => {
    const capture = inMemoryNotificationCapture({
      queue: [posted({ packageName: 'com.some.other.app' })],
    });

    const report = await drain(capture);

    expect(report).toMatchObject({ collected: 1, acknowledged: 1, drafted: 0 });
    expect(repo.pendingDrafts()).toEqual([]);
    // Not even remembered: an app the owner never pointed at leaves nothing whatsoever behind.
    expect(repo.seenFingerprints().size).toBe(0);
    expect(capture.waiting()).toEqual([]);
  });

  it('A repeat inside one collection dies on the fingerprint the batch has just committed', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const notification = posted();
    const capture = inMemoryNotificationCapture({ queue: [notification, notification] });

    const report = await drain(capture);

    // Both handed over, one чернетка: the seen set grows as the batch commits, so the second copy
    // is a duplicate rather than a second чернетка.
    expect(report).toMatchObject({ collected: 2, acknowledged: 2, drafted: 1 });
    expect(repo.pendingDrafts()).toHaveLength(1);
    expect(capture.waiting()).toEqual([]);
  });

  it('A storage failure acknowledges only the committed prefix and the tail redelivers', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const first = posted();
    const second = posted({ postedAt: new Date(2026, 7, 26, 10, 0).getTime() });
    const third = posted({ postedAt: new Date(2026, 7, 26, 11, 0).getTime() });
    const capture = inMemoryNotificationCapture({ queue: [first, second, third] });

    // Storage refuses everything after the first outcome — a disk that filled, a constraint that
    // fired. The drain stops there rather than acknowledging what it could not store.
    let committed = 0;
    const failing: DrainStorage = {
      watches: () => repo.watches(),
      seenFingerprints: () => repo.seenFingerprints(),
      commitOutcome: (outcome, storedAt) => {
        if (committed >= 1) throw new Error('сховище відмовило');
        committed += 1;
        repo.commitOutcome(outcome, storedAt);
      },
    };

    const report = await drainCaptures({
      capture,
      storage: failing,
      rules: () => [],
      newId: () => `id-${(ids += 1)}`,
      dateOf: () => isoDate('2026-08-26'),
      now: () => new Date('2026-08-26T12:00:00.000Z'),
    });

    expect(report).toMatchObject({ collected: 3, acknowledged: 1, drafted: 1 });
    expect(report.failure).toBeInstanceOf(Error);
    expect(repo.pendingDrafts()).toHaveLength(1);
    // The two that failed are still waiting, so nothing is lost.
    expect(capture.waiting()).toEqual([second, third]);

    // And the next drain, with storage working again, finishes them without doubling the first.
    const recovered = await drain(capture);
    expect(recovered).toMatchObject({ collected: 2, acknowledged: 2, drafted: 2 });
    expect(repo.pendingDrafts()).toHaveLength(3);
  });

  it('Two чернетки from one collection keep the order the phone handed them over in', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const first = posted({ text: 'Оплата 10.00UAH. Перша' });
    const second = posted({ text: 'Оплата 20.00UAH. Друга' });
    const capture = inMemoryNotificationCapture({ queue: [first, second] });

    await drain(capture);

    // Newest first is by when it was drafted, and within one batch that is arrival order — the
    // records are committed a millisecond apart rather than all under one instant.
    expect(repo.pendingDrafts().map((draft) => draft.text)).toEqual([
      'Оплата Оплата 20.00UAH. Друга',
      'Оплата Оплата 10.00UAH. Перша',
    ]);
  });

  it('A drain that stored something says so, and one that stored nothing stays quiet', async () => {
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    let told = 0;
    const stop = onCapturesStored(() => {
      told += 1;
    });
    try {
      const notification = posted();
      const capture = inMemoryNotificationCapture({ queue: [notification] });

      await drain(capture);
      expect(told).toBe(1);

      // Nothing waiting, and then a redelivery that is already remembered: neither stored
      // anything, so neither makes every screen re-query.
      await drain(capture);
      capture.capture(notification);
      await drain(capture);
      expect(told).toBe(1);
    } finally {
      stop();
    }

    // And a screen that has gone away is not told at all.
    const after = inMemoryNotificationCapture({ queue: [posted({ text: 'Оплата 5.00UAH. Інше' })] });
    await drain(after);
    expect(told).toBe(1);
  });

  it('Nothing waiting means nothing read and nothing acknowledged', async () => {
    const capture = inMemoryNotificationCapture();

    expect(await drain(capture)).toEqual({
      collected: 0,
      acknowledged: 0,
      drafted: 0,
      autoConfirmed: 0,
    });
  });

  it('A build with no listener collects nothing', async () => {
    const capture = inMemoryNotificationCapture({ queue: [posted()], unavailable: true });
    const refusal: WatchedSetOutcome = await capture.setWatched([PRIVAT]);

    expect(refusal).toEqual({ kind: 'unavailable' });
    expect(await drain(capture)).toMatchObject({ collected: 0, acknowledged: 0 });
    expect(repo.pendingDrafts()).toEqual([]);
  });
});
