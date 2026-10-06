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
  categorisationContext,
  categories as categoriesRepo,
  limits as limitsRepo,
  merchants as merchantsRepo,
  sources as sourcesRepo,
  storageStampNow,
  storedHistory,
  transactions as transactionsRepo,
} from '@/db/repos';
import { activeAccounts } from '@/domain/account';
import { namesById } from '@/domain/category';
import { merchantIndex } from '@/domain/merchants';
import { resolveCategory } from '@/domain/rules';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useHaptics } from '@/hooks/haptics-ports';
import { judgeProgressLater } from '@/hooks/progress-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { usePagedList } from '@/hooks/use-paged-list';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useRuleOffer } from '@/hooks/use-rule-offer';
import { expenseCategoryChoices, recentlyUsed, sourceChoices } from '@/ui/category-choices';
import { failureAlert } from '@/ui/failure-alert';
import { accountChoiceLabel } from '@/ui/labels';
import { monthLabel } from '@/ui/months';
import { assignSource, recategorise } from '@/ui/retype';
import { PICKER_SIZE } from '@/ui/shortlist';
import {
  accountFilterOrder,
  emptyMessage,
  merchantFromRoute,
  monthFromRoute,
  ONLY_CHOICES,
  ONLY_UNCATEGORISED,
  onlyFromRoute,
  onlyNarrowing,
  searchCriteria,
  SEARCH_HINT,
  searchDelayMs,
  searchLineTitle,
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
 * and narrowing by рахунок, місяць, «Без категорії» and «Без джерела». It exists because a history that cannot be searched cannot
 * answer «куди пішли гроші» once it is longer than one screen.
 *
 * Pushed over the tabs and reached from the стрічка on Головний (design D14): search is somewhere
 * you go from the стрічка, not somewhere you live. Every decision — what the query means, what a
 * page is, what to say when there is nothing — is in `src/ui/transaction-search.ts` and
 * `src/db/transactions-repo.ts` under `verify`; this file is the wiring. The two things it changes
 * are the категорія of a line in «Без категорії» and the джерело of a дохід in «Без джерела»,
 * through the стрічка's own one-tap flows — this is where «Потребує уваги» and the підсумок send
 * the owner to sort those piles.
 */

/** How far back the categorising picker reads what the owner reached for last — Головний's window. */
const RECENT_WINDOW = 50;

/** The value of the «Всі» chip. Not a рахунок id and not a місяць, so it can never be either. */
const ANY = '';

export default function TransactionsScreen() {
  const router = useRouter();
  const haptics = useHaptics();

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
        // The продавці: what a typed назва finds, what a line reads as, and what `?merchant=` may
        // name (design M7, M9).
        merchants: merchantsRepo.list(),
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
  // «Без категорії» or «Без джерела» — never both — on when the screen was opened with
  // `?only=uncategorised` or `?only=unsourced`: an initial value, not a lock.
  const askedOnly = useLocalSearchParams<{ only?: string }>().only;
  const [only, setOnly] = useState(onlyFromRoute(askedOnly));
  // One продавець, when a продавець's «Транзакції» opened the screen with `?merchant=`: exact, judged
  // on the опис, and an initial value rather than a lock. An id no продавець carries narrows nothing.
  const askedMerchant = merchantFromRoute(
    useLocalSearchParams<{ merchant?: string }>().merchant,
    stored.merchants,
  );
  const [chosenMerchant, setMerchantId] = useState(askedMerchant ?? ANY);
  // A продавець merged or deleted while this screen sat in the stack narrows nothing any more —
  // the chip naming it goes on the same re-read, so no narrowing is ever in force unnamed.
  const merchantId =
    chosenMerchant !== ANY && stored.merchants.some((m) => m.id === chosenMerchant) ? chosenMerchant : ANY;
  const merchants = useMemo(() => merchantIndex(stored.merchants), [stored.merchants]);

  const criteria = useMemo(
    () => searchCriteria(query, stored.categories, stored.sources, stored.merchants),
    [query, stored.categories, stored.sources, stored.merchants],
  );

  /** Storage, already carrying the criterion and the narrowing in force. */
  const read = useCallback(
    (limit: number, offset: number): readonly Transaction[] =>
      transactionsRepo.search({
        ...(criteria ? { match: criteria } : {}),
        ...(accountId === ANY ? {} : { accountId }),
        ...(month === ANY ? {} : { month }),
        ...onlyNarrowing(only),
        ...(merchantId === ANY ? {} : { merchantId }),
        limit,
        offset,
      }),
    [accountId, criteria, merchantId, month, only],
  );

  /** What the search reads from, and storage's change stamp: a new question starts over. */
  const pagePorts = useMemo(() => ({ read, stamp: storageStampNow }), [read]);
  /**
   * The pages shown: «Показати ще» reads only the next one while nothing was written since, and a
   * return to the screen or its own write reads as many rows as are shown, in one read, never back
   * to the first page (app-speed-pass design D6). The decisions are `transaction-search.ts`'s.
   */
  const question = JSON.stringify({
    criteria: criteria ?? null,
    accountId,
    month,
    only,
    merchantId,
  });
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
    criteria !== undefined ||
    accountId !== ANY ||
    month !== ANY ||
    only !== undefined ||
    merchantId !== ANY;
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
      setOnly(undefined);
      setMerchantId(ANY);
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
  /**
   * What the «Без джерела» mark offers: every unarchived джерело but «Без джерела» itself, which is
   * what the дохід is being moved off — the editing screen's own list, nothing but джерела.
   */
  const sourceRows = useMemo(() => sourceChoices(stored.sources), [stored.sources]);
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

  /**
   * What a правило or the шаблон would give the «Без категорії» line whose picker is open: offered
   * first among the five and marked, stored only when tapped (main-screen, "The шаблон's категорія
   * is one tap away"). The tiers are read once per opened picker, not per render, so typing in its
   * full list reads no storage.
   */
  const tiers = useMemo(
    () => (categorising === undefined ? undefined : categorisationContext()),
    [categorising],
  );
  const suggestedCategory = (t: Transaction) =>
    tiers === undefined
      ? undefined
      : resolveCategory(tiers, {
          description: t.description ?? '',
          mcc: 'mcc' in t ? t.mcc : undefined,
        });

  /** The «Без джерела» line whose one-tap джерело picker is open, if any — and its full list. */
  const [sourcing, setSourcing] = useState<string>();
  const [sourceListOpen, setSourceListOpen] = useState(false);
  const closeSourceList = useCallback(() => setSourceListOpen(false), []);
  useCloseOnBack(sourcing !== undefined && sourceListOpen, closeSourceList);

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
        // Stored, and felt as a store: the chip's own tick in the same tap gives way to it.
        haptics.play('stored');
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
    [haptics, reload, reloadStored, reportBug, ruleOffer],
  );

  /**
   * One tap behind the «Без джерела» mark: the same дохід under the same id, now carrying the pick
   * — the editing screen's plain save of a дохід. Under the «Без джерела» narrowing the reload
   * simply no longer returns the line. A джерело is not a категорія: no правило is offered.
   */
  const giveSource = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(assignSource(t, picked), new Date());
        judgeProgressLater();
        haptics.play('stored');
        setSourcing(undefined);
        setSourceListOpen(false);
        reload();
        // The pick is now the most recent джерело: the next picker on this screen puts it first.
        reloadStored();
      } catch (error) {
        Alert.alert(
          ...failureAlert({
            title: 'Не збережено',
            where: 'transaction-source',
            error,
            report: reportBug,
          }),
        );
      }
    },
    [haptics, reload, reloadStored, reportBug],
  );

  const accountChoices = [
    { value: ANY, label: 'Всі' },
    ...accountFilterOrder(activeAccounts(stored.accounts), recentAccounts).map((a) => ({
      value: a.id,
      label: accountChoiceLabel(a),
    })),
  ];
  const monthChoices = [
    { value: ANY, label: 'Всі' },
    ...stored.months.map((m) => ({ value: m, label: monthLabel(m) })),
  ];
  /** The продавець the screen was opened for, named on its chip while that narrowing can be in force. */
  const askedMerchantName = stored.merchants.find((m) => m.id === askedMerchant)?.name;
  const merchantChoices =
    askedMerchant !== undefined && askedMerchantName !== undefined
      ? [
          { value: ANY, label: 'Всі' },
          { value: askedMerchant, label: askedMerchantName },
        ]
      : [];

  /**
   * Every shown row's line, once per list rather than on every render — one clock for the whole
   * list, so «сьогодні» cannot change halfway down it (app-speed-pass design D7).
   */
  const lines = useMemo(() => {
    const now = new Date();
    return new Map(
      shown.transactions.map((t) => {
        const line = transactionLine(
          t,
          byId,
          categoryNames,
          sourceNames,
          overLimit,
          categoryIconKeys,
          merchants,
        );
        return [t.id, { line, subtitle: feedSubtitle(line, now) }] as const;
      }),
    );
  }, [byId, categoryIconKeys, categoryNames, merchants, overLimit, shown.transactions, sourceNames]);

  /** One row of the list — drawn only while it is on or near the screen. */
  const renderRow = (t: Transaction, index: number) => {
    const { line, subtitle } = lines.get(t.id)!;
    const title = searchLineTitle(line, only === ONLY_UNCATEGORISED);
    return (
      <ListRow key={line.id} last={index === shown.transactions.length - 1}>
        {/* Under «Без категорії» the опис already is the title; said once. */}
        <TransactionRow
          icon={line.icon}
          iconTone={line.iconTone}
          marked={line.uncategorised || line.unsourced}
          title={line.transferEnds ?? title}
          overLimit={line.overLimit}
          titleLines={line.category === undefined && line.source === undefined ? 2 : 1}
          subtitle={subtitle}
          description={
            line.descriptionShown && !(only === ONLY_UNCATEGORISED && title === line.descriptionShown)
              ? line.descriptionShown
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
                setSourcing(undefined);
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
            suggestedId={suggestedCategory(t)}
            noun="categories"
            expanded={categoryListOpen}
            onExpandedChange={setCategoryListOpen}
          />
        ) : null}

        {/* The same one tap for a дохід «Без джерела», as on Головний: only джерела are offered,
            and tapping the line itself still opens editing, where a дохід that is really a
            повернення or a переказ is retyped. */}
        {line.unsourced ? (
          <View style={styles.rowActions}>
            <RowAction
              title={sourcing === line.id ? 'Згорнути' : 'Обрати джерело'}
              onPress={() => {
                setSourcing(sourcing === line.id ? undefined : line.id);
                setSourceListOpen(false);
                setCategorising(undefined);
              }}
            />
          </View>
        ) : null}
        {/* Gated on the mark too, for the reason the категорія picker is. */}
        {line.unsourced && sourcing === line.id ? (
          <Picker
            label="Джерело"
            rows={sourceRows}
            recentIds={recent.sources}
            selected={undefined}
            onSelect={(picked: string) => giveSource(t, picked)}
            noun="sources"
            expanded={sourceListOpen}
            onExpandedChange={setSourceListOpen}
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
            choices={[{ value: ANY, label: 'Всі' }, ...ONLY_CHOICES]}
            selected={only ?? ANY}
            onSelect={(picked: string) => ask(() => setOnly(onlyFromRoute(picked)))}
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
          {/* Only when a продавець's «Транзакції» opened the screen: the narrowing names it while it
              is in force, and «Всі» takes it off without leaving. */}
          {merchantChoices.length > 0 ? (
            <Choices
              label="Продавець"
              choices={merchantChoices}
              selected={merchantId}
              onSelect={(picked: string) => ask(() => setMerchantId(picked))}
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
        categoryNames={categoryNames}
        accountNames={accountNames}
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
  return <SearchBar value={typed} onChange={change} placeholder={SEARCH_HINT} />;
}

const styles = StyleSheet.create({
  filters: { gap: Spacing.two },
  // A row's verbs side by side, wrapping on a narrow screen — spaced as on Головний, where
  // «Обрати категорію» and «Це переказ» touched with no gap. `three`, not `two`: each
  // `RowAction` carries `hitSlop` of `two`, and eight apart their hit areas would meet.
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
