// Runs on its own OS thread via `node:worker_threads`, so it can hold a real SQLite write lock
// open while the test's own thread observes what waiting on it looks like (design D6):
// `better-sqlite3` blocks its whole thread for the length of a call, so nothing on one thread
// could hold a lock open across a wait of its own. Plain ESM, loaded as a worker entry point on
// its own — it needs neither type stripping nor the `@/` alias.
import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const { file, job, delayMs, migrationsFolder } = workerData;
const signal = new Int32Array(workerData.signal);
const sleeper = new Int32Array(new SharedArrayBuffer(4));

function sleep(ms) {
  Atomics.wait(sleeper, 0, 0, ms);
}

function signalHolding() {
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

const sqlite = new Database(file, { timeout: 0 });
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

try {
  if (job === 'write') {
    // Matches what §3 makes every real write transaction do: take the write lock at `BEGIN`.
    sqlite.exec('BEGIN IMMEDIATE');
    sqlite.pragma(`user_version = ${Date.now() % 1000000}`);
    signalHolding();
    sleep(delayMs);
    sqlite.exec('COMMIT');
  } else if (job === 'migrate') {
    // Replicates `SQLiteSyncDialect.migrate` (node_modules/drizzle-orm/sqlite-core/dialect.js) by
    // hand, so the hold can sit between the migration statements and the commit — a boundary
    // drizzle's own `migrate` never exposes.
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `);
    const migrations = readMigrationFiles({ migrationsFolder });
    sqlite.exec('BEGIN');
    for (const migration of migrations) {
      for (const stmt of migration.sql) {
        sqlite.exec(stmt);
      }
      sqlite
        .prepare('INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)')
        .run(migration.hash, migration.folderMillis);
    }
    signalHolding();
    sleep(delayMs);
    sqlite.exec('COMMIT');
  } else {
    throw new Error(`concurrency-worker: unknown job "${job}"`);
  }
  // Closed before the message is posted, not after: the parent terminates this worker as soon as
  // the message arrives, which would otherwise race this thread's own cleanup.
  sqlite.close();
  parentPort?.postMessage({ ok: true });
} catch (error) {
  sqlite.close();
  parentPort?.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
