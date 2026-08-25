import { asc, eq } from 'drizzle-orm';

import type { CurrencyCode } from '../domain/money';
import type { MonobankRate } from '../monobank/currency';
import { monobankRates } from './schema';
import type { Storage } from './storage';

/**
 * The cached monobank rate in storage — the one repository that holds no domain value, because a
 * rate is not one. It exists so an offline morning still shows yesterday's approximation; losing
 * every row costs the approximate UAH figure and nothing else.
 *
 * The moment a rate was obtained is stored beside it: the screen needs it to decide whether to
 * ask monobank again, and it is the only thing that makes a stored rate interpretable later.
 */

export interface StoredRate extends MonobankRate {
  /** When this rate was obtained from monobank — not when the row was written. */
  readonly obtainedAt: Date;
}

export function ratesRepo(db: Storage) {
  return {
    /**
     * Insert or replace under the currency — the primary key — so obtaining a newer rate leaves
     * exactly one row per currency and no history. This is a cache; a rate from yesterday that a
     * fresher one replaced explains nothing about the owner's money.
     *
     * The caller passes the moment (`new Date()` in the app, a fixed instant in tests), because
     * nothing below the screen reads a clock.
     */
    upsert(rate: MonobankRate, obtainedAt: Date): void {
      const row = {
        currency: rate.currency,
        rateMillionths: rate.rateMillionths,
        obtainedAt,
      };
      db.insert(monobankRates)
        .values(row)
        .onConflictDoUpdate({
          target: monobankRates.currency,
          set: { rateMillionths: row.rateMillionths, obtainedAt: row.obtainedAt },
        })
        .run();
    },

    get(currency: CurrencyCode): StoredRate | undefined {
      const row = db
        .select()
        .from(monobankRates)
        .where(eq(monobankRates.currency, currency))
        .get();
      return row ? { ...row } : undefined;
    },

    /** Every cached rate, by currency, so a screen can convert a whole month in one read. */
    all(): StoredRate[] {
      return db
        .select()
        .from(monobankRates)
        .orderBy(asc(monobankRates.currency))
        .all()
        .map((row) => ({ ...row }));
    },
  };
}

export type RatesRepo = ReturnType<typeof ratesRepo>;
