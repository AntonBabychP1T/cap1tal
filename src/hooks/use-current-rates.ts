import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { rates as ratesRepo } from '@/db/repos';
import { fetchMonobankRates } from '@/monobank/currency';
import { shouldRefreshRates } from '@/ui/approx-uah';

/**
 * The rate refresh behind every «≈ … грн» in the app, and the only network any of those screens
 * touches. One copy, used by Місяць, Рахунки and Головний: the staleness rule is subtle enough
 * that three copies of it would be three chances to get it wrong, and an owner who never opens
 * Місяць would otherwise never see an approximation anywhere else.
 *
 * It runs while the numbers are already rendered, never before them: nothing on any screen except
 * the «≈» line depends on it, and every failure path — offline, a 429, a body that is not JSON —
 * returns no rows and leaves the screen exactly as it was. Whatever was cached keeps serving the
 * approximation.
 *
 * Asked at most once per focus, and deliberately **not** from the caller's loaded rates. This
 * effect writes to the rate cache and then calls `reload()`; if the freshly read cache were a
 * dependency, its own success would re-arm it. That is harmless when the answer covers every
 * currency — the second pass finds nothing stale — but a partial answer (monobank drops EUR, or a
 * row is malformed and the parser skips it) leaves EUR stale forever, so the effect would fetch,
 * store, re-arm, and fetch again with nothing but the endpoint's 429 to stop it. `design.md`
 * promises no retry loop anywhere, and `use-reload-on-focus.ts` warns about exactly this shape.
 *
 * So the cache is read straight from storage here — synchronous SQLite, the same read the rest of
 * the screen does — and the deps hold only `reload`, whose identity survives its own call.
 */
export function useCurrentRates(reload: () => void): void {
  useFocusEffect(
    useCallback(() => {
      let left = false;
      // Per currency, not off the newest row: a fresh USD rate must not keep a stale EUR one.
      if (shouldRefreshRates(ratesRepo.all(), new Date())) {
        void fetchMonobankRates(fetch).then((obtained) => {
          if (obtained.length === 0) {
            return;
          }
          // Stored even when the screen has been left in the meantime: the requirement is to store
          // what was obtained, the write is synchronous SQLite touching no React state, and
          // throwing a rate away would only mean asking monobank for it again. Only the re-render
          // is skipped — that is what `left` is for.
          const now = new Date();
          for (const rate of obtained) {
            ratesRepo.upsert(rate, now);
          }
          if (!left) {
            reload();
          }
        });
      }
      return () => {
        left = true;
      };
    }, [reload]),
  );
}
