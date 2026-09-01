import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
import { Card, ListCard, ListRow, Mark, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { activeAccounts } from '@/domain/account';
import { namesById } from '@/domain/category';
import type { Transaction } from '@/domain/transaction';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountChoiceLabel } from '@/ui/labels';
import { monthLabel, monthsOf } from '@/ui/months';
import { emptyMessage, searchCriteria, showMore } from '@/ui/transaction-search';
import {
  accountsById,
  feedSubtitle,
  feedTitle,
  overLimitByMonth,
  transactionLine,
} from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * «Транзакції» — every stored транзакція, not only the latest, with a search over what they say
 * and narrowing by рахунок and місяць. It exists because a history that cannot be searched cannot
 * answer «куди пішли гроші» once it is longer than one screen.
 *
 * Pushed over the tabs and reached from the стрічка on Головний (design D14): search is somewhere
 * you go from the стрічка, not somewhere you live. Every decision — what the query means, what a
 * page is, what to say when there is nothing — is in `src/ui/transaction-search.ts` and
 * `src/db/transactions-repo.ts` under `verify`; this file is the wiring, and it creates, changes
 * and deletes nothing of its own.
 */

/** The value of the «Всі» chip. Not a рахунок id and not a місяць, so it can never be either. */
const ANY = '';

export default function TransactionsScreen() {
  const router = useRouter();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        // Archived ones included: a search over the whole history must find a транзакція by the
        // категорія it carries, even one archived since.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        limits: limitsRepo.list(),
        // Only for the місяці the narrowing offers — the list itself is read a page at a time.
        months: monthsOf(transactionsRepo.listAll()),
      }),
      [],
    ),
  );

  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState(ANY);
  const [month, setMonth] = useState(ANY);

  const criteria = useMemo(
    () => searchCriteria(query, stored.categories, stored.sources),
    [query, stored.categories, stored.sources],
  );

  /** Storage, already carrying the criterion and the narrowing in force. */
  const read = useCallback(
    (limit: number, offset: number): readonly Transaction[] =>
      transactionsRepo.search({
        ...(criteria ? { match: criteria } : {}),
        ...(accountId === ANY ? {} : { accountId }),
        ...(month === ANY ? {} : { month }),
        limit,
        offset,
      }),
    [accountId, criteria, month],
  );

  /**
   * How many pages the owner has asked for, and the pages themselves read from storage. State
   * holds the *asking*, not the rows, so «Показати ще» keeps everything already on the screen in
   * place — the same offsets in the same order.
   *
   * The rows come back through `useReloadOnFocus` and not through a `useMemo`: with an empty
   * query — this screen's own default — `searchCriteria('')` is `undefined` on both sides of a
   * focus reload, so nothing a memo depends on would change and the screen would keep the page it
   * computed when it was mounted. A транзакція edited from the results would then read as it was,
   * and a deleted one would stay on the screen as a row that opens «Такої транзакції немає».
   * `showMore` is what decides a page, and it is proven in `transaction-search.test.ts`.
   */
  const [pages, setPages] = useState(1);
  const [shown] = useReloadOnFocus(
    useCallback(() => {
      let current = showMore([], read);
      for (let more = 1; more < pages; more += 1) {
        current = showMore(current.transactions, read);
      }
      return current;
    }, [pages, read]),
  );

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const overLimit = useMemo(
    () =>
      overLimitByMonth({
        feed: shown.transactions,
        limits: stored.limits,
        monthTransactions: (m) => transactionsRepo.listMonth(m),
      }),
    [shown.transactions, stored.limits],
  );

  const narrowed = criteria !== undefined || accountId !== ANY || month !== ANY;
  const nothing = emptyMessage({ shown: shown.transactions.length, narrowed });

  /** Changing the question starts its own first page; what was grown belonged to the old one. */
  const ask = useCallback((change: () => void) => {
    setPages(1);
    change();
  }, []);

  const clearNarrowing = useCallback(() => {
    ask(() => {
      setQuery('');
      setAccountId(ANY);
      setMonth(ANY);
    });
  }, [ask]);

  const accountChoices = [
    { value: ANY, label: 'Всі' },
    ...activeAccounts(stored.accounts).map((a) => ({
      value: a.id,
      label: accountChoiceLabel(a),
    })),
  ];
  const monthChoices = [
    { value: ANY, label: 'Всі' },
    ...stored.months.map((m) => ({ value: m, label: monthLabel(m) })),
  ];

  return (
    <Screen>
      <ScreenHeader
        title="Транзакції"
        subtitle="Уся історія, новіші вгорі"
        back={() => router.back()}
      />

      <Card style={styles.filters}>
        <Field
          label="Пошук"
          value={query}
          onChangeText={(typed: string) => ask(() => setQuery(typed))}
          autoCapitalize="none"
          placeholder="опис, категорія, джерело або сума"
        />
        <Choices
          label="Рахунок"
          choices={accountChoices}
          selected={accountId}
          onSelect={(picked: string) => ask(() => setAccountId(picked))}
        />
        {/* Only the місяці something is actually recorded in: a month the owner has nothing in
            could only ever produce «нічого не знайдено». */}
        {stored.months.length > 0 ? (
          <Choices
            label="Місяць"
            choices={monthChoices}
            selected={month}
            onSelect={(picked: string) => ask(() => setMonth(picked))}
          />
        ) : null}
        {narrowed ? (
          <Action variant="secondary" title="Показати все" onPress={clearNarrowing} />
        ) : null}
      </Card>

      {nothing ? (
        <ThemedText type="small" themeColor="textSecondary">
          {nothing}
        </ThemedText>
      ) : (
        <>
          <ListCard>
            {shown.transactions.map((t, index) => {
              const line = transactionLine(t, byId, categoryNames, sourceNames, overLimit);
              return (
                <ListRow key={line.id} last={index === shown.transactions.length - 1}>
                  <Pressable
                    onPress={() => router.push(`/transaction/${line.id}`)}
                    style={styles.row}>
                    <View style={styles.label}>
                      <View style={styles.rowTitle}>
                        {line.uncategorised ? <Mark /> : null}
                        <ThemedText
                          numberOfLines={1}
                          themeColor={line.overLimit ? 'textDanger' : undefined}>
                          {feedTitle(line)}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {feedSubtitle(line)}
                      </ThemedText>
                      {line.description ? (
                        <ThemedText type="small" themeColor="textMuted">
                          {line.description}
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText
                      tabular
                      style={styles.amount}
                      themeColor={
                        t.type === 'income'
                          ? 'textPositive'
                          : t.type === 'transfer'
                            ? 'textSecondary'
                            : undefined
                      }>
                      {line.amount}
                    </ThemedText>
                  </Pressable>
                </ListRow>
              );
            })}
          </ListCard>
          {shown.more ? (
            <Action
              variant="secondary"
              title="Показати ще"
              onPress={() => setPages((asked) => asked + 1)}
            />
          ) : (
            <ThemedText type="small" themeColor="textMuted">
              Це вся історія.
            </ThemedText>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: Spacing.three },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  label: { flex: 1, gap: Spacing.half },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - Spacing.half },
  amount: { fontWeight: 600 },
});
