import { asc, eq } from 'drizzle-orm';

import type { CurrentValue } from '../domain/investments';
import { money, type Money } from '../domain/money';
import { isoDate } from '../domain/transaction';
import { accounts, investmentValues } from './schema';
import type { Storage } from './storage';

/**
 * Поточні вартості in storage — what the owner last said each інвестиційний рахунок is worth, and
 * when they said it. Speaks the domain's `CurrentValue` only; rows never leave this module.
 *
 * «At most one вартість per рахунок» is the primary key, not a rule kept here: `set` is an upsert
 * and `clear` a delete, so the shape of the table *is* the requirement (design D3). What this
 * module adds are the two invariants SQLite cannot express without a trigger — the рахунок is of
 * вид `investment`, and the вартість is in that рахунок's own currency — as one read-and-compare
 * before the write, exactly as `goals-repo` guards its currency (design D4). Every path writes
 * through here, so what the specs reject is not representable in storage either, and not merely
 * refused by a form.
 *
 * Nothing in this module touches a транзакція or a баланс. A вартість is an observation of the
 * outside world; recording one moves no money.
 */
export function investmentsRepo(db: Storage) {
  return {
    /** A рахунок's поточна вартість, or nothing at all — the absence is an answer, never an error. */
    get(accountId: string): CurrentValue | undefined {
      const row = db
        .select()
        .from(investmentValues)
        .where(eq(investmentValues.accountId, accountId))
        .get();
      return row ? { amount: money(row.amount, row.currency), asOf: row.asOf } : undefined;
    },

    /**
     * Record or replace: one вартість stands in for the one that was there, сума and дата together.
     * Re-entering is a replacement like any other — no earlier figure lingers beside the new one,
     * because there is only ever one row, and no history is kept: the owner recorded what a
     * рахунок is worth now, not a series they never typed.
     *
     * The column's GLOB check only proves the shape 'NNNN-NN-NN', so the дата is validated as a
     * calendar date first: nothing may be stored that cannot come back out.
     */
    set(accountId: string, value: CurrentValue): void {
      isoDate(value.asOf);
      const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
      if (!account) {
        throw new Error(`рахунку «${accountId}» не існує`);
      }
      if (account.kind !== 'investment') {
        throw new Error(
          `поточна вартість буває тільки в інвестиційного рахунку, а «${account.name}» — це інший вид`,
        );
      }
      if (value.amount.currency !== account.currency) {
        throw new Error(
          `рахунок «${account.name}» — у ${account.currency}, ` +
            `тож його поточна вартість не може бути в ${value.amount.currency}`,
        );
      }
      if (value.amount.amount < 0) {
        throw new Error(
          `поточна вартість «${account.name}» не може бути меншою за нуль — ` +
            'інвестиція може коштувати нічого, але не менше',
        );
      }

      const row = {
        accountId,
        amount: value.amount.amount,
        currency: value.amount.currency,
        asOf: value.asOf,
      };
      db.insert(investmentValues)
        .values(row)
        .onConflictDoUpdate({
          target: investmentValues.accountId,
          set: { amount: row.amount, currency: row.currency, asOf: row.asOf },
        })
        .run();
    },

    /**
     * Clearing removes the row: a рахунок with no вартість is a рахунок with no row, not a zero —
     * «worth nothing» is a вартість the owner entered, and «we do not know» is not a number.
     */
    clear(accountId: string): void {
      db.delete(investmentValues).where(eq(investmentValues.accountId, accountId)).run();
    },

    /**
     * Every вартість by рахунок id — the shape every consumer of one wants: the Рахунки row, a
     * ціль's внесок, the звіти and the пакет for the аналіз. Read in рахунок-id order so the query
     * is total and does not depend on SQLite's sorter.
     */
    all(): Map<string, CurrentValue> {
      return new Map(
        db
          .select()
          .from(investmentValues)
          .orderBy(asc(investmentValues.accountId))
          .all()
          .map((row) => [row.accountId, { amount: money(row.amount, row.currency), asOf: row.asOf }]),
      );
    },

    /**
     * The same вартості with their дати dropped, for the readers that need only the сума: the
     * внесок an інвестиційний рахунок brings to a ціль is a сума, and a дата is not one. It is one
     * call rather than the same `.map` written out on every screen that computes a прогрес.
     */
    amounts(): Map<string, Money> {
      return new Map(
        [...this.all()].map(([accountId, value]) => [accountId, value.amount]),
      );
    },
  };
}

export type InvestmentsRepo = ReturnType<typeof investmentsRepo>;
