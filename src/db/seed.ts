import { categories, sources } from './schema';
import { STARTER_CATEGORIES, STARTER_SOURCES } from './starter-set';
import type { Storage } from './storage';

/**
 * Puts the owner's starter lists in place, and is safe to run on every open — which is exactly
 * what the root layout does, right after the migrations.
 *
 * Create-if-missing only (`ON CONFLICT DO NOTHING` on the primary key), so the seed can never
 * fight the owner: a row they renamed keeps its new name, a row they archived stays archived, and
 * nothing is ever duplicated or restored. That is what makes "seeding SHALL NOT change, restore
 * or duplicate a row that already exists" true by construction rather than by a version flag.
 *
 * Deleting a starter row is not something the app offers (archive only), so there is no case
 * where this quietly brings one back.
 */
export function seedStarterSet(db: Storage): void {
  db.insert(categories)
    .values(STARTER_CATEGORIES.map((row) => ({ id: row.id, name: row.name })))
    .onConflictDoNothing()
    .run();
  db.insert(sources)
    .values(STARTER_SOURCES.map((row) => ({ id: row.id, name: row.name })))
    .onConflictDoNothing()
    .run();
}
