import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { decideRead, type ReadEvent } from '@/ui/read-policy';

/**
 * Reads storage when the screen comes into sight, again whenever it comes back, and after the
 * screen's own writes — applying `src/ui/read-policy.ts` (app-speed-pass design D4).
 *
 * Returning to a screen is cheap because the reads it makes are: the whole stored history, the
 * «Без категорії» count, the статок reads and the зведення прогресу are remembered under storage's
 * own change stamp (`src/db/stored-history.ts`, design D1). That memo is keyed on what storage says
 * changed, never on what a writer remembered to announce, so no screen can show a balance older
 * than the last committed write — the guarantee the old "no store and no cache" rule existed for.
 *
 * `read` must be stable — wrap it in `useCallback`. The effect depends on its identity, so a fresh
 * closure every render would re-run the effect, which sets state, which renders again. A new `read`
 * while the screen is in sight (Місяць stepping a month) reads at once.
 *
 * `options.whileUnseen` is what a tab built out of sight holds until it is first opened: on Android
 * every tab is built at launch, and without it each would read its whole data before the owner had
 * tapped anything. The screen compares its value with that placeholder and draws an empty body. A
 * screen that always opens in sight — every pushed screen, and Головний — passes nothing and reads
 * as it is built.
 *
 * Returns the value, `reload` for the screen's own writes, and `reloadWhenSeen` for events from
 * outside it (a прогін finishing, captured notifications, the прогрес judged): it reads now when
 * the screen is in sight and otherwise waits for the screen's next focus.
 */
export function useReloadOnFocus<T>(read: () => T): [T, () => void, () => void];
export function useReloadOnFocus<T, P>(
  read: () => T,
  options: { readonly whileUnseen: P },
): [T | P, () => void, () => void];
export function useReloadOnFocus<T, P>(
  read: () => T,
  options?: { readonly whileUnseen: P },
): [T | P, () => void, () => void] {
  const navigation = useNavigation();
  const [mountedInSight] = useState(() => navigation.isFocused());
  // Per-screen bookkeeping the policy is asked about; never drawn, so a ref and not state.
  const state = useRef({ everFocused: mountedInSight, stale: false });

  const [value, setValue] = useState<T | P>(() => {
    const decision = options
      ? decideRead({ focused: mountedInSight, everFocused: false, stale: false, event: 'mount' })
      : 'read-now';
    return decision === 'read-now' ? read() : options!.whileUnseen;
  });

  const apply = useCallback(
    (event: ReadEvent) => {
      const bookkeeping = state.current;
      const decision = decideRead({
        focused: navigation.isFocused(),
        everFocused: bookkeeping.everFocused,
        stale: bookkeeping.stale,
        event,
      });
      if (decision === 'read-now') {
        bookkeeping.stale = false;
        setValue(() => read());
      } else if (decision === 'mark-stale') {
        bookkeeping.stale = true;
      }
    },
    [navigation, read],
  );

  const reload = useCallback(() => apply('own-write'), [apply]);
  const reloadWhenSeen = useCallback(() => apply('changed'), [apply]);

  useFocusEffect(
    useCallback(() => {
      const bookkeeping = state.current;
      // A focus, or a new `read` while in sight — the cleanup below has marked the screen stale
      // either way, so the policy reads for both; only the focus the screen mounted in is skipped.
      const decision = decideRead({
        focused: true,
        everFocused: bookkeeping.everFocused,
        stale: bookkeeping.stale,
        event: 'focus',
      });
      bookkeeping.everFocused = true;
      if (decision === 'read-now') {
        bookkeeping.stale = false;
        setValue(() => read());
      }
      return () => {
        // Out of sight (or about to read with a new `read`): whatever happens next, the next
        // focus reads.
        if (decideRead({ focused: false, everFocused: true, stale: false, event: 'blur' }) === 'mark-stale') {
          bookkeeping.stale = true;
        }
      };
    }, [read]),
  );

  return [value, reload, reloadWhenSeen];
}
