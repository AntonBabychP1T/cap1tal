import { sql } from 'drizzle-orm';

import type { IsoDate, Month } from '../domain/transaction';
import type { Storage } from './storage';

/** Net signed effect on one рахунок's баланс across one calendar month, in its own currency. */
export interface AccountMonthMovement {
  readonly accountId: string;
  readonly month: Month;
  readonly net: number;
}

/** One рахунок's earliest recorded транзакція date, no later than the day history is read for. */
export interface AccountFirstDate {
  readonly accountId: string;
  readonly firstDate: IsoDate;
}

/** Net signed effect on one рахунок's баланс through (and including) its own first date. */
export interface AccountFirstDateMovement {
  readonly accountId: string;
  readonly net: number;
}

/**
 * `transactionEffect` (`src/domain/account.ts`), restated in SQL: what one транзакція row does to
 * one рахунок's баланс, in that рахунок's own currency. One row per (рахунок, транзакція) touch —
 * a переказ contributes at most one row here per leg, never two for the same рахунок, because the
 * same-account-on-both-legs case is refused at creation.
 *
 * Kept as a `WITH` fragment and reused by every query below, so the four readings below can never
 * silently drift into disagreeing about what a транзакція's effect is (design D5;
 * differentially verified against `computeBalance` — task 2.3).
 */
const MOVEMENTS = sql`
  SELECT t.account_id AS accountId, t.date AS date,
         CASE t.type WHEN 'expense' THEN -t.amount ELSE t.amount END AS effect
  FROM transactions t
  WHERE t.type IN ('expense', 'income', 'refund', 'correction')

  UNION ALL

  SELECT t.from_account_id AS accountId, t.date AS date, -t.left_amount AS effect
  FROM transactions t
  WHERE t.type = 'transfer'

  UNION ALL

  SELECT t.to_account_id AS accountId, t.date AS date, t.arrived_amount AS effect
  FROM transactions t
  WHERE t.type = 'transfer'
`;

/**
 * The local read adapter net-worth's historical reconstruction is built on (design D5). Every
 * reading here is bounded by accounts and months, never by the number of stored транзакції: on a
 * 50000-record ledger this still returns at most a few hundred rows (task 2.3's differential
 * test), because SQLite does the summing and only the sums leave the database.
 *
 * Deliberately silent about which рахунки exist, what currency each is in, and what its opening
 * balance is — those live on the `Account` the caller already has. This module answers only what
 * that caller cannot already compute in one query: history, not membership.
 */
export function netWorthRepo(db: Storage) {
  return {
    /**
     * Net signed movement per рахунок per calendar month, транзакції dated on or before `today`
     * only — a future-dated транзакція never enters a historical aggregate (net-worth, "Future
     * dates do not extend the curve"). Walking month-end to month-end by adding each month's net
     * onto the running balance is how the historical series beyond the first point is built.
     */
    monthlyMovement(today: IsoDate): readonly AccountMonthMovement[] {
      return db.all<AccountMonthMovement>(sql`
        WITH movements AS (${MOVEMENTS})
        SELECT accountId, substr(date, 1, 7) AS month, SUM(effect) AS net
        FROM movements
        WHERE date <= ${today}
        GROUP BY accountId, month
      `);
    },

    /**
     * Each рахунок's earliest recorded транзакція date on or before `today` — absent for a
     * рахунок with no such транзакція. A nonzero opening balance is anchored here: before this
     * date the рахунок's historical contribution is unknown (net-worth, "Undated opening money
     * produces honest coverage gaps").
     */
    firstDates(today: IsoDate): readonly AccountFirstDate[] {
      return db.all<AccountFirstDate>(sql`
        WITH movements AS (${MOVEMENTS})
        SELECT accountId, MIN(date) AS firstDate
        FROM movements
        WHERE date <= ${today}
        GROUP BY accountId
      `);
    },

    /**
     * Net effect through each рахунок's own first date (end of day) — the one aggregate a
     * calendar-month bucket cannot give, because the first date rarely falls on a month boundary
     * and a later транзакція in that same month must not bleed into it (net-worth, "The first
     * date does not absorb its whole month"). Only рахунки with a first date on or before `today`
     * are represented.
     */
    firstDateMovement(today: IsoDate): readonly AccountFirstDateMovement[] {
      return db.all<AccountFirstDateMovement>(sql`
        WITH movements AS (${MOVEMENTS}),
             first_dates AS (
               SELECT accountId, MIN(date) AS firstDate
               FROM movements
               WHERE date <= ${today}
               GROUP BY accountId
             )
        SELECT m.accountId AS accountId, SUM(m.effect) AS net
        FROM movements m
        JOIN first_dates f ON f.accountId = m.accountId AND m.date <= f.firstDate
        GROUP BY m.accountId
      `);
    },

    /**
     * Every рахунок with at least one транзакція dated strictly after `today` — the future-record
     * flag a current Статок reading discloses instead of silently joining an incomparable future
     * value into the curve (net-worth, "Future dates do not extend the curve").
     */
    accountsWithFutureRecords(today: IsoDate): ReadonlySet<string> {
      const rows = db.all<{ accountId: string }>(sql`
        WITH movements AS (${MOVEMENTS})
        SELECT DISTINCT accountId FROM movements WHERE date > ${today}
      `);
      return new Set(rows.map((r) => r.accountId));
    },
  };
}

export type NetWorthRepo = ReturnType<typeof netWorthRepo>;
