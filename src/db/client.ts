import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { prepareConnection } from './prepare';
import * as schema from './schema';

/**
 * The app's storage: one SQLite file on the device, nothing leaves it.
 *
 * This is not the only opening of the file: a chance the phone gives — for the фоновий прогін or
 * for the Drive бекап — can be served by a second JS runtime with a connection of its own, on its
 * own thread, outliving the app having been swiped away. `prepareConnection` is what makes that
 * safe (design D1–D3). Migrations are applied here at startup (`src/hooks/use-storage-migrations.ts`
 * in the root layout) and by `prepareBackgroundStorage()` for the other opening — see
 * `.claude/rules/database.md`. Tests use better-sqlite3 over the same committed migrations, both
 * prepared the same way — see test-db.ts.
 */
export const DATABASE_NAME = 'cap1tal.db';

const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: false });
prepareConnection((sql) => sqlite.execSync(sql));

export const db = drizzle(sqlite, { schema });
