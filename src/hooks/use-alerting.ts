import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

import { reminders as remindersRepo } from '@/db/repos';
import { localNotifications } from '@/platform/local-notifications-device';
import type { AlertKind } from '@/reminders/notices';
import { clear, type AlertPorts } from '@/ui/alerting';

/**
 * What every screen needs to raise and clear its own сповіщення про збій: the two singletons the
 * app notifies over, the one question only a screen can answer, and the clear that opening it is.
 *
 * It sits in `src/hooks/` because all three touch React Native — `AppState` and a focus effect —
 * and nothing under `npm run verify` may. Everything they are *for* is decided in `src/ui/
 * alerting.ts` and `src/reminders/alerts.ts`, which is where the rules are proven.
 */

/** The phone's shade and the storage that remembers what is outstanding. */
export const ALERT_PORTS: AlertPorts = {
  notifications: localNotifications,
  storage: remindersRepo,
  now: () => new Date(),
};

/**
 * Whether the app is in front of the owner at this moment — which, for work they asked for on a
 * screen that explains its own failures, is exactly «they are already reading it» (design D5).
 * Read at the moment of the failure, never earlier: the owner leaves the app mid-sync, and that
 * is the whole case this exists for.
 */
export function attended(): boolean {
  return AppState.currentState === 'active';
}

/**
 * Opening the screen a сповіщення leads to clears it — one unconditional call that neither knows
 * nor cares whether one was outstanding (design D6). On focus rather than on mount, like every
 * other read in this app: coming back to a screen is opening it again.
 */
export function useClearAlertOnOpen(kind: AlertKind): void {
  useFocusEffect(
    useCallback(() => {
      void clear(kind, ALERT_PORTS);
    }, [kind]),
  );
}
