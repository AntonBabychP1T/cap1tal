import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';

import { Action, Field, Picker, RowAction } from '@/components/form';
import { RuleOfferSheet } from '@/components/rule-offer-sheet';
import {
  Card,
  CardGlow,
  Chevron,
  Divider,
  Fab,
  ListCard,
  ListRow,
  Mark,
  Screen,
  SectionLabel,
  Wordmark,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  investments as investmentsRepo,
  limits as limitsRepo,
  monobank as monobankRepo,
  netWorth as netWorthRepo,
  notifications as notificationsRepo,
  rates as ratesRepo,
  rules as rulesRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { computeBalance } from '@/domain/account';
import { namesById } from '@/domain/category';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useRuleOffer } from '@/hooks/use-rule-offer';
import { syncPorts } from '@/hooks/monobank-ports';
import { monobankTokenStore } from '@/platform/monobank-token-store';
import { raise as raiseAlert } from '@/ui/alerting';
import {
  confirmPendingDraft,
  dismissConfirmation,
  dismissPendingDraft,
  draftLines,
  type DraftAnswer,
} from '@/ui/drafts-section';
import { expenseCategoryChoices, recentlyUsed } from '@/ui/category-choices';
import { CategoryWidget } from '@/components/category-widget';
import { NetWorthWidget } from '@/components/net-worth-widget';
import { categoryMonthRoute, currentMonthRoute, remainderRoute } from '@/ui/home-navigation';
import { categoryPresentation } from '@/ui/home-categories';
import { hasDateRolledOver, makeCancelToken } from '@/ui/home-data';
import { manualRefresh } from '@/ui/home-refresh';
import { homeViewModel } from '@/ui/home-screen';
import { syncCoverage } from '@/ui/monobank-screen';
import { onSyncState, startSync, syncInFlight } from '@/ui/monobank-sync';
import { failureAlert } from '@/ui/failure-alert';
import { evaluateProgress } from '@/hooks/progress-ports';
import { newId } from '@/ui/id';
import { ruleTargetLabel } from '@/ui/list-management';
import { reportFailure } from '@/ui/journal';
import { currentMonth } from '@/ui/months';
import { todayIso } from '@/ui/dates';
import { netWorthWidgetModel } from '@/ui/net-worth';
import { PICKER_SIZE } from '@/ui/shortlist';
import { ONLY_UNCATEGORISED } from '@/ui/transaction-search';
import { onCapturesStored } from '@/ui/notification-drain';
import { firstRun } from '@/ui/onboarding';
import { offersTransferMark, recategorise } from '@/ui/retype';
import {
  accountsById,
  feedSubtitle,
  feedTitle,
  overLimitByMonth,
  transactionLine,
} from '@/ui/transaction-line';

import { Spacing, TouchTarget } from '@/constants/theme';

/**
 * Головний — the daily dashboard the app opens on: the compact header, this month's витрачено,
 * the latest п'ять транзакції with an optional «Без категорії» banner, and up to two collapsed
 * operational rows (pending чернетки, an actionable sync failure). Recording is behind the «+»
 * over the bottom-right corner, on its own screen (`transaction/new.tsx`).
 *
 * Everything the screen says is decided in `src/ui` and under `verify` — `homeViewModel` decides
 * the month status and the compact alerts, `draftLines` what a чернетка reads as, `transactionLine`
 * what a feed row reads and whether it is «Без категорії». This file is the wiring. See
 * design.md §6 and this change's design §D1, §D3, §D5, §D6.
 */

/** How many транзакції the стрічка shows. The rest are one tap away, in «Транзакції». */
const FEED_SIZE = 5;

/**
 * How far back the categorising picker reads what the owner reached for last. The стрічка above it
 * is five lines — too few to learn anything from — so recency gets its own bounded read, the same
 * one «Нова транзакція» makes, and the same rule: read, never counted, never stored.
 */
const RECENT_WINDOW = 50;

/**
 * Whether this launch has already been handed to «Перші кроки». Module state on purpose: the
 * redirect is about *launching* on a device that holds nothing, and once the owner has left the
 * checklist nothing may pull them back into it for the rest of the session — leaving it is always
 * allowed, and «Перші кроки» stays in Налаштування.
 */
let landedOnSetup = false;

/**
 * What answering a чернетка needs. A module constant because none of it depends on the screen's
 * state: the правила are re-read at the moment of confirmation (so one created since the чернетка
 * appeared is honoured), and everything the answer decides lives in `src/ui/drafts-section.ts`.
 */
const DRAFT_PORTS = {
  storage: notificationsRepo,
  rules: () => rulesRepo.list(),
  newId,
  now: () => new Date(),
};

export default function MainScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const accounts = accountsRepo.list();
      const now = new Date();
      const month = currentMonth(now);
      const today = todayIso(now);
      return {
        month,
        today,
        accounts,
        // The розрахунковий баланс of each рахунок — computed from транзакції, never stored —
        // still decides whether an unarchived one exists at all, for the invitation below.
        balances: new Map(
          accounts.map((a) => [a.id, computeBalance(a, transactionsRepo.listByAccount(a.id))]),
        ),
        // The month behind the status: the same bounded read Місяць does for the same month.
        monthTransactions: transactionsRepo.listMonth(month),
        // Статок's current reading needs every transaction, not just this month's — the same
        // total volume `balances` above already reads, just combined into one list.
        allTransactions: transactionsRepo.listAll(),
        investmentValues: investmentsRepo.all(),
        // Статок's bounded history reads — O(accounts x months), never O(transactions).
        netWorthMonthly: netWorthRepo.monthlyMovement(today),
        netWorthFirstDates: netWorthRepo.firstDates(today),
        netWorthFirstDateMovement: netWorthRepo.firstDateMovement(today),
        netWorthFutureRecords: netWorthRepo.accountsWithFutureRecords(today),
        rates: ratesRepo.all(),
        feed: transactionsRepo.listLatest(FEED_SIZE),
        // Deeper than the стрічка, and for one purpose: the категорії the picker offers first.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
        // Everything stored that still carries «Без категорії» — counted, not listed.
        uncategorised: transactionsRepo.countUncategorised(),
        // Every row, archived included: pickers filter, but a feed line still shows the name of a
        // category that has since been archived.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        limits: limitsRepo.list(),
        // What the drain has left for the owner to answer. Pending ones only — a confirmed or
        // dismissed чернетка is deleted, so this is never a growing archive.
        drafts: notificationsRepo.pendingDrafts(),
        // How fresh the bank data is: the links carry the moment each last completed a sync, and
        // the attempt says how the last run went. Two local reads, beside the others.
        links: monobankRepo.listLinks(),
        attempt: monobankRepo.attempt(),
      };
    }, []),
  );

  // The «≈ … грн» beside the money held; its absence changes nothing else on the screen.
  useCurrentRates(reload);

  /**
   * Whether a monobank token is kept — the one thing about the connection this screen cannot read
   * synchronously, because it lives in the device's secure storage.
   *
   * It decides only whether the freshness line exists at all: an owner who never connected a bank
   * is told nothing about one, and one who removed their token sees the line stop rather than age
   * silently. Read on focus like everything else here, and `undefined` until the first read
   * answers, which draws no line rather than a wrong one.
   */
  const [configured, setConfigured] = useState<boolean>();
  useFocusEffect(
    useCallback(() => {
      const { token, cancel } = makeCancelToken();
      void monobankTokenStore.read().then((read) => {
        if (!token.cancelled()) {
          setConfigured(read.kind === 'ok' && Boolean(read.token));
        }
      });
      return cancel;
    }, []),
  );

  /**
   * Whether a sync is going on, whoever started it — the app opening, a return to the foreground,
   * the pull below, or «Синхронізувати» on the monobank screen.
   *
   * Subscribed rather than read during render: a run that *begins* while Головний is already open
   * has to reach the line, and neither opening the app nor coming back to it is a navigation
   * focus. The same signal reloads what the screen shows, so транзакції a run imported appear
   * without the owner leaving it.
   */
  const [syncing, setSyncing] = useState(() => syncInFlight());
  useEffect(
    () =>
      onSyncState(() => {
        setSyncing(syncInFlight());
        reload();
      }),
    [reload],
  );

  /**
   * Pulling down: re-read everything, and ask monobank for anything new.
   *
   * A run the owner asked for, so the quiet interval does not apply: `syncDue` is asked only by
   * the trigger in the app shell, and nothing on this path consults it. With no token or no link it re-reads storage, sends nothing and refuses
   * nothing; with a run already going on `startSync` waits for that one instead of starting a
   * second, which is what keeps the spinner honest.
   */
  const [pulling, setPulling] = useState(false);
  const pull = useCallback(async (): Promise<void> => {
    setPulling(true);
    try {
      reload();
      await manualRefresh({
        configured: configured === true,
        linkedCount: stored.links.length,
        startSync: async () => {
          const run = newId();
          await startSync({
            // The жест is a run the owner asked for — the same division the тихий інтервал draws,
            // and «Pulling down on Головний refreshes it and syncs monobank now» is where it is
            // drawn — so it asks the bank for client-info rather than reusing the answer this
            // phone holds. A refresh that answered «now» with balances up to an hour old would
            // not be a refresh.
            sync: syncPorts({ asked: true }, run),
            attempts: monobankRepo,
            alerts: ALERT_PORTS,
            run,
            // `attended()` and not a hardcoded `true`, unlike the run the app shell starts: a
            // pull can begin a first sync that takes minutes, and the owner who started it may
            // well have put the phone down. Read at the moment of the failure, like every other
            // caller.
            attended: attended(),
          });
          // The sync committed, or it did not; either way the зведення is read once and only
          // what is newly true is earned.
          evaluateProgress();
          reload();
        },
      });
    } finally {
      setPulling(false);
    }
  }, [configured, reload, stored.links.length]);

  /**
   * Opening Головний again shows it from its top — the month's status. Restoring the scroll
   * position drops the owner who came back to read the month into the middle of the стрічка.
   * Scrolling within the screen is untouched: this fires on focus and on nothing else, and what
   * the стрічка holds is not touched at all.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  /**
   * The «Не вдалося зберегти транзакцію» сповіщення leads here (`src/reminders/notices.ts`), so
   * opening Головний clears it (design D6) — the recording itself now happens one screen further
   * on, and that screen raises and clears the same сповіщення around its own store. It is also
   * where a tapped нагадування lands.
   */
  useClearAlertOnOpen('local-save');

  /**
   * A device with no рахунок and no транзакція is a device on which this screen can do nothing —
   * the entry form refuses every entry without a рахунок. So the first launch of such a device
   * opens on «Перші кроки» instead. Once anything exists, or once the owner has left the
   * checklist, this never fires again.
   */
  const setupNeeded = firstRun({
    accounts: stored.accounts.length,
    transactions: stored.feed.length,
  });
  useEffect(() => {
    if (landedOnSetup || !setupNeeded) {
      return;
    }
    landedOnSetup = true;
    router.replace('/onboarding');
  }, [router, setupNeeded]);

  /**
   * The drain runs in the app shell, on opening and on every return to the foreground — neither of
   * which is a navigation focus, so `useReloadOnFocus` would not hear about the чернетка it just
   * stored. This is how a чернетка reaches the screen in the session that captured it instead of
   * waiting for the owner to leave the tab and come back.
   */
  useEffect(() => onCapturesStored(reload), [reload]);

  /**
   * The one reload trigger with no event of its own: the local calendar date moving on while
   * Головний stays open, or while the app sits backgrounded on it and is then resumed (main-screen,
   * "Rollover updates the month"). Neither is a navigation focus — nothing was pushed and nothing
   * was popped — so `useReloadOnFocus` hears about neither on its own.
   *
   * Checked two ways rather than one: the `AppState` listener catches the resume, which can land
   * on any date at all after the phone slept for a day or a week; the interval catches September 30
   * turning into October 1 while the screen was never once backgrounded. Both call the same
   * `reload()` every other trigger here calls, so a rollover the owner sees is exactly as coherent
   * as one they navigated back to.
   */
  useEffect(() => {
    const rolledOver = () => {
      if (hasDateRolledOver(stored.today, new Date())) {
        reload();
      }
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        rolledOver();
      }
    });
    // Coarse on purpose: a month card that is at most a minute late past midnight costs nothing
    // an owner sitting on Головний at that exact moment would notice, and a shorter interval
    // would only spend battery checking a date that changes once a day.
    const interval = setInterval(rolledOver, 60000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [reload, stored.today]);

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const accountNames = useMemo(() => namesById(stored.accounts), [stored.accounts]);
  // The джерела by id too: an imported дохід carries «Без джерела», and the стрічка has to name it.
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  /**
   * What the categorising picker offers: every unarchived категорія except «Без категорії», which
   * is what the line is being moved away from.
   */
  const categoryRows = useMemo(
    () =>
      expenseCategoryChoices(stored.categories).filter((c) => c.id !== UNCATEGORISED_CATEGORY_ID),
    [stored.categories],
  );
  /**
   * One more than a picker draws, deliberately. This screen's picker is the one place «Без
   * категорії» is not offered — it is what the line is being moved off — and it is also the
   * likeliest head of the recents on a phone full of imported витрати. Capped at five before that
   * filter, the picker would routinely get four real recents and an alphabetical top-up.
   */
  const recent = useMemo(() => recentlyUsed(stored.latest, PICKER_SIZE + 1), [stored.latest]);

  /** The pending чернетки as lines; an empty list is no block at all, not an empty state. */
  const drafts = useMemo(
    () =>
      draftLines({
        drafts: stored.drafts,
        accounts: stored.accounts,
        sourceNames,
      }),
    [sourceNames, stored.accounts, stored.drafts],
  );
  /** Collapsed by default (main-screen, "Operational alerts remain compact and actionable"). */
  const [draftsExpanded, setDraftsExpanded] = useState(false);

  /**
   * How much of the bank has synced, and how old the whole of it is — `syncCoverage`'s own answer,
   * read here and passed into the view model whole. The monobank screen reads the same one, which
   * is what keeps the two lines from ever saying different things.
   *
   * Only a completed account carries a moment, so a failed run leaves this exactly where it was.
   */
  const coverage = useMemo(() => syncCoverage(stored.links), [stored.links]);

  /**
   * Everything the screen says about the month, the money held and what is waiting. No number is
   * computed here: `homeViewModel` reads `monthlyPicture` and `accountTotals`, which are the same
   * calculations Місяць and Рахунки read.
   */
  const model = useMemo(
    () =>
      homeViewModel({
        month: stored.month,
        accounts: stored.accounts,
        transactions: stored.monthTransactions,
        balances: stored.balances,
        rates: stored.rates,
        uncategorised: stored.uncategorised,
        pendingDrafts: drafts.length,
        monobank: {
          configured: configured === true,
          linked: coverage.linked,
          synced: coverage.synced,
          // Present only when every linked рахунок has synced — the age of the whole picture,
          // which is the same moment the monobank screen names, in shorter words.
          ...(coverage.oldestCompletedMs === undefined
            ? {}
            : { oldestCompletedAtMs: coverage.oldestCompletedMs }),
          syncing,
          ...(stored.attempt ? { attempt: stored.attempt } : {}),
        },
        now: new Date(),
      }),
    [configured, coverage, drafts.length, stored, syncing],
  );

  /**
   * Which categories are over their ліміт, per month of the loaded стрічка. The стрічка holds the
   * latest транзакції, not whole months, so each month it touches — one or two, typically — is
   * read in full for its breakdown. `overLimitByMonth` decides everything; this is the read it
   * needs.
   */
  const overLimit = useMemo(
    () =>
      overLimitByMonth({
        feed: stored.feed,
        limits: stored.limits,
        monthTransactions: (month) => transactionsRepo.listMonth(month),
      }),
    [stored.feed, stored.limits],
  );

  /** «Топ категорій витрат»: the same місячна breakdown, ranked and currency-selected. */
  const [requestedCategoryCurrency, setRequestedCategoryCurrency] = useState<string>();
  const categories = useMemo(
    () =>
      categoryPresentation({
        month: stored.month,
        transactions: stored.monthTransactions,
        categoryNames,
        ...(requestedCategoryCurrency ? { requestedCurrency: requestedCategoryCurrency } : {}),
      }),
    [categoryNames, requestedCategoryCurrency, stored.month, stored.monthTransactions],
  );

  /** «Статок»: current values, history and the change line — assembled in one tested function. */
  const [requestedHistoryCurrency, setRequestedHistoryCurrency] = useState<string>();
  const netWorth = useMemo(
    () =>
      netWorthWidgetModel({
        accounts: stored.accounts,
        transactions: stored.allTransactions,
        currentValues: stored.investmentValues,
        monthlyMovement: stored.netWorthMonthly,
        firstDates: stored.netWorthFirstDates,
        firstDateMovement: stored.netWorthFirstDateMovement,
        accountsWithFutureRecords: stored.netWorthFutureRecords,
        rates: stored.rates,
        ...(requestedHistoryCurrency ? { requestedHistoryCurrency } : {}),
        now: new Date(),
        today: stored.today,
      }),
    [
      requestedHistoryCurrency,
      stored.accounts,
      stored.allTransactions,
      stored.investmentValues,
      stored.netWorthFirstDateMovement,
      stored.netWorthFirstDates,
      stored.netWorthFutureRecords,
      stored.netWorthMonthly,
      stored.rates,
      stored.today,
    ],
  );

  /** The «Без категорії» line whose one-tap picker is open, if any. */
  const [categorising, setCategorising] = useState<string>();
  /**
   * Whether that picker has its full list open. One boolean, because only one line categorises at
   * a time — and it is held here so the phone's «назад» closes the list before leaving Головний.
   */
  const [categoryListOpen, setCategoryListOpen] = useState(false);
  const closeCategoryList = useCallback(() => setCategoryListOpen(false), []);
  // Both halves, because Головний is the tab where «назад» exits the app: the flag has to mean
  // "a full list is on the screen right now", and `categorising` can go stale over a reload while
  // `categoryListOpen` stays true.
  useCloseOnBack(categorising !== undefined && categoryListOpen, closeCategoryList);

  /** The offer to remember today's tap as a правило — raised only after the категорія is stored. */
  const ruleOffer = useRuleOffer(reportBug);

  /** One tap from the стрічка: the same transaction under the same id, now carrying the pick. */
  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        // A транзакція was recorded — one of the named moments the прогрес is evaluated at. It is
        // the storing that evaluates, never the drawing.
        evaluateProgress();
        setCategorising(undefined);
        reload();
        // The категорія is already stored, never lost by a dismissed offer (design D5).
        if (t.type === 'expense' || t.type === 'refund') {
          ruleOffer.raise({ description: t.description, target: { kind: 'category', categoryId: picked } });
        }
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'transaction-recategorise', error, report: reportBug }),
        );
      }
    },
    [reload, reportBug, ruleOffer],
  );

  /** What the owner has typed as the сума of a raw чернетка, per чернетка. */
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});

  const settleDraft = useCallback(
    (draftId: string, answer: DraftAnswer) => {
      if (answer.kind === 'amount-required' || answer.kind === 'rejected') {
        // Nothing was stored and the чернетка still awaits — the parser's own words say why, and
        // they go into the журнал as the failure they are, offer to report included.
        Alert.alert(
          ...failureAlert({ title: 'Не підтверджено', where: 'draft-confirm', error: answer.message, report: reportBug }),
        );
        return;
      }
      setDraftAmounts(({ [draftId]: _answered, ...rest }) => rest);
      // A чернетка was confirmed or dismissed: confirming one stores a транзакція.
      evaluateProgress();
      reload();
    },
    [reload, reportBug],
  );

  const confirmDraftLine = useCallback(
    (draftId: string, needsAmount: boolean) => {
      const draft = stored.drafts.find((pending) => pending.id === draftId);
      if (!draft) {
        return;
      }
      try {
        settleDraft(
          draftId,
          confirmPendingDraft(
            draft,
            DRAFT_PORTS,
            needsAmount ? draftAmounts[draftId] : undefined,
          ),
        );
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не підтверджено', where: 'draft-confirm', error, report: reportBug }),
        );
        void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
      }
    },
    [draftAmounts, reportBug, settleDraft, stored.drafts],
  );

  const dismissDraftLine = useCallback(
    (line: (typeof drafts)[number]) => {
      const draft = stored.drafts.find((pending) => pending.id === line.id);
      if (!draft) {
        return;
      }
      // The same confirmed gesture deletion uses everywhere else in the app.
      Alert.alert('Чернетка', dismissConfirmation(line), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Відхилити',
          style: 'destructive',
          onPress: () => {
            try {
              settleDraft(line.id, dismissPendingDraft(draft, DRAFT_PORTS));
            } catch (error) {
              Alert.alert(
                ...failureAlert({ title: 'Не відхилено', where: 'draft-dismiss', error, report: reportBug }),
              );
            }
          },
        },
      ]);
    },
    [reportBug, settleDraft, stored.drafts],
  );

  return (
    <Screen
      scrollRef={scrollRef}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => {
            // A run that throws outright is journaled and goes no further: an unhandled rejection
            // out of a gesture handler is a red box the owner can do nothing with.
            pull().catch((thrown: unknown) => {
              reportFailure('monobank-sync', thrown);
            });
          }}
        />
      }
      overlay={<Fab onPress={() => router.push('/transaction/new')} />}>
      {/* The app's own name, not the tab's — the tab bar below already says which screen this is,
          and the reference reads as a product rather than as a form because of it. */}
      <View style={styles.brand}>
        <Wordmark />
      </View>

      {/* The compact header: how fresh the bank data is, and the same manual sync both the
          pull gesture and this button reach through `manualRefresh` (main-screen, "Sync
          occupies a compact header"). Absent entirely for an owner with no monobank. */}
      {model.monobank ? (
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textMuted">
            {model.monobank.freshness}
          </ThemedText>
          <Pressable
            onPress={() =>
              pull().catch((thrown: unknown) => {
                reportFailure('monobank-sync', thrown);
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Синхронізувати"
            style={styles.syncButton}>
            <ThemedText type="link" themeColor="accent">
              Оновити
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* The month first, and it is the screen's figure: what it has cost. The same numbers
          Місяць shows for the same month, which is where the card leads. */}
      <Pressable onPress={() => router.push(currentMonthRoute(new Date()))} accessibilityRole="button">
        <Card style={styles.status}>
          <CardGlow />
          <View style={styles.statusHead}>
            <ThemedText type="overline">{model.status.title}</ThemedText>
            <Chevron />
          </View>
          {model.status.emptyMessage ? (
            <ThemedText themeColor="textSecondary">{model.status.emptyMessage}</ThemedText>
          ) : (
            // One line, shrunk rather than wrapped: two currencies must not push the figure into
            // a second row and the card into a different height.
            <ThemedText type="title" tabular numberOfLines={1} adjustsFontSizeToFit>
              {model.status.spent}
            </ThemedText>
          )}
        </Card>
      </Pressable>

      {/* Nothing to record on: the invitation stays on Головний, and the latest транзакції below
          still show whatever is stored. */}
      {model.held === null ? (
        <Card>
          <ThemedText>Спершу створіть рахунок — без нього нічого записати.</ThemedText>
          <Action title="До Рахунків" onPress={() => router.push('/accounts')} />
        </Card>
      ) : null}

      {/* The uncategorised banner: a compact actionable row, counted over everything stored,
          absent entirely at zero — no heading, no reserved space (main-screen, "Uncategorised
          records are a compact feed banner"). */}
      {model.alerts.uncategorisedBanner ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/transactions', params: { only: ONLY_UNCATEGORISED } })
          }
          accessibilityRole="button">
          <Card style={styles.attentionRow}>
            <ThemedText numberOfLines={2} style={styles.attentionLabel}>
              {model.alerts.uncategorisedBanner}
            </ThemedText>
            <Chevron />
          </Card>
        </Pressable>
      ) : null}

      {/* The section says what it is — the latest only — and offers the whole history beside it.
          The offer does not depend on having a long one: search is where the owner goes to look
          for something, not a reward for having recorded enough. */}
      <SectionLabel
        note={`останні ${FEED_SIZE}`}
        action={{ label: 'Усі ›', onPress: () => router.push('/transactions') }}>
        Останні транзакції
      </SectionLabel>
      {stored.feed.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки нічого не записано.
        </ThemedText>
      ) : (
        <ListCard>
          {stored.feed.map((t, index) => {
            const line = transactionLine(t, byId, categoryNames, sourceNames, overLimit);
            return (
              <ListRow key={line.id} last={index === stored.feed.length - 1} style={styles.row}>
                <Pressable onPress={() => router.push(`/transaction/${line.id}`)}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowLabel}>
                      <View style={styles.rowTitle}>
                        {/* The mark, not a repainted row: what is uncategorised is the label. */}
                        {line.uncategorised ? <Mark /> : null}
                        {/* The category over its ліміт for this транзакція's month turns red, and
                            nothing else on the line changes. */}
                        <ThemedText
                          numberOfLines={1}
                          themeColor={line.overLimit ? 'textDanger' : undefined}
                        >
                          {feedTitle(line)}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {feedSubtitle(line)}
                      </ThemedText>
                      {/* The bank's own text, on its own line: what an uncategorised «СІЛЬПО Київ»
                          actually was, before the owner has said. A manual транзакція has none and
                          gets no empty row. */}
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
                      }
                    >
                      {line.amount}
                    </ThemedText>
                  </View>
                </Pressable>

                {/* The one tap behind the mark: picking here stores the category on the
                    transaction without the editing screen ever opening. Beside it, «Це переказ»
                    opens editing already switched to переказ — a витрата only (design D7). */}
                {line.uncategorised ? (
                  <View style={styles.rowActions}>
                    <RowAction
                      title={categorising === line.id ? 'Згорнути' : 'Обрати категорію'}
                      onPress={() => {
                        setCategorising(categorising === line.id ? undefined : line.id);
                        setCategoryListOpen(false);
                      }}
                    />
                    {offersTransferMark(t) ? (
                      <RowAction
                        title="Це переказ"
                        onPress={() => router.push(`/transaction/${line.id}?as=transfer`)}
                      />
                    ) : null}
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
      )}
      {/* At most two collapsed operational rows: the pending чернетки (count only, expanding in
          place to the existing confirm/dismiss surface) and an actionable sync failure. Neither,
          and nothing here renders at all (main-screen, "Operational alerts remain compact and
          actionable"). */}
      {model.alerts.draftCount > 0 || model.alerts.failureRow ? (
        <Card style={styles.attention}>
          {model.alerts.draftCount > 0 ? (
            <Pressable
              onPress={() => setDraftsExpanded((expanded) => !expanded)}
              accessibilityRole="button"
              style={styles.attentionRow}>
              <ThemedText numberOfLines={2} style={styles.attentionLabel}>
                {model.alerts.draftLabel}
              </ThemedText>
              <Chevron />
            </Pressable>
          ) : null}
          {model.alerts.failureRow ? (
            <View>
              {model.alerts.draftCount > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => router.push('/manage/monobank')}
                accessibilityRole="button"
                style={styles.attentionRow}>
                <ThemedText numberOfLines={2} style={styles.attentionLabel}>
                  {model.alerts.failureRow}
                </ThemedText>
                <ThemedText type="link" themeColor="accent">
                  Відкрити
                </ThemedText>
                <Chevron />
              </Pressable>
            </View>
          ) : null}
        </Card>
      ) : null}

      {draftsExpanded && drafts.length > 0 ? (
        <ListCard>
          {drafts.map((line, index) => (
            <ListRow key={line.id} last={index === drafts.length - 1} style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.rowLabel}>
                  <ThemedText numberOfLines={1}>{line.proposal}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`${line.accountName} · ${line.date}`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {line.text}
                  </ThemedText>
                  {/* The foreign сума the notification named: information, never a proposal. */}
                  {line.original ? (
                    <ThemedText type="small" themeColor="textMuted">
                      {line.original}
                    </ThemedText>
                  ) : null}
                </View>
                {line.amount ? (
                  <ThemedText tabular style={styles.amount}>
                    {line.amount}
                  </ThemedText>
                ) : null}
              </View>

              {/* A raw чернетка has no сума of its own; it confirms only with one the owner
                  supplies, in the рахунок's currency and under the manual-entry rules. */}
              {line.needsAmount ? (
                <Field
                  label="Сума"
                  value={draftAmounts[line.id] ?? ''}
                  onChangeText={(typed: string) =>
                    setDraftAmounts((current) => ({ ...current, [line.id]: typed }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  hint={line.currency}
                />
              ) : null}

              <View style={styles.rowActions}>
                <RowAction
                  title="Підтвердити"
                  onPress={() => confirmDraftLine(line.id, line.needsAmount)}
                />
                <RowAction title="Відхилити" onPress={() => dismissDraftLine(line)} />
              </View>
            </ListRow>
          ))}
        </ListCard>
      ) : null}

      {/* «Топ категорій витрат»: the same signed monthly breakdown Місяць's own drill-down
          shows, ranked and currency-selected (main-screen, "Top categories read the same signed
          monthly breakdown"). Currency selection never narrows what a row's own detail shows. */}
      <CategoryWidget
        presentation={categories}
        onSelectCurrency={setRequestedCategoryCurrency}
        onOpenCategory={(categoryId) => router.push(categoryMonthRoute(categoryId, new Date()))}
        onOpenRemainder={() => router.push(remainderRoute(new Date()))}
      />

      {/* «Статок»: a derived reading of every recorded рахунок, not a new balance (net-worth,
          "Статок is a reading of existing account contributions"). */}
      <NetWorthWidget
        model={netWorth}
        onSelectHistoryCurrency={setRequestedHistoryCurrency}
        onOpenAccounts={() => router.push('/accounts')}
      />

      <RuleOfferSheet
        offer={ruleOffer.offer}
        targetLabel={
          ruleOffer.offer ? ruleTargetLabel(ruleOffer.offer.target, categoryNames, accountNames) : ''
        }
        onAccept={ruleOffer.accept}
        onDecline={ruleOffer.decline}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.one },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
  },
  // A tap target as wide as it is tall, never smaller than the shared minimum — text alone would
  // shrink it well under that on a short label like «Оновити».
  syncButton: { minHeight: TouchTarget, minWidth: TouchTarget, alignItems: 'center', justifyContent: 'center' },
  // Clipped, so the accent rings behind the figure end at the card's own corner.
  status: { gap: Spacing.two + Spacing.half, overflow: 'hidden' },
  statusHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // A card holding one short line does not need a card's full padding around it.
  attention: { gap: Spacing.two, paddingVertical: Spacing.three },
  attentionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two - Spacing.half,
  },
  attentionLabel: { flex: 1 },
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowLabel: { flex: 1, gap: Spacing.half },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - Spacing.half },
  rowActions: { flexDirection: 'row' },
  amount: { fontWeight: 600 },
});
