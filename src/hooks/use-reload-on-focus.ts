import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Reads storage now, again whenever the screen comes back into focus, and on demand after the
 * screen's own writes. There is no store and no cache: synchronous SQLite makes re-querying the
 * simplest correct thing, so no screen can show a stale balance (design.md §6).
 *
 * `read` must be stable — wrap it in `useCallback`. The effect depends on its identity, so a
 * fresh closure every render would re-run the effect, which sets state, which renders again.
 *
 * The first focus, when it is the one the screen mounted in, is not read again: the initial state
 * was read by that very `read` a moment earlier, and reading twice doubled every screen's cost to
 * open — on a рахунок with a thousand транзакції, twice the freeze (bug report 2026-09-29). A
 * screen mounted unfocused (preloaded) reads on its first focus; a changed `read` or any later
 * focus reads as before.
 */
export function useReloadOnFocus<T>(read: () => T): [T, () => void] {
  const navigation = useNavigation();
  const [value, setValue] = useState(read);
  const mountedWith = useRef<(() => T) | undefined>(navigation.isFocused() ? read : undefined);
  const reload = useCallback(() => setValue(() => read()), [read]);
  useFocusEffect(
    useCallback(() => {
      if (mountedWith.current === read) {
        mountedWith.current = undefined;
        return;
      }
      mountedWith.current = undefined;
      setValue(() => read());
    }, [read]),
  );
  return [value, reload];
}
