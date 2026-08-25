import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema';
import { categories, sources } from './schema';

/**
 * Test-only storage: real SQLite through `better-sqlite3` with the committed migrations applied
 * by the official Drizzle migrator, so tests exercise the exact SQL the app runs. Nothing here is
 * bundled into the app — the runtime client lives in client.ts. See design.md §8.
 */
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestStorage {
  readonly db: TestDb;
  close(): void;
}

/** Resolved from this file, so a test run from any working directory finds the same migrations. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

function open(filename: string): TestStorage {
  const sqlite = new Database(filename);
  // SQLite disables foreign keys per connection; without this every FK and every
  // `onDelete: 'restrict'` in the schema would be inert.
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    close: () => sqlite.close(),
  };
}

/** A fresh in-memory database with all committed migrations applied. */
export function openTestDb(): TestStorage {
  return open(':memory:');
}

/**
 * The category and source rows a test's transactions point at. Since categories-rules a stored
 * витрата, повернення or дохід references a real row (persistence: "A transaction references
 * stored categories and sources"), so a test whose subject is something else declares the
 * vocabulary it needs in one line instead of building it by hand. The name is the id — these are
 * fixtures, not the owner's list; `seedStarterSet` is what puts the real names in.
 */
export function seedReferences(
  db: TestDb,
  ids: { categories?: readonly string[]; sources?: readonly string[] },
): void {
  for (const id of ids.categories ?? []) {
    db.insert(categories).values({ id, name: id }).onConflictDoNothing().run();
  }
  for (const id of ids.sources ?? []) {
    db.insert(sources).values({ id, name: id }).onConflictDoNothing().run();
  }
}

interface Journal {
  readonly entries: readonly { readonly idx: number; readonly tag: string }[];
}

export interface StagedStorage extends TestStorage {
  /** Applies the migrations the staged history left out, bringing the database up to date. */
  migrateToLatest(): void;
}

/**
 * A database with only the first `count` committed migrations applied, and the means to bring it
 * to the current shape afterwards — the only honest way to prove what a migration does to rows
 * that predate it. The partial history is staged in a temporary folder; the committed one is
 * never touched.
 */
export function openTestDbMigratedTo(count: number): StagedStorage {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  const staged = mkdtempSync(join(tmpdir(), 'cap1tal-migrations-'));
  mkdirSync(join(staged, 'meta'));
  const entries = journal.entries.slice(0, count);
  for (const entry of entries) {
    copyFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(staged, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(staged, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
    'utf8',
  );

  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: staged });
  rmSync(staged, { recursive: true, force: true });

  return {
    db,
    migrateToLatest: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => sqlite.close(),
  };
}

/**
 * A database backed by a file, so a test can close it and open it again — the only way to prove
 * that stored data survives a restart.
 */
export function openFileDb(path: string): TestStorage {
  return open(path);
}
