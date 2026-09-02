import { readFileSync } from 'node:fs';

import { getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import * as schema from '../db/schema';
import { money } from '../domain/money';
import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
  checkConsistent,
  parseState,
  type BackupReceipt,
  type BackupState,
} from './format';

const journal = JSON.parse(
  readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
) as { entries: readonly unknown[] };

/** Every table the app actually has, asked of the schema rather than listed a second time. */
const STORED_TABLES: string[] = Object.values(schema)
  .filter((value) => is(value, SQLiteTable))
  .map((table) => getTableName(table as SQLiteTable))
  .sort();

describe('the storage-shape version a бекап is written under', () => {
  it('is the number of committed migrations', () => {
    // The tripwire of design D5. When this fails, a migration has been added and nobody has yet
    // asked whether a бекап still holds everything it should — bumping the constant is one line,
    // and the alternative is a бекап that silently stops holding a new table.
    expect(BACKUP_SCHEMA_VERSION).toBe(journal.entries.length);
  });
});

describe('what a бекап holds', () => {
  it('names only tables that exist', () => {
    // A typo here would exclude a table by accident and nothing else would notice.
    expect(BACKUP_TABLES.filter((name) => !STORED_TABLES.includes(name))).toEqual([]);
  });

  it('Scenario: Nothing secret and nothing overheard reaches the file', () => {
    const excluded = STORED_TABLES.filter((name) => !BACKUP_TABLES.includes(name));

    // Enumerated, not merely "some things are left out": a table added later is either in the
    // бекап or listed here as a decision, and until one of the two happens `verify` fails.
    expect(excluded).toEqual([
      // What this phone last failed at — not the owner's money, and another device's failures are
      // not facts about this one.
      'alerts',
      // The screenshots of a репорт про помилку, and the репорти themselves: this phone's memory
      // of its own bugs — a build, a device and what the owner wrote about them, none of it the
      // owner's money, and none of it true of another phone. They leave only by «Передати».
      'bug_report_screenshots',
      'bug_reports',
      // Which рахунок the entry form on *this* phone opens on: a habit the device learned, not a
      // setting the owner chose and not their money. A restored phone learns it again.
      'entry_defaults',
      // The журнал: what this app did on this phone in the last day or two. Same reason as the
      // репорти it exists to serve.
      'journal',
      // A cache; it re-fetches itself.
      'monobank_rates',
      // Чернетки the owner has not confirmed — and their notification text with them.
      'notification_drafts',
      // What stops an already-decided notification drafting twice; it stays on the phone.
      'notification_fingerprints',
    ]);
  });

  it('holds no place a monobank token or a captured notification could sit', () => {
    // The token lives in the device's secure storage and in no table at all, so there is nothing
    // here to exclude — this asserts that stays true rather than trusting it.
    expect(STORED_TABLES.filter((name) => /token|secret/i.test(name))).toEqual([]);
    // And the raw text of a notification travels only on a чернетка, which is not in the бекап.
    expect(BACKUP_TABLES.filter((name) => /draft|fingerprint|rate/i.test(name))).toEqual([]);
  });

  it('holds every table the owner`s own money and configuration sit in', () => {
    for (const held of [
      'accounts',
      'categories',
      'sources',
      'rules',
      'category_limits',
      'goals',
      'transactions',
      'saldo_import',
      'monobank_accounts',
      'monobank_links',
      'monobank_imported_items',
      'notification_watches',
      // «Налаштування без секретів» (FR-B1): a restored phone reminds the owner as the old one did.
      'daily_reminder',
      // A чек is the owner's own record of a purchase, and the tax service is not guaranteed to
      // serve it again — so a restore reproduces it without the network.
      'fiscal_receipts',
      'receipt_items',
    ]) {
      expect(BACKUP_TABLES).toContain(held);
    }
  });
});

describe('what a бекап holding чеки may not contradict', () => {
  const withReceipt = (over: Partial<BackupReceipt> = {}): BackupReceipt => ({
    id: 'rc-1',
    transactionId: 'tx-1',
    registrarNumber: '3000909908',
    fiscalNumber: '696582',
    issuedDate: '2026-04-29',
    issuedTime: '22:20:06',
    dialect: 'rro',
    kind: 'sale',
    total: money(74_230, 'UAH'),
    acquisition: 'qr_scan',
    fetchedAtMs: 1_777_000_000_000,
    snapshot: '<RQ/>',
    ...over,
  });

  const held: BackupState = {
    // The транзакція below has to stand up on its own, or the рахунок check fires before any чек
    // check is reached and every case here would pass for the wrong reason.
    accounts: [
      {
        id: 'acc-1',
        name: 'Готівка',
        kind: 'cash',
        currency: 'UAH',
        openingBalance: money(0, 'UAH'),
        archived: false,
      },
    ],
    categories: [{ id: 'groceries', name: 'Продукти', archived: false }],
    sources: [],
    rules: [],
    limits: [],
    goals: [],
    transactions: [
      {
        transaction: {
          type: 'expense',
          id: 'tx-1',
          date: '2026-04-29',
          accountId: 'acc-1',
          amount: money(74_230, 'UAH'),
          categoryId: 'groceries',
        },
        storedAtMs: 1,
      },
    ],
    monobankAccounts: [],
    monobankLinks: [],
    monobankImportedItems: [],
    watches: [],
    receipts: [],
    receiptItems: [],
  };

  it('Scenario: A чек pointing outside the бекап stops the restore', () => {
    expect(() =>
      checkConsistent({ ...held, receipts: [withReceipt({ transactionId: 'gone' })] }),
    ).toThrow(/транзакцію, якої в бекапі немає/);
  });

  it('refuses two чеки on one транзакція', () => {
    expect(() =>
      checkConsistent({
        ...held,
        receipts: [withReceipt(), withReceipt({ id: 'rc-2', fiscalNumber: '696583' })],
      }),
    ).toThrow(/другий чек на одній транзакції/);
  });

  it('refuses two чеки of one identity', () => {
    expect(() =>
      checkConsistent({
        ...held,
        // A second транзакція, so the «one чек per транзакція» rule is not what fires here.
        transactions: [
          ...held.transactions,
          {
            transaction: {
              type: 'expense',
              id: 'tx-2',
              date: '2026-04-29',
              accountId: 'acc-1',
              amount: money(1, 'UAH'),
              categoryId: 'groceries',
            },
            storedAtMs: 2,
          },
        ],
        receipts: [withReceipt(), withReceipt({ id: 'rc-2', transactionId: 'tx-2' })],
      }),
    ).toThrow(/двічі під тими самими реквізитами/);
  });

  it('refuses a позиція naming a чек the бекап does not hold', () => {
    expect(() =>
      checkConsistent({
        ...held,
        receipts: [withReceipt()],
        receiptItems: [
          {
            id: 'ri-1',
            receiptId: 'rc-missing',
            line: 1,
            rawName: 'Молоко',
            quantityThousandths: 1000,
            lineTotal: money(4_720, 'UAH'),
          },
        ],
      }),
    ).toThrow(/чек, якого в бекапі немає/);
  });

  it('accepts a чек that stands up, with its позиції', () => {
    expect(() =>
      checkConsistent({
        ...held,
        receipts: [withReceipt()],
        receiptItems: [
          {
            id: 'ri-1',
            receiptId: 'rc-1',
            line: 1,
            rawName: 'Молоко',
            quantityThousandths: 1000,
            lineTotal: money(4_720, 'UAH'),
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe('reading чеки back out of a file', () => {
  it('Scenario: A бекап written before чеки existed restores without them', () => {
    // The шкала of the promise: a file naming neither list parses, and comes back with none.
    const state = parseState({ accounts: [], transactions: [] });

    expect(state.receipts).toEqual([]);
    expect(state.receiptItems).toEqual([]);
  });

  it('reads a чек and its позиція back exactly as written, absences included', () => {
    const written = {
      receipts: [
        {
          id: 'rc-1',
          transactionId: 'tx-1',
          registrarNumber: '3000909908',
          fiscalNumber: '696582',
          issuedDate: '2026-04-29',
          issuedTime: '22:20:06',
          dialect: 'rro',
          kind: 'sale',
          total: { amount: 74_230, currency: 'UAH' },
          sellerName: 'ТОВ "ПРОДАВЕЦЬ"',
          acquisition: 'qr_scan',
          fetchedAtMs: 1_777_000_000_000,
          snapshot: '<RQ/>',
        },
      ],
      receiptItems: [
        {
          id: 'ri-1',
          receiptId: 'rc-1',
          line: 9,
          rawName: 'Снек Кіндер Мілк Слайс 28г',
          quantityThousandths: 2000,
          unit: 'шт',
          unitPrice: { amount: 2_590, currency: 'UAH' },
          lineTotal: { amount: 5_180, currency: 'UAH' },
          barcode: '40084725',
        },
      ],
    };

    const state = parseState(written);

    expect(state.receipts[0]).toEqual({
      ...written.receipts[0],
      total: money(74_230, 'UAH'),
    });
    expect(state.receiptItems[0]?.unitPrice).toEqual(money(2_590, 'UAH'));
    // Absent stays absent rather than becoming a key set to undefined.
    expect('pointName' in (state.receipts[0] as object)).toBe(false);
    expect('discount' in (state.receiptItems[0] as object)).toBe(false);
    expect('uktzed' in (state.receiptItems[0] as object)).toBe(false);
  });

  it('refuses a чек whose dialect, kind or acquisition it does not know', () => {
    const base = {
      id: 'rc-1',
      transactionId: 'tx-1',
      registrarNumber: '1',
      fiscalNumber: '2',
      issuedDate: '2026-04-29',
      issuedTime: '22:20:06',
      dialect: 'rro',
      kind: 'sale',
      total: { amount: 1, currency: 'UAH' },
      acquisition: 'qr_scan',
      fetchedAtMs: 1,
      snapshot: '<RQ/>',
    };

    expect(() => parseState({ receipts: [{ ...base, dialect: 'edi' }] })).toThrow(/діалектом/);
    expect(() => parseState({ receipts: [{ ...base, kind: 'shift' }] })).toThrow(/чеком/);
    // A бекап from a version that acquires чеки another way is from a version this one is not.
    expect(() => parseState({ receipts: [{ ...base, acquisition: 'monobank_auto' }] })).toThrow(
      /способом/,
    );
  });
});
