import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { receipts as receiptsRepo, transactions as transactionsRepo } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import {
  DETACH_LABEL,
  detachConfirmation,
  receiptHeader,
  receiptItemRows,
} from '@/ui/receipt-screen';

import { Spacing } from '@/constants/theme';

/**
 * The позиції of an attached чек, and detaching it.
 *
 * Everything here is read from storage and rendered — no network, so an attached чек is fully
 * readable with the phone offline, which is the whole point of keeping the позиції rather than a
 * link to the tax service. The source snapshot is *not* read: every number and name on this screen
 * comes from the parsed чек, so altering the snapshot would change nothing shown here.
 */
export default function ReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loaded] = useReloadOnFocus(
    useCallback(
      () => ({
        stored: receiptsRepo.forTransaction(id),
        transaction: transactionsRepo.get(id),
      }),
      [id],
    ),
  );

  const detach = useCallback(() => {
    const receipt = loaded.stored;
    if (!receipt) return;
    // Asked once, because detaching deletes the чек and its позиції. The транзакція is untouched.
    Alert.alert('Відкріпити чек?', detachConfirmation(receipt), [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Відкріпити',
        style: 'destructive',
        onPress: () => {
          receiptsRepo.remove(receipt.receipt.id);
          router.back();
        },
      },
    ]);
  }, [loaded.stored, router]);

  if (!loaded.stored || !loaded.transaction) {
    return (
      <Screen>
        <ScreenHeader title="Фіскальний чек" back={() => router.back()} />
        <ThemedText>Чека не знайдено.</ThemedText>
      </Screen>
    );
  }

  const header = receiptHeader({ stored: loaded.stored, transaction: loaded.transaction });
  const rows = receiptItemRows(loaded.stored.items);

  return (
    <Screen>
      <ScreenHeader title="Фіскальний чек" back={() => router.back()} />
      <Card style={styles.header}>
        <ThemedText type="subtitle">{header.total}</ThemedText>
        {header.seller ? (
          <ThemedText type="small" themeColor="textSecondary">
            {header.seller}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {header.issued}
        </ThemedText>
        {/* Both amounts, marked as different — the транзакція's сума may have been edited since. */}
        {header.differsFrom ? <ThemedText>{header.differsFrom}</ThemedText> : null}
      </Card>

      <Card style={styles.list}>
        {rows.map((row) => (
          <View key={row.id} style={styles.item}>
            <ThemedText>{row.name}</ThemedText>
            {/* No «×» line where the чек printed no unit price: nothing is invented. */}
            {row.quantity ? (
              <ThemedText type="small" themeColor="textSecondary">
                {row.quantity}
              </ThemedText>
            ) : null}
            <ThemedText>{row.total}</ThemedText>
            {row.discount ? (
              <ThemedText type="small" themeColor="textSecondary">
                {row.discount}
              </ThemedText>
            ) : null}
          </View>
        ))}
      </Card>

      <Action variant="destructive" title={DETACH_LABEL} onPress={detach} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one },
  list: { gap: Spacing.one },
  item: { gap: 2, paddingVertical: Spacing.one },
});
