/**
 * One SQL statement, run and discarded — the narrowest thing both drivers offer: `expo-sqlite`
 * runs a statement through `execSync`, `better-sqlite3` through `exec`/`pragma`, and `PRAGMA
 * journal_mode` hands its row back differently on each, which a one-argument function sidesteps
 * (design D1).
 */
export type StatementRunner = (sql: string) => void;

/**
 * The wait a writer may spend meeting another writer, in milliseconds, before it fails rather than
 * landing (design D3). The floor is the longest write a chance the phone gives makes while the
 * owner may be opening the app — a monobank page commit or the Drive бекап's state writes, a
 * handful of rows and well under a second. The ceiling is how long the owner will look at a frozen
 * screen: `runSync` blocks React Native's JS thread, not Android's main thread, so a wait does not
 * by itself raise an ANR, but nothing on screen answers while it lasts. Three seconds is long
 * enough that a real background write never trips it and short enough that a genuinely stuck lock
 * surfaces as an error the owner can see and report, rather than an app that simply stops
 * responding.
 */
export const DEFAULT_BUSY_TIMEOUT_MS = 3000;

export interface PrepareConnectionOptions {
  readonly busyTimeoutMs?: number;
}

/**
 * The one preparation every connection to the database gets, whichever driver opened it (design
 * D1). The order is the design, not a detail:
 *
 * 1. `busy_timeout` — first, because every later statement can meet a lock and must be able to
 *    wait.
 * 2. `journal_mode = WAL` — inside a `try`. If another connection holds storage busy past the
 *    bound, the switch throws; that one failure is swallowed and the opening carries on in the
 *    mode the file already has, since a launch must never die on the step that exists to stop
 *    launches dying. The next opening tries again.
 * 3. `foreign_keys = ON` — SQLite disables it per connection; without this every `onDelete:
 *    'restrict'` reference in the schema would be inert.
 */
export function prepareConnection(exec: StatementRunner, options?: PrepareConnectionOptions): void {
  const busyTimeoutMs = options?.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  try {
    exec('PRAGMA journal_mode = WAL');
  } catch {
    // Swallowed: see the docblock above. The opening stays usable in whatever mode the file has.
  }
  exec('PRAGMA foreign_keys = ON');
}
