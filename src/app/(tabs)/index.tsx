import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View, type ScrollView } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
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
  limits as limitsRepo,
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
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { raise as raiseAlert } from '@/ui/alerting';
import {
  confirmPendingDraft,
  dismissConfirmation,
  dismissPendingDraft,
  draftLines,
  type DraftAnswer,
} from '@/ui/drafts-section';
import { expenseCategoryChoices } from '@/ui/category-choices';
import { homeViewModel } from '@/ui/home-screen';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { currentMonth } from '@/ui/months';
import { onCapturesStored } from '@/ui/notification-drain';
import { firstRun } from '@/ui/onboarding';
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
 * Головний — the short daily overview the app opens on: how the month is going, what the рахунки
 * hold, what is waiting for an answer, and the five latest транзакції. Recording is behind the «+»
 * over the bottom-right corner, on its own screen (`transaction/new.tsx`).
 *
 * Everything the screen says is decided in `src/ui` and under `verify` — `homeViewModel` decides
 * the month status, the money-held line and whether «Потребує уваги» exists at all, `draftLines`
 * what a чернетка reads as, `transactionLine` what a row reads and whether it is «Без категорії».
 * This file is the wiring. See design.md §6 and this change's design §D3, §D5, §D6.
 */

/** How many транзакції the стрічка shows. The rest are one tap away, in «Транзакції». */
const FEED_SIZE = 5;

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

/** The heading over everything that is waiting on the owner. Nothing waiting, no heading. */
const ATTENTION_TITLE = 'Потребує уваги';

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
      const month = currentMonth(new Date());
      return {
        month,
        accounts,
        // The розрахунковий баланс of each рахунок, so «На рахунках» is the sum of the same
        // numbers Рахунки shows — computed from транзакції, never stored.
        balances: new Map(
          accounts.map((a) => [a.id, computeBalance(a, transactionsRepo.listByAccount(a.id))]),
        ),
        // The month behind the status: the same bounded read Місяць does for the same month.
        monthTransactions: transactionsRepo.listMonth(month),
        rates: ratesRepo.all(),
        feed: transactionsRepo.listLatest(FEED_SIZE),
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
      };
    }, []),
  );

  // The «≈ … грн» beside the money held; its absence changes nothing else on the screen.
  useCurrentRates(reload);

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

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  // The джерела by id too: an imported дохід carries «Без джерела», and the стрічка has to name it.
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const categoryPicks = useMemo(
    () => expenseCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    [stored.categories],
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
      }),
    [drafts.length, stored],
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

  /** The «Без категорії» line whose one-tap picker is open, if any. */
  const [categorising, setCategorising] = useState<string>();

  /** One tap from the стрічка: the same transaction under the same id, now carrying the pick. */
  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        setCategorising(undefined);
        reload();
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'transaction-recategorise', error, report: reportBug }),
        );
      }
    },
    [reload, reportBug],
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
      overlay={<Fab onPress={() => router.push('/transaction/new')} />}>
      {/* The app's own name, not the tab's — the tab bar below already says which screen this is,
          and the reference reads as a product rather than as a form because of it. */}
      <View style={styles.brand}>
        <Wordmark />
      </View>

      {/* The month first, and it is the screen's figure: how much of it is left, what it has cost.
          The same numbers Місяць shows for the same month, which is where the card leads. */}
      <Pressable onPress={() => router.push('/month')} accessibilityRole="button">
        <Card style={styles.status}>
          <CardGlow />
          <View style={styles.statusHead}>
            <ThemedText type="overline">{model.status.title}</ThemedText>
            <Chevron />
          </View>
          {model.status.emptyMessage ? (
            <ThemedText themeColor="textSecondary">{model.status.emptyMessage}</ThemedText>
          ) : (
            <>
              {/* One line, shrunk rather than wrapped: two currencies must not push the figure
                  into a second row and the card into a different height. */}
              <ThemedText type="title" tabular numberOfLines={1} adjustsFontSizeToFit>
                {model.status.left}
              </ThemedText>
              <View style={styles.statusFoot}>
                <ThemedText type="small" themeColor="textSecondary">
                  {model.status.spentLabel}
                </ThemedText>
                <ThemedText type="smallBold" themeColor="text" tabular numberOfLines={1}>
                  {model.status.spent}
                </ThemedText>
              </View>
              {/* Why залишилось may be negative — the reason on the screen rather than guessed. */}
              {model.status.note ? (
                <ThemedText type="small" themeColor="textMuted">
                  {model.status.note}
                </ThemedText>
              ) : null}
            </>
          )}
        </Card>
      </Pressable>

      {/* The money held, its own card and a quieter one: what the рахунки hold is not the month's
          залишилось, and at a glance the size of the two figures is what says so. */}
      {model.held ? (
        <Pressable onPress={() => router.push('/accounts')} accessibilityRole="button">
          <Card style={styles.held}>
            <View style={styles.heldText}>
              <ThemedText type="small" themeColor="textSecondary">
                На рахунках
              </ThemedText>
              {/* Two lines rather than one shrunk to a hairline: three currencies is a normal
                  amount of money to hold, and «120 425,99 UAH · 1 355,22 EUR · 3 361,76 USD» read
                  at 60 % of the size is worse than read on two lines. */}
              <ThemedText type="default" tabular numberOfLines={2} style={styles.heldAmount}>
                {model.held.line}
              </ThemedText>
              {model.held.approximate ? (
                <ThemedText type="small" themeColor="textMuted" tabular>
                  {model.held.approximate}
                </ThemedText>
              ) : null}
            </View>
            <Chevron />
          </Card>
        </Pressable>
      ) : null}

      {/* Nothing to record on: the invitation stays on Головний, and the latest транзакції below
          still show whatever is stored. */}
      {model.held === null ? (
        <Card>
          <ThemedText>Спершу створіть рахунок — без нього нічого записати.</ThemedText>
          <Action title="До Рахунків" onPress={() => router.push('/accounts')} />
        </Card>
      ) : null}

      {/* What is waiting on the owner: the транзакції still without a категорія, counted, and the
          чернетки the phone's notifications left, answered in place. Neither, and this whole
          section is absent — no heading, no empty state. */}
      {model.attention.present ? (
        <>
          {model.attention.rows.length > 0 ? (
            <Card tone="accent" style={styles.attention}>
              <View style={styles.attentionHead}>
                <Mark />
                <ThemedText type="overline" themeColor="accent">
                  {ATTENTION_TITLE}
                </ThemedText>
              </View>
              {model.attention.rows.map((row, index) => (
                <View key={row}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push('/transactions')}
                    accessibilityRole="button"
                    style={styles.attentionRow}>
                    <ThemedText numberOfLines={2} style={styles.attentionLabel}>
                      {row}
                    </ThemedText>
                    <ThemedText type="link" themeColor="accent">
                      Переглянути
                    </ThemedText>
                    <Chevron />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <SectionLabel>{ATTENTION_TITLE}</SectionLabel>
          )}
          {drafts.length > 0 ? (
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
        </>
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
  brand: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.one },
  // Clipped, so the accent rings behind the figure end at the card's own corner.
  status: { gap: Spacing.two + Spacing.half, overflow: 'hidden' },
  statusHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  held: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heldText: { flex: 1, gap: Spacing.half },
  heldAmount: { fontWeight: 600 },
  // A card holding one short line does not need a card's full padding around it.
  attention: { gap: Spacing.two, paddingVertical: Spacing.three },
  attentionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
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
