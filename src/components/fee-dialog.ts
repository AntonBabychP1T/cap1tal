import { Alert } from 'react-native';

import { proposeFee, transfer, type Transaction, type Transfer } from '@/domain/transaction';
import { formatMoney } from '@/ui/amount-input';
import { newId } from '@/ui/id';

/**
 * The комісія dialog, shared by recording and editing so both behave the same way.
 *
 * Accepting stores the переказ with the сума that arrived on **both** legs plus the "Комісія"
 * витрата, so the account the money left loses exactly what left it and no розрахунковий баланс
 * counts the комісія twice (design §8). Declining stores the typed legs alone. A переказ that
 * lost nothing — and every cross-currency one — never asks: `proposeFee` returns nothing.
 */
export function askAboutFee(
  candidate: Transfer,
  store: (...written: Transaction[]) => void,
): void {
  const fee = proposeFee(candidate);
  if (!fee) {
    store(candidate);
    return;
  }
  Alert.alert(
    'Схоже на комісію',
    `Дійшло на ${formatMoney(fee.amount)} менше. Записати різницю як витрату «Комісія»?`,
    [
      { text: 'Ні', style: 'cancel', onPress: () => store(candidate) },
      {
        text: 'Так',
        onPress: () =>
          store(transfer({ ...candidate, left: candidate.arrived }), { ...fee, id: newId() }),
      },
    ],
  );
}
