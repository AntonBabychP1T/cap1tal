import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyRestore,
  isRefusal,
  makeBackup,
  readBackup,
  restoreBackup,
  saveBackup,
} from '../backup/backup';
import { canonicalJson, crc32 } from '../backup/canonical';
import type { BackupState } from '../backup/format';
import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  CORRECTION_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Transaction,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { backupRepo, type BackupRepo } from './backup-repo';
import { categoriesRepo } from './categories-repo';
import { entryDefaultsRepo } from './entry-defaults-repo';
import { goalsRepo } from './goals-repo';
import { importRepo } from './import-repo';
import { limitsRepo } from './limits-repo';
import { monobankRepo } from './monobank-repo';
import { notificationsRepo } from './notifications-repo';
import { ratesRepo } from './rates-repo';
import { receiptsRepo } from './receipts-repo';
import { remindersRepo } from './reminders-repo';
import { reportingRepo } from './reporting-repo';
import { rulesRepo } from './rules-repo';
import {
  monobankRates,
  notificationDrafts,
  notificationFingerprints,
  transactions as transactionsTable,
} from './schema';
import { sourcesRepo } from './sources-repo';
import { openTestDb, type TestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/**
 * The storage half of a бекап: reading the whole device as one snapshot, and replacing the whole
 * device with one as a single act — and, over the two of them, the round trip a бекап promises.
 *
 * Everything runs against the real committed migrations on an in-memory database, so the rules
 * that catch a bad restore here — the foreign keys, the CHECKs, the transaction — are the ones the
 * phone runs. No token exists anywhere near this file, which is the point of one of its tests.
 */

const OBTAINED_AT = new Date('2026-08-28T08:00:00.000Z');
const STORED_AT = new Date('2026-08-28T08:00:01.000Z');
const MADE_AT = new Date('2026-08-30T18:20:00.000Z');
const CURSOR_MS = Date.UTC(2026, 7, 1, 21, 0, 0);
const SYNCED_AT = new Date('2026-08-28T08:05:00.000Z');

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100_000, 'UAH'),
});
const jar = account({ id: 'jar', name: 'Банка', kind: 'savings', currency: 'UAH' });
const invest = account({ id: 'invest', name: 'Брокер', kind: 'investment', currency: 'UAH' });
const debt = account({ id: 'debt', name: 'Позика Петру', kind: 'debt', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'Долари', kind: 'savings', currency: 'USD' });

/** The whole of one owner's device, built through the repositories the app itself writes with. */
function seedWorld(db: TestDb): void {
  const accounts = accountsRepo(db);
  for (const a of [card, jar, invest, debt, dollars]) accounts.save(a);

  // «Без категорії», «Комісія» and «Коригування» are already there: migration 0003 put them in.
  const categories = categoriesRepo(db);
  categories.create({ id: 'food', name: 'Продукти' });
  categories.create({ id: 'old', name: 'Старе' });
  categories.archive('old');

  const sources = sourcesRepo(db);
  sources.create({ id: UNSOURCED_SOURCE_ID, name: 'Без джерела' });
  sources.create({ id: 'salary', name: 'Зарплата' });
  sources.create({ id: 'interest', name: 'Відсотки' });

  rulesRepo(db).save({
    id: 'r1',
    merchant: 'сільпо',
    mcc: 5411,
    categoryId: 'food',
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
  });
  limitsRepo(db).set({ categoryId: 'food', amount: money(250_000, 'UAH') });
  goalsRepo(db).save({
    id: 'g1',
    name: 'Авто',
    target: money(500_000, 'UAH'),
    deadline: '2027-01-01',
    accountIds: ['jar'],
  });

  const transactions = transactionsRepo(db);
  for (const [index, t] of everyTransactionType().entries()) {
    transactions.save(t, new Date(STORED_AT.getTime() + index));
  }

  importRepo(db).markCommitted(new Date('2026-06-01T09:00:00.000Z'));

  const monobank = monobankRepo(db);
  monobank.upsertAccounts(
    [
      {
        id: 'mono-card',
        kind: 'card',
        name: 'black ··1234',
        currency: 'UAH',
        bankBalance: money(500_000, 'UAH'),
      },
    ],
    OBTAINED_AT,
  );
  monobank.link({
    monobankAccountId: 'mono-card',
    accountId: 'card',
    syncStartDate: '2026-08-01',
    cursorMs: CURSOR_MS,
  });
  monobank.commitStatementAnswer({
    monobankAccountId: 'mono-card',
    transactions: [],
    newlySeenIds: ['item-1', 'item-2'],
    bankBalance: money(500_000, 'UAH'),
    obtainedAt: OBTAINED_AT,
    cursorMs: CURSOR_MS,
    storedAt: STORED_AT,
  });
  monobank.markSynced('mono-card', SYNCED_AT);

  notificationsRepo(db).addWatch({ packageName: 'ua.privatbank.ap24', accountId: 'card' });

  receiptsRepo(db).attach(
    {
      id: 'rc-1',
      transactionId: 't-expense',
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: '2026-08-01',
      issuedTime: '22:20:06',
      dialect: 'rro',
      kind: 'sale',
      total: money(12_000, 'UAH'),
      sellerName: 'ТОВ "ПРОДАВЕЦЬ"',
      acquisition: 'qr_scan',
      fetchedAt: Date.UTC(2026, 7, 1, 19, 30),
      snapshot: '<RQ><DAT/></RQ>',
    },
    [
      {
        id: 'ri-1',
        receiptId: 'rc-1',
        line: 1,
        rawName: 'Молоко 2.5%',
        quantityThousandths: 1000,
        lineTotal: money(4_720, 'UAH'),
        barcode: '4820000431026',
      },
      {
        id: 'ri-2',
        receiptId: 'rc-1',
        line: 2,
        rawName: 'Хліб житній',
        quantityThousandths: 1000,
        lineTotal: money(3_890, 'UAH'),
      },
      {
        id: 'ri-3',
        receiptId: 'rc-1',
        line: 3,
        rawName: 'Coca-Cola 2L',
        quantityThousandths: 2000,
        unit: 'шт',
        unitPrice: money(1_695, 'UAH'),
        lineTotal: money(3_390, 'UAH'),
        discount: money(100, 'UAH'),
        uktzed: '2202100000',
      },
    ],
  );
}

/** All five types, and the distinctions the glossary keeps between them. */
function everyTransactionType(): Transaction[] {
  return [
    {
      type: 'expense',
      id: 't-expense',
      date: '2026-08-01',
      accountId: 'card',
      amount: money(-12_000, 'UAH'),
      categoryId: 'food',
      originalAmount: money(-300, 'USD'),
      description: 'СІЛЬПО',
    },
    {
      type: 'expense',
      id: 't-fee',
      date: '2026-08-02',
      accountId: 'card',
      amount: money(-500, 'UAH'),
      categoryId: 'fees',
    },
    {
      type: 'income',
      id: 't-income',
      date: '2026-08-03',
      accountId: 'card',
      amount: money(3_000_000, 'UAH'),
      sourceId: 'salary',
    },
    {
      type: 'income',
      id: 't-interest',
      date: '2026-08-04',
      accountId: 'card',
      amount: money(1_500, 'UAH'),
      sourceId: 'interest',
    },
    {
      type: 'refund',
      id: 't-refund',
      date: '2026-08-05',
      accountId: 'card',
      amount: money(12_000, 'UAH'),
      categoryId: 'food',
    },
    {
      type: 'correction',
      id: 't-correction',
      date: '2026-08-06',
      accountId: 'card',
      amount: money(-3_000, 'UAH'),
    },
    {
      type: 'transfer',
      id: 't-transfer',
      date: '2026-08-07',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(-100_000, 'UAH'),
      arrived: money(100_000, 'UAH'),
    },
    {
      type: 'transfer',
      id: 't-invest',
      date: '2026-08-08',
      fromAccountId: 'card',
      toAccountId: 'invest',
      left: money(-200_000, 'UAH'),
      arrived: money(200_000, 'UAH'),
    },
    {
      type: 'transfer',
      id: 't-lend',
      date: '2026-08-09',
      fromAccountId: 'card',
      toAccountId: 'debt',
      left: money(-50_000, 'UAH'),
      arrived: money(50_000, 'UAH'),
    },
    {
      type: 'transfer',
      id: 't-cross',
      date: '2026-08-10',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(-410_000, 'UAH'),
      arrived: money(10_000, 'USD'),
    },
  ];
}

/** A pending чернетка, written straight in: this file is about storage, not about the engine. */
function draft(db: TestDb, id: string): void {
  db.insert(notificationDrafts)
    .values({
      id,
      accountId: 'card',
      currency: 'UAH',
      date: '2026-08-29',
      text: 'Приват24 Списання 120.00 UAH СІЛЬПО',
      kind: 'expense',
      amount: -12_000,
      createdAt: STORED_AT,
    })
    .run();
}

describe('the whole stored state as one snapshot', () => {
  let storage: TestStorage;
  let repo: BackupRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedWorld(storage.db);
    repo = backupRepo(storage.db);
  });
  afterEach(() => storage.close());

  it('Scenario: Everything stored is in the snapshot exactly once', () => {
    const snapshot = repo.snapshot();

    expect(snapshot.accounts.map((a) => a.id)).toEqual(['card', 'debt', 'invest', 'jar', 'usd']);
    expect(snapshot.accounts.find((a) => a.id === 'card')?.openingBalance).toEqual(
      money(100_000, 'UAH'),
    );
    expect(snapshot.categories.map((c) => c.id)).toEqual([
      CORRECTION_CATEGORY_ID,
      'fees',
      'food',
      'old',
      UNCATEGORISED_CATEGORY_ID,
    ]);
    expect(snapshot.categories.find((c) => c.id === 'old')?.archived).toBe(true);
    expect(snapshot.sources.map((s) => s.id)).toEqual(['interest', 'salary', UNSOURCED_SOURCE_ID]);
    expect(snapshot.rules).toEqual([
      { id: 'r1', merchant: 'сільпо', mcc: 5411, categoryId: 'food', createdAtMs: Date.UTC(2026, 4, 1, 10) },
    ]);
    expect(snapshot.limits).toEqual([{ categoryId: 'food', amount: money(250_000, 'UAH') }]);
    expect(snapshot.goals.map((g) => g.name)).toEqual(['Авто']);
    // All five types, each row once, each with the moment it counts as stored.
    expect(snapshot.transactions).toHaveLength(10);
    expect(new Set(snapshot.transactions.map((t) => t.transaction.id)).size).toBe(10);
    expect(snapshot.transactions.every((t) => Number.isSafeInteger(t.storedAtMs))).toBe(true);
    expect(snapshot.saldoImportCommittedAtMs).toBe(Date.UTC(2026, 5, 1, 9));
    expect(snapshot.monobankAccounts.map((a) => a.id)).toEqual(['mono-card']);
    expect(snapshot.monobankLinks).toEqual([
      {
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-01',
        cursorMs: CURSOR_MS,
        lastSyncedAtMs: SYNCED_AT.getTime(),
      },
    ]);
    expect(snapshot.monobankImportedItems.map((i) => i.itemId)).toEqual(['item-1', 'item-2']);
    expect(snapshot.watches).toEqual([{ packageName: 'ua.privatbank.ap24', accountId: 'card' }]);
    // The чек, once, with its снапшот — and its three позиції, once each, absent values absent.
    expect(snapshot.receipts).toHaveLength(1);
    expect(snapshot.receipts[0]).toMatchObject({
      id: 'rc-1',
      transactionId: 't-expense',
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: '2026-08-01',
      dialect: 'rro',
      kind: 'sale',
      total: money(12_000, 'UAH'),
      snapshot: '<RQ><DAT/></RQ>',
    });
    expect(snapshot.receiptItems.map((i) => i.rawName)).toEqual([
      'Молоко 2.5%',
      'Хліб житній',
      'Coca-Cola 2L',
    ]);
    expect(new Set(snapshot.receiptItems.map((i) => i.id)).size).toBe(3);
    expect('unitPrice' in (snapshot.receiptItems[0] as object)).toBe(false);
    expect(snapshot.receiptItems[2]?.discount).toEqual(money(100, 'UAH'));
  });

  it('Scenario: The snapshot leaves out the cache and the captures', () => {
    ratesRepo(storage.db).upsert({ currency: 'USD', rateMillionths: 41_000_000 }, OBTAINED_AT);
    draft(storage.db, 'd1');
    draft(storage.db, 'd2');
    storage.db.insert(notificationFingerprints).values({ fingerprint: 'seen-1' }).run();

    const snapshot = repo.snapshot();

    // A бекап holds what the owner confirmed as their money, not what the phone overheard.
    const written = JSON.stringify(snapshot);
    expect(written).not.toContain('41000000');
    // Not «СІЛЬПО»: a транзакція of this device carries that as its own опис, and that one
    // belongs in the бекап. This is the half of the чернетка's text only the phone overheard.
    expect(written).not.toContain('Приват24 Списання');
    expect(written).not.toContain('seen-1');
    expect(Object.keys(snapshot)).not.toContain('rates');
    expect(Object.keys(snapshot)).not.toContain('drafts');
    expect(Object.keys(snapshot)).not.toContain('fingerprints');
    // And the рахунки and транзакції of that same device are all there.
    expect(snapshot.accounts).toHaveLength(5);
    expect(snapshot.transactions).toHaveLength(10);
  });

  it('Scenario: A бекап carries no attempt', () => {
    // The phone has synced and remembers how it went; the file must not.
    const monobank = monobankRepo(storage.db);
    monobank.beginAttempt(new Date('2026-09-02T08:15:00.000Z'));
    monobank.finishAttempt('invalid-token');

    const snapshot = repo.snapshot();

    const written = JSON.stringify(snapshot);
    expect(written).not.toContain('invalid-token');
    expect(Object.keys(snapshot)).not.toContain('attempt');
    // ...while the money and the links of that same device are in it whole.
    expect(snapshot.accounts).toHaveLength(5);
    expect(snapshot.monobankLinks.length).toBeGreaterThan(0);
  });

  it('reads the same snapshot twice from an unchanged device', () => {
    // A total order everywhere, so a бекап of an unchanged phone is the same file — which is what
    // makes a checksum comparable at all.
    expect(makeBackup(repo.snapshot(), MADE_AT).bytes).toBe(
      makeBackup(repo.snapshot(), MADE_AT).bytes,
    );
  });
});

describe('the whole stored state replaced by a snapshot, as one unit', () => {
  let storage: TestStorage;
  let repo: BackupRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedWorld(storage.db);
    repo = backupRepo(storage.db);
  });
  afterEach(() => storage.close());

  /** A smaller world than the seeded one: one рахунок, one категорія, three транзакції. */
  function smallState(): BackupState {
    return {
      accounts: [
        {
          id: 'only',
          name: 'Готівка',
          kind: 'cash',
          currency: 'UAH',
          openingBalance: money(5_000, 'UAH'),
          archived: false,
        },
      ],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      sources: [],
      rules: [],
      limits: [],
      goals: [],
      transactions: ['2026-07-01', '2026-07-02', '2026-07-03'].map((date, i) => ({
        transaction: {
          type: 'expense' as const,
          id: `n${i}`,
          date,
          accountId: 'only',
          amount: money(-1_000, 'UAH'),
          categoryId: 'c1',
        },
        storedAtMs: STORED_AT.getTime() + i,
      })),
      monobankAccounts: [],
      monobankLinks: [],
      monobankImportedItems: [],
      watches: [],
      receipts: [
        {
          id: 'rc-new',
          transactionId: 'n0',
          registrarNumber: '4000146829',
          fiscalNumber: '1384600901',
          issuedDate: '2026-08-01',
          issuedTime: '14:54:54',
          dialect: 'prro',
          kind: 'sale',
          total: money(9_999, 'UAH'),
          acquisition: 'qr_scan',
          fetchedAtMs: Date.UTC(2026, 7, 1, 12),
          snapshot: '<CHECK/>',
        },
      ],
      receiptItems: [
        {
          id: 'ri-new-1',
          receiptId: 'rc-new',
          line: 1,
          rawName: 'Оплата за послуги',
          quantityThousandths: 1000,
          lineTotal: money(9_999, 'UAH'),
        },
        {
          id: 'ri-new-2',
          receiptId: 'rc-new',
          line: 2,
          rawName: 'Пакет',
          quantityThousandths: 1000,
          lineTotal: money(0, 'UAH'),
        },
      ],
    };
  }

  it('Scenario: A replaced state is the snapshot`s and nothing else', () => {
    draft(storage.db, 'd1');

    repo.replaceAll(smallState());

    const after = repo.snapshot();
    expect(after.accounts.map((a) => a.id)).toEqual(['only']);
    expect(after.categories.map((c) => c.id)).toEqual(['c1']);
    expect(after.transactions.map((t) => t.transaction.id)).toEqual(['n0', 'n1', 'n2']);
    expect(after.sources).toEqual([]);
    expect(after.rules).toEqual([]);
    expect(after.limits).toEqual([]);
    expect(after.goals).toEqual([]);
    expect(after.saldoImportCommittedAtMs).toBeUndefined();
    // The чернетка went with the world it named: it proposed money on a рахунок that is gone.
    expect(notificationsRepo(storage.db).pendingDrafts()).toEqual([]);
    // Exactly the бекап's чек with its two позиції — the five the device held are gone with the
    // транзакції they hung under.
    expect(after.receipts.map((r) => r.id)).toEqual(['rc-new']);
    expect(after.receiptItems.map((i) => i.id)).toEqual(['ri-new-1', 'ri-new-2']);
    expect(receiptsRepo(storage.db).forTransaction('n0')?.receipt.fiscalNumber).toBe('1384600901');
  });

  it("Scenario: A ціль's склад is in the snapshot, and survives snapshot → replace → snapshot", () => {
    const withComposition: BackupState = {
      ...smallState(),
      accounts: [
        ...smallState().accounts,
        {
          id: 'usd',
          name: 'USD банка',
          kind: 'savings',
          currency: 'USD',
          openingBalance: money(0, 'USD'),
          archived: false,
        },
        {
          id: 'bonds',
          name: 'ОВДП',
          kind: 'investment',
          currency: 'UAH',
          openingBalance: money(0, 'UAH'),
          archived: false,
        },
      ],
      goals: [
        {
          id: 'g-machine',
          name: 'Машина',
          target: money(70_000_000, 'UAH'),
          deadline: '2027-06-30',
          accountIds: ['only', 'usd', 'bonds'],
        },
        { id: 'g-reserve', name: 'Резерв', target: money(1_000_000, 'UAH'), accountIds: ['only'] },
      ],
    };

    repo.replaceAll(withComposition);

    const after = repo.snapshot();
    expect(after.goals).toEqual([
      {
        id: 'g-machine',
        name: 'Машина',
        target: money(70_000_000, 'UAH'),
        deadline: '2027-06-30',
        // In the snapshot's own stable order, so the same state snapshots identically.
        accountIds: ['bonds', 'only', 'usd'],
      },
      { id: 'g-reserve', name: 'Резерв', target: money(1_000_000, 'UAH'), accountIds: ['only'] },
    ]);
    // Round-trips a second time unchanged.
    repo.replaceAll(after);
    expect(repo.snapshot()).toEqual(after);
  });

  it('Scenario: Replacing leaves no склад behind — no orphan склад row remains', () => {
    repo.replaceAll({
      ...smallState(),
      goals: [
        { id: 'g-old', name: 'Старе', target: money(1_000, 'UAH'), accountIds: ['only'] },
      ],
    });

    repo.replaceAll(smallState());

    expect(repo.snapshot().goals).toEqual([]);
    // Asserted as the outcome, so it holds whether or not the cascade fires: `backup-repo` deletes
    // `goal_accounts` explicitly, and a restore must not depend on a PRAGMA to be correct.
    expect(storage.db.all('SELECT * FROM goal_accounts')).toEqual([]);
  });

  it('Scenario: A replacement that fails partway stores nothing', () => {
    const before = repo.snapshot();
    const broken: BackupState = {
      ...smallState(),
      transactions: [
        ...smallState().transactions,
        {
          transaction: {
            type: 'expense',
            id: 'n-last',
            date: '2026-07-04',
            accountId: 'only',
            amount: money(-1_000, 'UAH'),
            // A категорія the snapshot does not hold: the foreign key is the last line, and this
            // is the state no reader would have produced.
            categoryId: 'c-missing',
          },
          storedAtMs: STORED_AT.getTime(),
        },
      ],
    };

    expect(() => repo.replaceAll(broken)).toThrow();

    // Everything, unchanged — not "roughly the same": the whole snapshot compares equal.
    expect(repo.snapshot()).toEqual(before);
    // Named separately because it is the point of the scenario for this change: the чек the
    // device held is among the rows that must survive a rolled-back restore, with its позиції.
    expect(repo.snapshot().receipts.map((r) => r.id)).toEqual(['rc-1']);
    expect(repo.snapshot().receiptItems).toHaveLength(3);
    expect(receiptsRepo(storage.db).forTransaction('t-expense')?.items).toHaveLength(3);
  });

  it('Scenario: A restore leaves them in place', () => {
    // The журнал and the репорти про помилки are this phone's memory of its own bugs. A
    // відновлення replaces the owner's money and says nothing about them — least of all because
    // restoring a бекап is exactly the kind of thing the owner might be doing when it goes wrong.
    const reporting = reportingRepo(storage.db);
    for (let i = 0; i < 300; i += 1) {
      reporting.append({
        id: `j${i}`,
        at: new Date(OBTAINED_AT.getTime() + i),
        kind: 'screen',
        name: `/route/${i}`,
      });
    }
    for (const id of ['r1', 'r2']) {
      reporting.create({
        id,
        createdAt: OBTAINED_AT,
        did: `написав про ${id}`,
        happened: null,
        expected: null,
        route: '/manage/backup',
        build: { version: '0.0.0', commit: 'abc1234', dirty: false, builtAt: 'x' },
        device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
        migrationsApplied: 13,
        counts: { accounts: 1, transactions: 1, categories: 1, rules: 0, drafts: 0 },
        journal: reporting.tail(),
        prompting: null,
        origin: 'section',
        captureFailure: null,
      });
    }
    reporting.addScreenshot('r1', 'shot-1.png', OBTAINED_AT);
    // This phone is being tested by the handle rather than the gesture — a habit of the device,
    // not a setting about the owner's money.
    reporting.setCaptureSettings({ gestureEnabled: false, handleEnabled: true });
    const journalBefore = reporting.tail();
    const reportsBefore = reporting.list();

    repo.replaceAll(smallState());

    expect(reporting.tail()).toEqual(journalBefore);
    expect(reporting.tail()).toHaveLength(300);
    expect(reporting.list()).toEqual(reportsBefore);
    expect(reporting.list().map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(reporting.get('r1')?.screenshots.map((shot) => shot.name)).toEqual(['shot-1.png']);
  });

  it('Scenario: A restore leaves them in place', () => {
    // The origins and the two switches say how this phone is being tested. A бекап made on another
    // phone knows nothing about that, and a відновлення must not pretend otherwise.
    const reporting = reportingRepo(storage.db);
    reporting.create({
      id: 'r-here',
      createdAt: OBTAINED_AT,
      did: 'заведено з екрана /(tabs) жестом',
      happened: 'підсумок відʼємний',
      expected: null,
      route: '/(tabs)',
      build: { version: '0.0.0', commit: 'abc1234', dirty: false, builtAt: 'x' },
      device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
      migrationsApplied: 14,
      counts: { accounts: 1, transactions: 1, categories: 1, rules: 0, drafts: 0 },
      journal: [],
      prompting: null,
      origin: 'here',
      captureFailure: 'Вікно захищене від знімків',
    });
    reporting.setCaptureSettings({ gestureEnabled: false, handleEnabled: true });

    repo.replaceAll(smallState());

    expect(reporting.captureSettings()).toEqual({ gestureEnabled: false, handleEnabled: true });
    const kept = reporting.get('r-here');
    expect(kept?.origin).toBe('here');
    expect(kept?.captureFailure).toBe('Вікно захищене від знімків');
  });

  it('Scenario: A restore leaves this phone`s attempt alone', () => {
    // What this phone last tried is a fact about this phone. A бекап made elsewhere replaces the
    // owner's money and says nothing about it — otherwise a restored device would either skip a
    // sync it never made or wear a failure it never had.
    const monobank = monobankRepo(storage.db);
    const at = new Date('2026-09-02T08:15:00.000Z');
    monobank.beginAttempt(at);
    monobank.finishAttempt('complete');

    repo.replaceAll(smallState());

    expect(monobankRepo(storage.db).attempt()).toEqual({
      attemptedAtMs: at.getTime(),
      outcome: 'complete',
    });
  });

  it('Scenario: The rate cache and the fingerprints survive a replacement', () => {
    ratesRepo(storage.db).upsert({ currency: 'USD', rateMillionths: 41_000_000 }, OBTAINED_AT);
    storage.db.insert(notificationFingerprints).values({ fingerprint: 'seen-1' }).run();

    repo.replaceAll(smallState());

    expect(ratesRepo(storage.db).get('USD')).toEqual({
      currency: 'USD',
      rateMillionths: 41_000_000,
      obtainedAt: OBTAINED_AT,
    });
    expect(notificationsRepo(storage.db).seenFingerprints()).toEqual(new Set(['seen-1']));
    // And nothing at all was left of the rate row being counted as state.
    expect(storage.db.select().from(monobankRates).all()).toHaveLength(1);
  });
});

describe('the round trip a бекап promises', () => {
  let source: TestStorage;
  let target: TestStorage;

  beforeEach(() => {
    source = openTestDb();
    seedWorld(source.db);
    target = openTestDb();
  });
  afterEach(() => {
    source.close();
    target.close();
  });

  /** Everything on `source`, restored onto `target`; the file is the only thing that travels. */
  async function roundTrip(): Promise<void> {
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    const restored = await restoreBackup(backupRepo(target.db), snapshot.bytes);
    expect(restored).toBe('ok');
  }

  it('Scenario: Every transaction type survives the round trip', async () => {
    await roundTrip();

    const after = backupRepo(target.db).snapshot();
    const byId = new Map(after.transactions.map((t) => [t.transaction.id, t.transaction]));
    for (const original of everyTransactionType()) {
      expect(byId.get(original.id)).toEqual(original);
    }
    // Both legs of each переказ, each in its own currency, and no exchange rate anywhere.
    const cross = byId.get('t-cross');
    expect(cross?.type === 'transfer' && cross.left).toEqual(money(-410_000, 'UAH'));
    expect(cross?.type === 'transfer' && cross.arrived).toEqual(money(10_000, 'USD'));
    expect(JSON.stringify(after)).not.toContain('rate');
  });

  it('Scenario: The distinctions of the glossary survive the round trip', async () => {
    await roundTrip();

    const byId = new Map(
      backupRepo(target.db).snapshot().transactions.map((t) => [t.transaction.id, t.transaction]),
    );
    // An інвестиція and a позика are перекази, not витрати.
    expect(byId.get('t-invest')?.type).toBe('transfer');
    expect(byId.get('t-lend')?.type).toBe('transfer');
    // A повернення is a повернення and not a дохід, and it sits in the категорія it undoes.
    const refund = byId.get('t-refund');
    expect(refund?.type).toBe('refund');
    expect(refund?.type === 'refund' && refund.categoryId).toBe('food');
    // Відсотки are a дохід with its own джерело; a комісія is a витрата in «Комісія».
    expect(byId.get('t-interest')?.type).toBe('income');
    const fee = byId.get('t-fee');
    expect(fee?.type === 'expense' && fee.categoryId).toBe('fees');
    // And every сума is still in the currency of the рахунок it sits on.
    const accounts = new Map(
      backupRepo(target.db).snapshot().accounts.map((a) => [a.id, a.currency]),
    );
    for (const t of byId.values()) {
      if (t.type === 'transfer') {
        expect(t.left.currency).toBe(accounts.get(t.fromAccountId));
        expect(t.arrived.currency).toBe(accounts.get(t.toAccountId));
      } else {
        expect(t.amount.currency).toBe(accounts.get(t.accountId));
      }
    }
  });

  it('Scenario: Configuration comes back with the money', async () => {
    await roundTrip();

    const after = backupRepo(target.db).snapshot();
    expect(after.categories.find((c) => c.id === 'old')).toEqual({
      id: 'old',
      name: 'Старе',
      archived: true,
    });
    expect(rulesRepo(target.db).list()).toEqual([
      {
        id: 'r1',
        merchant: 'сільпо',
        mcc: 5411,
        categoryId: 'food',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    ]);
    // The ліміт is still measured against its own категорія.
    expect(limitsRepo(target.db).get('food')).toEqual({
      categoryId: 'food',
      amount: money(250_000, 'UAH'),
    });
    expect(goalsRepo(target.db).list()).toEqual([
      {
        id: 'g1',
        name: 'Авто',
        target: money(500_000, 'UAH'),
        deadline: '2027-01-01',
        accountIds: ['jar'],
      },
    ]);
    expect(importRepo(target.db).committedAt()).toEqual(new Date('2026-06-01T09:00:00.000Z'));
    expect(monobankRepo(target.db).linkOf('mono-card')).toEqual({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-01',
      cursorMs: CURSOR_MS,
      // The moment a sync last completed travels with the cursor it belongs to: the restored
      // phone says the рахунок was synced when it was, not that it never has been.
      lastSyncedAtMs: SYNCED_AT.getTime(),
    });
    expect(notificationsRepo(target.db).watches()).toEqual([
      { packageName: 'ua.privatbank.ap24', accountId: 'card', currency: 'UAH' },
    ]);
  });

  it('Scenario: What the бекап does not hold is gone', async () => {
    // A бекап of one рахунок, one категорія and three витрати, restored onto the seeded phone —
    // which holds five other рахунки, four other категорії and ten other транзакції.
    const bytes = makeBackup(
      {
        accounts: [card],
        categories: [{ id: 'food', name: 'Продукти', archived: false }],
        sources: [],
        rules: [],
        limits: [],
        goals: [],
        transactions: ['2026-07-01', '2026-07-02', '2026-07-03'].map((date, i) => ({
          transaction: {
            type: 'expense' as const,
            id: `kept-${i}`,
            date,
            accountId: 'card',
            amount: money(-1_000, 'UAH'),
            categoryId: 'food',
          },
          storedAtMs: STORED_AT.getTime() + i,
        })),
        monobankAccounts: [],
        monobankLinks: [],
        monobankImportedItems: [],
        watches: [],
        receipts: [],
        receiptItems: [],
      },
      MADE_AT,
    ).bytes;

    expect(await restoreBackup(backupRepo(source.db), bytes)).toBe('ok');

    const after = backupRepo(source.db).snapshot();
    expect(after.accounts.map((a) => a.id)).toEqual(['card']);
    expect(after.transactions.map((t) => t.transaction.id)).toEqual([
      'kept-0',
      'kept-1',
      'kept-2',
    ]);
    expect(after.categories.map((c) => c.id)).toEqual(['food']);
    // The monobank link, the imported ids, the правило, the ліміт, the ціль, the Saldo marker and
    // the відстежуваний застосунок were on the phone and are not in this бекап — so they are gone.
    expect(after.monobankAccounts).toEqual([]);
    expect(after.monobankImportedItems).toEqual([]);
    expect(after.rules).toEqual([]);
    expect(after.limits).toEqual([]);
    expect(after.goals).toEqual([]);
    expect(after.watches).toEqual([]);
    expect(after.saldoImportCommittedAtMs).toBeUndefined();
  });

  it('Scenario: A чек comes back under its транзакція without the tax service', async () => {
    // The point of the source snapshot (design D7): the file is the only thing that travels, and
    // no lookup happens on the way back. Nothing in this test can reach a network — `restoreBackup`
    // takes a repository and bytes, and the чек comes out of the bytes.
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);

    expect(await restoreBackup(backupRepo(target.db), snapshot.bytes)).toBe('ok');

    const restored = receiptsRepo(target.db).forTransaction('t-expense');
    expect(restored?.receipt).toMatchObject({
      id: 'rc-1',
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: '2026-08-01',
      total: money(12_000, 'UAH'),
      snapshot: '<RQ><DAT/></RQ>',
    });
    expect(restored?.items.map((i) => i.rawName)).toEqual([
      'Молоко 2.5%',
      'Хліб житній',
      'Coca-Cola 2L',
    ]);
    // The barcode included, and the позиція that carried none still carries none.
    expect(restored?.items[0]?.barcode).toBe('4820000431026');
    expect(restored?.items[1]?.barcode).toBeUndefined();
    expect(restored?.items[2]?.discount).toEqual(money(100, 'UAH'));
  });

  it('Scenario: A бекап written before чеки existed restores without them', async () => {
    // A file from the previous release: it names no чек at all. The транзакції come back and none
    // of them carries one.
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    const body = JSON.parse(snapshot.bytes) as {
      data: Record<string, unknown>;
      checksum: string;
    };
    delete body.data.receipts;
    delete body.data.receiptItems;
    // Re-checksummed, so the file is a genuine older бекап rather than a damaged current one.
    body.checksum = crc32(canonicalJson(body.data));
    const older = JSON.stringify(body);

    expect(await restoreBackup(backupRepo(target.db), older)).toBe('ok');

    expect(backupRepo(target.db).snapshot().receipts).toEqual([]);
    expect(receiptsRepo(target.db).forTransaction('t-expense')).toBeUndefined();
    expect(backupRepo(target.db).snapshot().transactions).toHaveLength(10);
  });

  it('Scenario: Restoring the same бекап twice changes nothing the second time', async () => {
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    const repo = backupRepo(target.db);

    expect(await restoreBackup(repo, snapshot.bytes)).toBe('ok');
    const once = repo.snapshot();
    expect(await restoreBackup(repo, snapshot.bytes)).toBe('ok');

    // Nothing doubled — a restore replaces, it never merges.
    expect(repo.snapshot()).toEqual(once);
  });

  it('Scenario: The чернетки go, the fingerprints stay', async () => {
    const repo = backupRepo(target.db);
    // A phone of its own, with two чернетки awaiting a word and a decided notification remembered.
    seedWorld(target.db);
    draft(target.db, 'd1');
    draft(target.db, 'd2');
    target.db.insert(notificationFingerprints).values({ fingerprint: 'already-decided' }).run();

    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    expect(await restoreBackup(repo, snapshot.bytes)).toBe('ok');

    expect(notificationsRepo(target.db).pendingDrafts()).toEqual([]);
    // The fingerprint stays, so the notification it marks still yields no second чернетка.
    expect(notificationsRepo(target.db).seenFingerprints().has('already-decided')).toBe(true);
  });

  it('Scenario: The remembered рахунок goes with the phone it was learned on', async () => {
    // The ordinary phone: the owner has recorded by hand, so the form remembers a рахунок — and
    // that рахунок is one of the world about to be replaced.
    seedWorld(target.db);
    entryDefaultsRepo(target.db).remember('jar');
    expect(entryDefaultsRepo(target.db).remembered()).toBe('jar');

    await roundTrip();

    // The restore lands, and the habit is forgotten rather than kept pointing at a replaced world:
    // the form opens on nothing until the owner records by hand again (`format.ts` names it among
    // the exclusions and promises exactly this).
    expect(entryDefaultsRepo(target.db).remembered()).toBeUndefined();
  });

  it('Scenario: Sync does not re-import what was already imported', async () => {
    await roundTrip();

    const monobank = monobankRepo(target.db);
    expect(monobank.linkOf('mono-card')?.cursorMs).toBe(CURSOR_MS);
    expect(monobank.importedIds('mono-card')).toEqual(new Set(['item-1', 'item-2']));
    expect(monobank.hasImported('mono-card', 'item-1')).toBe(true);
    // And nothing in this whole path went near the token: it is in no table and in no snapshot.
    expect(JSON.stringify(backupRepo(target.db).snapshot())).not.toContain('token');
  });

  it('Scenario: A link that has never synced is restored as one that never has', async () => {
    // The same file an older app wrote, and the one this app writes for a link that has never
    // synced: neither names the moment at all, and neither may have one invented for it.
    const bytes = makeBackup(
      {
        accounts: [card],
        categories: [],
        sources: [],
        rules: [],
        limits: [],
        goals: [],
        transactions: [],
        monobankAccounts: [
          {
            id: 'mono-card',
            kind: 'card',
            name: 'black ··1234',
            currency: 'UAH',
            bankBalance: money(500_000, 'UAH'),
            obtainedAtMs: OBTAINED_AT.getTime(),
          },
        ],
        monobankLinks: [
          {
            monobankAccountId: 'mono-card',
            accountId: 'card',
            syncStartDate: '2026-08-01',
            cursorMs: CURSOR_MS,
          },
        ],
        monobankImportedItems: [],
        watches: [],
        receipts: [],
        receiptItems: [],
      },
      MADE_AT,
    ).bytes;
    expect(bytes).not.toContain('lastSyncedAtMs');

    expect(await restoreBackup(backupRepo(target.db), bytes)).toBe('ok');
    const link = monobankRepo(target.db).linkOf('mono-card');
    expect(link?.cursorMs).toBe(CURSOR_MS);
    expect(link?.lastSyncedAtMs).toBeNull();
  });

  it('Scenario: A restore that fails partway leaves the phone as it was', async () => {
    seedWorld(target.db);
    const repo = backupRepo(target.db);
    const before = repo.snapshot();

    const read = readBackup((await saveBackup(backupRepo(source.db), MADE_AT)).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    // Writing its last транзакція is rejected: a дата the column takes and the reader could not.
    const broken = {
      ...read.state,
      transactions: [
        ...read.state.transactions,
        {
          transaction: {
            ...read.state.transactions[0]!.transaction,
            id: 'n-last',
            date: '2026-02-30',
          },
          storedAtMs: STORED_AT.getTime(),
        },
      ],
    };

    expect(() => repo.replaceAll(broken)).toThrow();
    expect(repo.snapshot()).toEqual(before);
    // And the same is true of a rejection SQLite itself raises, deep inside the write.
    const constraintBroken = {
      ...read.state,
      transactions: read.state.transactions.map((entry, index) =>
        index === read.state.transactions.length - 1
          ? {
              ...entry,
              transaction: { ...entry.transaction, id: read.state.transactions[0]!.transaction.id },
            }
          : entry,
      ),
    };
    expect(() => repo.replaceAll(constraintBroken)).toThrow();
    expect(repo.snapshot()).toEqual(before);
    expect(target.db.select().from(transactionsTable).all()).toHaveLength(10);
  });

  it('passes a refusal through untouched, having written nothing', async () => {
    seedWorld(target.db);
    const repo = backupRepo(target.db);
    const before = repo.snapshot();

    expect(await restoreBackup(repo, 'Date,Account,Amount\n')).toEqual({ kind: 'not-a-backup' });
    expect(repo.snapshot()).toEqual(before);
  });

  it('restores a бекап already read, without reading the file twice', async () => {
    // What the screen does after the owner has seen the preview: the very бекап they were shown.
    const read = readBackup((await saveBackup(backupRepo(source.db), MADE_AT)).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    expect(await applyRestore(backupRepo(target.db), read)).toBe('ok');
    expect(backupRepo(target.db).snapshot().transactions).toHaveLength(10);
  });
});

describe('the нагадування travels; this phone`s failures do not', () => {
  let source: TestStorage;
  let target: TestStorage;

  beforeEach(() => {
    source = openTestDb();
    seedWorld(source.db);
    target = openTestDb();
  });
  afterEach(() => {
    source.close();
    target.close();
  });

  async function roundTrip(): Promise<void> {
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    expect(await restoreBackup(backupRepo(target.db), snapshot.bytes)).toBe('ok');
  }

  it('Scenario: The reminder comes back with the бекап', async () => {
    remindersRepo(source.db).setPreference({ enabled: true, time: { hour: 9, minute: 30 } });

    await roundTrip();

    // «Налаштування без секретів» (FR-B1): the restored phone reminds the owner as the old one did.
    expect(remindersRepo(target.db).preference()).toEqual({
      enabled: true,
      time: { hour: 9, minute: 30 },
    });
  });

  it('carries a нагадування the owner turned off, with the time they had chosen', async () => {
    remindersRepo(source.db).setPreference({ enabled: false, time: { hour: 9, minute: 30 } });

    await roundTrip();

    expect(remindersRepo(target.db).preference()).toEqual({
      enabled: false,
      time: { hour: 9, minute: 30 },
    });
  });

  it('Scenario: A бекап carries no репорт', async () => {
    const reporting = reportingRepo(source.db);
    reporting.append({
      id: 'j1',
      at: OBTAINED_AT,
      kind: 'failure',
      name: 'backup-save',
      detail: 'ZZ-JOURNAL-LINE',
    });
    for (const id of ['r1', 'r2']) {
      reporting.create({
        id,
        createdAt: OBTAINED_AT,
        did: `ZZ-DID-${id}`,
        happened: null,
        expected: null,
        route: '/manage/backup',
        build: { version: '0.0.0', commit: 'abc1234', dirty: false, builtAt: 'x' },
        device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
        migrationsApplied: 13,
        counts: { accounts: 1, transactions: 1, categories: 1, rules: 0, drafts: 0 },
        journal: reporting.tail(),
        prompting: null,
        origin: 'section',
        captureFailure: null,
      });
    }
    reporting.addScreenshot('r1', 'ZZ-SHOT.png', OBTAINED_AT);

    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);

    // Not one of them is in the file, nor is the snapshot even shaped to hold them.
    expect(snapshot.bytes).not.toContain('ZZ-JOURNAL-LINE');
    expect(snapshot.bytes).not.toContain('ZZ-DID-');
    expect(snapshot.bytes).not.toContain('ZZ-SHOT.png');
    expect(snapshot.bytes).not.toContain('backup-save');
    const keys = Object.keys(backupRepo(source.db).snapshot());
    expect(keys).not.toContain('journal');
    expect(keys).not.toContain('reports');
    expect(keys).not.toContain('bugReports');

    // And the restoring phone keeps its own, untouched.
    await roundTrip();
    expect(reportingRepo(target.db).list()).toEqual([]);
    expect(reportingRepo(source.db).list().map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('Scenario: Another phone`s failures do not arrive', async () => {
    remindersRepo(source.db).raise('monobank-sync', OBTAINED_AT);

    await roundTrip();

    // What one phone last failed at is not a fact about another, and the file says nothing of it.
    expect(remindersRepo(target.db).outstanding()).toEqual([]);
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    expect(snapshot.bytes).not.toContain('monobank-sync');
    expect(Object.keys(backupRepo(source.db).snapshot())).not.toContain('alerts');
  });

  it('leaves the restoring phone`s own outstanding сповіщення exactly where they are', async () => {
    remindersRepo(target.db).raise('collection', OBTAINED_AT);

    await roundTrip();

    // The бекап replaced the owner's money; it said nothing about what this phone is failing at,
    // and a restore is not a reason to claim the collection started working again.
    expect(remindersRepo(target.db).outstandingKinds()).toEqual(['collection']);
  });

  it('restores an older бекап that names no нагадування as off', async () => {
    // A file written before this change simply holds fewer things (backup-file design D5).
    await roundTrip();

    expect(remindersRepo(target.db).preference()).toEqual({ enabled: false });
  });

  it('replaces the нагадування rather than leaving the old one beside it', async () => {
    remindersRepo(source.db).setPreference({ enabled: true, time: { hour: 9, minute: 30 } });
    remindersRepo(target.db).setPreference({ enabled: true, time: { hour: 21, minute: 0 } });

    await roundTrip();

    expect(remindersRepo(target.db).preference()).toEqual({
      enabled: true,
      time: { hour: 9, minute: 30 },
    });
    expect(target.db.all('SELECT * FROM daily_reminder')).toHaveLength(1);
  });

  it('refuses a бекап naming a time that is not one, in words, having written nothing', async () => {
    remindersRepo(target.db).setPreference({ enabled: true, time: { hour: 21, minute: 0 } });
    const snapshot = await saveBackup(backupRepo(source.db), MADE_AT);
    const damaged = JSON.parse(snapshot.bytes) as { data: Record<string, unknown> };
    damaged.data.reminder = { enabled: true, time: { hour: 25, minute: 70 } };

    const refusal = await restoreBackup(backupRepo(target.db), JSON.stringify(damaged));

    expect(refusal !== 'ok' && isRefusal(refusal) && refusal.kind).toBe('damaged');
    expect(remindersRepo(target.db).preference()).toEqual({
      enabled: true,
      time: { hour: 21, minute: 0 },
    });
  });
});
