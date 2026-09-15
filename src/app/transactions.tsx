import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, Picker, RowAction } from '@/components/form';
import { RuleOfferSheet } from '@/components/rule-offer-sheet';
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
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { evaluateProgress } from '@/hooks/progress-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useRuleOffer } from '@/hooks/use-rule-offer';
import { expenseCategoryChoices, recentlyUsed } from '@/ui/category-choices';
import { failureAlert } from '@/ui/failure-alert';
import { accountChoiceLabel, categoryLabel } from '@/ui/labels';
import { monthLabel, monthsOf } from '@/ui/months';
import { recategorise } from '@/ui/retype';
import { PICKER_SIZE } from '@/ui/shortlist';
import {
  emptyMessage,
  monthFromRoute,
  ONLY_UNCATEGORISED,
  searchCriteria,
  searchLineTitle,
  showMore,
  uncategorisedFromRoute,
} from '@/ui/transaction-search';
import {
  accountsById,
  feedSubtitle,
  overLimitByMonth,
  transactionLine,
} from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * «Транзакції» — every stored транзакція, not only the latest, with a search over what they say
 * and narrowing by рахунок, місяць and «Без категорії». It exists because a history that cannot be searched cannot
 * answer «куди пішли гроші» once it is longer than one screen.
 *
 * Pushed over the tabs and reached from the стрічка on Головний (design D14): search is somewhere
 * you go from the стрічка, not somewhere you live. Every decision — what the query means, what a
 * page is, what to say when there is nothing — is in `src/ui/transaction-search.ts` and
 * `src/db/transactions-repo.ts` under `verify`; this file is the wiring. The one thing it changes
 * is the категорія of a line in «Без категорії», through the стрічка's own one-tap flow — this is
 * where «Потребує уваги» sends the owner to sort that pile.
 */

/** How far back the categorising picker reads what the owner reached for last — Головний's window. */
const RECENT_WINDOW = 50;

/** The value of the «Всі» chip. Not a рахунок id and not a місяць, so it can never be either. */
const ANY = '';

export default function TransactionsScreen() {
  const router = useRouter();

  const [stored, reloadStored] = useReloadOnFocus(
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
        // What the categorising picker puts first — the same recents Головний's picker reads.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
      }),
      [],
    ),
  );

  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState(ANY);
  // The місяць the screen opens on: «будь-який», or the one a `?month=` in the route asked for.
  // `monthFromRoute` is what decides whether that text is a місяць at all, under `verify`.
  const asked = useLocalSearchParams<{ month?: string }>().month;
  const [month, setMonth] = useState(monthFromRoute(asked) ?? ANY);
  // «Без категорії», on when «Потребує уваги» opened the screen with `?only=uncategorised`.
  const only = useLocalSearchParams<{ only?: string }>().only;
  const [uncategorisedOnly, setUncategorisedOnly] = useState(uncategorisedFromRoute(only));

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
        ...(uncategorisedOnly ? { uncategorised: true } : {}),
        limit,
        offset,
      }),
    [accountId, criteria, month, uncategorisedOnly],
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
  const [shown, reload] = useReloadOnFocus(
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

  const narrowed =
    criteria !== undefined || accountId !== ANY || month !== ANY || uncategorisedOnly;
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
      setUncategorisedOnly(false);
    });
  }, [ask]);

  /**
   * What the categorising picker offers: every unarchived категорія except «Без категорії», which
   * is what the line is being moved away from — Головний's picker, with Головний's recents.
   */
  const categoryRows = useMemo(
    () =>
      expenseCategoryChoices(stored.categories).filter((c) => c.id !== UNCATEGORISED_CATEGORY_ID),
    [stored.categories],
  );
  const recent = useMemo(() => recentlyUsed(stored.latest, PICKER_SIZE + 1), [stored.latest]);

  /** The «Без категорії» line whose one-tap picker is open, if any. */
  const [categorising, setCategorising] = useState<string>();
  /** Whether that picker has its full list open — so «назад» closes the list before the screen. */
  const [categoryListOpen, setCategoryListOpen] = useState(false);
  const closeCategoryList = useCallback(() => setCategoryListOpen(false), []);
  useCloseOnBack(categorising !== undefined && categoryListOpen, closeCategoryList);

  const reportBug = useCallback(
    (entryId: string) =>
      router.push({
        pathname: '/manage/bug-reports/new',
        params: { prompt: entryId },
      }),
    [router],
  );

  /**
   * One tap, as from the стрічка: the same транзакція under the same id, now carrying the pick.
   * The reload re-reads every page asked for through the same `search`, so under the «Без
   * категорії» narrowing the line is simply not returned any more and the rest keep their order.
   */
  /** The offer to remember today's tap as a правило — raised only after the категорія is stored. */
  const ruleOffer = useRuleOffer(reportBug);

  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        // A транзакція was recorded — one of the moments the прогрес is evaluated at.
        evaluateProgress();
        setCategorising(undefined);
        setCategoryListOpen(false);
        reload();
        // The pick is now the most recent категорія: the next picker on this screen puts it first.
        reloadStored();
        // The категорія is already stored, never lost by a dismissed offer (design D5).
        if (t.type === 'expense' || t.type === 'refund') {
          ruleOffer.raise({ description: t.description, categoryId: picked });
        }
      } catch (error) {
        Alert.alert(
          ...failureAlert({
            title: 'Не збережено',
            where: 'transaction-recategorise',
            error,
            report: reportBug,
          }),
        );
      }
    },
    [reload, reloadStored, reportBug, ruleOffer],
  );

  const accountChoices = [
    { value: ANY, label: 'Всі' },
    ...activeAccounts(stored.accounts).map((a) => ({
      value: a.id,
      label: accountChoiceLabel(a),
    })),
  ];
  const categoryChoices = [
    { value: ANY, label: 'Всі' },
    { value: ONLY_UNCATEGORISED, label: 'Без категорії' },
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
        <Choices
          label="Категорія"
          choices={categoryChoices}
          selected={uncategorisedOnly ? ONLY_UNCATEGORISED : ANY}
          onSelect={(picked: string) =>
            ask(() => setUncategorisedOnly(picked === ONLY_UNCATEGORISED))
          }
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
              const title = searchLineTitle(line, uncategorisedOnly);
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
                          {title}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {feedSubtitle(line)}
                      </ThemedText>
                      {/* Under «Без категорії» the опис already is the title; said once. */}
                      {line.description && !(uncategorisedOnly && title === line.description) ? (
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

                  {/* The one tap behind the mark, as on Головний: picking stores the категорія
                      without the editing screen ever opening. */}
                  {line.uncategorised ? (
                    <View style={styles.rowActions}>
                      <RowAction
                        title={categorising === line.id ? 'Згорнути' : 'Обрати категорію'}
                        onPress={() => {
                          setCategorising(categorising === line.id ? undefined : line.id);
                          setCategoryListOpen(false);
                        }}
                      />
                    </View>
                  ) : null}
                  {categorising === line.id ? (
                    <Picker
                      label="Категорія"
                      rows={categoryRows}
                      recentIds={recent.categories}
                      selected={undefined}
                      onSelect={(picked: string) => categorise(t, picked)}
                      noun="categories"
                      expanded={categoryListOpen}
                      onExpandedChange={setCategoryListOpen}
                    />
                  ) : null}
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
      <RuleOfferSheet
        offer={ruleOffer.offer}
        categoryName={
          ruleOffer.offer ? categoryLabel(ruleOffer.offer.categoryId, categoryNames) : ''
        }
        onAccept={ruleOffer.accept}
        onDecline={ruleOffer.decline}
      />
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
  rowActions: { flexDirection: 'row' },
  amount: { fontWeight: 600 },
});
