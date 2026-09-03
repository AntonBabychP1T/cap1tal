import { asc, eq, inArray, sql } from 'drizzle-orm';

import { compositionProblem, type AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import { isoDate } from '../domain/transaction';
import { accounts, goalAccounts, goals } from './schema';
import type { Storage } from './storage';

/**
 * Цілі-накопичення in storage, each with its склад. Speaks domain `AccumulationGoal`s only — rows
 * never leave this module.
 *
 * A **ціль витрат** has nothing here on purpose: it is the `category_limits` row of its категорія,
 * written through `limits-repo` under the ліміт's own name (design D1). One row, two names, and no
 * second ceiling that could hold a different сума.
 *
 * The rule this module is the last guard of is `compositionProblem`'s: a склад is non-empty, names
 * each рахунок once, and the ціль's currency is UAH or the single currency that склад shares
 * (design D5). SQLite can express «no рахунок twice» — the composite primary key of `goal_accounts`
 * does — but it cannot express «equal to a column of another table», so the currency half is a
 * read-and-compare. It is in the one writer every path goes through, so what the money rules forbid
 * is not representable in storage either.
 */
function toGoal(
  row: { id: string; name: string; amount: number; currency: string; deadline: string | null },
  accountIds: readonly string[],
): AccumulationGoal {
  return {
    id: row.id,
    name: row.name,
    target: money(row.amount, row.currency),
    // Absent, not empty and not today's date: «this ціль has no дата» is an answer of its own.
    ...(row.deadline === null ? {} : { deadline: row.deadline }),
    accountIds: [...accountIds],
  };
}

export function goalsRepo(db: Storage) {
  /** The склад of each of the given цілі, in a stable order, as one query rather than one per ціль. */
  function compositionsOf(ids: readonly string[]): Map<string, string[]> {
    const byGoal = new Map<string, string[]>(ids.map((id) => [id, []]));
    if (ids.length === 0) {
      return byGoal;
    }
    const rows = db
      .select()
      .from(goalAccounts)
      .where(inArray(goalAccounts.goalId, [...ids]))
      .orderBy(asc(goalAccounts.goalId), asc(goalAccounts.accountId))
      .all();
    for (const row of rows) {
      byGoal.get(row.goalId)?.push(row.accountId);
    }
    return byGoal;
  }

  return {
    /**
     * Insert or replace under the same id, ціль and склад together in one transaction: creating and
     * editing are one write path, so an edited склад is checked exactly as a new one is, and a
     * refusal half-way leaves neither the ціль nor its склад changed.
     *
     * The склад is replaced wholesale rather than diffed — it is a set, and the set the caller
     * hands over is the whole of it. The column's GLOB check only proves the shape 'NNNN-NN-NN',
     * so a дата is validated as a calendar date first: nothing may be stored that cannot come back
     * out.
     */
    save(goal: AccumulationGoal): void {
      if (goal.deadline !== undefined) {
        isoDate(goal.deadline);
      }
      const stored =
        goal.accountIds.length === 0
          ? []
          : db
              .select()
              .from(accounts)
              .where(inArray(accounts.id, [...goal.accountIds]))
              .all();
      const byId = new Map(stored.map((account) => [account.id, account]));
      for (const accountId of goal.accountIds) {
        if (!byId.has(accountId)) {
          throw new Error(`рахунку «${accountId}» не існує`);
        }
      }

      // The склад is read in the order the ціль names it, so a duplicate is found as a duplicate
      // rather than as a currency that happens to match twice.
      const composition = goal.accountIds.map((id) => ({
        id,
        currency: byId.get(id)!.currency,
        name: byId.get(id)!.name,
      }));
      const problem = compositionProblem(goal.target.currency, composition);
      if (problem) {
        throw new Error(refusal(problem, goal, composition));
      }

      const row = {
        id: goal.id,
        name: goal.name,
        amount: goal.target.amount,
        currency: goal.target.currency,
        deadline: goal.deadline ?? null,
      };
      const { id: _id, ...replaceable } = row;
      db.transaction((tx) => {
        tx.insert(goals).values(row).onConflictDoUpdate({ target: goals.id, set: replaceable }).run();
        tx.delete(goalAccounts).where(eq(goalAccounts.goalId, goal.id)).run();
        tx.insert(goalAccounts)
          .values(goal.accountIds.map((accountId) => ({ goalId: goal.id, accountId })))
          .run();
      });
    },

    get(id: string): AccumulationGoal | undefined {
      const row = db.select().from(goals).where(eq(goals.id, id)).get();
      return row ? toGoal(row, compositionsOf([id]).get(id)!) : undefined;
    },

    /**
     * Removing a ціль removes it and its склад and nothing else: no рахунок and no транзакція is
     * touched by it. The склад goes by the `ON DELETE CASCADE` the schema carries — a склад row has
     * no meaning without its ціль.
     */
    remove(id: string): void {
      db.delete(goals).where(eq(goals.id, id)).run();
    },

    /**
     * Every ціль, the nearest дата first — a ціль with a дата is the one with a clock on it — then
     * the ones with no дата, then by id, so the order is total and never depends on SQLite's
     * sorter. `deadline IS NULL` sorts false (0) before true (1), which is exactly «dated first».
     */
    list(): AccumulationGoal[] {
      const rows = db
        .select()
        .from(goals)
        .orderBy(sql`${goals.deadline} IS NULL`, asc(goals.deadline), asc(goals.id))
        .all();
      const compositions = compositionsOf(rows.map((row) => row.id));
      return rows.map((row) => toGoal(row, compositions.get(row.id)!));
    },
  };
}

/**
 * What a refused ціль says, in the owner's own language. The domain names the problem; the
 * sentence is storage's, because a repo refusal is read by whoever is looking at a log or a crash
 * and not only by the form, which phrases the same problems its own way while the owner types.
 */
function refusal(
  problem: NonNullable<ReturnType<typeof compositionProblem>>,
  goal: AccumulationGoal,
  composition: readonly { readonly id: string; readonly currency: string; readonly name: string }[],
): string {
  switch (problem.kind) {
    case 'empty':
      return `ціль «${goal.name}» не має жодного рахунку`;
    case 'duplicate': {
      const named = composition.find((member) => member.id === problem.accountId);
      return `ціль «${goal.name}» називає рахунок «${named?.name ?? problem.accountId}» двічі`;
    }
    case 'mixed':
      return (
        `ціль «${goal.name}» стоїть на рахунках у різних валютах (${problem.currencies.join(', ')}), ` +
        `тож вона може бути тільки в UAH, а не в ${goal.target.currency}`
      );
    case 'foreign':
      return (
        `рахунки цілі «${goal.name}» — у ${problem.shared}, ` +
        `тож ціль у ${goal.target.currency} на них стояти не може`
      );
  }
}

export type GoalsRepo = ReturnType<typeof goalsRepo>;
