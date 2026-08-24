import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import type * as schema from './schema';

/**
 * The database handle the repositories take. Both drivers — `expo-sqlite` at runtime and
 * `better-sqlite3` in tests — expose the same synchronous query builder, so repositories are
 * written once and the tests exercise the code the app runs. See design.md §8.
 */
export type Storage =
  | BetterSQLite3Database<typeof schema>
  | ExpoSQLiteDatabase<typeof schema>;
