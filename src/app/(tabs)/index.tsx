import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View, type ScrollView } from 'react-native';

import { askAboutTransfer } from '@/components/transfer-dialog';
import { Action, Choices, Field, RowAction } from '@/components/form';
import {
  Card,
  ListCard,
  ListRow,
  Mark,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  entryDefaults as entryDefaultsRepo,
  limits as limitsRepo,
  notifications as notificationsRepo,
  rates as ratesRepo,
  rules as rulesRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { activeAccounts, computeBalance } from '@/domain/account';
import { namesById } from '@/domain/category';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountTotals, approximateTotals, totalsLine } from '@/ui/account-totals';
import {
  expenseCategoryChoices,
  recentlyUsed,
  recentRows,
  sourceChoices,
} from '@/ui/category-choices';
import { todayIso } from '@/ui/dates';
import {
  confirmPendingDraft,
  dismissConfirmation,
  dismissPendingDraft,
  draftLines,
  DRAFTS_SECTION_TITLE,
  type DraftAnswer,
} from '@/ui/drafts-section';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';
import { onCapturesStored } from '@/ui/notification-drain';
import {
  buildEntry,
  defaultAccountId,
  normaliseDescription,
  recordedConfirmation,
  type EntryType,
} from '@/ui/entry-form';
import { newId } from '@/ui/id';
import { firstRun } from '@/ui/onboarding';
import { accountChoiceLabel, failureMessage, transactionTypeLabel } from '@/ui/labels';
import { recategorise } from '@/ui/retype';
import {
  accountsById,
  feedSubtitle,
  feedTitle,
  overLimitByMonth,
  transactionLine,
} from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * Головний — the screen the app opens on: record a transaction, and the стрічка of the latest
 * ones with editing one tap away. Everything that can be decided without JSX lives in
 * `src/domain` and `src/ui` and is under `verify` — `buildEntry` decides what a filled form
 * stores, `expenseCategoryChoices` what a picker offers, `transactionLine` what a row reads and
 * whether it is «Без категорії»; this file is the wiring. See design.md §6.
 */

const FEED_SIZE = 50;

/**
 * How many recently used категорії (and джерела) the shortcut row holds. Five is a row that fits
 * under the thumb without becoming a second full list — a number to tune after the emulator pass,
 * not a rule, which is why it is here and not in `category-choices.ts`.
 */
const RECENT_SIZE = 5;

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

/** The order the vision names them in; the words themselves are the glossary's, via `labels`. */
const ENTRY_CHOICES: readonly { value: EntryType; label: string }[] = (
  ['expense', 'transfer', 'income', 'refund'] as const
).map((value) => ({ value, label: transactionTypeLabel(value) }));

export default function MainScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const accounts = accountsRepo.list();
      return {
        accounts,
        // The розрахунковий баланс of each рахунок, so «Усього грошей» is the sum of the same
        // numbers Рахунки shows — computed from транзакції, never stored.
        balances: new Map(
          accounts.map((a) => [a.id, computeBalance(a, transactionsRepo.listByAccount(a.id))]),
        ),
        rates: ratesRepo.all(),
        // The рахунок the entry form opens on. Written by `store()` below and by nothing else in
        // the app, so a sync, an import and a confirmed чернетка leave it as the owner left it.
        rememberedAccountId: entryDefaultsRepo.remembered(),
        feed: transactionsRepo.listLatest(FEED_SIZE),
        // Every row, archived included: pickers filter, but a feed line still shows the name of a
        // category that has since been archived.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        limits: limitsRepo.list(),
        // What the drain has left for the owner to answer. Pending ones only — a confirmed or
        // dismissed чернетка is deleted, so this is never a growing archive.
        drafts: notificationsRepo.pendingDrafts(),
      };
    }, []),
  );

  // The «≈ … грн» beside «Усього грошей»; its absence changes nothing else on the screen.
  useCurrentRates(reload);

  /**
   * Opening Головний again shows it from its top — the money and the entry form. Restoring the
   * scroll position drops the owner who came back to record something into the middle of the form
   * they came back to use. Scrolling within the screen is untouched: this fires on focus and on
   * nothing else, and what the feed holds is not touched at all.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  /**
   * Opening Головний is the owner looking at where a транзакція is recorded — which is where a
   * failure to store one is explained and retried, so it clears that сповіщення (design D6). It
   * is also where a tapped нагадування lands.
   */
  useClearAlertOnOpen('local-save');

  /**
   * A device with no рахунок and no транзакція is a device on which this screen can do nothing —
   * the «+» refuses every entry without a рахунок. So the first launch of such a device opens on
   * «Перші кроки» instead. Once anything exists, or once the owner has left the checklist, this
   * never fires again.
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

  const offered = useMemo(() => activeAccounts(stored.accounts), [stored.accounts]);
  /**
   * «Усього грошей» — what the рахунки hold, decided in `src/ui/account-totals.ts`. Deliberately
   * not the month's «Залишилось»: that number lives on Місяць, under its own name, and this screen
   * shows no monthly number at all so the two can never be confused.
   */
  const totals = useMemo(
    () => accountTotals(stored.accounts, stored.balances),
    [stored.accounts, stored.balances],
  );
  const approximate = useMemo(
    () => approximateTotals(totals.total, stored.rates),
    [stored.rates, totals.total],
  );
  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  // The джерела by id too: an imported дохід carries «Без джерела», and the feed has to name it.
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const categoryPicks = useMemo(
    () => expenseCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    [stored.categories],
  );
  const sourcePicks = useMemo(
    () => sourceChoices(stored.sources).map((s) => ({ value: s.id, label: s.name })),
    [stored.sources],
  );
  /**
   * What the owner reached for last, read off the стрічка already loaded — never counted, never
   * stored. Resolved against the same offered lists, so an archived категорія is not resurrected
   * by having been used and «Без джерела» is not offered by having been imported onto.
   */
  const recent = useMemo(() => recentlyUsed(stored.feed, RECENT_SIZE), [stored.feed]);
  const recentCategoryPicks = useMemo(
    () => recentRows(recent.categories, expenseCategoryChoices(stored.categories)).map((c) => ({
      value: c.id,
      label: c.name,
    })),
    [recent.categories, stored.categories],
  );
  const recentSourcePicks = useMemo(
    () => recentRows(recent.sources, sourceChoices(stored.sources)).map((s) => ({
      value: s.id,
      label: s.name,
    })),
    [recent.sources, stored.sources],
  );
  /**
   * Which categories are over their ліміт, per month of the loaded feed. The feed holds the latest
   * транзакції, not whole months, so each month it touches — one or two, typically — is read in
   * full for its breakdown. `overLimitByMonth` decides everything; this is the read it needs.
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

  const [entry, setEntry] = useState<EntryType>('expense');
  /**
   * The form opens on the рахунок last recorded on by hand — an offer, freely changed before
   * recording. A remembered рахунок that has since been archived pre-chooses nothing, and
   * `defaultAccountId` is what decides that; read once, at mount, because only `store()` moves it
   * and `store()` is recording on this very screen.
   */
  const [fromId, setFromId] = useState<string | undefined>(() =>
    defaultAccountId(stored.rememberedAccountId, activeAccounts(stored.accounts)),
  );
  const [toId, setToId] = useState<string>();
  const [amount, setAmount] = useState('');
  const [arrived, setArrived] = useState('');
  const [date, setDate] = useState(() => todayIso(new Date()));
  const [categoryId, setCategoryId] = useState<string>();
  const [sourceId, setSourceId] = useState<string>();
  /** The опис, optional for every type. Empty is the normal case and stores nothing. */
  const [description, setDescription] = useState('');
  /**
   * What the last recording stored, in the owner's words, where they are already looking. Cleared
   * by the next recording and by the next change to any field, so it can never describe a form
   * that has since moved on. No timer: nothing to race in a smoke test, and nothing that
   * disappears before the owner looks up (design D11).
   */
  const [confirmation, setConfirmation] = useState<string>();
  /** The «Без категорії» line whose one-tap picker is open, if any. */
  const [categorising, setCategorising] = useState<string>();

  const from = offered.find((a) => a.id === fromId);
  const to = offered.find((a) => a.id === toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);

  /**
   * Choosing an account of another currency clears the сума touching it: an amount is entered in
   * its account's currency, and keeping the digits would reinterpret 125,50 UAH as 125,50 USD.
   */
  const chooseFrom = useCallback(
    (nextId: string) => {
      const next = offered.find((a) => a.id === nextId);
      if (next && from && next.currency !== from.currency) {
        setAmount('');
      }
      setFromId(nextId);
      setConfirmation(undefined);
    },
    [from, offered],
  );

  const chooseTo = useCallback(
    (nextId: string) => {
      const next = offered.find((a) => a.id === nextId);
      if (next && to && next.currency !== to.currency) {
        setArrived('');
      }
      setToId(nextId);
      setConfirmation(undefined);
    },
    [offered, to],
  );

  /**
   * Switching the type drops the label picked for the previous one. A повернення and a дохід take
   * no default, so carrying a category picked while recording a витрата over into a повернення
   * would be exactly the default the spec forbids.
   */
  const chooseEntry = useCallback((next: EntryType) => {
    setEntry(next);
    setCategoryId(undefined);
    setSourceId(undefined);
    setConfirmation(undefined);
  }, []);

  const clear = useCallback(() => {
    setAmount('');
    setArrived('');
    setDate(todayIso(new Date()));
    setCategoryId(undefined);
    setSourceId(undefined);
    setDescription('');
    reload();
  }, [reload]);

  const store = useCallback(
    (...written: Transaction[]) => {
      const now = new Date();
      for (const t of written) {
        transactionsRepo.save(t, now);
      }
      // Recording by hand is the one thing that moves the memory — for a переказ, the рахунок the
      // money left, which is the one this picker names. Nothing else in the app calls `remember`.
      if (fromId) {
        entryDefaultsRepo.remember(fromId);
      }
      clear();
      setConfirmation(
        recordedConfirmation(written, { accounts: byId, categoryNames, sourceNames }),
      );
      // Storing worked, so whatever the last failure to store was is no longer true.
      void clearAlert('local-save', ALERT_PORTS);
    },
    [byId, categoryNames, clear, fromId, sourceNames],
  );

  const record = useCallback(() => {
    try {
      const built = buildEntry(
        {
          type: entry,
          accountId: fromId,
          toAccountId: toId,
          amount,
          arrived,
          date,
          categoryId,
          sourceId,
          description: normaliseDescription(description),
        },
        { id: newId(), accounts: offered },
      );
      // Only a переказ can propose anything on top of itself, and the owner decides whether it is.
      if (built.type === 'transfer') {
        // The рахунок the money left decides what may be proposed, and its stored транзакції are
        // what says how much that person still owed before this переказ.
        askAboutTransfer(
          built,
          {
            accounts: offered,
            sourceTransactions: transactionsRepo.listByAccount(built.fromAccountId),
          },
          store,
        );
        return;
      }
      store(built);
    } catch (error) {
      setConfirmation(undefined);
      Alert.alert('Не записано', failureMessage(error));
      // The Alert above is the report, and it is on the screen the owner is standing on — so this
      // almost always answers «attended» and posts nothing. It is here for the case that is not:
      // a store that fails as they leave (design D5).
      void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
    }
  }, [
    amount,
    arrived,
    categoryId,
    date,
    description,
    entry,
    fromId,
    offered,
    sourceId,
    store,
    toId,
  ]);

  /** One tap from the feed: the same transaction under the same id, now carrying the pick. */
  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        setCategorising(undefined);
        reload();
      } catch (error) {
        Alert.alert('Не збережено', failureMessage(error));
      }
    },
    [reload],
  );

  /** What the owner has typed as the сума of a raw чернетка, per чернетка. */
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});

  const settleDraft = useCallback(
    (draftId: string, answer: DraftAnswer) => {
      if (answer.kind === 'amount-required' || answer.kind === 'rejected') {
        // Nothing was stored and the чернетка still awaits — the parser's own words say why.
        Alert.alert('Не підтверджено', answer.message);
        return;
      }
      setDraftAmounts(({ [draftId]: _answered, ...rest }) => rest);
      reload();
    },
    [reload],
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
        Alert.alert('Не підтверджено', failureMessage(error));
        void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
      }
    },
    [draftAmounts, settleDraft, stored.drafts],
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
              Alert.alert('Не відхилено', failureMessage(error));
            }
          },
        },
      ]);
    },
    [settleDraft, stored.drafts],
  );

  const accountChoices = offered.map((a) => ({ value: a.id, label: accountChoiceLabel(a) }));

  /**
   * Any change to any field ends the confirmation: it named what was recorded from the form as it
   * then stood, and a form that has moved on must not still be wearing that sentence.
   */
  const changing =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setConfirmation(undefined);
      set(value);
    };

  return (
    <Screen scrollRef={scrollRef}>
      <ScreenHeader title="Головний" />

      {/* Money first: the screen opens on what the рахунки hold, above the form that spends it.
          A device with no рахунок shows none and keeps inviting the first one. */}
      {totals.total.length > 0 ? (
        <Card style={styles.totals}>
          <ThemedText type="overline">Усього грошей</ThemedText>
          <ThemedText type="subtitle" tabular>
            {totalsLine(totals.total)}
          </ThemedText>
          {approximate ? (
            <ThemedText type="small" themeColor="textSecondary" tabular>
              {approximate}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {offered.length === 0 ? (
        <Card>
          <ThemedText>Спершу створіть рахунок — без нього нічого записати.</ThemedText>
          <Action title="До Рахунків" onPress={() => router.push('/accounts')} />
        </Card>
      ) : (
        <Card style={styles.form}>
          <Choices label="Тип" choices={ENTRY_CHOICES} selected={entry} onSelect={chooseEntry} />
          <Choices
            label={entry === 'transfer' ? 'Звідки' : 'Рахунок'}
            choices={accountChoices}
            selected={fromId}
            onSelect={chooseFrom}
          />
          {entry === 'transfer' ? (
            <Choices label="Куди" choices={accountChoices} selected={toId} onSelect={chooseTo} />
          ) : null}
          <Field
            label={entry === 'transfer' ? 'Скільки пішло' : 'Сума'}
            value={amount}
            onChangeText={changing(setAmount)}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={from ? from.currency : undefined}
          />
          {entry === 'transfer' && from && to ? (
            <Field
              label="Скільки прийшло"
              value={arrived}
              onChangeText={changing(setArrived)}
              keyboardType="decimal-pad"
              placeholder={crossCurrency ? '0,00' : 'стільки ж'}
              hint={
                crossCurrency ? to.currency : `${to.currency} — залиште порожнім, якщо без комісії`
              }
            />
          ) : null}
          <Field
            label="Дата"
            value={date}
            onChangeText={changing(setDate)}
            autoCapitalize="none"
            placeholder="РРРР-ММ-ДД"
          />
          {/* A витрата arrives carrying «Без категорії» and the owner may pick another; a
              повернення has no default and is not stored until one is picked. */}
          {entry === 'expense' || entry === 'refund' ? (
            <>
              {/* The shortcut above the full list, not instead of it: a категорія may stand in
                  both, and it is marked selected in both. */}
              {recentCategoryPicks.length > 0 ? (
                <Choices
                  label="Нещодавні"
                  choices={recentCategoryPicks}
                  selected={
                    entry === 'expense' ? (categoryId ?? UNCATEGORISED_CATEGORY_ID) : categoryId
                  }
                  onSelect={changing(setCategoryId)}
                />
              ) : null}
              <Choices
                label={entry === 'refund' ? 'До якої категорії' : 'Категорія'}
                choices={categoryPicks}
                selected={
                  entry === 'expense' ? (categoryId ?? UNCATEGORISED_CATEGORY_ID) : categoryId
                }
                onSelect={changing(setCategoryId)}
              />
            </>
          ) : null}
          {entry === 'income' ? (
            <>
              {recentSourcePicks.length > 0 ? (
                <Choices
                  label="Нещодавні"
                  choices={recentSourcePicks}
                  selected={sourceId}
                  onSelect={changing(setSourceId)}
                />
              ) : null}
              <Choices
                label="Джерело"
                choices={sourcePicks}
                selected={sourceId}
                onSelect={changing(setSourceId)}
              />
            </>
          ) : null}
          {/* The опис: optional for every type, and information only — it moves no total, no
              balance and no classification. Left empty, nothing is stored and the feed shows no
              empty row for it. */}
          <Field
            label="Опис"
            value={description}
            onChangeText={changing(setDescription)}
            placeholder="напр. шини на зиму"
            hint="необовʼязково"
          />
          <Action title="Записати" onPress={record} />
          {/* Where the owner is already looking, without scrolling: what was just recorded, and
              what was stored alongside it. A refusal shows its own words and no confirmation. */}
          {confirmation ? (
            <ThemedText type="small" themeColor="textPositive">
              {confirmation}
            </ThemedText>
          ) : null}
        </Card>
      )}

      {/* The чернетки the phone's notifications left, above the feed because they are the one
          thing on this screen still waiting on the owner. No pending ones, no block. */}
      {drafts.length > 0 ? (
        <>
          <SectionLabel>{DRAFTS_SECTION_TITLE}</SectionLabel>
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
        </>
      ) : null}

      {/* The section says what it is — the latest only — and offers the whole history beside it.
          The offer does not depend on having a long one: search is where the owner goes to look
          for something, not a reward for having recorded enough. */}
      <SectionLabel note={`останні ${FEED_SIZE}`}>Останні транзакції</SectionLabel>
      <View style={styles.feedActions}>
        <RowAction title="Усі транзакції та пошук" onPress={() => router.push('/transactions')} />
      </View>
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
                    transaction without the editing screen ever opening. */}
                {line.uncategorised ? (
                  <View style={styles.rowActions}>
                    <RowAction
                      title={categorising === line.id ? 'Згорнути' : 'Обрати категорію'}
                      onPress={() =>
                        setCategorising(categorising === line.id ? undefined : line.id)
                      }
                    />
                  </View>
                ) : null}
                {categorising === line.id ? (
                  <Choices
                    label="Категорія"
                    choices={categoryPicks.filter((c) => c.value !== UNCATEGORISED_CATEGORY_ID)}
                    selected={undefined}
                    onSelect={(picked: string) => categorise(t, picked)}
                  />
                ) : null}
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  totals: { gap: Spacing.two - Spacing.half },
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
  feedActions: { flexDirection: 'row' },
  amount: { fontWeight: 600 },
});
