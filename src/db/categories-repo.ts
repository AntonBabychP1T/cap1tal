import { isReservedCategory, type Category } from '../domain/category';
import { namedListRepo } from './named-list-repo';
import { categories } from './schema';
import type { Storage } from './storage';

/**
 * The категорії in storage. Speaks domain `Category`s only — rows never leave this module.
 *
 * The list rules themselves are `namedListRepo`, shared with `sources-repo.ts`: the categories
 * capability states them once for both lists, so they are implemented once. What is only true
 * here is the reserved set — «Без категорії», «Комісія» and «Коригування» refuse a rename and an
 * archive, because default recording, the комісія proposal and коригування attribution all depend
 * on them existing under their names.
 */
export function categoriesRepo(db: Storage) {
  return namedListRepo<Category>(
    db,
    categories,
    {
      nominative: 'категорія',
      genitive: 'категорії',
      refusal: (name, verb) => `«${name}» — службова категорія, її не можна ${verb}`,
    },
    isReservedCategory,
  );
}

export type CategoriesRepo = ReturnType<typeof categoriesRepo>;
