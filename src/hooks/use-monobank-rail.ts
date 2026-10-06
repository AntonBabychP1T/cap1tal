import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { monobankTokenStore } from '@/platform/monobank-token-store';
import { makeCancelToken } from '@/ui/home-data';
import { monobankRailRow, type RailMonobank } from '@/ui/home-screen';
import { bankCoverage } from '@/ui/monobank-screen';
import { onSyncState, syncInFlight } from '@/ui/monobank-sync';

/**
 * The rail's monobank sentence for a screen other than Головний — the queue «Що потребує
 * відповіді» — read exactly as Головний reads it: whether a token is kept (secure storage, read on
 * focus), whether a sync is going on, and `bankCoverage` over the links and the remembered рахунки,
 * all handed to the one `monobankRailRow` (answer-queue design D1). So the queue's bank entry says
 * what Головний's row says, in the same words, and leaves when that row leaves.
 */
export function useMonobankRail(input: {
  readonly links: Parameters<typeof bankCoverage>[0];
  readonly monobankAccounts: Parameters<typeof bankCoverage>[1];
  readonly attempt: RailMonobank['attempt'];
}): string | null {
  // `undefined` until the first read answers — no row rather than a wrong one, so a queue opened
  // over a configured token never flashes the no-token entry.
  const [configured, setConfigured] = useState<boolean>();
  useFocusEffect(
    useCallback(() => {
      const { token, cancel } = makeCancelToken();
      void monobankTokenStore.read().then((read) => {
        if (!token.cancelled()) setConfigured(read.kind === 'ok' && Boolean(read.token));
      });
      return cancel;
    }, []),
  );
  const [syncing, setSyncing] = useState(() => syncInFlight());
  useEffect(() => onSyncState(() => setSyncing(syncInFlight())), []);

  const coverage = useMemo(
    () => bankCoverage(input.links, input.monobankAccounts),
    [input.links, input.monobankAccounts],
  );
  return useMemo(() => {
    if (configured === undefined) return null;
    return monobankRailRow(
      {
        configured,
        linked: coverage.linked,
        synced: coverage.synced,
        ...(coverage.oldestCompletedMs === undefined ? {} : { oldestCompletedAtMs: coverage.oldestCompletedMs }),
        ...(coverage.oldestSyncedMs === undefined ? {} : { oldestSyncedAtMs: coverage.oldestSyncedMs }),
        syncing,
        ...(input.attempt ? { attempt: input.attempt } : {}),
      },
      new Date(),
    );
  }, [configured, coverage, input.attempt, syncing]);
}
