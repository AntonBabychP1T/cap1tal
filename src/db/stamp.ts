import { sql } from 'drizzle-orm';

import { inTransaction } from './prepare';
import type { Storage } from './storage';

/**
 * Reads repeated between writes, answered from memory — and never older than the last committed
 * write (persistence, "A read repeated between writes is answered without reading storage again";
 * app-speed-pass design D1).
 *
 * This is not a cache that writers keep up to date: nothing here is told about a write. The key a
 * value is remembered under is storage's own change stamp, taken *before* the read, so a write can
 * only ever make the next answer a fresh one:
 *
 * - `total_changes()` counts every row this connection has inserted, updated or deleted since it
 *   opened — every repository, a restore, a merge, a sweep, a seed.
 * - `PRAGMA data_version` moves when *another* connection commits — the фоновий прогін and the
 *   Drive бекап, which run in a second JS runtime with a connection of their own.
 *
 * Nothing is stored: a value lives as long as the process, one generation per memo.
 */

/** Rows written through {@link outsideStamp}, per connection — subtracted from the stamp. */
const excludedChanges = new WeakMap<object, number>();

/** The connection a handle speaks for: drizzle's `$client` where it has one, the handle itself otherwise. */
function connectionOf(db: Storage): object {
  const client = (db as { $client?: unknown }).$client;
  return typeof client === 'object' && client !== null ? client : db;
}

/**
 * Storage's change stamp as one string: `data_version`, then `total_changes()` less the rows
 * written outside it. Equal stamps mean no write this memo could depend on was committed in
 * between. One statement, through the table-valued `pragma_data_version()`.
 */
export function storageStamp(db: Storage): string {
  const row = db.get<{ version: number; changes: number }>(
    sql`select (select data_version from pragma_data_version()) as version, total_changes() as changes`,
  );
  const excluded = excludedChanges.get(connectionOf(db)) ?? 0;
  return `${row?.version ?? 0}:${(row?.changes ?? 0) - excluded}`;
}

/**
 * Runs `write` without moving the stamp: the rows it changes are added to this connection's
 * excluded count, so the memos keep answering from memory across it. JS is single-threaded and
 * the connection is ours, so the difference in `total_changes()` is exactly `write`'s own rows.
 *
 * Only for a table no memoized read is made from. The one caller is `reportingRepo.append` — the
 * журнал records every screen opened, and counted raw it would move the stamp on every tab switch
 * and back swipe; the журнал feeds no memo (the bug report reads it directly). A new caller states
 * the same in its own doc.
 */
export function outsideStamp<T>(db: Storage, write: () => T): T {
  const changes = () =>
    db.get<{ changes: number }>(sql`select total_changes() as changes`)?.changes ?? 0;
  const before = changes();
  try {
    return write();
  } finally {
    const connection = connectionOf(db);
    excludedChanges.set(connection, (excludedChanges.get(connection) ?? 0) + changes() - before);
  }
}

/**
 * `read`, remembered under storage's change stamp and an optional `key` (the ISO day, for a read
 * that also depends on `now`). The protocol, in this order, is the design:
 *
 * 1. **Inside a transaction, bypass.** Run `read` and remember nothing: it may see rows a rollback
 *    later takes away, and a rollback moves no counter back.
 * 2. **Stamp first.** A commit by another connection that lands *during* `read` moves
 *    `data_version` after the stamp, so the next call reads again — a value is only ever
 *    remembered under a stamp at or before the state it saw.
 * 3. **Reuse or read.** Same stamp and key: the remembered value. Otherwise `read`, sealed, and
 *    remembered.
 *
 * The answer is sealed (see {@link sealed}) whichever way it was produced, so no caller can change
 * what the next one receives.
 */
export function stampedMemo<T>(db: Storage, read: (key: string) => T): (key?: string) => T {
  let remembered: { readonly stamp: string; readonly key: string; readonly value: T } | undefined;
  return (key = '') => {
    if (inTransaction(db)) {
      return sealed(read(key));
    }
    const stamp = storageStamp(db);
    if (remembered && remembered.stamp === stamp && remembered.key === key) {
      return remembered.value;
    }
    const value = sealed(read(key));
    remembered = { stamp, key, value };
    return value;
  };
}

function refuse(): never {
  throw new TypeError('a stored-history answer cannot be changed');
}

/**
 * A map or set whose writers throw: own `set`/`add`/`delete`/`clear` shadow the prototype's, and
 * the object is frozen so they cannot be put back. An instance rather than a subclass, so nothing
 * depends on how a build transpiles `extends Map`.
 */
function sealCollection<C extends Map<unknown, unknown> | Set<unknown>>(collection: C): C {
  for (const writer of ['set', 'add', 'delete', 'clear']) {
    if (writer in collection) {
      Object.defineProperty(collection, writer, { value: refuse });
    }
  }
  return Object.freeze(collection);
}

/**
 * `value` made unchangeable, in every build: arrays and plain objects deep-frozen in place, maps
 * and sets replaced by sealed copies whose writers throw. Anything else (a `Date`, a function) is
 * left as it is. Runs once per rebuild — small beside mapping the rows it covers.
 */
export function sealed<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  if (value instanceof Map) {
    return sealCollection(
      new Map([...(value as Map<unknown, unknown>)].map(([k, v]) => [k, sealed(v)] as const)),
    ) as T;
  }
  if (value instanceof Set) {
    return sealCollection(new Set([...(value as Set<unknown>)].map((v) => sealed(v)))) as T;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = sealed(value[i]);
    return Object.freeze(value);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const name of Object.keys(record)) record[name] = sealed(record[name]);
  return Object.freeze(value);
}
