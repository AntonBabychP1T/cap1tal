import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Picker, RowAction, SearchBar } from '@/components/form';
import { RuleOfferSheet } from '@/components/rule-offer-sheet';
import { Card, ListRow, ListScreen, ScreenHeader } from '@/components/surfaces';
import { TransactionRow } from '@/components/transaction-row';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
  sources as sourcesRepo,
  storageStampNow,
  storedHistory,
  transactions as transactionsRepo,
} from '@/db/repos';
import { activeAccounts } from '@/domain/account';
import { namesById } from '@/domain/category';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { judgeProgressLater } from '@/hooks/progress-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { usePagedList } from '@/hooks/use-paged-list';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useRuleOffer } from '@/hooks/use-rule-offer';
import { expenseCategoryChoices, recentlyUsed } from '@/ui/category-choices';
import { failureAlert } from '@/ui/failure-alert';
import { accountChoiceLabel } from '@/ui/labels';
import { ruleTargetLabel } from '@/ui/list-management';
import { monthLabel } from '@/ui/months';
import { recategorise } from '@/ui/retype';
import { PICKER_SIZE } from '@/ui/shortlist';
import {
  accountFilterOrder,
  emptyMessage,
  monthFromRoute,
  ONLY_UNCATEGORISED,
  searchCriteria,
  searchDelayMs,
  searchLineTitle,
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
        // Only for the місяці the narrowing offers — the list itself is read a page at a time. One
        // stamped DISTINCT over the date index, never the whole history (app-speed-pass design D6).
        months: transactionsRepo.months(),
        // What the categorising picker puts first — the same recents Головний's picker reads.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
      }),
      [],
    ),
  );

  /**
   * What the list is searched for. The field's own text lives in `PausedSearchBar`, which hands it
   * over once typing pauses — so a keystroke redraws the field and nothing else (transaction-search,
   * "Typing a search is never held up by the search"; app-speed-pass design D6). Clearing the
   * narrowing starts the field over through `searchReset`.
   */
  const [query, setQuery] = useState('');
  const [searchReset, setSearchReset] = useState(0);
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

  /** What the search reads from, and storage's change stamp: a new question starts over. */
  const pagePorts = useMemo(() => ({ read, stamp: storageStampNow }), [read]);
  /**
   * The pages shown: «Показати ще» reads only the next one while nothing was written since, and a
   * return to the screen or its own write reads as many rows as are shown, in one read, never back
   * to the first page (app-speed-pass design D6). The decisions are `transaction-search.ts`'s.
   */
  const question = JSON.stringify({ criteria: criteria ?? null, accountId, month, uncategorisedOnly });
  const [shown, showNext, reload] = usePagedList(question, pagePorts);

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const categoryIconKeys = useMemo(() => new Map(stored.categories.map((c) => [c.id, c.iconKey])), [stored.categories]);
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const accountNames = useMemo(() => namesById(stored.accounts), [stored.accounts]);
  const overLimit = useMemo(
    () =>
      overLimitByMonth({
        feed: shown.transactions,
        limits: stored.limits,
        // From the stored history already read between writes — never a read per month the rows
        // span (transaction-search, "Limit marks on the list need no read per month").
        monthTransactions: (m) => storedHistory.read().byMonth().get(m) ?? [],
      }),
    [shown.transactions, stored.limits],
  );

  const narrowed =
    criteria !== undefined || accountId !== ANY || month !== ANY || uncategorisedOnly;
  const nothing = emptyMessage({ shown: shown.transactions.length, narrowed });

  /**
   * Changing the question starts its own first page — `usePagedList` does that whenever the
   * question's value changes — so what was grown for the old one is never shown under the new.
   * Kept as the one door every narrowing goes through.
   */
  const ask = useCallback((change: () => void) => {
    change();
  }, []);

  const clearNarrowing = useCallback(() => {
    ask(() => {
      setQuery('');
      setSearchReset((n) => n + 1);
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
  /** Every рахунок the latest транзакції touched, for the order of the рахунок row. */
  const recentAccounts = useMemo(
    () => recentlyUsed(stored.latest, stored.accounts.length).accounts,
    [stored.latest, stored.accounts.length],
  );

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
        judgeProgressLater();
        setCategorising(undefined);
        setCategoryListOpen(false);
        reload();
        // The pick is now the most recent категорія: the next picker on this screen puts it first.
        reloadStored();
        // The категорія is already stored, never lost by a dismissed offer (design D5).
        if (t.type === 'expense' || t.type === 'refund') {
          ruleOffer.raise({ description: t.description, target: { kind: 'category', categoryId: picked } });
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
    ...accountFilterOrder(activeAccounts(stored.accounts), recentAccounts).map((a) => ({
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

  /**
   * Every shown row's line, once per list rather than on every render — one clock for the whole
   * list, so «сьогодні» cannot change halfway down it (app-speed-pass design D7).
   */
  const lines = useMemo(() => {
    const now = new Date();
    return new Map(
      shown.transactions.map((t) => {
        const line = transactionLine(t, byId, categoryNames, sourceNames, overLimit, categoryIconKeys);
        return [t.id, { line, subtitle: feedSubtitle(line, now) }] as const;
      }),
    );
  }, [byId, categoryIconKeys, categoryNames, overLimit, shown.transactions, sourceNames]);

  /** One row of the list — drawn only while it is on or near the screen. */
  const renderRow = (t: Transaction, index: number) => {
    const { line, subtitle } = lines.get(t.id)!;
    const title = searchLineTitle(line, uncategorisedOnly);
    return (
      <ListRow key={line.id} last={index === shown.transactions.length - 1}>
        {/* Under «Без категорії» the опис already is the title; said once. */}
        <TransactionRow
          icon={line.icon}
          iconTone={line.iconTone}
          marked={line.uncategorised}
          title={title}
          titleTone={line.overLimit ? 'textDanger' : undefined}
          titleLines={line.category === undefined && line.source === undefined ? 2 : 1}
          subtitle={subtitle}
          description={
            line.description && !(uncategorisedOnly && title === line.description)
              ? line.description
              : undefined
          }
          amount={line.amount}
          amountTone={line.amountTone}
          onPress={() => router.push(`/transaction/${line.id}`)}
        />

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
        {/* Only while the line is still «Без категорії»: the picker is keyed by id, and a line
            retyped elsewhere (a переказ, a дохід) keeps its id — its stale picker then refused
            the next tap with «категорію має лише витрата або повернення» (2026-09-22). */}
        {line.uncategorised && categorising === line.id ? (
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
  };

  return (
    <ListScreen
      header={
        <>
        <ScreenHeader
          title="Транзакції"
          subtitle="Уся історія, новіші вгорі"
          back={() => router.back()}
        />

        <Card style={styles.filters}>
          <PausedSearchBar key={searchReset} onSearch={setQuery} />
          <Choices
            label="Рахунок"
            choices={accountChoices}
            selected={accountId}
            onSelect={(picked: string) => ask(() => setAccountId(picked))}
            scroll
          />
          <Choices
            label="Категорія"
            choices={categoryChoices}
            selected={uncategorisedOnly ? ONLY_UNCATEGORISED : ANY}
            onSelect={(picked: string) =>
              ask(() => setUncategorisedOnly(picked === ONLY_UNCATEGORISED))
            }
            scroll
          />
          {/* Only the місяці something is actually recorded in: a month the owner has nothing in
              could only ever produce «нічого не знайдено». */}
          {stored.months.length > 0 ? (
            <Choices
              label="Місяць"
              choices={monthChoices}
              selected={month}
              onSelect={(picked: string) => ask(() => setMonth(picked))}
              scroll
            />
          ) : null}
          {narrowed ? (
            <Action variant="secondary" title="Показати все" onPress={clearNarrowing} />
          ) : null}
        </Card>
        </>
      }
      data={shown.transactions}
      keyExtractor={(t) => t.id}
      renderRow={renderRow}
      empty={
        nothing ? (
          <ThemedText type="small" themeColor="textSecondary">
            {nothing}
          </ThemedText>
        ) : null
      }
      footer={
        shown.transactions.length === 0 ? null : shown.more ? (
          <Action variant="secondary" title="Показати ще" onPress={showNext} />
        ) : (
          <ThemedText type="small" themeColor="textMuted">
            Це вся історія.
          </ThemedText>
        )
      }>
      <RuleOfferSheet
        offer={ruleOffer.offer}
        targetLabel={
          ruleOffer.offer ? ruleTargetLabel(ruleOffer.offer.target, categoryNames, accountNames) : ''
        }
        onAccept={ruleOffer.accept}
        onDecline={ruleOffer.decline}
      />
    </ListScreen>
  );
}

/**
 * The search field, owning its text: every letter appears at once, and `onSearch` hears the text
 * after `searchDelayMs` of quiet — at once when the field is cleared.
 */
function PausedSearchBar({ onSearch }: { onSearch: (text: string) => void }) {
  const [typed, setTyped] = useState('');
  const [searched, setSearched] = useState('');
  useEffect(() => {
    if (typed === searched) {
      return;
    }
    const timer = setTimeout(() => {
      setSearched(typed);
      onSearch(typed);
    }, searchDelayMs(searched, typed));
    return () => clearTimeout(timer);
  }, [onSearch, searched, typed]);
  const change = (text: string) => {
    setTyped(text);
    if (searchDelayMs(searched, text) === 0) {
      setSearched(text);
      onSearch(text);
    }
  };
  return <SearchBar value={typed} onChange={change} placeholder="опис, категорія або сума" />;
}

const styles = StyleSheet.create({
  filters: { gap: Spacing.two },
  // A row's verbs side by side, wrapping on a narrow screen — spaced as on Головний, where
  // «Обрати категорію» and «Це переказ» touched with no gap. `three`, not `two`: each
  // `RowAction` carries `hitSlop` of `two`, and eight apart their hit areas would meet.
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
