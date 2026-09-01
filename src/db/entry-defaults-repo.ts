import { entryDefaults } from './schema';
import type { Storage } from './storage';

/**
 * The one thing the entry form on Головний remembers between launches: the рахунок of the owner's
 * most recent hand-recorded транзакція.
 *
 * A preference, not money — nothing derives a balance or a monthly number from it. Remembering is
 * the caller's explicit act and never a side effect of storing a транзакція: `transactionsRepo`
 * knows nothing about this table, so a monobank sync, a Saldo import and a confirmed чернетка all
 * leave it exactly as it was. Only the hand-entry path on Головний calls `remember`.
 *
 * One row, `'entry'`, kept single by the schema's CHECK: remembering another рахунок replaces the
 * first rather than adding to it, which is why this writes with `onConflictDoUpdate` and never
 * deletes-then-inserts.
 */
export function entryDefaultsRepo(db: Storage) {
  return {
    /** The рахунок id last remembered, or `undefined` on a device that has never recorded by hand. */
    remembered(): string | undefined {
      return db.select().from(entryDefaults).all()[0]?.accountId;
    },

    /**
     * Remembers this рахунок as the last hand-recorded one, replacing whatever was remembered
     * before. The рахунок must exist — the foreign key says so — but it may be archived: taking an
     * archived рахунок out of the form's offer is the screen's rule, not storage's, and forgetting
     * it here would lose the memory the moment a рахунок was archived and unarchived.
     */
    remember(accountId: string): void {
      db.insert(entryDefaults)
        .values({ id: 'entry', accountId })
        .onConflictDoUpdate({ target: entryDefaults.id, set: { accountId } })
        .run();
    },
  };
}

export type EntryDefaultsRepo = ReturnType<typeof entryDefaultsRepo>;
