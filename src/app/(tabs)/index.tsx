import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';

import { Appear, ChangingFigure, Reflow, TabFade, Tap } from '@/components/motion';
import { Action, Field, Picker, RowAction } from '@/components/form';
import { RuleOfferSheet } from '@/components/rule-offer-sheet';
import { TransactionRow } from '@/components/transaction-row';
import {
  Card,
  CardGlow,
  Chevron,
  Divider,
  Fab,
  ListCard,
  ListRow,
  Screen,
  SectionLabel,
  Wordmark,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  categories as categoriesRepo,
  dashboardLayout as dashboardLayoutRepo,
  investments as investmentsRepo,
  limits as limitsRepo,
  merchants as merchantsRepo,
  monobank as monobankRepo,
  netWorth as netWorthRepo,
  notifications as notificationsRepo,
  rates as ratesRepo,
  categorisationContext,
  sources as sourcesRepo,
  storedHistory,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { resolveCategory } from '@/domain/rules';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useHaptics } from '@/hooks/haptics-ports';
import { useNetWorthSelection } from '@/hooks/net-worth-selection';
import { useTheme } from '@/hooks/use-theme';
import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { syncOutcomeEvent } from '@/ui/haptics';
import { syncEvent } from '@/ui/read-policy';
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
  type DraftLine,
} from '@/ui/drafts-section';
import { expenseCategoryChoices, recentlyUsed, sourceChoices } from '@/ui/category-choices';
import { CategoryWidget } from '@/components/category-widget';
import { NetWorthWidget } from '@/components/net-worth-widget';
import { ObservationsWidget } from '@/components/observations-widget';
import {
  answerNotDuplicate,
  currentObservations,
  deleteOneOfDuplicate,
  forgetNotDuplicate,
} from '@/hooks/observations-reads';
import { homeDashboardReadPlan } from '@/ui/home-dashboard';
import { categoryMonthRoute, currentMonthRoute, remainderRoute } from '@/ui/home-navigation';
import { categoryPresentation } from '@/ui/home-categories';
import { hasDateRolledOver, makeCancelToken } from '@/ui/home-data';
import { manualRefresh } from '@/ui/home-refresh';
import { homeViewModel } from '@/ui/home-screen';
import { bankCoverage } from '@/ui/monobank-screen';
import { onSyncState, startSync, syncInFlight } from '@/ui/monobank-sync';
import { failureAlert, refusalAlert } from '@/ui/failure-alert';
import { judgeProgressLater, onProgressJudged, progressScreenData } from '@/hooks/progress-ports';
import {
  PROGRESS_ROUTE,
  progressViewModel,
  progressWidgetPreview,
  unseenAchievementsBadge,
} from '@/ui/progress-screen';
import { newId } from '@/ui/id';
import type { DashboardWidgetId } from '@/dashboard/layout';
import { reportFailure } from '@/ui/journal';
import { currentMonth } from '@/ui/months';
import { todayIso } from '@/ui/dates';
import { netWorthWidgetModel } from '@/ui/net-worth';
import { observationsWidgetModel } from '@/ui/observations';
import { PICKER_SIZE } from '@/ui/shortlist';
import { ONLY_UNCATEGORISED } from '@/ui/transaction-search';
import { onCapturesStored } from '@/ui/notification-drain';
import { firstRun } from '@/ui/onboarding';
import { assignSource, offersTransferMark, recategorise } from '@/ui/retype';
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
  categorisation: categorisationContext,
  newId,
  now: () => new Date(),
};

function MainScreen() {
  const router = useRouter();
  const haptics = useHaptics();
  const theme = useTheme();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload, reloadWhenSeen] = useReloadOnFocus(
    useCallback(() => {
      // The whole stored history, read at most once per change stamp (app-speed-pass design D1):
      // every balance, Статок, the month, the стрічка and the ліміти below are cut from this one
      // answer, and a return with nothing written in between reads none of it again.
      const history = storedHistory.read();
      const accounts = history.accounts;
      const now = new Date();
      const month = currentMonth(now);
      const today = todayIso(now);

      // The layout is read first, synchronously — SQLite allows it — so every read below it is
      // conditional on what it says. A hidden widget therefore costs its dedicated read nothing,
      // and a newly introduced one is simply not among `plan.visibleIds` yet (design D6).
      const layout = dashboardLayoutRepo.read();
      const plan = homeDashboardReadPlan(layout.items);
      // The latest транзакції, newest first — the head of the history, already in the latest
      // listing's order, so the стрічка is its first five without a second read.
      const latest = plan.needsFeed ? history.transactions.slice(0, RECENT_WINDOW) : [];

      return {
        month,
        today,
        plan,
        layoutDiagnostic: layout.diagnostic,
        accounts,
        // The розрахунковий баланс of each рахунок — computed from транзакції, never stored —
        // still decides whether an unarchived one exists at all, for the invitation below. Not
        // gated by any widget: the invitation is fixed, not a widget (design D5).
        balances: history.balances(),
        // The month behind «Витрачено» and «Топ категорій» — the same bounded read Місяць does
        // for the same month, shared by both widgets and read once between them.
        monthTransactions: plan.needsMonthTransactions ? (history.byMonth().get(month) ?? []) : [],
        // Статок's current reading needs every transaction ever recorded — the same read the
        // balances above already made.
        allTransactions: plan.needsNetWorth ? history.transactions : [],
        investmentValues: plan.needsNetWorth ? investmentsRepo.all() : new Map(),
        // Статок's bounded history reads — O(accounts x months), never O(transactions).
        netWorthMonthly: plan.needsNetWorth ? netWorthRepo.monthlyMovement(today) : [],
        netWorthFirstDates: plan.needsNetWorth ? netWorthRepo.firstDates(today) : [],
        netWorthFirstDateMovement: plan.needsNetWorth ? netWorthRepo.firstDateMovement(today) : [],
        netWorthFutureRecords: plan.needsNetWorth
          ? netWorthRepo.accountsWithFutureRecords(today)
          : new Set<string>(),
        rates: ratesRepo.all(),
        feed: latest.slice(0, FEED_SIZE),
        // Deeper than the стрічка, and for one purpose: the категорії the picker offers first.
        latest,
        // Which months are over a ліміт is judged from the same history, month by month in
        // `listMonth`'s order — never a read per month the стрічка touches.
        byMonth: history.byMonth,
        // The current month's спостереження, through the stamp memo — derived, stored nowhere — and
        // which months hold a транзакція, for the previous month's «Підсумок» row. Hidden, the
        // widget costs neither (observations design D8).
        observations: plan.needsObservations ? currentObservations(today) : [],
        activeMonths: plan.needsObservations ? new Set(history.months) : new Set<string>(),
        // The read-only прогrес reading — evaluates nothing, marks nothing seen (design D6).
        progressData: plan.needsProgress ? progressScreenData(now) : undefined,
        // Everything stored that still carries «Без категорії» — counted, not listed. Always
        // read: the banner is fixed, not a widget, and stays visible whatever is hidden.
        uncategorised: transactionsRepo.countUncategorised(),
        // Every row, archived included: pickers filter, but a feed line still shows the name of a
        // category that has since been archived.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        limits: limitsRepo.list(),
        // The продавці, so a стрічка line reads «АТБ» where its опис is recognised (design M9).
        merchants: merchantsRepo.index(),
        // What the drain has left for the owner to answer. Pending ones only — a confirmed or
        // dismissed чернетка is deleted, so this is never a growing archive.
        drafts: notificationsRepo.pendingDrafts(),
        // How fresh the bank data is: the links carry the moment each last completed a sync, and
        // the attempt says how the last run went. Two local reads, beside the others.
        links: monobankRepo.listLinks(),
        attempt: monobankRepo.attempt(),
        // Which of them the token still shows: a рахунок it stopped showing is set aside rather
        // than left to age the whole bank (monobank-sync-freshness D4). One more small local read.
        monobankAccounts: monobankRepo.rememberedAccounts(),
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
   * focus. The same signal re-reads what the screen shows once a run finishes, so транзакції a run
   * imported appear without the owner leaving it — and, while Головний is out of sight, when the
   * owner comes back to it rather than behind a pushed screen. A run *starting* has written nothing
   * and reads nothing (app-speed-pass design D4).
   */
  const [syncing, setSyncing] = useState(() => syncInFlight());
  useEffect(
    () =>
      onSyncState(() => {
        setSyncing(syncInFlight());
        if (syncEvent(syncInFlight())) reloadWhenSeen();
      }),
    [reloadWhenSeen],
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
  /**
   * The same run started by «Оновити» in the header rather than by the gesture: it shows its own
   * spinner beside the header line instead of the gesture's (motion, "A прогін shows a spinner
   * until it ends"), so neither ever shows two.
   */
  const [refreshing, setRefreshing] = useState(false);
  const pull = useCallback(async (source: 'gesture' | 'button'): Promise<void> => {
    const setBusy = source === 'gesture' ? setPulling : setRefreshing;
    setBusy(true);
    try {
      reload();
      await manualRefresh({
        configured: configured === true,
        linkedCount: stored.links.length,
        startSync: async () => {
          const run = newId();
          const started = await startSync({
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
          // A прогін the owner started that failed is felt; one stopped or postponed is not, and
          // one already running elsewhere was not started here (motion, "An outcome the owner
          // caused is felt once").
          if (started.kind !== 'already-running') {
            const event = syncOutcomeEvent(started.run);
            if (event) haptics.play(event);
          }
          // The sync committed, or it did not; either way the зведення is read once and only
          // what is newly true is earned.
          judgeProgressLater();
          // A pull can outlast the owner's stay on Головний: re-read now in sight, or on return.
          reloadWhenSeen();
        },
      });
    } finally {
      setBusy(false);
    }
  }, [configured, haptics, reload, reloadWhenSeen, stored.links.length]);

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
  useEffect(() => onCapturesStored(reloadWhenSeen), [reloadWhenSeen]);

  /**
   * A досягнення judged after a save (or a прогін) reaches this screen: at once in sight, on the
   * next focus otherwise (app-speed-pass design D5).
   */
  useEffect(() => onProgressJudged(reloadWhenSeen), [reloadWhenSeen]);

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
   *
   * Both run only while Головний is in sight: out of sight nothing on it is looked at, and its next
   * focus reads anyway (app-speed-pass design D9).
   */
  useFocusEffect(
    useCallback(() => {
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
    }, [reload, stored.today]),
  );

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const categoryIconKeys = useMemo(() => new Map(stored.categories.map((c) => [c.id, c.iconKey])), [stored.categories]);
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
  /**
   * What the «Без джерела» mark offers: every unarchived джерело but «Без джерела» itself — the
   * editing screen's own list, nothing but джерела — shortlisted from the latest доходи's джерела.
   */
  const sourceRows = useMemo(() => sourceChoices(stored.sources), [stored.sources]);

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
   * How much of the bank has synced, and how old the whole of it is — `bankCoverage`'s own answer,
   * read here and passed into the view model whole. The monobank screen reads the same one, which
   * is what keeps the two lines from ever saying different things.
   *
   * Only a completed account carries a moment, so a failed run leaves this exactly where it was.
   */
  const coverage = useMemo(
    () => bankCoverage(stored.links, stored.monobankAccounts),
    [stored.links, stored.monobankAccounts],
  );

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
          // The no-token row's дата: the oldest among the рахунки that did sync.
          ...(coverage.oldestSyncedMs === undefined
            ? {}
            : { oldestSyncedAtMs: coverage.oldestSyncedMs }),
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
        monthTransactions: (month) => stored.byMonth().get(month) ?? [],
      }),
    [stored],
  );

  /**
   * The стрічка's lines, once per read rather than on every render — typing a сума into a чернетка
   * or opening a picker redraws nothing here (app-speed-pass design D7).
   */
  const feedLines = useMemo(() => {
    const now = new Date();
    return new Map(
      stored.feed.map((t) => {
        const line = transactionLine(
          t,
          byId,
          categoryNames,
          sourceNames,
          overLimit,
          categoryIconKeys,
          stored.merchants,
        );
        return [t.id, { line, subtitle: feedSubtitle(line, now) }] as const;
      }),
    );
  }, [byId, categoryIconKeys, categoryNames, overLimit, sourceNames, stored.feed, stored.merchants]);

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

  /**
   * «Статок»: current values, history and the change line — assembled in one tested function.
   * `undefined` whenever the widget is hidden, since its dedicated reads were skipped too
   * (design D6) — there is nothing correct this could compute from an empty history it never
   * asked for.
   */
  // A currency code, or the combined «Усе ≈ грн» — shared with the «Статок» screen (design D6).
  const { history: requestedHistory } = useNetWorthSelection();
  const netWorth = useMemo(
    () =>
      stored.plan.needsNetWorth
        ? netWorthWidgetModel({
            accounts: stored.accounts,
            transactions: stored.allTransactions,
            balances: stored.balances,
            currentValues: stored.investmentValues,
            monthlyMovement: stored.netWorthMonthly,
            firstDates: stored.netWorthFirstDates,
            firstDateMovement: stored.netWorthFirstDateMovement,
            accountsWithFutureRecords: stored.netWorthFutureRecords,
            rates: stored.rates,
            ...(requestedHistory ? { requestedHistory } : {}),
            now: new Date(),
            today: stored.today,
          })
        : undefined,
    [
      requestedHistory,
      stored.accounts,
      stored.allTransactions,
      stored.balances,
      stored.investmentValues,
      stored.netWorthFirstDateMovement,
      stored.netWorthFirstDates,
      stored.netWorthFutureRecords,
      stored.netWorthMonthly,
      stored.plan.needsNetWorth,
      stored.rates,
      stored.today,
    ],
  );

  /** «Спостереження»: the first three of the current month's, and the previous month's підсумок. */
  const observations = useMemo(
    () =>
      stored.plan.needsObservations
        ? observationsWidgetModel({
            observations: stored.observations,
            today: stored.today,
            activeMonths: stored.activeMonths,
            names: {
              categoryNames,
              accountNames: new Map(stored.accounts.map((a) => [a.id, a.name])),
              now: new Date(),
            },
          })
        : undefined,
    [categoryNames, stored.accounts, stored.activeMonths, stored.observations, stored.plan.needsObservations, stored.today],
  );

  /**
   * «Прогрес»: the same quiet badge «Звіти» shows, and at most one leading row from the already
   * ordered sections — read-only, exactly like the full screen's own reading (design D6).
   * `undefined` whenever the widget is hidden, since `stored.progressData` was never read.
   */
  const progressPreview = useMemo(() => {
    if (!stored.progressData) {
      return undefined;
    }
    const data = stored.progressData;
    const model = progressViewModel({
      candidates: data.candidates,
      earned: data.earned,
      offered: data.offered,
      accepted: data.accepted,
      dismissed: data.dismissed,
      hasHistory: data.hasHistory,
      now: new Date(),
    });
    return progressWidgetPreview(model, unseenAchievementsBadge(data.earned, data.candidates));
  }, [stored.progressData]);

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

  /** The «Без джерела» дохід whose one-tap джерело picker is open, if any — and its full list. */
  const [sourcing, setSourcing] = useState<string>();
  const [sourceListOpen, setSourceListOpen] = useState(false);
  const closeSourceList = useCallback(() => setSourceListOpen(false), []);
  useCloseOnBack(sourcing !== undefined && sourceListOpen, closeSourceList);

  /** The offer to remember today's tap as a правило — raised only after the категорія is stored. */
  const ruleOffer = useRuleOffer(reportBug);

  /** One tap from the стрічка: the same transaction under the same id, now carrying the pick. */
  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        // A транзакція was recorded — one of the named moments the прогрес is evaluated at. It is
        // the storing that evaluates, never the drawing.
        judgeProgressLater();
        // Stored, and felt as a store: the chip's own tick in the same tap gives way to it.
        haptics.play('stored');
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
    [haptics, reload, reportBug, ruleOffer],
  );

  /**
   * One tap behind the «Без джерела» mark: the same дохід under the same id, now carrying the pick
   * — the editing screen's plain save of a дохід, without editing ever opening. A джерело is not a
   * категорія: no правило is offered for it.
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
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'transaction-source', error, report: reportBug }),
        );
      }
    },
    [haptics, reload, reportBug],
  );

  const settleDraft = useCallback(
    (draftId: string, answer: DraftAnswer) => {
      if (answer.kind === 'amount-required' || answer.kind === 'rejected') {
        // Nothing was stored and the чернетка still awaits — the parser's own words say why. A
        // missing or mistyped сума is the owner's to fix, so it is a refusal: journaled like any
        // other, but with «Зрозуміло» alone and no offer to report a bug that is not one.
        Alert.alert(
          ...refusalAlert({ title: 'Не підтверджено', where: 'draft-confirm', message: answer.message }),
        );
        return;
      }
      // A чернетка was confirmed or dismissed: confirming one stores a транзакція.
      judgeProgressLater();
      reload();
    },
    [reload],
  );

  const confirmDraftLine = useCallback(
    (draftId: string, typedAmount: string | undefined) => {
      const draft = stored.drafts.find((pending) => pending.id === draftId);
      if (!draft) {
        return;
      }
      try {
        const answer = confirmPendingDraft(draft, DRAFT_PORTS, typedAmount);
        settleDraft(draftId, answer);
        // Confirming a чернетка stores a транзакція: felt like any other store.
        if (answer.kind === 'confirmed') haptics.play('stored');
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не підтверджено', where: 'draft-confirm', error, report: reportBug }),
        );
        void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
      }
    },
    [haptics, reportBug, settleDraft, stored.drafts],
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

  /**
   * One known widget's whole content, exhaustively — adding an id to the registry without a case
   * here is a compile error (the `default` branch below), never a silently blank widget. Every
   * widget reads only what `stored` already conditionally loaded for it (design D6); nothing here
   * computes a balance, a monthly number or a досягнення of its own.
   */
  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case 'month-spent':
        return (
          <Tap
            key={id}
            onPress={() => router.push(currentMonthRoute(new Date()))}
            accessibilityRole="button">
            <Card style={styles.status}>
              <CardGlow />
              <View style={styles.statusHead}>
                <ThemedText type="overline">{model.status.title}</ThemedText>
                <Chevron />
              </View>
              {model.status.emptyMessage ? (
                <ThemedText themeColor="textSecondary">{model.status.emptyMessage}</ThemedText>
              ) : (
                // One line, shrunk rather than wrapped: two currencies must not push the figure
                // into a second row and the card into a different height.
                // One figure per currency, so only the one that changed moves.
                <View style={styles.figures}>
                  {model.status.spentFigures.map((figure, i) => (
                    <Fragment key={figure.currency}>
                      {i > 0 ? (
                        <ThemedText type="title" themeColor="textMuted">
                          {' · '}
                        </ThemedText>
                      ) : null}
                      <ChangingFigure type="title" tabular adjustsFontSizeToFit boxStyle={styles.figure}>
                        {figure.text}
                      </ChangingFigure>
                    </Fragment>
                  ))}
                </View>
              )}
            </Card>
          </Tap>
        );

      case 'latest-transactions':
        return (
          <View key={id}>
            {/* The section says what it is — the latest only — and offers the whole history
                beside it. The offer does not depend on having a long one: search is where the
                owner goes to look for something, not a reward for having recorded enough. */}
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
                  const { line, subtitle } = feedLines.get(t.id)!;
                  return (
                    // A row moves when the inline picker above it opens or closes.
                    <Reflow key={line.id}>
                      <ListRow last={index === stored.feed.length - 1} style={styles.row}>
                        <TransactionRow
                          icon={line.icon}
                          iconTone={line.iconTone}
                          marked={line.uncategorised || line.unsourced}
                          title={line.transferEnds ?? feedTitle(line)}
                          overLimit={line.overLimit}
                          titleLines={line.category === undefined && line.source === undefined ? 2 : 1}
                          subtitle={subtitle}
                          description={line.descriptionShown}
                          amount={line.amount}
                          amountTone={line.amountTone}
                          onPress={() => router.push(`/transaction/${line.id}`)}
                        />

                        {/* The one tap behind the mark: picking here stores the category on the
                            transaction without the editing screen ever opening. Beside it, «Це
                            переказ» opens editing already switched to переказ — a витрата only
                            (design D7). */}
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
                            {offersTransferMark(t) ? (
                              <RowAction
                                title="Це переказ"
                                onPress={() => {
                                  // Its picker would be stale by the time Головний is back.
                                  setCategorising(undefined);
                                  setCategoryListOpen(false);
                                  router.push(`/transaction/${line.id}?as=transfer`);
                                }}
                              />
                            ) : null}
                          </View>
                        ) : null}
                        {/* Only while the line is still «Без категорії»: the picker is keyed by id, and a line
                            retyped elsewhere (a переказ, a дохід) keeps its id — its stale picker then refused
                            the next tap with «категорію має лише витрата або повернення» (2026-09-22). */}
                        {line.uncategorised && categorising === line.id ? (
                          <Appear>
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
                              searchBelow
                            />
                          </Appear>
                        ) : null}

                        {/* The same one tap for a дохід «Без джерела»: the mark offers only джерела.
                            One that is really a повернення or a переказ is retyped from editing,
                            which tapping the line itself still opens. */}
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
                          <Appear>
                            <Picker
                              label="Джерело"
                              rows={sourceRows}
                              recentIds={recent.sources}
                              selected={undefined}
                              onSelect={(picked: string) => giveSource(t, picked)}
                              noun="sources"
                              expanded={sourceListOpen}
                              onExpandedChange={setSourceListOpen}
                              searchBelow
                            />
                          </Appear>
                        ) : null}
                      </ListRow>
                    </Reflow>
                  );
                })}
              </ListCard>
            )}
          </View>
        );

      case 'top-categories':
        return (
          // «Топ категорій витрат»: the same signed monthly breakdown Місяць's own drill-down
          // shows, ranked and currency-selected (main-screen, "Top categories read the same
          // signed monthly breakdown"). Currency selection never narrows what a row's own detail
          // shows.
          <CategoryWidget
            key={id}
            presentation={categories}
            onSelectCurrency={setRequestedCategoryCurrency}
            onOpenCategory={(categoryId) => router.push(categoryMonthRoute(categoryId, new Date()))}
            onOpenRemainder={() => router.push(remainderRoute(new Date()))}
          />
        );

      case 'observations':
        // Always defined here: computed exactly when `plan.needsObservations`. «Не дубль» is
        // stored at once and the reload re-derives the list without the pair, in place.
        return observations ? (
          <ObservationsWidget
            key={id}
            model={observations}
            onOpen={(route) => router.push(route)}
            onNotDuplicate={(pair) => {
              answerNotDuplicate(pair);
              reload();
            }}
            onUndoNotDuplicate={(pair) => {
              forgetNotDuplicate(pair);
              reload();
            }}
            onDeleteOne={(id) => {
              deleteOneOfDuplicate(id);
              reload();
            }}
          />
        ) : null;

      case 'net-worth':
        // Always defined here: `netWorth` is computed exactly when `plan.needsNetWorth`, which is
        // exactly when this id is among `plan.visibleIds`.
        return netWorth ? (
          // «Статок»: a derived reading of every recorded рахунок, not a new balance (net-worth,
          // "Статок is a reading of existing account contributions").
          <NetWorthWidget key={id} model={netWorth} onOpen={() => router.push('/net-worth')} />
        ) : null;

      case 'progress':
        return progressPreview ? (
          <Tap key={id} onPress={() => router.push(PROGRESS_ROUTE)} accessibilityRole="button">
            <Card style={styles.status}>
              <View style={styles.statusHead}>
                <ThemedText type="overline">{progressPreview.title}</ThemedText>
                <Chevron />
              </View>
              <ThemedText
                numberOfLines={progressPreview.nothingYet ? undefined : 1}
                themeColor={progressPreview.leadLabel ? undefined : 'textSecondary'}>
                {progressPreview.nothingYet ?? progressPreview.leadLabel ?? 'Поки що нічого не запропоновано.'}
              </ThemedText>
              {progressPreview.badge ? (
                <ThemedText type="small" themeColor="accent">
                  {progressPreview.badge}
                </ThemedText>
              ) : null}
            </Card>
          </Tap>
        ) : null;

      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  }

  return (
    <Screen
      scrollRef={scrollRef}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => {
            // A run that throws outright is journaled and goes no further: an unhandled rejection
            // out of a gesture handler is a red box the owner can do nothing with.
            pull('gesture').catch((thrown: unknown) => {
              reportFailure('monobank-sync', thrown);
            });
          }}
        />
      }
      overlay={<Fab onPress={() => router.push('/transaction/new')} />}>
      {/* The app's own name, not the tab's — the tab bar below already says which screen this is,
          and the reference reads as a product rather than as a form because of it. Beside it, the
          one action that opens dashboard editing: no sync, no write, just navigation (main-screen,
          "The header opens dashboard editing"). */}
      <View style={styles.brand}>
        <Wordmark />
        <Tap
          onPress={() => router.push('/manage/home-dashboard')}
          accessibilityRole="button"
          accessibilityLabel="Налаштувати Головний"
          style={styles.customiseButton}>
          <ThemedText type="link" themeColor="accent">
            Налаштувати
          </ThemedText>
        </Tap>
      </View>

      {/* The compact header: how fresh the bank data is, and the same manual sync both the
          pull gesture and this button reach through `manualRefresh` (main-screen, "Sync
          occupies a compact header"). Absent entirely for an owner with no monobank. */}
      {model.monobank ? (
        <View style={styles.header}>
          <View style={styles.freshness}>
            {refreshing ? <ActivityIndicator size="small" color={theme.textMuted} /> : null}
            <ThemedText type="small" themeColor="textMuted">
              {model.monobank.freshness}
            </ThemedText>
          </View>
          <Tap
            onPress={() =>
              pull('button').catch((thrown: unknown) => {
                reportFailure('monobank-sync', thrown);
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Синхронізувати"
            style={styles.syncButton}>
            <ThemedText type="link" themeColor="accent">
              Оновити
            </ThemedText>
          </Tap>
        </View>
      ) : null}

      {/* The fixed service rail: directly below the header, before every widget, whatever the
          owner has hidden or reordered (main-screen, "Operational alerts remain compact and
          actionable"). None of it has a registry id — it cannot be hidden or moved. */}

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
          records are a compact feed banner"). Visible even with «Останні 5 транзакцій» hidden. */}
      {model.alerts.uncategorisedBanner ? (
        <Appear>
          <Tap
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
          </Tap>
        </Appear>
      ) : null}

      {/* At most two collapsed operational rows: the pending чернетки (count only, expanding in
          place to the existing confirm/dismiss surface) and an actionable sync failure. Neither,
          and nothing here renders at all (main-screen, "Operational alerts remain compact and
          actionable"). */}
      {model.alerts.draftCount > 0 || model.alerts.failureRow ? (
        <Appear>
          <Card style={styles.attention}>
            {model.alerts.draftCount > 0 ? (
              <Tap
                onPress={() => setDraftsExpanded((expanded) => !expanded)}
                accessibilityRole="button"
                style={styles.attentionRow}>
                <ThemedText numberOfLines={2} style={styles.attentionLabel}>
                  {model.alerts.draftLabel}
                </ThemedText>
                <Chevron />
              </Tap>
            ) : null}
            {model.alerts.failureRow ? (
              <Appear>
                {model.alerts.draftCount > 0 ? <Divider /> : null}
                <Tap
                  onPress={() => router.push('/manage/monobank')}
                  accessibilityRole="button"
                  style={styles.attentionRow}>
                  {/* No line cap: the no-token row ends on its дата, which a two-line cap cut at
                      100 % text on a Pixel 10 Pro («… не оновлюються з 21 …»). */}
                  <ThemedText style={styles.attentionLabel}>
                    {model.alerts.failureRow}
                  </ThemedText>
                  <ThemedText type="link" themeColor="accent">
                    Відкрити
                  </ThemedText>
                  <Chevron />
                </Tap>
              </Appear>
            ) : null}
          </Card>
        </Appear>
      ) : null}

      {/* The чернетки open in place: they fade in and everything under them moves down with them
          (motion, "Opening чернетки moves the feed down smoothly"). */}
      {draftsExpanded && drafts.length > 0 ? (
        <Appear>
          <ListCard>
            {drafts.map((line, index) => (
              <DraftRow
                key={line.id}
                line={line}
                last={index === drafts.length - 1}
                onConfirm={confirmDraftLine}
                onDismiss={dismissDraftLine}
              />
            ))}
          </ListCard>
        </Appear>
      ) : null}

      {/* The known widgets, in the owner's saved order — each rendered exactly once, through the
          exhaustive switch above (main-screen, "A saved layout controls only known widgets"). */}
      {stored.plan.visibleIds.map((id) => {
        // Each widget moves to its new place when something above it opens or leaves.
        const widget = renderWidget(id);
        return widget ? <Reflow key={id}>{widget}</Reflow> : null;
      })}

      {/* Every widget hidden: the header, the customise action and any service item above still
          stand; this is the compact explanation that takes their place (dashboard-layout, "Every
          widget may be hidden"). It carries its own button to the editor — a sentence pointing
          at a small link «вище» was the only way back, and QA read the screen as broken. The
          same plain push as the header action; `secondary`, because the «+» stays this screen's
          one filled action. */}
      {stored.plan.visibleIds.length === 0 ? (
        <Card style={styles.allHidden}>
          <ThemedText type="small" themeColor="textSecondary">
            Усі віджети приховано. Поверніть будь-який з них у налаштуваннях Головного.
          </ThemedText>
          <Action
            title="Налаштувати Головний"
            variant="secondary"
            onPress={() => router.push('/manage/home-dashboard')}
          />
        </Card>
      ) : null}

      <RuleOfferSheet
        offer={ruleOffer.offer}
        categoryNames={categoryNames}
        accountNames={accountNames}
        onAccept={ruleOffer.accept}
        onDecline={ruleOffer.decline}
      />
    </Screen>
  );
}

/**
 * One pending чернетка on Головний, owning what the owner types as its сума: a keystroke redraws
 * this row and nothing else — not the статок, the категорії or the стрічка (app-shell, "A long list
 * draws only what is near the screen"; app-speed-pass design D7). A settled чернетка leaves the
 * list, and its typed сума goes with it.
 */
function DraftRow({
  line,
  last,
  onConfirm,
  onDismiss,
}: {
  line: DraftLine;
  last: boolean;
  onConfirm: (draftId: string, typedAmount: string | undefined) => void;
  onDismiss: (line: DraftLine) => void;
}) {
  const [amount, setAmount] = useState('');
  return (
    <ListRow last={last} style={styles.row}>
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
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
          hint={line.currency}
        />
      ) : null}

      <View style={styles.rowActions}>
        <RowAction
          title="Підтвердити"
          onPress={() => onConfirm(line.id, line.needsAmount ? amount : undefined)}
        />
        <RowAction title="Відхилити" onPress={() => onDismiss(line)} />
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
  },
  // A tap target as wide as it is tall, never smaller than the shared minimum — text alone would
  // shrink it well under that on a short label like «Налаштувати» (main-screen, "Reordering is
  // understandable and accessible").
  customiseButton: { minHeight: TouchTarget, minWidth: TouchTarget, alignItems: 'center', justifyContent: 'center' },
  allHidden: { gap: Spacing.three },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
  },
  // A tap target as wide as it is tall, never smaller than the shared minimum — text alone would
  // shrink it well under that on a short label like «Оновити».
  freshness: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  syncButton: { minHeight: TouchTarget, minWidth: TouchTarget, alignItems: 'center', justifyContent: 'center' },
  // Clipped, so the accent rings behind the figure end at the card's own corner.
  status: { gap: Spacing.two + Spacing.half, overflow: 'hidden' },
  // The month's витрачено, one figure per currency on one line: each shrinks to fit rather than
  // pushing the line into a second row.
  figures: { flexDirection: 'row', alignItems: 'baseline' },
  figure: { flexShrink: 1, minWidth: 0 },
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
  // «Обрати категорію» and «Це переказ» side by side, wrapping on a narrow screen. `three`, not
  // `two`: each `RowAction` carries `hitSlop` of `two`, and with no gap the two pills touched.
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  amount: { fontWeight: 600 },
});

/**
 * The tab as the navigator mounts it: the screen inside the cross-fade every tab shares (motion,
 * "Screens enter from where they come from"; design D8).
 */
export default function MainTab() {
  return (
    <TabFade tab="index">
      <MainScreen />
    </TabFade>
  );
}
