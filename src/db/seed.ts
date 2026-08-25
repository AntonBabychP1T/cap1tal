import { and, eq, ne } from 'drizzle-orm';

import { INTEREST_SOURCE_ID } from '../domain/transaction';
import { categories, sources, transactions } from './schema';
import { INTEREST_SOURCE_NAME, STARTER_CATEGORIES, STARTER_SOURCES } from './starter-set';
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
  adoptHandCreatedInterest(db);
  db.insert(categories)
    .values(STARTER_CATEGORIES.map((row) => ({ id: row.id, name: row.name })))
    .onConflictDoNothing()
    .run();
  db.insert(sources)
    .values(STARTER_SOURCES.map((row) => ({ id: row.id, name: row.name })))
    .onConflictDoNothing()
    .run();
}

/**
 * The one thing the seed does that is not create-if-missing, and it is a repair, not a rule.
 *
 * Until «Відсотки» became reserved the categories spec told the owner to create it by hand, so a
 * device may hold one under a generated id — and creating the reserved row beside it would leave
 * two unarchived джерела of one name, which the list rules forbid. So the hand-made row is adopted
 * instead: insert the reserved row, move its доходи onto it, drop the old one. That order is the
 * only one `transactions.source_id`'s `onDelete: 'restrict'` allows, and one transaction is what
 * keeps a half-done adoption from existing.
 *
 * From the second opening on there is no such row and this matches nothing, which is why it can
 * live in a function that runs on every open. It deliberately does not live in a migration:
 * `.claude/rules/database.md` allows hand-written data statements only where the schema change
 * cannot land without them, and the marker table lands perfectly well without this.
 */
function adoptHandCreatedInterest(db: Storage): void {
  const strays = db
    .select()
    .from(sources)
    .where(and(eq(sources.name, INTEREST_SOURCE_NAME), ne(sources.id, INTEREST_SOURCE_ID)))
    .all();
  if (strays.length === 0) {
    return;
  }
  db.transaction((tx) => {
    tx.insert(sources)
      .values({ id: INTEREST_SOURCE_ID, name: INTEREST_SOURCE_NAME })
      .onConflictDoNothing()
      .run();
    for (const stray of strays) {
      tx.update(transactions)
        .set({ sourceId: INTEREST_SOURCE_ID })
        .where(eq(transactions.sourceId, stray.id))
        .run();
      tx.delete(sources).where(eq(sources.id, stray.id)).run();
    }
  });
}
