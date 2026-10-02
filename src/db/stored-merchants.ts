import { asc } from 'drizzle-orm';

import type { Merchant, MerchantSpelling } from '../domain/merchants';
import { merchantSpellings, merchants } from './schema';
import type { Storage } from './storage';

/**
 * Every продавець with its написання, by назва folded — the «Продавці» list's order, and what every
 * `MerchantIndex` is built from. A module of its own because three readers need it and stand on
 * each other otherwise: the deciding context (`categorisation.ts`), the search
 * (`transactions-repo.ts`), which the розбір reads through, and `merchants-repo.ts`.
 *
 * The написання come oldest first; `merchantIndex` orders them for recognition itself.
 */
export function storedMerchants(db: Storage): Merchant[] {
  const spellings = db
    .select()
    .from(merchantSpellings)
    .orderBy(asc(merchantSpellings.createdAt), asc(merchantSpellings.id))
    .all();
  const byMerchant = new Map<string, MerchantSpelling[]>();
  for (const s of spellings) {
    const held = byMerchant.get(s.merchantId) ?? [];
    held.push({ id: s.id, spelling: s.spelling, addedAt: s.createdAt });
    byMerchant.set(s.merchantId, held);
  }
  return db
    .select()
    .from(merchants)
    .orderBy(asc(merchants.nameKey), asc(merchants.id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      spellings: byMerchant.get(row.id) ?? [],
      createdAt: row.createdAt,
    }));
}
