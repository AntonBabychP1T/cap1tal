import { asc, eq } from 'drizzle-orm';

import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import { categories, categoryLimits } from './schema';
import type { Storage } from './storage';

/**
 * Ліміти in storage. Speaks domain `CategoryLimit`s only — rows never leave this module.
 *
 * "At most one ліміт per category" is the primary key, not a rule this module keeps: `set` is an
 * upsert and `clear` a delete, so the shape of the table *is* the requirement (design D1). What
 * this module adds on top is the sentence a refusal reads as: a ліміт on a category that is not
 * there is refused by name, before SQLite refuses it as a foreign key.
 */
export function limitsRepo(db: Storage) {
  return {
    /** The category's ліміт, or nothing at all — the absence is an answer, never an error. */
    get(categoryId: string): CategoryLimit | undefined {
      const row = db
        .select()
        .from(categoryLimits)
        .where(eq(categoryLimits.categoryId, categoryId))
        .get();
      return row ? { categoryId: row.categoryId, amount: money(row.amount, row.currency) } : undefined;
    },

    /**
     * Set or change: one ліміт replaces the one that was there, in whatever currency it was.
     * Re-setting in another currency is a change like any other — the old amount does not linger
     * beside the new one, because there is only ever one row.
     */
    set(limit: CategoryLimit): void {
      const category = db
        .select()
        .from(categories)
        .where(eq(categories.id, limit.categoryId))
        .get();
      if (!category) {
        throw new Error(`категорії «${limit.categoryId}» не існує`);
      }
      const row = {
        categoryId: limit.categoryId,
        amount: limit.amount.amount,
        currency: limit.amount.currency,
      };
      db.insert(categoryLimits)
        .values(row)
        .onConflictDoUpdate({
          target: categoryLimits.categoryId,
          set: { amount: row.amount, currency: row.currency },
        })
        .run();
    },

    /** Clearing removes the row: a category with no ліміт is a category with no row, not a zero. */
    clear(categoryId: string): void {
      db.delete(categoryLimits).where(eq(categoryLimits.categoryId, categoryId)).run();
    },

    /** Every ліміт, by category id so the order is total and does not depend on SQLite's sorter. */
    list(): CategoryLimit[] {
      return db
        .select()
        .from(categoryLimits)
        .orderBy(asc(categoryLimits.categoryId))
        .all()
        .map((row) => ({ categoryId: row.categoryId, amount: money(row.amount, row.currency) }));
    },
  };
}

export type LimitsRepo = ReturnType<typeof limitsRepo>;
