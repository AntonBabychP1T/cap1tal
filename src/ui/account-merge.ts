import type { Account } from '../domain/account';
import type { MergePreview } from '../domain/account-merge';
import { accountChoicesFor } from './account-choices';
import { formatMoney } from './amount-input';

/**
 * «Обʼєднати з іншим рахунком» — two рахунки that are the same money become one.
 *
 * The case it exists for: a monobank банка linked on its own рахунок («На облігацію», made by the
 * link) while the owner had kept that very банка by hand for months («облігація $»). Both count
 * toward «Усього грошей», so the same dollars were counted twice (owner's report, 2026-09-23).
 * Unlinking cannot fix that — the linked рахунок keeps its транзакції and its balance — so the
 * рахунок the owner is standing on is folded into the one they pick: its транзакції, its monobank
 * link, its watched bank app and everything else that names it move over, and it is gone.
 *
 * What may be merged and what it would do is `src/domain/account-merge.ts`; this is what the
 * screen offers and says. `account-merge-repo.ts` is the one write.
 */

/**
 * What the рахунок being folded away may be folded into: every unarchived рахунок of the same
 * currency but itself, in the order every рахунок picker uses. One currency because a транзакція's
 * сума is in its рахунок's currency, and there is no rate that could make a USD history UAH truth.
 */
export function mergeTargets(from: Account, all: readonly Account[]): Account[] {
  return accountChoicesFor(all, undefined).filter(
    (a) => a.id !== from.id && a.currency === from.currency,
  );
}

/** The confirmation the owner reads before anything is written: what goes where, and the result. */
export function mergeConfirmation(input: {
  readonly from: Account;
  readonly into: Account;
  readonly preview: MergePreview;
  readonly linkMoves: boolean;
}): string {
  const { from, into, preview } = input;
  const lines = [
    `«${from.name}» зникне, а все з нього перейде в «${into.name}».`,
    `Транзакцій перейде: ${preview.moved}.`,
  ];
  if (preview.dropped > 0) {
    lines.push(`Переказів між ними буде видалено: ${preview.dropped}.`);
  }
  if (input.linkMoves) {
    lines.push(`Рахунок monobank надалі синхронізуватиметься в «${into.name}».`);
  }
  lines.push(`Баланс «${into.name}» після обʼєднання: ${formatMoney(preview.balance)}.`);
  if (preview.corrections > 0) {
    lines.push(
      `Серед транзакцій «${from.name}» є коригування (${preview.corrections}). Якщо «Звірити» ` +
        `лише додало туди гроші, які «${into.name}» вже має, обʼєднайте без коригувань — ` +
        `тоді баланс буде ${formatMoney(preview.balanceWithoutCorrections)}.`,
    );
  }
  return lines.join('\n');
}
