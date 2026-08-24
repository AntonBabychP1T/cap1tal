import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Reads storage now, again whenever the screen comes back into focus, and on demand after the
 * screen's own writes. There is no store and no cache: synchronous SQLite makes re-querying the
 * simplest correct thing, so no screen can show a stale balance (design.md §6).
 *
 * `read` must be stable — wrap it in `useCallback`. The effect depends on its identity, so a
 * fresh closure every render would re-run the effect, which sets state, which renders again.
 */
export function useReloadOnFocus<T>(read: () => T): [T, () => void] {
  const [value, setValue] = useState(read);
  const reload = useCallback(() => setValue(() => read()), [read]);
  useFocusEffect(
    useCallback(() => {
      setValue(() => read());
    }, [read]),
  );
  return [value, reload];
}
