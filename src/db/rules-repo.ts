import { asc, eq } from 'drizzle-orm';

import { checkMerchantCriterion, type Rule } from '../domain/rules';
import { CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID, UNSOURCED_SOURCE_ID } from '../domain/transaction';
import { sweepStored, type SweepCounts } from './categorisation';
import { toRule } from './mappers';
import { merchants, rules, sources, type NewRuleRow } from './schema';
import type { Storage } from './storage';
import { Refusal } from '../domain/refusal';

export type { SweepCounts };

/**
 * Правила автокатегоризації in storage. Speaks domain `Rule`s only — rows never leave this module.
 *
 * Matching itself is `matchRule`/`matchCategory` in src/domain/rules.ts, and the three import
 * sources and the entry form are what run it. What this module does with it is the розбір: storing
 * a правило decides, here, which stored «Без категорії» витрати it now recognises —
 * `sweepUncategorised` decides and `sweepStored` (`categorisation.ts`) writes, over both tiers —
 * the правила and the шаблон — turning a matched витрата into a переказ through the same shared
 * pairing step (`counterpart-income-repo.ts`) every other переказ a правило makes goes through
 * (design D5).
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
     * A target category or рахунок with no row is left to the foreign key: the picker only ever
     * offers rows that exist, so the rejection is a backstop, and `onDelete: 'restrict'` is what
     * the persistence spec asks for at storage level.
     *
     * **Storing a правило runs the розбір**, in this same transaction: every stored витрата in
     * «Без категорії» that the правила — as they stand *after* this write — or, where none of them
     * answers, the шаблон now recognise moves
     * onto what they give it — a категорія, or a переказ when the best правило is a
     * правило-переказ. The invariant lives here, at the only write path, because four screens
     * store a правило and a fifth will; one of them would eventually forget to sweep. One
     * transaction because a правило stored while its розбір failed would leave the owner with a
     * правило that quietly did nothing.
     *
     * Restore does not come through here — `backup-repo.ts` writes the `rules` table directly — so
     * a відновлення replaces правила and транзакції together without re-deciding either.
     */
    save(rule: Rule): SweepCounts {
      const row = toRuleRow(rule);
      return db.transaction((tx) => {
        // The foreign key refuses an unknown продавець too, but by a constraint name; this says it.
        if (row.merchantId && !tx.select().from(merchants).where(eq(merchants.id, row.merchantId)).get()) {
          throw new Refusal('Такого продавця немає');
        }
        // Likewise an unknown джерело: a sentence, not a constraint name.
        if (row.sourceId && !tx.select().from(sources).where(eq(sources.id, row.sourceId)).get()) {
          throw new Refusal('Такого джерела немає');
        }
        tx.insert(rules)
          .values(row)
          .onConflictDoUpdate({
            target: rules.id,
            set: {
              merchant: row.merchant,
              merchantId: row.merchantId,
              mcc: row.mcc,
              categoryId: row.categoryId,
              toAccountId: row.toAccountId,
              sourceId: row.sourceId,
              createdAt: row.createdAt,
            },
          })
          .run();
        return sweepStored(tx, rule.createdAt);
      }, { behavior: 'immediate' });
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
  const merchantId = rule.merchantId ?? null;
  const mcc = rule.mcc ?? null;
  if (mcc !== null && !Number.isInteger(mcc)) {
    // The column would take 54.11 happily, and the rule would then never match anything: an MCC
    // is compared for equality against an integer the bank sends.
    throw new Refusal('MCC — це ціле число, напр. 5411');
  }
  // A pattern and a продавець are two ways to say one merchant criterion, never both at once.
  checkMerchantCriterion(rule);
  if (merchant === '' && merchantId === null && mcc === null) {
    // The table has a CHECK for this too, but this is the one mistake the owner can actually make
    // in the «Правила» form, and `failureMessage` puts whatever is thrown straight into an Alert —
    // so it says a sentence rather than SQLITE_CONSTRAINT_CHECK.
    throw new Refusal('Правило потребує продавця або MCC');
  }
  // `Rule.target` is a discriminated union above storage, so an ordinary caller cannot build one
  // naming both — but a hand-crafted value (a restore writes `rules` directly, and could carry a
  // malformed row) still reaches this function, and the CHECK it would otherwise fail on gives a
  // constraint name rather than a sentence the owner reads.
  const rawTarget = rule.target as unknown as { categoryId?: string; toAccountId?: string; sourceId?: string };
  const named = [rawTarget.categoryId, rawTarget.toAccountId, rawTarget.sourceId].filter((t) => t !== undefined);
  if (named.length > 1) {
    throw new Refusal('Правило має одну мету: категорію, рахунок призначення або джерело');
  }
  if (rule.target.kind === 'source' && rule.target.sourceId === UNSOURCED_SOURCE_ID) {
    // «Без джерела» is the absence of a джерело — the very gap a правило-джерело exists to fill.
    throw new Refusal('«Без джерела» не може бути метою правила — це відсутність джерела');
  }
  if (rule.target.kind === 'category') {
    if (rule.target.categoryId === CORRECTION_CATEGORY_ID) {
      // «Коригування» is carried only by коригування the app itself creates; a rule targeting it
      // would categorise an imported витрата as one, which is a different transaction type.
      throw new Refusal('«Коригування» не може бути метою правила');
    }
    if (rule.target.categoryId === UNCATEGORISED_CATEGORY_ID) {
      // «Без категорії» is the absence of a категорія, not one. A rule aiming at it would pin a
      // merchant to the very gap the rules exist to fill: it would outrank shorter rules naming a
      // real категорія, and survive every розбір, since a витрата it "moved" never left the gap.
      throw new Refusal('«Без категорії» не може бути метою правила — це відсутність категорії');
    }
  }
  return {
    id: rule.id,
    // A pattern that is blank after trimming is no pattern at all; stored trimmed, so the
    // surrounding spaces the owner typed never become part of what has to occur in a description.
    merchant: merchant === '' ? null : merchant,
    merchantId,
    mcc,
    categoryId: rule.target.kind === 'category' ? rule.target.categoryId : null,
    toAccountId: rule.target.kind === 'transfer' ? rule.target.toAccountId : null,
    sourceId: rule.target.kind === 'source' ? rule.target.sourceId : null,
    createdAt: rule.createdAt,
  };
}
