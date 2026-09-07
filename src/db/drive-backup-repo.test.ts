import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { backupRepo } from './backup-repo';
import { isConnected, NOT_CONNECTED } from '../backup/drive/state';
import { driveBackupRepo } from './drive-backup-repo';
import { toAccountRow, toTransactionRow } from './mappers';
import { accounts, driveBackup, transactions as transactionsTable } from './schema';
import { openTestDb, seedReferences, type TestStorage } from './test-db';

/**
 * The Google Drive state on the device, against the real migrations — and the one test design D1's
 * fourth point rests on: that none of it reaches a бекап.
 */

const connectedAt = new Date('2026-09-06T07:00:00.000Z');
const yesterday = new Date('2026-09-06T08:00:00.000Z');
const today = new Date('2026-09-07T08:00:00.000Z');

describe('the drive_backup table', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('is one row and cannot become two', () => {
    const db = storage.db;

    db.insert(driveBackup).values({ id: 'drive', accountLabel: 'owner@example.com' }).run();

    // The CHECK is what keeps it to one row — the `saldo_import` idiom (design D11). A second row
    // under any other id is refused by SQLite, not by a repository remembering to check.
    expect(() => db.insert(driveBackup).values({ id: 'other' }).run()).toThrow();
    expect(db.select().from(driveBackup).all()).toHaveLength(1);
  });

  it('Scenario: No бекап carries the authorisation — there is no column it could sit in', () => {
    const columns = storage.db
      .all<{ name: string }>(sql`SELECT name FROM pragma_table_info('drive_backup')`)
      .map((row) => row.name);

    expect(columns).toEqual([
      'id',
      'account_label',
      'recovery_code_acknowledged_at',
      'last_success_at',
      'last_uploaded_checksum',
      'last_failure_kind',
      'last_failure_at',
    ]);
    // Asserted by name and exhaustively: the three secrets live in the device's secure storage,
    // and a column added later that could hold one has to come past this test first.
    for (const forbidden of ['token', 'key', 'code', 'secret', 'authorisation', 'authorization']) {
      expect(columns.filter((name) => name.includes(forbidden))).toEqual(
        forbidden === 'code' ? ['recovery_code_acknowledged_at'] : [],
      );
    }
  });
});

describe('what the section reads', () => {
  let storage: TestStorage;
  let repo: ReturnType<typeof driveBackupRepo>;

  beforeEach(() => {
    storage = openTestDb();
    repo = driveBackupRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Nothing uploaded yet is said plainly', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);

    const state = repo.read();
    // Connected a minute ago and nothing uploaded: no date at all, rather than an invented one or
    // the moment of connecting standing in for a бекап that never happened.
    expect(state.accountLabel).toBe('owner@example.com');
    expect(state.lastSuccessAt).toBeUndefined();
    expect(state.lastUploadedChecksum).toBeUndefined();
    expect(isConnected(state)).toBe(true);
  });

  it('is not connected until the код відновлення is dealt with', () => {
    // A phone that has never connected.
    expect(repo.read()).toEqual(NOT_CONNECTED);
    expect(isConnected(NOT_CONNECTED)).toBe(false);

    // The Google step is done and the код відновлення is not: design D11's one definition says
    // this is not a connection, so no background task registers and nothing is uploaded.
    repo.connect('owner@example.com');
    expect(isConnected(repo.read())).toBe(false);

    repo.acknowledgeRecoveryCode(connectedAt);
    expect(isConnected(repo.read())).toBe(true);
  });

  it('Scenario: Connecting with the code needs no second acknowledgement', () => {
    // Design D14's other door: a new phone that typed a код відновлення which opened a версія.
    // Typing it *is* the demonstration, so the same call completes the connection.
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);

    expect(isConnected(repo.read())).toBe(true);
    expect(repo.read().recoveryCodeAcknowledgedAt).toEqual(connectedAt);
  });

  it('Scenario: A failure does not erase the last success', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordSuccess(yesterday, 'deadbeef');

    repo.recordFailure(today, 'no-network');

    const state = repo.read();
    // Yesterday's success still stands, beside today's failure and its reason — the owner needs to
    // know their history is safe as of yesterday, and a failure that cleared it would say it is not.
    expect(state.lastSuccessAt).toEqual(yesterday);
    expect(state.lastUploadedChecksum).toBe('deadbeef');
    expect(state.lastFailureKind).toBe('no-network');
    expect(state.lastFailureAt).toEqual(today);
  });

  it('A success clears the failure beside it', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordFailure(yesterday, 'no-network');

    repo.recordSuccess(today, 'cafebabe');

    const state = repo.read();
    // The other direction: a failure from yesterday shown beside a success from a minute ago would
    // be a stale sentence the owner has no way to dismiss.
    expect(state.lastSuccessAt).toEqual(today);
    expect(state.lastFailureKind).toBeUndefined();
    expect(state.lastFailureAt).toBeUndefined();
  });

  it('Scenario: Withdrawn access stops the claim of being connected — over the real migrations', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordSuccess(yesterday, 'deadbeef');

    repo.recordWithdrawn(today);

    const state = repo.read();
    // The acknowledgement is nulled, so `isConnected` is false and the app stops calling itself
    // connected — the SQL half of the rule, which the in-memory double alone cannot prove.
    expect(isConnected(state)).toBe(false);
    expect(state.recoveryCodeAcknowledgedAt).toBeUndefined();
    // And nothing else moved: the account is still named and the last бекап still stands.
    expect(state.accountLabel).toBe('owner@example.com');
    expect(state.lastSuccessAt).toEqual(yesterday);
    expect(state.lastUploadedChecksum).toBe('deadbeef');
    expect(state.lastFailureKind).toBe('withdrawn');
    expect(state.lastFailureAt).toEqual(today);
  });

  it('clearing the failure clears only the failure', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordSuccess(yesterday, 'deadbeef');
    repo.recordFailure(today, 'no-network');

    repo.clearFailure();

    const state = repo.read();
    expect(state.lastFailureKind).toBeUndefined();
    expect(state.lastFailureAt).toBeUndefined();
    // The pair either side of it is untouched — a clear that took the last success with it would
    // tell the owner their history had never been saved.
    expect(state.lastSuccessAt).toEqual(yesterday);
    expect(state.lastUploadedChecksum).toBe('deadbeef');
    expect(isConnected(state)).toBe(true);
  });

  it('reconnecting after a withdrawal both connects and clears it', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordWithdrawn(today);

    repo.connect('owner@example.com');
    repo.clearFailure();
    repo.acknowledgeRecoveryCode(today);

    const state = repo.read();
    expect(isConnected(state)).toBe(true);
    // «Google більше не дозволяє доступ» beside a connection that has just succeeded would be a
    // stale sentence the owner has no way to dismiss.
    expect(state.lastFailureKind).toBeUndefined();
  });

  it('Scenario: After disconnecting the section is back to its offer', () => {
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordSuccess(yesterday, 'deadbeef');

    repo.disconnect();

    expect(repo.read()).toEqual(NOT_CONNECTED);
    expect(isConnected(repo.read())).toBe(false);
  });
});

describe('what a бекап carries of the Drive connection', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: An uploaded бекап carries no secret and no captured payload — nor the Drive state', () => {
    const db = storage.db;
    // A phone that is connected, has backed up, and has money in it.
    const repo = driveBackupRepo(db);
    repo.connect('owner@example.com');
    repo.acknowledgeRecoveryCode(connectedAt);
    repo.recordSuccess(yesterday, 'deadbeef');
    repo.recordFailure(today, 'no-network');

    seedReferences(db, { categories: [UNCATEGORISED_CATEGORY_ID] });
    db.insert(accounts)
      .values(
        toAccountRow(
          account({
            id: 'card',
            name: 'mono black',
            kind: 'spending',
            currency: 'UAH',
            openingBalance: money(500_000, 'UAH'),
          }),
        ),
      )
      .run();
    db.insert(transactionsTable)
      .values(
        toTransactionRow(
          expenseByDefault({
            id: 'e1',
            date: '2026-09-06',
            accountId: 'card',
            amount: money(125_50, 'UAH'),
            categoryId: UNCATEGORISED_CATEGORY_ID,
            description: 'СІЛЬПО Київ',
          }),
        ),
      )
      .run();

    const snapshot = JSON.stringify(backupRepo(db).snapshot());

    // The money is in it…
    expect(snapshot).toContain('mono black');
    // …and not one field of the Drive connection is. A бекап restored on a new phone must not
    // arrive claiming a Google connection that phone does not have — and the sealing key it would
    // need is not in the бекап either (design D1's fourth point).
    for (const secret of [
      'owner@example.com',
      'deadbeef',
      'no-network',
      'drive_backup',
      'driveBackup',
      'recoveryCode',
      'accountLabel',
    ]) {
      expect(snapshot).not.toContain(secret);
    }
  });
});
