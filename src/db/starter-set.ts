import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';

/**
 * The owner's own starter lists, as the categories spec names them: the Saldo категорії and
 * джерела they were already keeping, verbatim, with the hierarchy flattened. This module is the
 * one representation of that spec list in code — the seed writes it and the tests read it, so
 * neither can drift from the other without the other noticing.
 *
 * The ids are stable, human-readable slugs rather than generated ones: saldo-import (step 6) and
 * бекап (step 11) address these rows by id, and an id that survives a rename is what lets an
 * import land in the category the owner renamed. Two slugs — `krayshop` and `gifts` — appear in
 * both lists; the two tables are separate namespaces, and using one slug for one name is what
 * keeps them readable.
 *
 * «Борг» is deliberately absent: lending is a переказ onto a рахунок-борг, not a витрата.
 *
 * No colocated test: this is data, not behaviour, and a test that read it back would only prove
 * it equals itself. `seed.test.ts` restates the spec's list independently and asserts what is
 * stored against that — so the spec, not this module, is what the tests hold it to.
 */
export interface StarterRow {
  readonly id: string;
  readonly name: string;
}

/**
 * The three rows the domain's stored transactions already reference. They are seeded like the
 * rest, but migration 0003 has already inserted them — it has to, since it turns `category_id`
 * into a foreign key while those ids are on rows (design decision 4). Listing them here keeps
 * the starter set complete and the seed's `INSERT OR IGNORE` finds them in place.
 */
export const RESERVED_CATEGORIES: readonly StarterRow[] = [
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії' },
  { id: FEES_CATEGORY_ID, name: 'Комісія' },
  { id: CORRECTION_CATEGORY_ID, name: 'Коригування' },
];

export const STARTER_CATEGORIES: readonly StarterRow[] = [
  { id: 'home', name: 'Home' },
  { id: 'coffee', name: 'COFFEE ☕' },
  { id: 'groceries', name: 'Groceries' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'family-care', name: 'Family care' },
  { id: 'transport', name: 'Transport' },
  { id: 'travel', name: 'Travel' },
  { id: 'bills', name: 'Bills' },
  { id: 'gifts', name: 'Gifts' },
  { id: 'eating-out', name: 'Eating out' },
  { id: 'food-delivery', name: 'Food Delivery' },
  { id: 'krayshop', name: 'KrayShop' },
  { id: 'digital', name: 'Digital' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'simeyniy-byudzhet', name: 'сімейний бюджет' },
  { id: 'clothing', name: 'Clothing' },
  { id: 'health', name: 'Health' },
  { id: 'book', name: 'book' },
  { id: 'pets', name: 'Pets' },
  { id: 'other-expense', name: 'Other expense' },
  { id: 'charity', name: 'Charity' },
  { id: 'education', name: 'Education' },
  { id: 'habits', name: 'habits' },
  { id: 'bulka', name: 'булка' },
  { id: 'services', name: 'Services' },
  ...RESERVED_CATEGORIES,
];

/**
 * «батьки → Андрій, Лена» is flattened into three top-level sources, not merged into one: «батьки»
 * carries direct history in Saldo, and the owner tracked the two people apart on purpose. Merging
 * would be irreversible at import time; renaming is one tap.
 */
export const STARTER_SOURCES: readonly StarterRow[] = [
  { id: 'salary', name: 'Salary' },
  { id: 'salary-mono', name: 'salary Mono' },
  { id: 'freelance', name: 'Freelance' },
  { id: 'stependiya', name: 'степендія' },
  { id: 'batky', name: 'батьки' },
  { id: 'batky-andriy', name: 'батьки — Андрій' },
  { id: 'batky-lena', name: 'батьки — Лена' },
  { id: 'olyny-batky', name: 'Оліни батьки' },
  { id: 'krayshop', name: 'KrayShop' },
  { id: 'gifts', name: 'Gifts' },
  { id: 'investytsiyi', name: 'інвестиції' },
  { id: 'other-income', name: 'Other income' },
];
