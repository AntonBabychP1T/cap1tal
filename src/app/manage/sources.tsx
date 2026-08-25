import { useCallback } from 'react';

import { ManageListScreen } from '@/components/manage-list';
import { sources as sourcesRepo } from '@/db/repos';
import { newId } from '@/ui/id';
import { manageSources } from '@/ui/list-management';

/** The «Джерела» section — the same list, the same verbs; no джерело is reserved. */
export default function SourcesScreen() {
  return (
    <ManageListScreen
      title="Джерела"
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
