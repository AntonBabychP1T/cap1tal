import { and, eq, ne } from 'drizzle-orm';

import { categories, sources, transactions } from './schema';
import { RESERVED_SOURCES, STARTER_CATEGORIES, STARTER_SOURCES } from './starter-set';
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
  adoptHandCreatedReservedSources(db);
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
 * Until «Відсотки» and «Без джерела» became reserved джерела the owner could create either by
 * hand like any other row — the categories spec told them to, in the first case — so a device may
 * hold one under a generated id. Creating the reserved row beside it would leave two unarchived
 * джерела of one name, which the list rules forbid. So the hand-made row is adopted instead:
 * insert the reserved row, move its доходи onto it, drop the old one. That order is the only one
 * `transactions.source_id`'s `onDelete: 'restrict'` allows, and one transaction is what keeps a
 * half-done adoption from existing.
 *
 * The reserved row comes out unarchived even when the row being adopted was archived: what is
 * being adopted is the name and the доходи under it, and a reserved джерело the app itself stores
 * onto cannot be archived away (categories: "an existing джерело with one of those names SHALL
 * become that reserved row itself … and SHALL be unarchived in becoming one"). Nothing else the
 * owner archived is touched — this runs only where a stray of exactly one of these two names is.
 *
 * From the second opening on there is no such row and this matches nothing, which is why it can
 * live in a function that runs on every open. It deliberately does not live in a migration:
 * `.claude/rules/database.md` allows hand-written data statements only where the schema change
 * cannot land without them, and neither table needs this to land.
 */
function adoptHandCreatedReservedSources(db: Storage): void {
  for (const reserved of RESERVED_SOURCES) {
    const strays = db
      .select()
      .from(sources)
      .where(and(eq(sources.name, reserved.name), ne(sources.id, reserved.id)))
      .all();
    if (strays.length === 0) {
      continue;
    }
    db.transaction((tx) => {
      tx.insert(sources)
        .values({ id: reserved.id, name: reserved.name })
        .onConflictDoUpdate({ target: sources.id, set: { archived: false } })
        .run();
      for (const stray of strays) {
        tx.update(transactions)
          .set({ sourceId: reserved.id })
          .where(eq(transactions.sourceId, stray.id))
          .run();
        tx.delete(sources).where(eq(sources.id, stray.id)).run();
      }
    });
  }
}
