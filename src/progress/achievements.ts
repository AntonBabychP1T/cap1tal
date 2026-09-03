import type { IsoDate } from '../domain/transaction';
import type { EarnedAchievement } from './earned';
import { candidates, type Candidate, type CatalogueInput } from './catalogue';

/**
 * The engine: what the stored data proves, minus what is already earned.
 *
 * Pure and **add-only**. There is no code path here that removes an earned досягнення, and that is
 * the decision the whole capability rests on (design D2): a досягнення describes the past, so an
 * edit to a 2024 транзакція must never take one away — the owner is never punished for correcting
 * their own record. Deleting half the history changes nothing that was earned; it only changes what
 * *would* be earned, and the engine has already stopped asking about those.
 *
 * Running it twice over unchanged data returns nothing the second time, because a key already
 * earned is not a candidate to earn again. Running it a hundred times is running it once.
 */

export interface EvaluateInput extends CatalogueInput {
  /** The keys already stored. The engine adds what is not here and touches nothing that is. */
  readonly earned: ReadonlySet<string>;
  /** The moment the rows would be written — the `recorded_at` of design D3. */
  readonly nowMs: number;
}

/**
 * The дата досягнення of one candidate (design D4).
 *
 * Where the history dates the condition — the Nth транзакція, the end of the Nth активний місяць,
 * the first переказ onto a вид — that date is used, whatever day the system evaluated: a
 * retroactive award for a 2024 fact is dated 2024, which is the whole point of awarding
 * retroactively at all.
 *
 * Where the condition is a balance or the mere existence of something the транзакції do not date —
 * a ціль's progress, the резерв, the перша ціль — the дата is **today**, because a розрахунковий
 * баланс is a number about now and claiming an earlier date would be a fiction the app invented.
 */
export function achievedOn(candidate: Candidate, today: IsoDate): IsoDate {
  return candidate.dating === 'history' && candidate.achievedOn !== undefined
    ? candidate.achievedOn
    : today;
}

/**
 * What the data now proves and storage does not yet hold, in the catalogue's own order.
 *
 * The whole stored history is considered every time, not only what changed — which is what makes
 * installing this on an existing phone, committing a Saldo імпорт, restoring a бекап and syncing a
 * year of monobank all earn what they deserve without a single special case.
 */
export function evaluate(input: EvaluateInput): EarnedAchievement[] {
  return candidates(input)
    .filter((candidate) => candidate.earned && !input.earned.has(candidate.key))
    .map((candidate) => ({
      key: candidate.key,
      template: candidate.template,
      achievedOn: achievedOn(candidate, input.today),
      recordedAtMs: input.nowMs,
      // Unseen: the owner is shown it once, quietly and in one group, when they open «Прогрес».
      evidence: candidate.evidence,
    }));
}
