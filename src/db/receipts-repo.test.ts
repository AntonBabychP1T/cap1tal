import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import type { FiscalReceipt, ReceiptItem } from '../domain/fiscal-receipt';
import { money } from '../domain/money';
import { monthlyPicture } from '../domain/monthly-picture';
import { expenseByDefault, refund, type Transaction } from '../domain/transaction';
import { toAccountRow } from './mappers';
import { receiptsRepo } from './receipts-repo';
import {
  accounts,
  fiscalReceipts as fiscalReceiptsTable,
  receiptItems as receiptItemsTable,
  transactions as transactionsTable,
} from './schema';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/**
 * Real SQLite over the committed migrations — no mock of the database anywhere, so the constraints
 * that carry the rules («one чек per транзакція», «one чек per identity», the cascade) are the
 * ones the phone runs.
 */

/** The moment a транзакція counts as stored — fixed, so nothing here depends on a clock. */
const STORED_AT = new Date('2026-04-29T12:00:00.000Z');

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(1_000_00, 'UAH'),
});

const purchase = expenseByDefault({
  id: 'tx-1',
  date: '2026-04-29',
  accountId: 'card',
  amount: money(74230, 'UAH'),
  categoryId: 'groceries',
});

const other = expenseByDefault({
  id: 'tx-2',
  date: '2026-04-30',
  accountId: 'card',
  amount: money(5000, 'UAH'),
  categoryId: 'groceries',
});

function receiptOn(transactionId: string, over: Partial<FiscalReceipt> = {}): FiscalReceipt {
  return {
    id: 'r1',
    transactionId,
    registrarNumber: '3000909908',
    fiscalNumber: '696582',
    issuedDate: '2026-04-29',
    issuedTime: '22:20:06',
    dialect: 'rro',
    kind: 'sale',
    total: money(74230, 'UAH'),
    sellerName: 'ТОВ "ПРОДАВЕЦЬ"',
    acquisition: 'qr_scan',
    fetchedAt: 1_777_000_000_000,
    snapshot: '<RQ><DAT/></RQ>',
    ...over,
  };
}

function itemsOn(receiptId: string): ReceiptItem[] {
  return [
    {
      id: 'i1',
      receiptId,
      line: 5,
      rawName: 'ВодаНегазованаМиргородська1,5',
      quantityThousandths: 1000,
      lineTotal: money(2340, 'UAH'),
      barcode: '4820000431026',
      code: '25',
    },
    {
      id: 'i2',
      receiptId,
      line: 9,
      rawName: 'Снек Кіндер Мілк Слайс 28г',
      quantityThousandths: 2000,
      unit: 'шт',
      unitPrice: money(2590, 'UAH'),
      lineTotal: money(5180, 'UAH'),
      discount: money(100, 'UAH'),
      barcode: '40084725',
      uktzed: '1806903100',
      code: '1178',
    },
  ];
}

describe('a чек in storage', () => {
  let storage: TestStorage;
  let repo: ReturnType<typeof receiptsRepo>;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, { categories: ['groceries'] });
    storage.db.insert(accounts).values(toAccountRow(card)).run();
    transactionsRepo(storage.db).save(purchase, STORED_AT);
    transactionsRepo(storage.db).save(other, STORED_AT);
    repo = receiptsRepo(storage.db);
  });

  afterEach(() => storage.close());

  it('A чек round-trips whole', () => {
    const items = itemsOn('r1');
    repo.attach(receiptOn('tx-1'), items);

    const stored = repo.forTransaction('tx-1');

    expect(stored?.receipt).toEqual(receiptOn('tx-1'));
    expect(stored?.items).toEqual(items);
    // Absent values are still absent, not null and not empty.
    expect('unitPrice' in (stored?.items[0] as object)).toBe(false);
    expect('unit' in (stored?.items[0] as object)).toBe(false);
    expect('uktzed' in (stored?.items[0] as object)).toBe(false);
  });

  it('reads the позиції in document order', () => {
    repo.attach(receiptOn('tx-1'), [...itemsOn('r1')].reverse());

    expect(repo.forTransaction('tx-1')?.items.map((i) => i.line)).toEqual([5, 9]);
  });

  it('A second чек on a транзакція is rejected', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    expect(() =>
      repo.attach(receiptOn('tx-1', { id: 'r2', fiscalNumber: '999999' }), []),
    ).toThrow();
    expect(repo.forTransaction('tx-1')?.receipt.id).toBe('r1');
  });

  it('The same identity is rejected twice', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    expect(() => repo.attach(receiptOn('tx-2', { id: 'r2' }), [])).toThrow();
    expect(repo.forTransaction('tx-2')).toBeUndefined();
  });

  it('An unknown транзакція id is rejected', () => {
    expect(() => repo.attach(receiptOn('nope', { id: 'r9' }), itemsOn('r9'))).toThrow();

    expect(repo.byIdentity({ registrarNumber: '3000909908', fiscalNumber: '696582', issuedDate: '2026-04-29' })).toBeUndefined();
  });

  it('A failed позиція stores no чек', () => {
    const items = itemsOn('r1');
    // The third позиція repeats line 9, which UNIQUE(receipt_id, line) refuses.
    const withClash = [...items, { ...(items[1] as ReceiptItem), id: 'i3' }];

    expect(() => repo.attach(receiptOn('tx-1'), withClash)).toThrow();

    expect(repo.forTransaction('tx-1')).toBeUndefined();
    expect(
      repo.byIdentity({ registrarNumber: '3000909908', fiscalNumber: '696582', issuedDate: '2026-04-29' }),
    ).toBeUndefined();
  });

  it('finds a чек by its identity wherever it hangs', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    const found = repo.byIdentity({
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: '2026-04-29',
    });

    expect(found?.receipt.transactionId).toBe('tx-1');
    expect(found?.items).toHaveLength(2);
    // The same number on another day, or another реєстратор, is another чек entirely.
    expect(
      repo.byIdentity({ registrarNumber: '3000909908', fiscalNumber: '696582', issuedDate: '2026-04-30' }),
    ).toBeUndefined();
    expect(
      repo.byIdentity({ registrarNumber: '4000146829', fiscalNumber: '696582', issuedDate: '2026-04-29' }),
    ).toBeUndefined();
  });

  it('A чек is not limited to «Продукти»', () => {
    // The engine forbids no category: the same чек attaches to a витрата in «Побут» exactly as it
    // would to one in the seeded groceries category.
    seedReferences(storage.db, { categories: ['home'] });
    const household = expenseByDefault({
      id: 'tx-home',
      date: '2026-04-29',
      accountId: 'card',
      amount: money(74230, 'UAH'),
      categoryId: 'home',
    });
    transactionsRepo(storage.db).save(household, STORED_AT);

    repo.attach(receiptOn('tx-home'), itemsOn('r1'));

    expect(repo.forTransaction('tx-home')?.items).toHaveLength(2);
    expect(repo.forTransaction('tx-home')?.receipt.total).toEqual(money(74230, 'UAH'));
  });

  it('Scanning the same QR twice is one чек', () => {
    // The same реквізити offered a second time for the same транзакція: storage holds one чек, and
    // the second offer is answered by the чек that is already there rather than by a new row.
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    const identity = {
      registrarNumber: '3000909908',
      fiscalNumber: '696582',
      issuedDate: '2026-04-29',
    };
    const already = repo.byIdentity(identity);
    expect(already?.receipt.transactionId).toBe('tx-1');
    // Which is what the screen asks before it writes anything — and writing anyway is refused.
    expect(() => repo.attach(receiptOn('tx-1', { id: 'r2' }), itemsOn('r2'))).toThrow();

    expect(
      storage.db.select().from(fiscalReceiptsTable).all().filter((r) => r.fiscalNumber === '696582'),
    ).toHaveLength(1);
    expect(repo.forTransaction('tx-1')?.receipt.id).toBe('r1');
  });

  it('A failed store leaves no чек behind', () => {
    // The same unit as «A failed позиція stores no чек», under the title the fiscal-receipts spec
    // gives it: the last позиція is rejected, so neither it nor the чек is stored.
    const items = itemsOn('r1');
    const doomed = [...items, { ...(items[1] as ReceiptItem), id: 'i3' }];

    expect(() => repo.attach(receiptOn('tx-1'), doomed)).toThrow();

    expect(repo.forTransaction('tx-1')).toBeUndefined();
    expect(storage.db.select().from(receiptItemsTable).all()).toEqual([]);
  });

  it('Removing the транзакція removes the чек', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    transactionsRepo(storage.db).remove('tx-1');

    // Nothing of it loads — not the чек by its identity, and not one позиція by any route.
    expect(
      repo.byIdentity({ registrarNumber: '3000909908', fiscalNumber: '696582', issuedDate: '2026-04-29' }),
    ).toBeUndefined();
    expect(storage.db.select().from(receiptItemsTable).all()).toEqual([]);
  });

  it('Replacing the транзакція keeps the чек', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    // Replaced under its id by a повернення with another сума — the persistence spec's own case.
    transactionsRepo(storage.db).save(
      refund({
        id: 'tx-1',
        date: '2026-04-29',
        accountId: 'card',
        amount: money(5000, 'UAH'),
        categoryId: 'groceries',
      }),
      STORED_AT,
    );

    const stored = repo.forTransaction('tx-1');
    expect(stored?.receipt).toEqual(receiptOn('tx-1'));
    expect(stored?.items).toEqual(itemsOn('r1'));
  });

  it('Deleting the транзакція deletes the чек', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    transactionsRepo(storage.db).remove('tx-1');

    expect(repo.forTransaction('tx-1')).toBeUndefined();
    expect(
      repo.byIdentity({ registrarNumber: '3000909908', fiscalNumber: '696582', issuedDate: '2026-04-29' }),
    ).toBeUndefined();
  });

  it('Editing the сума keeps the чек', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    transactionsRepo(storage.db).save({ ...purchase, amount: money(70000, 'UAH') }, STORED_AT);

    const stored = repo.forTransaction('tx-1');
    expect(stored?.receipt.total).toEqual(money(74230, 'UAH'));
    expect(stored?.items).toHaveLength(2);
    expect(transactionsRepo(storage.db).get('tx-1')).toMatchObject({
      type: 'expense',
      amount: money(70000, 'UAH'),
    });
  });

  it('Retyping keeps the чек', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    const retyped: Transaction = refund({
      id: 'tx-1',
      date: '2026-04-29',
      accountId: 'card',
      amount: money(74230, 'UAH'),
      categoryId: 'groceries',
    });
    transactionsRepo(storage.db).save(retyped, STORED_AT);

    expect(repo.forTransaction('tx-1')?.receipt.id).toBe('r1');
    expect(repo.forTransaction('tx-1')?.items).toHaveLength(2);
  });

  it('Detaching deletes the чек and frees its identity', () => {
    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    repo.remove('r1');

    expect(repo.forTransaction('tx-1')).toBeUndefined();
    // The позиції went with it...
    expect(
      repo.byIdentity({ registrarNumber: '3000909908', fiscalNumber: '696582', issuedDate: '2026-04-29' }),
    ).toBeUndefined();
    // ...and the транзакція is exactly what it was.
    expect(transactionsRepo(storage.db).get('tx-1')).toEqual(purchase);
    // The same QR can be attached again, here or elsewhere.
    repo.attach(receiptOn('tx-2', { id: 'r2' }), []);
    expect(repo.forTransaction('tx-2')?.receipt.id).toBe('r2');
  });
});

describe('a чек across a restart', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cap1tal-receipts-'));
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('reads back unchanged after storage is closed and reopened', () => {
    const path = join(directory, 'receipts.db');
    const items = itemsOn('r1');

    const first = openFileDb(path);
    seedReferences(first.db, { categories: ['groceries'] });
    first.db.insert(accounts).values(toAccountRow(card)).run();
    transactionsRepo(first.db).save(purchase, STORED_AT);
    receiptsRepo(first.db).attach(receiptOn('tx-1'), items);
    first.close();

    const second = openFileDb(path);
    try {
      const stored = receiptsRepo(second.db).forTransaction('tx-1');
      expect(stored?.receipt).toEqual(receiptOn('tx-1'));
      expect(stored?.items).toEqual(items);
    } finally {
      second.close();
    }
  });
});

/**
 * The requirement the whole capability rests on, proven against the app's own computations rather
 * than asserted: a чек is detail, and detail moves no money.
 */
describe('a чек changes no number the app computes', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, { categories: ['groceries'] });
    storage.db.insert(accounts).values(toAccountRow(card)).run();
    transactionsRepo(storage.db).save(purchase, STORED_AT);
    transactionsRepo(storage.db).save(other, STORED_AT);
  });

  afterEach(() => storage.close());

  it('Attaching a чек changes no number', () => {
    const repo = receiptsRepo(storage.db);
    const all = () => transactionsRepo(storage.db).listAll();

    const balanceBefore = computeBalance(card, all());
    const pictureBefore = monthlyPicture({ month: '2026-04', accounts: [card], transactions: all() });

    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    expect(computeBalance(card, all())).toEqual(balanceBefore);
    expect(monthlyPicture({ month: '2026-04', accounts: [card], transactions: all() })).toEqual(
      pictureBefore,
    );
  });

  it('Позиції never become транзакції', () => {
    const repo = receiptsRepo(storage.db);
    const countBefore = transactionsRepo(storage.db).listAll().length;

    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    // Two позиції were stored and the транзакція count did not move.
    expect(repo.forTransaction('tx-1')?.items).toHaveLength(2);
    expect(transactionsRepo(storage.db).listAll()).toHaveLength(countBefore);
    // And no позиція carries a категорія — there is no column for one.
    for (const item of repo.forTransaction('tx-1')?.items ?? []) {
      expect(Object.keys(item)).not.toContain('categoryId');
    }
  });

  it('the транзакція table is untouched by an attach', () => {
    const repo = receiptsRepo(storage.db);
    const before = storage.db.select().from(transactionsTable).all();

    repo.attach(receiptOn('tx-1'), itemsOn('r1'));

    expect(storage.db.select().from(transactionsTable).all()).toEqual(before);
  });
});
