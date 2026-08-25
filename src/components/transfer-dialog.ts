import { Alert } from 'react-native';

import type { Account } from '@/domain/account';
import type { Transaction, Transfer } from '@/domain/transaction';
import { formatMoney } from '@/ui/amount-input';
import { proposeForTransfer } from '@/ui/entry-form';
import { newId } from '@/ui/id';

/**
 * The question a переказ may raise before it is stored, shared by recording and editing so both
 * behave the same way. Which question — the комісія of a short arrival, or the дохід «Відсотки» of
 * a repayment above the principal — is decided in `proposeForTransfer`, where `verify` can prove
 * it; only the wording and the two buttons live here.
 *
 * Accepting stores what the proposal says instead of the typed переказ: for a комісія, the сума
 * that arrived on both legs plus the "Комісія" витрата, so the account the money left loses
 * exactly what left it and no розрахунковий баланс counts it twice; for «Відсотки», the principal
 * on both legs plus the дохід, so the person's рахунок-борг lands on exactly nothing owed.
 * Declining stores the typed legs alone.
 */
export function askAboutTransfer(
  candidate: Transfer,
  context: {
    readonly accounts: readonly Account[];
    /** Every stored транзакція touching the рахунок the money left. */
    readonly sourceTransactions: readonly Transaction[];
  },
  store: (...written: Transaction[]) => void,
): void {
  const proposal = proposeForTransfer(candidate, context);
  if (!proposal) {
    store(candidate);
    return;
  }
  const [title, question, extra] =
    proposal.kind === 'fee'
      ? [
          'Схоже на комісію',
          `Дійшло на ${formatMoney(proposal.expense.amount)} менше. Записати різницю як витрату «Комісія»?`,
          proposal.expense,
        ]
      : [
          'Схоже на відсотки',
          `Повернули на ${formatMoney(proposal.income.amount)} більше за борг. Записати різницю як дохід «Відсотки»?`,
          proposal.income,
        ];
  Alert.alert(title, question, [
    { text: 'Ні', style: 'cancel', onPress: () => store(candidate) },
    { text: 'Так', onPress: () => store(proposal.transfer, { ...extra, id: newId() }) },
  ]);
}
