import { readFileSync } from 'node:fs';

import { getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import * as schema from '../db/schema';
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES } from './format';

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
      // Which рахунок the entry form on *this* phone opens on: a habit the device learned, not a
      // setting the owner chose and not their money. A restored phone learns it again.
      'entry_defaults',
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
    ]) {
      expect(BACKUP_TABLES).toContain(held);
    }
  });
});
