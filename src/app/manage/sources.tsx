import { useCallback } from 'react';

import { ManageListScreen } from '@/components/manage-list';
import { sources as sourcesRepo } from '@/db/repos';
import { newId } from '@/ui/id';
import { manageSources } from '@/ui/list-management';

/**
 * The «Джерела» section — the same list and the same verbs as «Категорії». One джерело is
 * reserved: «Відсотки», which the відсотки proposal picks by id, so it offers no rename and no
 * archive. `manageSources` decides that; this screen only renders what it says.
 */
export default function SourcesScreen() {
  return (
    <ManageListScreen
      title="Джерела"
      where="sources"
      hint="Звідки прийшли гроші. Архівне джерело лишається на своїх доходах, але його більше не пропонують."
      load={useCallback(() => manageSources(sourcesRepo.list()), [])}
      create={useCallback((name: string) => {
        sourcesRepo.create({ id: newId(), name });
      }, [])}
      rename={useCallback((id: string, name: string) => sourcesRepo.rename(id, name), [])}
      archive={useCallback((id: string) => sourcesRepo.archive(id), [])}
      unarchive={useCallback((id: string) => sourcesRepo.unarchive(id), [])}
    />
  );
}
