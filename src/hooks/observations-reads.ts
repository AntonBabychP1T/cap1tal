import {
  categories as categoriesRepo,
  duplicateAnswers as duplicateAnswersRepo,
  rememberedRead,
  storedHistory,
} from '@/db/repos';
import { monthOf, type IsoDate, type Month } from '@/domain/transaction';
import type { Observation } from '@/observations/observation';
import { observationsOf } from '@/observations/observations';

/**
 * Where the screens read спостереження from (observations design D8): the stored history, the
 * категорії and the «Не дубль» answers, through the stamp memo — so a return with nothing written
 * in between derives nothing again, and any write, an answer included, makes the next read fresh.
 * Keyed by the day as well, since «the current month» and a window's завершені місяці move with it.
 *
 * Two memos, so Головний's current month and Місяць's shown month never evict each other.
 */
const readMonth = (key: string): Observation[] => {
  const [month, today] = key.split('|') as [Month, IsoDate];
  return observationsOf({
    month,
    today,
    transactions: storedHistory.read().transactions,
    categories: categoriesRepo.list(),
    answers: duplicateAnswersRepo.list(),
  });
};
const currentMemo = rememberedRead(readMonth);
const shownMemo = rememberedRead(readMonth);

/** The current month's спостереження, for Головний. */
export function currentObservations(today: IsoDate): Observation[] {
  return currentMemo(`${monthOf(today)}|${today}`);
}

/** The shown month's спостереження, for Місяць. */
export function monthObservations(month: Month, today: IsoDate): Observation[] {
  return shownMemo(`${month}|${today}`);
}

/**
 * «Не дубль»: the owner's answer for the pair, stored at once. The write moves the change stamp, so
 * every surface re-derives its list without the pair the next time it reads.
 */
export function answerNotDuplicate(pair: { readonly first: string; readonly second: string }): void {
  duplicateAnswersRepo.answer(pair.first, pair.second, new Date());
}
