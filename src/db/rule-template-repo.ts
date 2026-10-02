import { eq } from 'drizzle-orm';

import { isReservedCategory } from '../domain/category';
import { Refusal } from '../domain/refusal';
import { TEMPLATE_GROUPS, TEMPLATE_VERSION } from '../domain/rule-template';
import { sweepStored, type SweepCounts } from './categorisation';
import { ruleTemplateChoices, ruleTemplateSweep } from './schema';
import type { Storage } from './storage';

/**
 * What the owner decided about one базова категорія: land in this категорія, or switched off.
 * No value at all is "untouched" — it follows its типова категорія.
 */
export type TemplateChoice =
  | { readonly kind: 'category'; readonly categoryId: string }
  | { readonly kind: 'off' };

const SWEEP_ROW = 'sweep';

/**
 * The owner's mapping of the шаблон категоризації onto this device's категорії, and the version
 * «Без категорії» was last swept under (rule-template design T3, T5). Storage holds only what the
 * owner decided; the шаблон itself is `src/domain/rule-template.ts`.
 */
export function ruleTemplateRepo(db: Storage) {
  const sweptVersion = (): number | undefined =>
    db.select().from(ruleTemplateSweep).where(eq(ruleTemplateSweep.id, SWEEP_ROW)).get()?.version;

  return {
    /**
     * Every stored choice by базова категорія id — including one for a group id the шаблон no
     * longer carries, which nothing reads and nothing removes (an app downgrade keeps it).
     */
    choices(): ReadonlyMap<string, TemplateChoice> {
      return new Map(
        db
          .select()
          .from(ruleTemplateChoices)
          .all()
          .map((row) => [
            row.groupId,
            row.categoryId === null
              ? ({ kind: 'off' } as const)
              : ({ kind: 'category', categoryId: row.categoryId } as const),
          ]),
      );
    },

    /**
     * Points a базова категорія at a категорія of this device, or switches it off — and runs the
     * розбір of «Без категорії» in the same transaction, exactly as storing a правило does
     * ("Changing a mapping sweeps «Без категорії»"). Nothing that already carries a категорія moves,
     * so switching off takes nothing back.
     *
     * One row per базова категорія: choosing again replaces the choice. A reserved категорія is
     * refused — «Без категорії» is the absence the шаблон exists to fill, and «Коригування» and
     * «Комісія» are carried only by what the app creates itself. A категорія with no row is left to
     * the foreign key: the picker only offers rows that exist.
     */
    choose(groupId: string, choice: TemplateChoice, now: Date): SweepCounts {
      if (!TEMPLATE_GROUPS.some((g) => g.id === groupId)) {
        throw new Refusal('Такої базової категорії немає');
      }
      if (choice.kind === 'category' && isReservedCategory(choice.categoryId)) {
        throw new Refusal('Базова категорія не може вести в службову категорію');
      }
      const categoryId = choice.kind === 'category' ? choice.categoryId : null;
      return db.transaction((tx) => {
        tx.insert(ruleTemplateChoices)
          .values({ groupId, categoryId })
          .onConflictDoUpdate({ target: ruleTemplateChoices.groupId, set: { categoryId } })
          .run();
        return sweepStored(tx, now);
      }, { behavior: 'immediate' });
    },

    /** The шаблон version «Без категорії» was last swept under; none before the first sweep. */
    sweptVersion,

    /** Whether the шаблон this app carries has not yet been swept under on this device. */
    sweepDue(): boolean {
      return sweptVersion() !== TEMPLATE_VERSION;
    },

    /**
     * The open-time розбір (categorisation-rules, "A newly arrived шаблон sweeps «Без категорії»
     * once"): when the шаблон this app carries is not the one storage last swept under, sweep and
     * record the version — in one transaction, so a sweep that throws leaves the version unrecorded
     * and the next open tries again. Under the same version it does nothing and answers nothing.
     */
    sweepIfTemplateChanged(now: Date): SweepCounts | undefined {
      return db.transaction((tx) => {
        const swept = tx
          .select()
          .from(ruleTemplateSweep)
          .where(eq(ruleTemplateSweep.id, SWEEP_ROW))
          .get()?.version;
        if (swept === TEMPLATE_VERSION) {
          return undefined;
        }
        const counts = sweepStored(tx, now);
        tx.insert(ruleTemplateSweep)
          .values({ id: SWEEP_ROW, version: TEMPLATE_VERSION })
          .onConflictDoUpdate({ target: ruleTemplateSweep.id, set: { version: TEMPLATE_VERSION } })
          .run();
        return counts;
      }, { behavior: 'immediate' });
    },
  };
}

export type RuleTemplateRepo = ReturnType<typeof ruleTemplateRepo>;
