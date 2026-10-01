import { sql } from 'drizzle-orm';

import type { MovementKind } from '../domain/net-worth';
import type { IsoDate, Month } from '../domain/transaction';
import type { Storage } from './storage';
import { stampedMemo } from './stamp';

/** Net signed effect on one рахунок's баланс across one calendar month, in its own currency. */
export interface AccountMonthMovement {
  readonly accountId: string;
  readonly month: Month;
  readonly net: number;
}

/** One рахунок's net effect in one calendar month from one `MovementKind` of транзакція. */
export interface AccountMonthKindMovement {
  readonly accountId: string;
  readonly month: Month;
  readonly kind: MovementKind;
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
 * Each row also names its `MovementKind` — витрата and повернення are both `spending`, each переказ
 * leg `transfer` — for the розбивка (design D3).
 *
 * Kept as a `WITH` fragment and reused by every query below, so the five readings below can never
 * silently drift into disagreeing about what a транзакція's effect is (design D5;
 * differentially verified against `computeBalance` — task 2.3).
 */
const MOVEMENTS = sql`
  SELECT t.account_id AS accountId, t.date AS date,
         CASE t.type WHEN 'expense' THEN -t.amount ELSE t.amount END AS effect,
         CASE t.type WHEN 'income' THEN 'income'
                     WHEN 'correction' THEN 'correction'
                     ELSE 'spending' END AS kind
  FROM transactions t
  WHERE t.type IN ('expense', 'income', 'refund', 'correction')

  UNION ALL

  SELECT t.from_account_id AS accountId, t.date AS date, -t.left_amount AS effect,
         'transfer' AS kind
  FROM transactions t
  WHERE t.type = 'transfer'

  UNION ALL

  SELECT t.to_account_id AS accountId, t.date AS date, t.arrived_amount AS effect,
         'transfer' AS kind
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
  const direct = {
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
     * `monthlyMovement` split by `MovementKind` — the same rows grouped once more, so the розбивка
     * of a month adds up to exactly its movement (net-worth, "Each month's change has a розбивка",
     * design D3). Bounded by рахунки × months × four kinds, never by транзакції.
     */
    monthlyMovementByType(today: IsoDate): readonly AccountMonthKindMovement[] {
      return db.all<AccountMonthKindMovement>(sql`
        WITH movements AS (${MOVEMENTS})
        SELECT accountId, substr(date, 1, 7) AS month, kind, SUM(effect) AS net
        FROM movements
        WHERE date <= ${today}
        GROUP BY accountId, month, kind
      `);
    },

    /**
     * Each рахунок's earliest recorded транзакція date on or before `today` — absent for a
     * рахунок with no such транзакція. A рахунок enters history no later than this date (net-worth,
     * "A рахунок enters Статок history at its дата початкового залишку").
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

  // Each reading is a function of storage and `today` alone, so it is remembered under the change
  // stamp with the day as its key (app-speed-pass design D1): Головний asks all five on every
  // focus, and with nothing written in between the answer is the one it already has.
  const monthlyMovement = stampedMemo(db, (today) => direct.monthlyMovement(today as IsoDate));
  const monthlyMovementByType = stampedMemo(db, (today) =>
    direct.monthlyMovementByType(today as IsoDate),
  );
  const firstDates = stampedMemo(db, (today) => direct.firstDates(today as IsoDate));
  const firstDateMovement = stampedMemo(db, (today) => direct.firstDateMovement(today as IsoDate));
  const accountsWithFutureRecords = stampedMemo(db, (today) =>
    direct.accountsWithFutureRecords(today as IsoDate),
  );

  return {
    monthlyMovement: (today: IsoDate): readonly AccountMonthMovement[] => monthlyMovement(today),
    monthlyMovementByType: (today: IsoDate): readonly AccountMonthKindMovement[] =>
      monthlyMovementByType(today),
    firstDates: (today: IsoDate): readonly AccountFirstDate[] => firstDates(today),
    firstDateMovement: (today: IsoDate): readonly AccountFirstDateMovement[] =>
      firstDateMovement(today),
    accountsWithFutureRecords: (today: IsoDate): ReadonlySet<string> =>
      accountsWithFutureRecords(today),
  };
}

export type NetWorthRepo = ReturnType<typeof netWorthRepo>;
