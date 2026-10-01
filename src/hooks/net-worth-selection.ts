import { useSyncExternalStore } from 'react';

import type { HistoryPeriod } from '../domain/net-worth';
import { DEFAULT_PERIOD, DEFAULT_VIEW, type HistoryView } from '../ui/net-worth-screen';

/**
 * Статок's history selection, shared by the widget on Головний and the «Статок» screen (design
 * D6): the reading (a currency or «Усе ≈ грн»), the period and the view. In memory for the app's
 * run only — they survive leaving and reopening the screen, never a restart (net-worth-screen,
 * "«Статок» opens on the selected reading and month"). «Прогноз» is deliberately not here: it is
 * the screen's own state, off whenever the screen opens.
 */
export interface NetWorthSelection {
  /** A currency code or `TOTAL_HISTORY`; absent until the owner chooses, so the default applies. */
  readonly history?: string;
  readonly period: HistoryPeriod;
  readonly view: HistoryView;
}

export interface NetWorthSelectionStore {
  get(): NetWorthSelection;
  set(change: Partial<NetWorthSelection>): void;
  subscribe(listener: () => void): () => void;
}

export function createNetWorthSelectionStore(): NetWorthSelectionStore {
  let state: NetWorthSelection = { period: DEFAULT_PERIOD, view: DEFAULT_VIEW };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(change) {
      state = { ...state, ...change };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The one store of this app run. */
export const netWorthSelection = createNetWorthSelectionStore();

/** The current selection, re-rendering the caller whenever either screen changes it. */
export function useNetWorthSelection(): NetWorthSelection {
  return useSyncExternalStore(netWorthSelection.subscribe, netWorthSelection.get, netWorthSelection.get);
}
