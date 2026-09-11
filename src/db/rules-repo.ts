import { asc, eq } from 'drizzle-orm';

import { countUncategorisedExpenses, sweepUncategorised, type Rule } from '../domain/rules';
import { CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { rules, type NewRuleRow, type RuleRow } from './schema';
import type { Storage } from './storage';
import { transactionsRepo } from './transactions-repo';

/** What a розбір did: the «Без категорії» витрати it looked at, and the ones it moved. */
export interface SweepCounts {
  readonly examined: number;
  readonly moved: number;
}

/**
 * Правила автокатегоризації in storage. Speaks domain `Rule`s only — rows never leave this module.
 *
 * Matching itself is `matchRule` in src/domain/rules.ts, and the three import sources and the
 * entry form are what run it. What this module does with it is the розбір: storing a правило
 * decides, here, which stored «Без категорії» витрати it now recognises — `sweepUncategorised`
 * decides, this module writes.
 */
export function rulesRepo(db: Storage) {
  return {
    /**
     * Insert or update under the same id, so creating a rule and changing its pattern, MCC or
     * target are one write path. `onConflictDoUpdate` rather than SQLite's `INSERT OR REPLACE`,
     * which is a delete followed by an insert — the same shape accounts-repo.ts explains, kept
     * here so every repository upserts alike and nothing that later references a rule can be
     * broken by the one repository that took the delete-and-reinsert shortcut.
     *
     * `createdAt` is written on an update too. Unlike a transaction's `storedAt` it is domain
     * data — the tie-break between two equally specific rules — so the value the caller holds
     * and the stored row must not drift apart.
     *
     * A target category with no row is left to the foreign key: the picker only ever offers rows
     * that exist, so the rejection is a backstop, and `onDelete: 'restrict'` is what the
     * persistence spec asks for at storage level.
     *
     * **Storing a правило runs the розбір**, in this same transaction: every stored витрата in
     * «Без категорії» that the правила — as they stand *after* this write — now recognise moves
     * onto the категорія they give it. The invariant lives here, at the only write path, because
     * four screens store a правило and a fifth will; one of them would eventually forget to sweep.
     * One transaction because a правило stored while its розбір failed would leave the owner with
     * a правило that quietly did nothing.
     *
     * Restore does not come through here — `backup-repo.ts` writes the `rules` table directly — so
     * a відновлення replaces правила and транзакції together without re-deciding either.
     */
    save(rule: Rule): SweepCounts {
      const row = toRuleRow(rule);
      return db.transaction((tx) => {
        tx.insert(rules)
          .values(row)
          .onConflictDoUpdate({
            target: rules.id,
            set: {
              merchant: row.merchant,
              mcc: row.mcc,
              categoryId: row.categoryId,
              createdAt: row.createdAt,
            },
          })
          .run();
        const stored = transactionsRepo(tx).listAll();
        const all = tx.select().from(rules).all().map(toRule);
        const moves = sweepUncategorised(all, stored);
        const write = transactionsRepo(tx);
        for (const move of moves) {
          write.setCategory(move.id, move.categoryId);
        }
        return { examined: countUncategorisedExpenses(stored), moved: moves.length };
      });
    },

    get(id: string): Rule | undefined {
      const row = db.select().from(rules).where(eq(rules.id, id)).get();
      return row ? toRule(row) : undefined;
    },

    remove(id: string): void {
      db.delete(rules).where(eq(rules.id, id)).run();
    },

    /**
     * Every rule, oldest first — the order the «Правила» list shows them in, and the one the
     * owner reads their own history of decisions in. The id breaks a tie between two rules
     * created in the same millisecond, so the order is total and never depends on what SQLite
     * happens to return.
     */
    list(): Rule[] {
      return db.select().from(rules).orderBy(asc(rules.createdAt), asc(rules.id)).all().map(toRule);
    },
  };
}

export type RulesRepo = ReturnType<typeof rulesRepo>;

function toRuleRow(rule: Rule): NewRuleRow {
  const merchant = rule.merchant?.trim() ?? '';
  const mcc = rule.mcc ?? null;
  if (mcc !== null && !Number.isInteger(mcc)) {
    // The column would take 54.11 happily, and the rule would then never match anything: an MCC
    // is compared for equality against an integer the bank sends.
    throw new Error('MCC — це ціле число, напр. 5411');
  }
  if (rule.categoryId === CORRECTION_CATEGORY_ID) {
    // «Коригування» is carried only by коригування the app itself creates; a rule targeting it
    // would categorise an imported витрата as one, which is a different transaction type.
    throw new Error('«Коригування» не може бути метою правила');
  }
  if (rule.categoryId === UNCATEGORISED_CATEGORY_ID) {
    // «Без категорії» is the absence of a категорія, not one. A rule aiming at it would pin a
    // merchant to the very gap the rules exist to fill: it would outrank shorter rules naming a
    // real категорія, and survive every розбір, since a витрата it "moved" never left the gap.
    throw new Error('«Без категорії» не може бути метою правила — це відсутність категорії');
  }
  if (merchant === '' && mcc === null) {
    // The table has a CHECK for this too, but this is the one mistake the owner can actually make
    // in the «Правила» form, and `failureMessage` puts whatever is thrown straight into an Alert —
    // so it says a sentence rather than SQLITE_CONSTRAINT_CHECK.
    throw new Error('Правило потребує продавця або MCC');
  }
  return {
    id: rule.id,
    // A pattern that is blank after trimming is no pattern at all; stored trimmed, so the
    // surrounding spaces the owner typed never become part of what has to occur in a description.
    merchant: merchant === '' ? null : merchant,
    mcc,
    categoryId: rule.categoryId,
    createdAt: rule.createdAt,
  };
}

/**
 * An absent criterion is NULL in the row and a missing key on the domain value — not a key set to
 * `undefined` — so a loaded rule is the value that was stored and not a lookalike.
 */
function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    ...(row.merchant === null ? {} : { merchant: row.merchant }),
    ...(row.mcc === null ? {} : { mcc: row.mcc }),
    categoryId: row.categoryId,
    createdAt: row.createdAt,
  };
}
