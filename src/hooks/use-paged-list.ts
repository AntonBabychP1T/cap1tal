import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  firstPage,
  nextPage,
  rereadPages,
  type PagePorts,
  type ShownPages,
} from '@/ui/transaction-search';

/**
 * The pages «Транзакції» shows, kept across «Показати ще», a return to the screen and the screen's
 * own writes (transaction-search, "Showing more reads only what it adds"; app-speed-pass design
 * D6). Every decision is `firstPage` / `nextPage` / `rereadPages`, proven in
 * `transaction-search.test.ts`; this is the wiring.
 *
 * - A new `question` — a different search or narrowing, said as a value — starts its own first
 *   page. Not the ports' identity: a focus re-reads the категорії and джерела the search is built
 *   from, which rebuilds `ports` for the very same question, and that must keep the pages shown.
 * - `more()` reads the next page, or everything shown plus it in one read when storage changed.
 * - `reload()` and every focus after the first read as many rows as are shown, in one read.
 *
 * Every read goes through the latest `ports`.
 */
export function usePagedList(
  question: string,
  ports: PagePorts,
): [ShownPages, () => void, () => void] {
  const [state, setState] = useState(() => ({ question, shown: firstPage(ports) }));
  let current = state;
  if (state.question !== question) {
    // A different question: its own first page, decided while rendering rather than a frame later.
    current = { question, shown: firstPage(ports) };
    setState(current);
  }

  const latest = useRef({ ...current, ports });
  useEffect(() => {
    latest.current = { ...current, ports };
  });

  const more = useCallback(() => {
    const { question: asked, shown, ports: reading } = latest.current;
    setState({ question: asked, shown: nextPage(shown, reading) });
  }, []);

  const reload = useCallback(() => {
    const { question: asked, shown, ports: reading } = latest.current;
    setState({ question: asked, shown: rereadPages(shown, reading) });
  }, []);

  // The focus the screen opened in is the read it was built with; every later one re-reads.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) {
        reload();
      }
      focusedBefore.current = true;
    }, [reload]),
  );

  return [current.shown, more, reload];
}
