import { eq } from 'drizzle-orm';

import { foldCase, occursAtWordStart } from '../domain/fold';
import {
  checkMerchantName,
  checkSpelling,
  merchantIndex,
  merchantNameKey,
  type Merchant,
  type MerchantIndex,
} from '../domain/merchants';
import { Refusal } from '../domain/refusal';
import { sweepStored, type SweepCounts } from './categorisation';
import { storedMerchants } from './stored-merchants';
import { merchantSpellings, merchants, rules } from './schema';
import type { Storage } from './storage';

export type { SweepCounts };

/**
 * Продавці in storage (merchants capability, design M5, M6). Speaks domain `Merchant`s only.
 *
 * Recognition is never stored: what a транзакція's опис is recognised as is read through
 * `index()` whenever it is read (design M1), so nothing here touches `transactions` — except the
 * розбір. Every change that can change what an опис is recognised as — naming, adding or removing
 * a написання, merging, deleting — runs the розбір of «Без категорії» in its own `immediate`
 * transaction, exactly as storing a правило does: a правило naming a продавець matches whatever
 * that продавець now recognises, and a change stored while its розбір failed cannot exist. A
 * rename recognises nothing new and sweeps nothing.
 *
 * Every refusal is a `Refusal` the owner reads, thrown before anything is written.
 */
export function merchantsRepo(db: Storage) {
  const list = (tx: Storage = db): Merchant[] => storedMerchants(tx);

  /** The назва, checked and trimmed, refused when another продавець already has it. */
  function freeName(tx: Storage, name: string, except?: string): { name: string; key: string } {
    const trimmed = checkMerchantName(name);
    const key = merchantNameKey(trimmed);
    const holder = tx.select().from(merchants).where(eq(merchants.nameKey, key)).get();
    if (holder !== undefined && holder.id !== except) {
      throw new Refusal(`Продавець «${holder.name}» уже є`);
    }
    return { name: trimmed, key };
  }

  /** The написання, folded and checked, refused when any продавець already holds it. */
  function freeSpelling(tx: Storage, text: string): string {
    const spelling = checkSpelling(text);
    const held = tx
      .select()
      .from(merchantSpellings)
      .innerJoin(merchants, eq(merchants.id, merchantSpellings.merchantId))
      .where(eq(merchantSpellings.spelling, spelling))
      .get();
    if (held !== undefined) {
      throw new Refusal(`Написання «${spelling}» уже належить продавцю «${held.merchants.name}»`);
    }
    return spelling;
  }

  function existing(tx: Storage, id: string): { id: string; name: string } {
    const row = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (row === undefined) throw new Refusal('Такого продавця немає');
    return row;
  }

  function rulesNaming(tx: Storage, id: string): number {
    return tx.select().from(rules).where(eq(rules.merchantId, id)).all().length;
  }

  function write<T>(run: (tx: Storage) => T): T {
    return db.transaction((tx) => run(tx), { behavior: 'immediate' });
  }

  return {
    list: (): Merchant[] => list(),

    /** Every написання stored right now, ready to recognise описи. Build one per read. */
    index: (): MerchantIndex => merchantIndex(list()),

    get(id: string): Merchant | undefined {
      return list().find((m) => m.id === id);
    },

    /** How many правила name the продавець — what deleting it is refused with. */
    rulesNaming: (id: string): number => rulesNaming(db, id),

    /**
     * Names an опис no продавець recognises (merchants, "A продавець is named from an опис no
     * продавець recognises"): a new продавець with one написання, or one написання added to a
     * продавець that exists. The написання has to occur in the опис, folded, because naming
     * exists to make that опис recognised; once stored, it is.
     */
    name(input: {
      readonly description: string;
      readonly spelling: string;
      readonly spellingId: string;
      readonly into:
        | { readonly kind: 'new'; readonly id: string; readonly name: string }
        | { readonly kind: 'existing'; readonly merchantId: string };
      readonly now: Date;
    }): SweepCounts {
      return write((tx) => {
        const recognised = merchantIndex(list(tx)).recognise(input.description);
        if (recognised !== undefined) {
          throw new Refusal(`Цей опис уже розпізнано як «${recognised.name}»`);
        }
        const spelling = freeSpelling(tx, input.spelling);
        if (!occursAtWordStart(foldCase(input.description), spelling)) {
          throw new Refusal('Написання має бути частиною опису');
        }
        let merchantId: string;
        if (input.into.kind === 'new') {
          const { name, key } = freeName(tx, input.into.name);
          tx.insert(merchants)
            .values({ id: input.into.id, name, nameKey: key, createdAt: input.now })
            .run();
          merchantId = input.into.id;
        } else {
          merchantId = existing(tx, input.into.merchantId).id;
        }
        tx.insert(merchantSpellings)
          .values({ id: input.spellingId, merchantId, spelling, createdAt: input.now })
          .run();
        return sweepStored(tx, input.now);
      });
    },

    /** A new назва, validated as when the продавець was named. Recognises nothing new: no розбір. */
    rename(id: string, name: string): void {
      write((tx) => {
        existing(tx, id);
        const free = freeName(tx, name, id);
        tx.update(merchants).set({ name: free.name, nameKey: free.key }).where(eq(merchants.id, id)).run();
      });
    },

    /** One more написання; unlike naming, it need not occur in any particular опис. */
    addSpelling(input: {
      readonly merchantId: string;
      readonly spelling: string;
      readonly spellingId: string;
      readonly now: Date;
    }): SweepCounts {
      return write((tx) => {
        existing(tx, input.merchantId);
        const spelling = freeSpelling(tx, input.spelling);
        tx.insert(merchantSpellings)
          .values({ id: input.spellingId, merchantId: input.merchantId, spelling, createdAt: input.now })
          .run();
        return sweepStored(tx, input.now);
      });
    },

    /** Removes one написання; the last one is refused — a продавець with none is deleted instead. */
    removeSpelling(spellingId: string, now: Date): SweepCounts {
      return write((tx) => {
        const row = tx.select().from(merchantSpellings).where(eq(merchantSpellings.id, spellingId)).get();
        if (row === undefined) throw new Refusal('Такого написання немає');
        const held = tx
          .select()
          .from(merchantSpellings)
          .where(eq(merchantSpellings.merchantId, row.merchantId))
          .all().length;
        if (held <= 1) {
          throw new Refusal('Останнє написання не можна прибрати — видаліть продавця');
        }
        tx.delete(merchantSpellings).where(eq(merchantSpellings.id, spellingId)).run();
        return sweepStored(tx, now);
      });
    },

    /**
     * `fromId` into `intoId` (design M6): every написання and every правило of the first now belong
     * to the second, whose назва stands, and the first no longer exists.
     */
    merge(fromId: string, intoId: string, now: Date): SweepCounts {
      return write((tx) => {
        if (fromId === intoId) throw new Refusal('Продавця не можна обʼєднати з ним самим');
        existing(tx, fromId);
        existing(tx, intoId);
        tx.update(merchantSpellings)
          .set({ merchantId: intoId })
          .where(eq(merchantSpellings.merchantId, fromId))
          .run();
        tx.update(rules).set({ merchantId: intoId }).where(eq(rules.merchantId, fromId)).run();
        tx.delete(merchants).where(eq(merchants.id, fromId)).run();
        return sweepStored(tx, now);
      });
    },

    /**
     * Deletes a продавець no правило names, its написання with it; refused, saying how many, while
     * правила name it. No транзакція changes: a категорія a правило naming it gave earlier stays.
     */
    remove(id: string, now: Date): SweepCounts {
      return write((tx) => {
        const merchant = existing(tx, id);
        const naming = rulesNaming(tx, id);
        if (naming > 0) {
          throw new Refusal(`Продавця «${merchant.name}» називають правила: ${naming}`);
        }
        tx.delete(merchants).where(eq(merchants.id, id)).run();
        return sweepStored(tx, now);
      });
    },
  };
}

export type MerchantsRepo = ReturnType<typeof merchantsRepo>;
