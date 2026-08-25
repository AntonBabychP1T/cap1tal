import { useCallback } from 'react';

import { ManageListScreen } from '@/components/manage-list';
import { categories as categoriesRepo } from '@/db/repos';
import { newId } from '@/ui/id';
import { manageCategories } from '@/ui/list-management';

/**
 * The «Категорії» section. Everything it decides — the order, which verbs a row offers, that
 * «Без категорії», «Комісія» and «Коригування» offer none — is `manageCategories`; the repository
 * refuses an empty or duplicate name and a reserved row's rename or archive.
 */
export default function CategoriesScreen() {
  return (
    <ManageListScreen
      title="Категорії"
      hint="Куди пішли гроші. Архівна категорія лишається на своїх транзакціях, але її більше не пропонують."
      load={useCallback(() => manageCategories(categoriesRepo.list()), [])}
      create={useCallback((name: string) => {
        categoriesRepo.create({ id: newId(), name });
      }, [])}
      rename={useCallback((id: string, name: string) => categoriesRepo.rename(id, name), [])}
      archive={useCallback((id: string) => categoriesRepo.archive(id), [])}
      unarchive={useCallback((id: string) => categoriesRepo.unarchive(id), [])}
    />
  );
}
