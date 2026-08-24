import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

/**
 * The app's storage: one SQLite file on the device, nothing leaves it.
 * Migrations are applied at startup in the root layout; nothing else applies them.
 * Tests use better-sqlite3 over the same committed migrations — see test-db.ts.
 */
export const DATABASE_NAME = 'cap1tal.db';

const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: false });
// SQLite disables foreign keys per connection; without this the schema's `onDelete: 'restrict'`
// references would be inert.
sqlite.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
