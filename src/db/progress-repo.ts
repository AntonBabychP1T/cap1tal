import { asc, eq, isNull, sql } from 'drizzle-orm';

import type { AccountKind } from '../domain/account';
import { money, type CurrencyCode } from '../domain/money';
import {
  isoDate,
  CORRECTION_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type IsoDate,
} from '../domain/transaction';
import {
  decodeEvidence,
  encodeEvidence,
  type ChallengeDecision,
  type EarnedAchievement,
  type SpendingNorm,
  type SpendingNorms,
} from '../progress/earned';
import type {
  DraftRow,
  KindRow,
  LimitedCategoryRow,
  MonthRow,
  ProgressSummary,
} from '../progress/summary';
import { challengeDecisions, earnedAchievements, spendingNorms } from './schema';
import type { Storage } from './storage';

/**
 * The зведення прогресу, read as aggregates.
 *
 * The rule this module exists to keep is a testable one: **evaluating досягнення never loads a
 * транзакція**. Every reading below is a `GROUP BY` whose rows are bounded by (місяць × currency),
 * by (вид рахунку × currency) or by a fixed count — about a hundred rows for the owner's real
 * two-year history, whatever number of транзакції sits behind it (design D10, persistence «The
 * зведення is bounded, not per транзакція»).
 *
 * There is one deliberate exception, and it is one row: `nthTransactionDate` reads the Nth
 * транзакція alone, to date a count досягнення the evaluation is newly earning.
 *
 * The money numbers are the місячна картина's own, computed here in SQL because the alternative is
 * loading the history. That makes this the one place where `monthlyPicture`'s rules are written
 * twice, so `progress-repo.test.ts` compares the two on the same fixture — the зведення is a
 * faster reading of the same truth, never a second opinion.
 */

interface MonthAggregate {
  readonly month: string;
  readonly currency: string;
  readonly spent: number;
  readonly income: number;
  readonly invested: number;
  readonly saved: number;
  readonly transactions: number;
  readonly uncategorised: number;
  readonly unsourced: number;
}

interface KindAggregate {
  readonly kind: string;
  readonly currency: string;
  readonly balance: number;
}

interface LimitedCategoryAggregate {
  readonly month: string;
  readonly currency: string;
  readonly categoryId: string;
  readonly spent: number;
}

interface SpanAggregate {
  readonly count: number;
  readonly earliest: string | null;
  readonly latest: string | null;
}

interface DraftAggregate {
  readonly month: string;
  readonly waiting: number;
}

/**
 * Every транзакція, split into the legs that carry money and the legs that merely name a currency,
 * so one `GROUP BY` over the union answers both «how much moved» and «how many rows were there».
 *
 * A транзакція that is not a переказ is one leg: its own currency, its own сума, and the count of
 * one. A переказ is up to four: one leg per end so the місяць counts it in *both* its currencies
 * (`COUNT(DISTINCT id)` makes a same-currency переказ count once), and one leg per bucket carrying
 * the сума `classifyTransfer` measures it by — which for a cross-currency переказ is the opposite
 * end's, and so may name a different currency than the leg that counted it. Bucket legs carry a
 * NULL id for that reason: they are money, not a row to be counted.
 *
 * `спент` follows rules/domain.md exactly: витрати net of повернення, and a negative коригування
 * counted as spent while a positive one is дохід. A повернення «Без категорії» counts among the
 * unanswered rows beside a витрата, because a повернення *is* a negative витрата in the same
 * категорія — the same question, left open in the same місяць.
 */
const MONTH_LEGS = sql`
  SELECT substr(t.date, 1, 7) AS month,
         t.currency AS currency,
         CASE t.type
           WHEN 'expense' THEN t.amount
           WHEN 'refund' THEN -t.amount
           WHEN 'correction' THEN (CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END)
           ELSE 0
         END AS spent,
         CASE t.type
           WHEN 'income' THEN t.amount
           WHEN 'correction' THEN (CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END)
           ELSE 0
         END AS income,
         0 AS invested,
         0 AS saved,
         CASE WHEN t.type IN ('expense', 'refund') AND t.category_id = ${UNCATEGORISED_CATEGORY_ID}
              THEN 1 ELSE 0 END AS uncategorised,
         CASE WHEN t.type = 'income' AND t.source_id = ${UNSOURCED_SOURCE_ID}
              THEN 1 ELSE 0 END AS unsourced,
         t.id AS counted
  FROM transactions t
  WHERE t.type <> 'transfer'

  UNION ALL

  SELECT substr(t.date, 1, 7), t.left_currency, 0, 0, 0, 0, 0, 0, t.id
  FROM transactions t WHERE t.type = 'transfer'

  UNION ALL

  SELECT substr(t.date, 1, 7), t.arrived_currency, 0, 0, 0, 0, 0, 0, t.id
  FROM transactions t WHERE t.type = 'transfer'

  UNION ALL

  SELECT substr(t.date, 1, 7),
         CASE WHEN t.left_currency <> t.arrived_currency THEN t.left_currency
              ELSE t.arrived_currency END,
         0, 0,
         CASE WHEN d.kind = 'investment'
              THEN (CASE WHEN t.left_currency <> t.arrived_currency THEN t.left_amount
                         ELSE t.arrived_amount END)
              ELSE 0 END,
         CASE WHEN d.kind = 'savings'
              THEN (CASE WHEN t.left_currency <> t.arrived_currency THEN t.left_amount
                         ELSE t.arrived_amount END)
              ELSE 0 END,
         0, 0, NULL
  FROM transactions t JOIN accounts d ON d.id = t.to_account_id
  WHERE t.type = 'transfer'

  UNION ALL

  SELECT substr(t.date, 1, 7),
         CASE WHEN t.left_currency <> t.arrived_currency THEN t.arrived_currency
              ELSE t.left_currency END,
         0, 0,
         CASE WHEN s.kind = 'investment'
              THEN -(CASE WHEN t.left_currency <> t.arrived_currency THEN t.arrived_amount
                          ELSE t.left_amount END)
              ELSE 0 END,
         CASE WHEN s.kind = 'savings'
              THEN -(CASE WHEN t.left_currency <> t.arrived_currency THEN t.arrived_amount
                          ELSE t.left_amount END)
              ELSE 0 END,
         0, 0, NULL
  FROM transactions t JOIN accounts s ON s.id = t.from_account_id
  WHERE t.type = 'transfer'
`;

const KINDS: readonly AccountKind[] = ['spending', 'savings', 'investment', 'cash', 'debt'];

function toKind(value: string): AccountKind {
  const kind = KINDS.find((known) => known === value);
  if (!kind) {
    throw new Error(`unknown account kind "${value}"`);
  }
  return kind;
}

export function progressRepo(db: Storage) {
  /**
   * A stored row as an earned досягнення, or nothing when this build cannot read its свідчення.
   *
   * Skipping rather than throwing is deliberate and is the same rule D3 states about an unknown
   * template: a row written by a later build is **kept** in storage and simply not shown. Throwing
   * here would let one row the current code does not understand empty the whole screen — and a row
   * is never deleted by a code change.
   */
  function toEarned(row: {
    key: string;
    template: string;
    achievedOn: string;
    recordedAt: Date;
    seenAt: Date | null;
    evidence: string;
  }): EarnedAchievement | undefined {
    try {
      return {
        key: row.key,
        template: row.template,
        achievedOn: row.achievedOn,
        recordedAtMs: row.recordedAt.getTime(),
        ...(row.seenAt === null ? {} : { seenAtMs: row.seenAt.getTime() }),
        evidence: decodeEvidence(row.evidence),
      };
    } catch {
      return undefined;
    }
  }

  return {
    /**
     * The whole history as one зведення. Four readings, none of which returns a транзакція: the
     * місяці, the totals per вид рахунку, the extent of the history, and the чернетки still
     * waiting.
     */
    readProgressSummary(): ProgressSummary {
      const monthRows = db.all<MonthAggregate>(sql`
        SELECT month,
               currency,
               SUM(spent) AS spent,
               SUM(income) AS income,
               SUM(invested) AS invested,
               SUM(saved) AS saved,
               COUNT(DISTINCT counted) AS transactions,
               SUM(uncategorised) AS uncategorised,
               SUM(unsourced) AS unsourced
        FROM (${MONTH_LEGS})
        GROUP BY month, currency
        ORDER BY month, currency
      `);

      /**
       * The розрахунковий баланс of every рахунок, added up per (вид, currency) — `computeBalance`'s
       * own arithmetic, in SQL: the opening balance, minus витрати, plus доходи, повернення and
       * коригування (whose amount is signed), minus what left by a переказ and plus what arrived.
       * One row per вид and currency comes back, never one per транзакція.
       */
      const kindRows = db.all<KindAggregate>(sql`
        SELECT a.kind AS kind,
               a.currency AS currency,
               SUM(
                 a.opening_amount
                 + COALESCE((SELECT SUM(CASE t.type WHEN 'expense' THEN -t.amount ELSE t.amount END)
                             FROM transactions t
                             WHERE t.account_id = a.id AND t.type <> 'transfer'), 0)
                 - COALESCE((SELECT SUM(t.left_amount) FROM transactions t
                             WHERE t.from_account_id = a.id), 0)
                 + COALESCE((SELECT SUM(t.arrived_amount) FROM transactions t
                             WHERE t.to_account_id = a.id), 0)
               ) AS balance
        FROM accounts a
        GROUP BY a.kind, a.currency
        ORDER BY a.kind, a.currency
      `);

      /**
       * Витрачено per категорія — but only for the категорії that carry a ліміт, which is the one
       * question anything asks of it. `categoryBreakdown`'s own arithmetic: a витрата adds, a
       * повернення subtracts, and a negative коригування lands under the correction категорія,
       * which appears here only if the owner has put a ліміт on it.
       */
      const limitedRows = db.all<LimitedCategoryAggregate>(sql`
        SELECT month, currency, categoryId, SUM(spent) AS spent
        FROM (
          SELECT substr(t.date, 1, 7) AS month,
                 t.currency AS currency,
                 t.category_id AS categoryId,
                 CASE t.type WHEN 'expense' THEN t.amount ELSE -t.amount END AS spent
          FROM transactions t
          WHERE t.type IN ('expense', 'refund')

          UNION ALL

          SELECT substr(t.date, 1, 7), t.currency, ${CORRECTION_CATEGORY_ID}, -t.amount
          FROM transactions t
          WHERE t.type = 'correction' AND t.amount < 0
        )
        WHERE categoryId IN (SELECT category_id FROM category_limits)
        GROUP BY month, currency, categoryId
        ORDER BY month, currency, categoryId
      `);

      const span = db.get<SpanAggregate>(sql`
        SELECT COUNT(*) AS count, MIN(date) AS earliest, MAX(date) AS latest FROM transactions
      `);

      // Every row of `notification_drafts` is a чернетка still waiting: settling one deletes it.
      const draftRows = db.all<DraftAggregate>(sql`
        SELECT substr(date, 1, 7) AS month, COUNT(*) AS waiting
        FROM notification_drafts
        GROUP BY month
        ORDER BY month
      `);

      const months: MonthRow[] = monthRows.map((row) => ({
        month: row.month,
        currency: row.currency,
        spent: row.spent,
        income: row.income,
        invested: row.invested,
        saved: row.saved,
        transactions: row.transactions,
        uncategorised: row.uncategorised,
        unsourced: row.unsourced,
      }));
      const balances: KindRow[] = kindRows.map((row) => ({
        kind: toKind(row.kind),
        currency: row.currency,
        balance: row.balance,
      }));
      const drafts: DraftRow[] = draftRows.map((row) => ({
        month: row.month,
        waiting: row.waiting,
      }));
      const limitedCategories: LimitedCategoryRow[] = limitedRows.map((row) => ({
        month: row.month,
        currency: row.currency,
        categoryId: row.categoryId,
        spent: row.spent,
      }));

      return {
        months,
        balances,
        limitedCategories,
        history: {
          count: span?.count ?? 0,
          // Absent, never a sentinel: an empty history has no earliest транзакція to name.
          ...(span?.earliest ? { earliest: span.earliest } : {}),
          ...(span?.latest ? { latest: span.latest } : {}),
        },
        drafts,
      };
    },

    /**
     * Earn a досягнення, or leave the one already earned exactly as it is.
     *
     * `onConflictDoNothing` on the key **is** the «earned at most once» rule of the capability: the
     * engine may run a hundred times over a history that proves the same fact, and the first row
     * written is the one that stays, with the дата and the свідчення of the moment it was first
     * true. Nothing here ever updates or deletes an earned row.
     */
    earn(achievement: EarnedAchievement): void {
      // Nothing may be stored that the column's GLOB would take and the reader could not bring
      // back: the shape check proves 'NNNN-NN-NN', not that it is a calendar date.
      isoDate(achievement.achievedOn);
      db.insert(earnedAchievements)
        .values({
          key: achievement.key,
          template: achievement.template,
          achievedOn: achievement.achievedOn,
          recordedAt: new Date(achievement.recordedAtMs),
          seenAt: achievement.seenAtMs === undefined ? null : new Date(achievement.seenAtMs),
          evidence: encodeEvidence(achievement.evidence),
        })
        .onConflictDoNothing()
        .run();
    },

    /** Every earned досягнення, by key — a total order, so two reads agree. */
    listEarned(): EarnedAchievement[] {
      return db
        .select()
        .from(earnedAchievements)
        .orderBy(asc(earnedAchievements.key))
        .all()
        .map(toEarned)
        .filter((one): one is EarnedAchievement => one !== undefined);
    },

    /** Just the keys — what the engine asks, so it can add only what is not there. */
    earnedKeys(): Set<string> {
      return new Set(db.select().from(earnedAchievements).all().map((row) => row.key));
    },

    /**
     * Mark every unseen досягнення seen, in one write — what opening «Прогрес» does.
     *
     * One statement rather than one per row: after the first evaluation on an existing phone there
     * are a dozen or twenty of them, and the owner is shown them as one group (design D11), so
     * they are marked as one group too. A row already seen keeps the moment it was first seen.
     */
    markAllSeen(seenAt: Date): number {
      return db
        .update(earnedAchievements)
        .set({ seenAt })
        .where(isNull(earnedAchievements.seenAt))
        .run().changes;
    },

    /**
     * The owner's decision about a виклик, replacing whatever they decided before under that key.
     * Accepting a виклик they had dismissed is a decision like any other, and there is only ever
     * one row per key.
     */
    decide(decision: ChallengeDecision): void {
      db.insert(challengeDecisions)
        .values({
          key: decision.key,
          decision: decision.decision,
          decidedAt: new Date(decision.decidedAtMs),
        })
        .onConflictDoUpdate({
          target: challengeDecisions.key,
          set: { decision: decision.decision, decidedAt: new Date(decision.decidedAtMs) },
        })
        .run();
    },

    /** Every decision, by key. Nothing derived comes back with them — there is nothing derived. */
    listDecisions(): ChallengeDecision[] {
      return db
        .select()
        .from(challengeDecisions)
        .orderBy(asc(challengeDecisions.key))
        .all()
        .map((row) => ({
          key: row.key,
          decision: row.decision === 'dismissed' ? ('dismissed' as const) : ('accepted' as const),
          decidedAtMs: row.decidedAt.getTime(),
        }));
    },

    /** Bring a dismissed виклик back: the decision is removed, not replaced by a third state. */
    undecide(key: string): void {
      db.delete(challengeDecisions).where(eq(challengeDecisions.key, key)).run();
    },

    /**
     * Confirm a місячна норма витрат, replacing the currency's previous one. A non-positive сума is
     * refused here in the owner's own words as well as by the column's CHECK — a норма of zero is
     * not a норма, and the refusal is read by whoever is looking at a log, not only by the form.
     */
    confirmNorm(norm: SpendingNorm): void {
      if (norm.amount.amount <= 0) {
        throw new Error(
          `місячна норма витрат у ${norm.amount.currency} має бути більшою за нуль`,
        );
      }
      db.insert(spendingNorms)
        .values({
          currency: norm.amount.currency,
          amount: norm.amount.amount,
          confirmedAt: new Date(norm.confirmedAtMs),
        })
        .onConflictDoUpdate({
          target: spendingNorms.currency,
          set: { amount: norm.amount.amount, confirmedAt: new Date(norm.confirmedAtMs) },
        })
        .run();
    },

    /**
     * One currency's норма, or nothing at all. The absence is an answer of its own and is never a
     * норма of zero: every досягнення and виклик that needs a норма simply does not exist for a
     * currency that has none.
     */
    norm(currency: CurrencyCode): SpendingNorm | undefined {
      const row = db.select().from(spendingNorms).where(eq(spendingNorms.currency, currency)).get();
      return row
        ? { amount: money(row.amount, row.currency), confirmedAtMs: row.confirmedAt.getTime() }
        : undefined;
    },

    /** Every confirmed норма, by currency — what the engine is handed. */
    norms(): SpendingNorms {
      return new Map(
        db
          .select()
          .from(spendingNorms)
          .orderBy(asc(spendingNorms.currency))
          .all()
          .map((row) => [
            row.currency,
            { amount: money(row.amount, row.currency), confirmedAtMs: row.confirmedAt.getTime() },
          ]),
      );
    },

    /**
     * The дата of the earliest переказ onto a рахунок of a given вид — what «Перше відкладення» and
     * «Перший внесок в інвестиції» are dated by. One row, and `undefined` when no such переказ has
     * ever been recorded. The second of the two single-row readings the achievements spec allows.
     */
    firstTransferOntoKind(kind: AccountKind): IsoDate | undefined {
      const row = db.get<{ date: string }>(sql`
        SELECT t.date AS date
        FROM transactions t JOIN accounts a ON a.id = t.to_account_id
        WHERE t.type = 'transfer' AND a.kind = ${kind}
        ORDER BY t.date, t.rowid
        LIMIT 1
      `);
      return row?.date;
    },

    /**
     * The дата of the Nth транзакція in the history's own order — дата first, then the order the
     * rows were stored, which `rowid` is. One row comes back and no other транзакція is read: this
     * is the single exception the achievements spec allows, run only in the evaluation that first
     * crosses a count tier.
     *
     * `undefined` when the history is shorter than N — the caller has not earned that tier.
     */
    nthTransactionDate(n: number): IsoDate | undefined {
      if (!Number.isSafeInteger(n) || n < 1) {
        throw new Error(`the Nth транзакція needs a positive N, got ${n}`);
      }
      const row = db.get<{ date: string }>(sql`
        SELECT date FROM transactions ORDER BY date, rowid LIMIT 1 OFFSET ${n - 1}
      `);
      return row?.date;
    },
  };
}

export type ProgressRepo = ReturnType<typeof progressRepo>;
