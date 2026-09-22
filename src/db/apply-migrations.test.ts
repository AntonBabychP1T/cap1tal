import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations } from './apply-migrations';
import { holdLock } from './hold-lock';
import { prepareConnection } from './prepare';
import * as schema from './schema';

/**
 * Proves the persistence spec's migration-race scenario over a real file (design Context: the two
 * callers of `migrate` are `useMigrations` and `prepareBackgroundStorage()`), and `applyMigrations`'
 * own retry (design D5).
 */

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Matches `SQLiteSyncDialect.migrate`'s own bootstrap DDL exactly (node_modules/drizzle-orm). */
const MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )
`;

function tempFile(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cap1tal-migrate-race-'));
  return { dir, file: join(dir, 'db.sqlite') };
}

/** A file an earlier version already migrated: the table exists, and nothing is recorded in it. */
function withEmptyMigrationsTable(file: string): void {
  const sqlite = new Database(file);
  sqlite.exec(MIGRATIONS_TABLE_DDL);
  sqlite.close();
}

describe('apply-migrations', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: Two openings migrate the same storage at once', async () => {
    let file: string;
    ({ dir, file } = tempFile());
    withEmptyMigrationsTable(file);

    // The other opening: holds its hand-applied copy of the committed migration open for a fifth
    // of a second before committing (design D6/Context).
    const holder = holdLock({ file, job: 'migrate', delayMs: 200, migrationsFolder: MIGRATIONS_FOLDER });

    // This opening: prepared like every real one, whose default bound sits well above the
    // worker's hold — without the wait this fails at once with `SQLITE_BUSY` instead of racing.
    const sqlite = new Database(file);
    prepareConnection((sql) => sqlite.exec(sql));
    const db = drizzle(sqlite, { schema });
    await applyMigrations(() => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }));
    sqlite.close();

    await holder.finished;

    const checker = new Database(file);
    try {
      const applied = checker.prepare('SELECT COUNT(*) as n FROM __drizzle_migrations').get() as {
        n: number;
      };
      expect(applied.n).toBe(4);
      expect(
        checker.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get(),
      ).toBeDefined();
    } finally {
      checker.close();
    }
  });

  it('a migrate that always throws is attempted twice and its error reaches the caller', async () => {
    const failure = new Error('broken migration');
    const migrate = vi.fn(() => {
      throw failure;
    });

    await expect(applyMigrations(migrate)).rejects.toThrow(failure);
    expect(migrate).toHaveBeenCalledTimes(2);
  });
});
