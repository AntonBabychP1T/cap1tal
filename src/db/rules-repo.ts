import { asc, eq } from 'drizzle-orm';

import type { Rule } from '../domain/rules';
import { CORRECTION_CATEGORY_ID } from '../domain/transaction';
import { rules, type NewRuleRow, type RuleRow } from './schema';
import type { Storage } from './storage';

/**
 * Правила автокатегоризації in storage. Speaks domain `Rule`s only — rows never leave this module.
 *
 * Nothing here applies a rule: matching is `matchRule` in src/domain/rules.ts, and the importers
 * of steps 6–8 are what run it. This module holds what the owner edits in «Правила».
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
     */
    save(rule: Rule): void {
      const row = toRuleRow(rule);
      db.insert(rules)
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
