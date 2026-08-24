import { asc, eq } from 'drizzle-orm';

import type { Account } from '../domain/account';
import { toAccount, toAccountRow } from './mappers';
import { accounts } from './schema';
import type { Storage } from './storage';

/**
 * Accounts in storage. Speaks domain `Account`s only — rows never leave this module.
 *
 * `save` upserts through `onConflictDoUpdate`, never `INSERT OR REPLACE`: SQLite's REPLACE is a
 * delete followed by an insert, which would trip the `onDelete: 'restrict'` foreign key the
 * moment the account has transactions.
 */
export function accountsRepo(db: Storage) {
  return {
    /**
     * Insert or replace under the same id — the one write path, so renaming, editing the opening
     * balance and archiving all go through it. The kind and the currency are fixed at creation:
     * changing the currency would leave every stored amount in a currency the account no longer
     * has, and changing the kind would silently reclassify its whole history in the monthly
     * picture. Both are rejected rather than applied.
     */
    save(a: Account): void {
      const existing = db.select().from(accounts).where(eq(accounts.id, a.id)).get();
      if (existing && existing.kind !== a.kind) {
        throw new Error(
          `account "${a.id}" is ${existing.kind}; the kind cannot be changed after creation`,
        );
      }
      if (existing && existing.currency !== a.currency) {
        throw new Error(
          `account "${a.id}" is in ${existing.currency}; the currency cannot be changed after creation`,
        );
      }
      const row = toAccountRow(a);
      db.insert(accounts)
        .values(row)
        .onConflictDoUpdate({
          target: accounts.id,
          set: {
            name: row.name,
            openingAmount: row.openingAmount,
            archived: row.archived,
          },
        })
        .run();
    },

    get(id: string): Account | undefined {
      const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
      return row ? toAccount(row) : undefined;
    },

    list(): Account[] {
      return db.select().from(accounts).orderBy(asc(accounts.name)).all().map(toAccount);
    },
  };
}

export type AccountsRepo = ReturnType<typeof accountsRepo>;
