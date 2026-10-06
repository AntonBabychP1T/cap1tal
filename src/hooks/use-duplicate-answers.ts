import { useMemo } from 'react';

import { answerNotDuplicate, deleteOneOfDuplicate, forgetNotDuplicate } from './observations-reads';

type Pair = { readonly first: string; readonly second: string };

/**
 * «Не дубль», «Скасувати» and «Видалити одну» for a можливий дубль, wired once (answer-queue design
 * D4): the observations widget on Головний, Місяць, the підсумок and the queue «Що потребує
 * відповіді» all answer a pair through these three, then re-read with the screen's own `reload`. One
 * implementation, so `observations-by-weight` edits one seam and not four copies.
 */
export function useDuplicateAnswers(reload: () => void): {
  readonly onNotDuplicate: (pair: Pair) => void;
  readonly onUndoNotDuplicate: (pair: Pair) => void;
  readonly onDeleteOne: (id: string) => void;
} {
  return useMemo(
    () => ({
      // Stored at once; the reload re-derives the list without the pair, in place.
      onNotDuplicate: (pair: Pair) => {
        answerNotDuplicate(pair);
        reload();
      },
      onUndoNotDuplicate: (pair: Pair) => {
        forgetNotDuplicate(pair);
        reload();
      },
      onDeleteOne: (id: string) => {
        deleteOneOfDuplicate(id);
        reload();
      },
    }),
    [reload],
  );
}
