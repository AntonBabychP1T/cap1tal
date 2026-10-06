import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DraftRow } from '@/components/draft-row';
import { Choices, Picker, RowAction } from '@/components/form';
import { Appear, ListItem, Reflow, Tap } from '@/components/motion';
import { ObservationsList } from '@/components/observations-list';
import { RuleOfferSheet } from '@/components/rule-offer-sheet';
import { Banner, Card, Chevron, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { TransactionRow } from '@/components/transaction-row';
import {
  categories as categoriesRepo,
  categorisationContext,
  duplicateAnswers as duplicateAnswersRepo,
  merchants as merchantsRepo,
  monobank as monobankRepo,
  notifications as notificationsRepo,
  sources as sourcesRepo,
  storedHistory,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { resolveCategory } from '@/domain/rules';
import type { Transaction } from '@/domain/transaction';
import { useHaptics } from '@/hooks/haptics-ports';
import { ALERT_PORTS, attended } from '@/hooks/use-alerting';
import { linkedAccountIds } from '@/hooks/observations-reads';
import { judgeProgressLater } from '@/hooks/progress-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useDuplicateAnswers } from '@/hooks/use-duplicate-answers';
import { useMonobankRail } from '@/hooks/use-monobank-rail';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useRuleOffer } from '@/hooks/use-rule-offer';
import { raise as raiseAlert } from '@/ui/alerting';
import {
  ANSWER_QUEUE_TITLE,
  QUEUE_PAGE,
  answerMonthFromRoute,
  answerQueue,
  queueSubtitle,
  visibleEntries,
  type QueueGroupKind,
} from '@/ui/answer-queue';
import { expenseCategoryChoices, recentlyUsed, sourceChoices } from '@/ui/category-choices';
import { todayIso } from '@/ui/dates';
import {
  confirmPendingDraft,
  dismissConfirmation,
  dismissPendingDraft,
  draftLines,
  type DraftAnswer,
  type DraftLine,
} from '@/ui/drafts-section';
import { failureAlert, refusalAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { monthLabel } from '@/ui/months';
import { observationLines } from '@/ui/observations';
import { assignSource, offersTransferMark, recategorise } from '@/ui/retype';
import { PICKER_SIZE } from '@/ui/shortlist';
import { accountsById, feedTitle, transactionLine } from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/** The value of the «Всі» chip — not a місяць, so it can never be one. */
const ANY = '';

const DRAFT_PORTS = {
  storage: notificationsRepo,
  categorisation: categorisationContext,
  newId,
  now: () => new Date(),
};

const FIRST_PAGE: Readonly<Record<QueueGroupKind, number>> = {
  drafts: QUEUE_PAGE,
  duplicates: QUEUE_PAGE,
  uncategorised: QUEUE_PAGE,
  unsourced: QUEUE_PAGE,
};

/**
 * «Що потребує відповіді» (answer-queue capability): everything that waits for the owner's word, in
 * one fixed order of groups, each entry answered where it stands. A reading over stored state —
 * `answerQueue` decides every group, count and line; this screen loads, lays out and answers
 * through the same actions the feed, the observations widget and the чернетки already use (design
 * D4). Nothing about the queue itself is stored.
 */
export default function AnswersScreen() {
  const router = useRouter();
  const haptics = useHaptics();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) => router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  // The місяць asked for is an initial value, never a lock (design D3).
  const asked = useLocalSearchParams<{ month?: string }>().month;
  const [month, setMonth] = useState<string>(answerMonthFromRoute(asked) ?? ANY);

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const history = storedHistory.read();
      return {
        today: todayIso(new Date()),
        accounts: history.accounts,
        transactions: history.transactions,
        months: history.months,
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        merchants: merchantsRepo.index(),
        drafts: notificationsRepo.pendingDrafts(),
        answers: duplicateAnswersRepo.list(),
        linked: linkedAccountIds(),
        links: monobankRepo.listLinks(),
        attempt: monobankRepo.attempt(),
        monobankAccounts: monobankRepo.rememberedAccounts(),
      };
    }, []),
  );
  const shared = useDuplicateAnswers(reload);
  /**
   * Whether a pair was answered «Не дубль» on this visit — «Можливі дублі» stays in place for its
   * «Скасувати» even when that was the last pair. Leaving the screen forgets it, as the list's own
   * answered rows are forgotten.
   */
  const [answeredHere, setAnsweredHere] = useState(false);
  useFocusEffect(useCallback(() => () => setAnsweredHere(false), []));
  const duplicateAnswers = useMemo(
    () => ({
      ...shared,
      onNotDuplicate: (pair: { readonly first: string; readonly second: string }) => {
        setAnsweredHere(true);
        shared.onNotDuplicate(pair);
      },
    }),
    [shared],
  );
  const bank = useMonobankRail({
    links: stored.links,
    monobankAccounts: stored.monobankAccounts,
    attempt: stored.attempt ?? undefined,
  });

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const categoryIconKeys = useMemo(() => new Map(stored.categories.map((c) => [c.id, c.iconKey])), [stored.categories]);
  const accountNames = useMemo(() => namesById(stored.accounts), [stored.accounts]);
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const categoryRows = useMemo(() => expenseCategoryChoices(stored.categories), [stored.categories]);
  const sourceRows = useMemo(() => sourceChoices(stored.sources), [stored.sources]);
  const recent = useMemo(() => recentlyUsed(stored.transactions.slice(0, 50), PICKER_SIZE + 1), [stored.transactions]);

  const queue = useMemo(
    () =>
      answerQueue({
        transactions: stored.transactions,
        drafts: stored.drafts,
        answers: stored.answers,
        linkedAccountIds: stored.linked,
        bank,
        today: stored.today,
        ...(month === ANY ? {} : { month }),
        categoryNames,
        keepDuplicates: answeredHere,
      }),
    [answeredHere, bank, categoryNames, month, stored],
  );

  /** How many of each group are in sight: an answer leaves it alone, so the owner keeps their place. */
  const [shown, setShown] = useState<Record<QueueGroupKind, number>>(FIRST_PAGE);
  const narrow = useCallback((picked: string) => {
    setMonth(picked);
    setShown(FIRST_PAGE);
  }, []);

  // ── «Без категорії» and «Без джерела»: the feed's one tap, here ──────────────────────────────
  const [categorising, setCategorising] = useState<string>();
  const [categoryListOpen, setCategoryListOpen] = useState(false);
  const closeCategoryList = useCallback(() => setCategoryListOpen(false), []);
  useCloseOnBack(categorising !== undefined && categoryListOpen, closeCategoryList);
  const [sourcing, setSourcing] = useState<string>();
  const [sourceListOpen, setSourceListOpen] = useState(false);
  const closeSourceList = useCallback(() => setSourceListOpen(false), []);
  useCloseOnBack(sourcing !== undefined && sourceListOpen, closeSourceList);

  const tiers = useMemo(() => (categorising === undefined ? undefined : categorisationContext()), [categorising]);
  const suggestedCategory = (t: Transaction) =>
    tiers === undefined
      ? undefined
      : resolveCategory(tiers, { description: t.description ?? '', mcc: 'mcc' in t ? t.mcc : undefined });

  /** What the last accepted правило's розбір did, said where it was triggered; nothing if nothing. */
  const [sweptMessage, setSweptMessage] = useState<string>();
  const ruleOffer = useRuleOffer(
    reportBug,
    useCallback(
      (said: string | undefined) => {
        setSweptMessage(said);
        reload();
      },
      [reload],
    ),
  );

  /** One pick: the same транзакція under the same id, now carrying the категорія; then the offer. */
  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        judgeProgressLater();
        haptics.play('stored');
        setCategorising(undefined);
        reload();
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

  /** One pick behind «Обрати джерело», then the правило-джерело offer. */
  const giveSource = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(assignSource(t, picked), new Date());
        judgeProgressLater();
        haptics.play('stored');
        setSourcing(undefined);
        setSourceListOpen(false);
        reload();
        ruleOffer.raise({ description: t.description, target: { kind: 'source', sourceId: picked } });
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'transaction-source', error, report: reportBug }),
        );
      }
    },
    [haptics, reload, reportBug, ruleOffer],
  );

  // ── Чернетки ────────────────────────────────────────────────────────────────────────────────
  const settleDraft = useCallback(
    (answer: DraftAnswer) => {
      if (answer.kind === 'amount-required' || answer.kind === 'rejected') {
        Alert.alert(...refusalAlert({ title: 'Не підтверджено', where: 'draft-confirm', message: answer.message }));
        return;
      }
      // Confirmed or dismissed: the чернетка leaves «Чернетки», and a транзакція confirmed into
      // «Без категорії» or «Без джерела» stands in that group at once — the re-read puts it there.
      judgeProgressLater();
      reload();
    },
    [reload],
  );

  const confirmDraftLine = useCallback(
    (draftId: string, typedAmount: string | undefined) => {
      const draft = stored.drafts.find((pending) => pending.id === draftId);
      if (!draft) return;
      try {
        const answer = confirmPendingDraft(draft, DRAFT_PORTS, typedAmount);
        settleDraft(answer);
        if (answer.kind === 'confirmed') haptics.play('stored');
      } catch (error) {
        Alert.alert(...failureAlert({ title: 'Не підтверджено', where: 'draft-confirm', error, report: reportBug }));
        void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
      }
    },
    [haptics, reportBug, settleDraft, stored.drafts],
  );

  const dismissDraftLine = useCallback(
    (line: DraftLine) => {
      const draft = stored.drafts.find((pending) => pending.id === line.id);
      if (!draft) return;
      // Asked first, as deletion is everywhere else; nothing is created either way.
      Alert.alert('Чернетка', dismissConfirmation(line), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Відхилити',
          style: 'destructive',
          onPress: () => {
            try {
              settleDraft(dismissPendingDraft(draft, DRAFT_PORTS));
            } catch (error) {
              Alert.alert(...failureAlert({ title: 'Не відхилено', where: 'draft-dismiss', error, report: reportBug }));
            }
          },
        },
      ]);
    },
    [reportBug, settleDraft, stored.drafts],
  );

  // The місяць a route asked for is named even when no транзакція is dated in it (only a чернетка).
  const months = month !== ANY && !stored.months.includes(month) ? [month, ...stored.months] : stored.months;
  const monthChoices = [{ value: ANY, label: 'Всі' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))];
  /** «Нічого не чекає відповіді» in one sentence and nothing else — no narrowing to offer then. */
  const nothingAtAll = month === ANY && queue.emptyMessage !== null;

  /** A «Без категорії» or «Без джерела» entry: the feed's line, its mark and its one-tap picker. */
  const renderRecord = (t: Transaction, index: number, count: number) => {
    const line = transactionLine(t, byId, categoryNames, sourceNames, new Map(), categoryIconKeys, stored.merchants);
    return (
      // An answered entry fades out while the ones after it close the gap (motion).
      <ListItem key={t.id} reflow>
        <ListRow last={index === count - 1} style={styles.row}>
          {/* Tapping the entry outside its picker opens its editing. */}
          <TransactionRow
            icon={line.icon}
            iconTone={line.iconTone}
            marked
            title={line.transferEnds ?? feedTitle(line)}
            // Two lines always: the title is «Без категорії» or «дохід · Без джерела», the very gap the
            // entry is in the queue for, and at 200 % text one line cut it to «Без кате…».
            titleLines={2}
            subtitle={queueSubtitle(line, new Date())}
            description={line.descriptionShown}
            amount={line.amount}
            amountTone={line.amountTone}
            onPress={() => router.push(`/transaction/${t.id}`)}
          />
          {line.uncategorised ? (
            <View style={styles.rowActions}>
              <RowAction
                title={categorising === t.id ? 'Згорнути' : 'Обрати категорію'}
                onPress={() => {
                  setCategorising(categorising === t.id ? undefined : t.id);
                  setCategoryListOpen(false);
                  setSourcing(undefined);
                }}
              />
              {/* A витрата only: a повернення is offered категорії and nothing else. */}
              {offersTransferMark(t) ? (
                <RowAction
                  title="Це переказ"
                  onPress={() => {
                    setCategorising(undefined);
                    setCategoryListOpen(false);
                    router.push(`/transaction/${t.id}?as=transfer`);
                  }}
                />
              ) : null}
            </View>
          ) : null}
          {line.uncategorised && categorising === t.id ? (
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
          {line.unsourced ? (
            <View style={styles.rowActions}>
              <RowAction
                title={sourcing === t.id ? 'Згорнути' : 'Обрати джерело'}
                onPress={() => {
                  setSourcing(sourcing === t.id ? undefined : t.id);
                  setSourceListOpen(false);
                  setCategorising(undefined);
                }}
              />
            </View>
          ) : null}
          {line.unsourced && sourcing === t.id ? (
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
      </ListItem>
    );
  };

  return (
    <Screen>
      <ScreenHeader title={ANSWER_QUEUE_TITLE} back={() => router.back()} />

      {/* The narrowing, named while in force; «Всі» takes it off without leaving. */}
      {months.length > 0 && !nothingAtAll ? (
        <Choices label="Місяць" choices={monthChoices} selected={month} onSelect={narrow} scroll />
      ) : null}

      {/* 1. The bank the app cannot hear: Головний's own sentence, answered on the monobank screen. */}
      {queue.bank ? (
        <Appear>
          <Tap onPress={() => router.push('/manage/monobank')} accessibilityRole="button">
            <Card style={styles.lineCard}>
              <ThemedText style={styles.lineLabel}>{queue.bank}</ThemedText>
              <ThemedText type="link" themeColor="accent">
                Відкрити
              </ThemedText>
              <Chevron />
            </Card>
          </Tap>
        </Appear>
      ) : null}

      {/* 2. The most recent finished місяць that is not clean; its tap narrows the queue to it. */}
      {queue.monthLine ? (
        <Tap onPress={() => narrow(queue.monthLine!.month)} accessibilityRole="button">
          <Card style={styles.lineCard}>
            <ThemedText style={styles.lineLabel}>{queue.monthLine.text}</ThemedText>
            <Chevron />
          </Card>
        </Tap>
      ) : null}

      {sweptMessage ? (
        <Appear>
          <Banner>{sweptMessage}</Banner>
        </Appear>
      ) : null}

      {queue.emptyMessage ? (
        <Card>
          <ThemedText themeColor="textSecondary">{queue.emptyMessage}</ThemedText>
        </Card>
      ) : null}

      {queue.groups.map((group) => {
        const page = visibleEntries<unknown>(group.entries as readonly unknown[], shown[group.kind]);
        const count = page.visible.length;
        return (
          <Reflow key={group.kind}>
            <View style={styles.group}>
              {/* Headed by its name and how many it holds — a count, never a сума. */}
              <SectionLabel note={String(group.entries.length)}>{group.title}</SectionLabel>
              {group.kind === 'drafts' ? (
                <ListCard>
                  {draftLines({
                    drafts: page.visible as typeof group.entries,
                    accounts: stored.accounts,
                    sourceNames,
                  }).map((line, index) => (
                    <ListItem key={line.id} reflow>
                      <DraftRow
                        line={line}
                        last={index === count - 1}
                        onConfirm={confirmDraftLine}
                        onDismiss={dismissDraftLine}
                      />
                    </ListItem>
                  ))}
                </ListCard>
              ) : group.kind === 'duplicates' ? (
                <ObservationsList
                  lines={observationLines(page.visible as typeof group.entries, {
                    categoryNames,
                    accountNames,
                    now: new Date(),
                  })}
                  onOpen={(route) => router.push(route)}
                  {...duplicateAnswers}
                />
              ) : (
                <ListCard>
                  {(page.visible as readonly Transaction[]).map((t, index) => renderRecord(t, index, count))}
                </ListCard>
              )}
              {page.moreLabel ? (
                <RowAction
                  title={page.moreLabel}
                  tone="quiet"
                  onPress={() => setShown((now) => ({ ...now, [group.kind]: now[group.kind] + QUEUE_PAGE }))}
                />
              ) : null}
            </View>
          </Reflow>
        );
      })}

      <RuleOfferSheet
        offer={ruleOffer.offer}
        categoryNames={categoryNames}
        accountNames={accountNames}
        sourceNames={sourceNames}
        onAccept={ruleOffer.accept}
        onDecline={ruleOffer.decline}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  lineCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lineLabel: { flex: 1 },
  row: { gap: Spacing.two },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
