import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Runs `act` every time the app comes back to the foreground.
 *
 * Not the same signal as `useReloadOnFocus`, and the difference is the whole reason this exists:
 * navigation focus fires when the owner moves between screens *inside* the app, and never when
 * they leave it and return. Two things in this app depend on the second one — the notification
 * drain, which collects what the phone captured while the app was not running, and the
 * «Сповіщення банків» section, whose access state is granted on Android's own screen (another
 * app, so our screen never loses focus while the owner is over there).
 *
 * `act` must be stable — wrap it in `useCallback`, as with `useReloadOnFocus`, or the subscription
 * is torn down and rebuilt on every render.
 */
export function useOnForeground(act: () => void): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        act();
      }
    });
    return () => subscription.remove();
  }, [act]);
}
