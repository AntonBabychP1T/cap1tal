import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema';

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
 * A database backed by a file, so a test can close it and open it again — the only way to prove
 * that stored data survives a restart.
 */
export function openFileDb(path: string): TestStorage {
  return open(path);
}
