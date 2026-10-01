import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { installmentsRepo, type InstallmentsRepo } from '../db/installments-repo';
import { openTestDb, seedReservedCategories, type TestStorage } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { inMemoryLocalNotifications } from '../platform/local-notifications';
import { settleAndReassert, settleAndReassertQuietly } from './installment-upkeep';
import { bindTestJournal } from './journal';

describe('the upkeep of the розстрочки', () => {
  let storage: TestStorage;
  let repo: InstallmentsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    accountsRepo(storage.db).save(account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' }));
    repo = installmentsRepo(storage.db);
    repo.save({
      id: 'i',
      name: 'Чайник',
      total: 200_000,
      partsCount: 2,
      part: 100_000,
      firstDue: '2026-10-05',
      debitAccountId: 'black',
      paidBefore: 0,
      recordedAt: 1,
    });
  });
  afterEach(() => storage.close());

  const morning = () => new Date(2026, 9, 3, 8, 0);

  it('links first, then re-asserts the warnings — and on focus only when linking changed something', async () => {
    const phone = inMemoryLocalNotifications();
    const ports = { storage: repo, notifications: phone, now: morning };
    expect(await settleAndReassert(ports, { only: 'if-changed' })).toBe(false);
    expect(phone.scheduled()).toEqual([]);

    expect(await settleAndReassert(ports)).toBe(false);
    expect(await phone.scheduledIds()).toEqual(['installment-due-2026-10-04', 'installment-due-2026-11-04']);

    transactionsRepo(storage.db).save(
      expenseByDefault({ id: 'd', date: '2026-10-03', accountId: 'black', amount: money(100_000, 'UAH') }),
      morning(),
    );
    expect(await settleAndReassert(ports, { only: 'if-changed' })).toBe(true);
    expect(await phone.scheduledIds()).toEqual(['installment-due-2026-11-04']);
  });

  it('journals a failure rather than throwing it', async () => {
    const journalOf = bindTestJournal();
    const broken = {
      storage: { ...repo, settle: () => { throw new Error('storage is gone'); } },
      notifications: inMemoryLocalNotifications(),
      now: morning,
    };
    await expect(settleAndReassertQuietly(broken)).resolves.toBeUndefined();
    expect(journalOf().some((e) => e.kind === 'failure' && e.name === 'installment-upkeep')).toBe(true);
  });
});
