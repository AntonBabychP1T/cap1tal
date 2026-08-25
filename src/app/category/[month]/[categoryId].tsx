import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accounts as accountsRepo, transactions as transactionsRepo } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { categoryTransactions } from '@/ui/category-transactions';
import { categoryLabel } from '@/ui/labels';
import { monthLabel } from '@/ui/months';
import { accountsById, transactionLine } from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * One category's transactions for one month — what a breakdown row on Місяць opens. Rows render
 * through the same `transactionLine` the Головний feed uses, and a tap opens the same editing
 * screen, so a transaction found here is edited exactly as one found there.
 *
 * The route is `/category/…`, not `/month/…`: the Місяць tab already owns `/month`.
 */
export default function CategoryMonthScreen() {
  const router = useRouter();
  const { month, categoryId } = useLocalSearchParams<{ month: string; categoryId: string }>();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        transactions: transactionsRepo.listMonth(month),
      }),
      [month],
    ),
  );

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const listed = useMemo(
    () => categoryTransactions({ month, categoryId, transactions: stored.transactions }),
    [categoryId, month, stored.transactions],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{categoryLabel(categoryId)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {monthLabel(month)}
          </ThemedText>

          {listed.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              У цій категорії за місяць нічого немає.
            </ThemedText>
          ) : (
            listed.map((t) => {
              const line = transactionLine(t, byId);
              return (
                <Pressable key={line.id} onPress={() => router.push(`/transaction/${line.id}`)}>
                  <ThemedView type="backgroundElement" style={styles.row}>
                    <View style={styles.rowTop}>
                      <ThemedText type="smallBold">{line.amount}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {line.date}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {line.type} · {line.accounts}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })
          )}

          <Action title="Назад" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.one },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
