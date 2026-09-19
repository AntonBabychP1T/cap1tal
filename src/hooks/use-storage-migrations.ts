import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useReducer } from 'react';

import { applyMigrations } from '@/db/apply-migrations';

interface MigrationsState {
  readonly success: boolean;
  readonly error?: Error;
}

const INITIAL: MigrationsState = { success: false, error: undefined };

/**
 * The `{ success, error }` shape of drizzle's own `useMigrations` — same call, same meaning — but
 * over `applyMigrations` instead of `migrate` directly, so a chance the phone gives applying the
 * same migration at the same moment as this root layout does not turn into a failed launch
 * (design D5, `.claude/rules/database.md`).
 */
export function useStorageMigrations(
  db: Parameters<typeof migrate>[0],
  migrationsConfig: Parameters<typeof migrate>[1],
): MigrationsState {
  const [state, dispatch] = useReducer(
    (_current: MigrationsState, next: MigrationsState) => next,
    INITIAL,
  );

  useEffect(() => {
    let cancelled = false;
    applyMigrations(() => migrate(db, migrationsConfig))
      .then(() => {
        if (!cancelled) dispatch({ success: true, error: undefined });
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ success: false, error: error as Error });
      });
    return () => {
      cancelled = true;
    };
  }, [db, migrationsConfig]);

  return state;
}
