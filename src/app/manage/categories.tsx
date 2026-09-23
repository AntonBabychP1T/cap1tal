import { useCallback } from 'react';

import { ManageListScreen } from '@/components/manage-list';
import { categories as categoriesRepo } from '@/db/repos';
import { newId } from '@/ui/id';
import { manageCategories } from '@/ui/list-management';
import { PICKABLE_CATEGORY_ICONS } from '@/ui/category-icons';
import type { CategoryIconKey } from '@/domain/category-icon';

/**
 * The «Категорії» section. Everything it decides — the order, which verbs a row offers, that
 * «Без категорії», «Комісія» and «Коригування» offer none — is `manageCategories`; the repository
 * refuses an empty or duplicate name and a reserved row's rename or archive.
 */
export default function CategoriesScreen() {
  return (
    <ManageListScreen
      createLabel="Нова категорія"
      title="Категорії"
      where="categories"
      hint="Куди пішли гроші. Архівна категорія лишається на своїх транзакціях, але її більше не пропонують."
      load={useCallback(() => manageCategories(categoriesRepo.list()), [])}
      categoryIcons={PICKABLE_CATEGORY_ICONS}
      create={useCallback((name: string, iconKey?: CategoryIconKey) => {
        categoriesRepo.create({ id: newId(), name, iconKey });
      }, [])}
      rename={useCallback((id: string, name: string, iconKey?: CategoryIconKey) => categoriesRepo.update(id, { name, iconKey }), [])}
      archive={useCallback((id: string) => categoriesRepo.archive(id), [])}
      unarchive={useCallback((id: string) => categoriesRepo.unarchive(id), [])}
    />
  );
}
