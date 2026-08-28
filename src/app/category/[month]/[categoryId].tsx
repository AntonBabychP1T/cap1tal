import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { categoryMonthHeading, categoryTransactions } from '@/ui/category-transactions';
import { monthLabel } from '@/ui/months';
import { accountsById, feedSubtitle, feedTitle, transactionLine } from '@/ui/transaction-line';

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
        // Archived ones included: this list exists to show a category's history, and archiving
        // takes a category out of pickers, never out of the months it already has.
        categories: categoriesRepo.list(),
        limits: limitsRepo.list(),
      }),
      [month],
    ),
  );

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const names = useMemo(() => namesById(stored.categories), [stored.categories]);
  const listed = useMemo(
    () => categoryTransactions({ month, categoryId, transactions: stored.transactions }),
    [categoryId, month, stored.transactions],
  );
  /** The category's own name, and whether it is over its ліміт for the month being shown. */
  const heading = useMemo(
    () =>
      categoryMonthHeading({
        month,
        categoryId,
        transactions: stored.transactions,
        categoryNames: names,
        limits: stored.limits,
      }),
    [categoryId, month, names, stored.limits, stored.transactions],
  );

  return (
    <Screen>
      <ScreenHeader
        title={heading.label}
        subtitle={monthLabel(month)}
        danger={heading.overLimit}
        back={() => router.back()}
      />

      {listed.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          У цій категорії за місяць нічого немає.
        </ThemedText>
      ) : (
        <ListCard>
          {listed.map((t, index) => {
            const line = transactionLine(t, byId, names);
            return (
              <ListRow key={line.id} last={index === listed.length - 1}>
                <Pressable
                  onPress={() => router.push(`/transaction/${line.id}`)}
                  style={styles.row}>
                  <View style={styles.label}>
                    <ThemedText numberOfLines={1}>{feedTitle(line)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {feedSubtitle(line)}
                    </ThemedText>
                  </View>
                  <ThemedText tabular style={styles.amount}>
                    {line.amount}
                  </ThemedText>
                </Pressable>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  label: { flex: 1, gap: Spacing.half },
  amount: { fontWeight: 600 },
});
