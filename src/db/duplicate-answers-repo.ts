import { and, asc, eq } from 'drizzle-orm';

import { duplicateAnswers } from './schema';
import { stampedMemo } from './stamp';
import type { Storage } from './storage';

/**
 * The owner's «Не дубль» answers (persistence, "A «Не дубль» answer survives a restart and lives
 * exactly as long as both транзакції"; observations design D5). The only thing about an
 * спостереження that is ever stored: the detectors read these and skip the pairs they name.
 *
 * A pair is unordered. The repository sorts it before every read and write, and storage's own CHECK
 * refuses an unsorted row, so «`a` with `b`» and «`b` with `a`» are one answer however they are
 * asked.
 */
export interface DuplicateAnswer {
  /** The smaller of the two транзакція ids. */
  readonly first: string;
  readonly second: string;
  readonly answeredAt: Date;
}

/** The pair in storage's order: the smaller id first. */
export function sortedPair(a: string, b: string): readonly [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function duplicateAnswersRepo(db: Storage) {
  // Asked on every showing of a month's спостереження, on Головний among others — so it answers
  // from memory between writes, and any write (an answer, a deletion, a restore) makes it fresh.
  const read = stampedMemo(db, (): DuplicateAnswer[] =>
    db
      .select()
      .from(duplicateAnswers)
      .orderBy(asc(duplicateAnswers.firstId), asc(duplicateAnswers.secondId))
      .all()
      .map((row) => ({ first: row.firstId, second: row.secondId, answeredAt: row.answeredAt })),
  );

  return {
    /**
     * Stores «Не дубль» for the pair. Answering a pair already answered keeps the one answer and
     * its first moment: the owner said the same thing twice, not two things.
     */
    answer(a: string, b: string, now: Date): void {
      if (a === b) {
        throw new Error('a транзакція is not a дубль of itself');
      }
      const [first, second] = sortedPair(a, b);
      db.insert(duplicateAnswers)
        .values({ firstId: first, secondId: second, answeredAt: now })
        .onConflictDoNothing()
        .run();
    },

    /**
     * Takes back «Не дубль» for the pair, in either order (observations, "«Не дубль» given by
     * mistake is undone"): the pair is stated again exactly as before. A pair never answered stays
     * as it is.
     */
    forget(a: string, b: string): void {
      const [first, second] = sortedPair(a, b);
      db.delete(duplicateAnswers)
        .where(and(eq(duplicateAnswers.firstId, first), eq(duplicateAnswers.secondId, second)))
        .run();
    },

    /** When the pair was answered «Не дубль», in either order; `undefined` when it was not. */
    answered(a: string, b: string): Date | undefined {
      const [first, second] = sortedPair(a, b);
      return read().find((row) => row.first === first && row.second === second)?.answeredAt;
    },

    /** Every answer, by its pair. */
    list(): readonly DuplicateAnswer[] {
      return read();
    },
  };
}

export type DuplicateAnswersRepo = ReturnType<typeof duplicateAnswersRepo>;
