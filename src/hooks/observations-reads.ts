import {
  categories as categoriesRepo,
  duplicateAnswers as duplicateAnswersRepo,
  monobank as monobankRepo,
  rememberedRead,
  storedHistory,
  transactions as transactionsRepo,
} from '@/db/repos';
import { monthOf, type IsoDate, type Month } from '@/domain/transaction';
import type { Observation } from '@/observations/observation';
import { observationsOf } from '@/observations/observations';
import { judgeProgressLater } from './progress-ports';

/** The рахунки linked to monobank — equal описи on one of them read as the bank's own records. */
export function linkedAccountIds(): ReadonlySet<string> {
  return new Set(monobankRepo.listLinks().map((l) => l.accountId));
}

/**
 * Where the screens read спостереження from (observations design D8): the stored history, the
 * категорії, the «Не дубль» answers and the linked рахунки, through the stamp memo — so a return with nothing written
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
    linkedAccountIds: linkedAccountIds(),
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

/**
 * «Скасувати» after «Не дубль»: the answer is forgotten, and the next read states the pair again
 * exactly as it was (observations, "«Не дубль» given by mistake is undone").
 */
export function forgetNotDuplicate(pair: { readonly first: string; readonly second: string }): void {
  duplicateAnswersRepo.forget(pair.first, pair.second);
}

/**
 * «Видалити одну», once chosen and confirmed: the delete the editing screen makes — the транзакція
 * goes, the answer that named it with it — and the progress judged after it, as there.
 */
export function deleteOneOfDuplicate(id: string): void {
  transactionsRepo.remove(id);
  // A транзакція was deleted. The engine only ever adds: nothing is unearned by this.
  judgeProgressLater();
}
