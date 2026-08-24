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
    save(a: Account): void {
      const row = toAccountRow(a);
      db.insert(accounts)
        .values(row)
        .onConflictDoUpdate({
          target: accounts.id,
          set: {
            name: row.name,
            kind: row.kind,
            currency: row.currency,
            openingAmount: row.openingAmount,
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
