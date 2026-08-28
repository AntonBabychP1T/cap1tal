import { asc, eq } from 'drizzle-orm';

import type { Goal } from '../domain/goals';
import { money } from '../domain/money';
import { isoDate } from '../domain/transaction';
import { accounts, goals } from './schema';
import type { Storage } from './storage';

/**
 * Цілі in storage. Speaks domain `Goal`s only — rows never leave this module.
 *
 * The one rule that is this module's own is the currency invariant: a ціль's target lives in its
 * linked рахунок's currency, and a ціль whose currency differs from it is refused here rather than
 * only in the editor (design D2). SQLite cannot express "equal to a column of another table", so
 * it is a read-and-compare — but it is in the writer every path goes through, so the mismatch the
 * money rules forbid is not representable in storage either.
 */
function toGoal(row: {
  id: string;
  name: string;
  amount: number;
  currency: string;
  deadline: string;
  accountId: string;
}): Goal {
  return {
    id: row.id,
    name: row.name,
    target: money(row.amount, row.currency),
    deadline: row.deadline,
    accountId: row.accountId,
  };
}

export function goalsRepo(db: Storage) {
  return {
    /**
     * Insert or replace under the same id: creating and editing are one write path, so a ціль
     * moved onto another рахунок is checked against that рахунок's currency exactly as a new one
     * is. The column's GLOB check only proves the shape 'NNNN-NN-NN', so the дата is validated as
     * a calendar date first — nothing may be stored that cannot come back out.
     */
    save(goal: Goal): void {
      isoDate(goal.deadline);
      const account = db.select().from(accounts).where(eq(accounts.id, goal.accountId)).get();
      if (!account) {
        throw new Error(`no рахунок "${goal.accountId}" for the ціль "${goal.name}"`);
      }
      if (account.currency !== goal.target.currency) {
        throw new Error(
          `рахунок "${account.name}" is in ${account.currency}; a ${goal.target.currency} target cannot sit on it`,
        );
      }
      const row = {
        id: goal.id,
        name: goal.name,
        amount: goal.target.amount,
        currency: goal.target.currency,
        deadline: goal.deadline,
        accountId: goal.accountId,
      };
      const { id: _id, ...replaceable } = row;
      db.insert(goals)
        .values(row)
        .onConflictDoUpdate({ target: goals.id, set: replaceable })
        .run();
    },

    get(id: string): Goal | undefined {
      const row = db.select().from(goals).where(eq(goals.id, id)).get();
      return row ? toGoal(row) : undefined;
    },

    /** Removing a ціль removes only the ціль: no рахунок and no транзакція is touched by it. */
    remove(id: string): void {
      db.delete(goals).where(eq(goals.id, id)).run();
    },

    /**
     * Every ціль, the nearest дата first — a ціль is a deadline, so that is the order it is read
     * in — then by id, so the order is total and never depends on SQLite's sorter.
     */
    list(): Goal[] {
      return db.select().from(goals).orderBy(asc(goals.deadline), asc(goals.id)).all().map(toGoal);
    },
  };
}

export type GoalsRepo = ReturnType<typeof goalsRepo>;
