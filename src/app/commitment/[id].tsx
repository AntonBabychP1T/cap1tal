import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { RowAction } from '@/components/form';
import { Tap } from '@/components/motion';
import { Card, Divider, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  commitments as commitmentsRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { INSTALLMENT_UPKEEP_PORTS, settleInstallmentsOnFocus } from '@/hooks/installment-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import {
  DUE_VERB_LABELS,
  NO_COMMITMENT_DEBIT_CHOICES,
  UPDATE_AMOUNT,
  commitmentChoiceRows,
  commitmentDetail,
  deleteCommitmentConfirmation,
  stoppingVerb,
  type DueVerb,
  type LinkedDebit,
} from '@/ui/commitment-detail';
import { todayIso } from '@/ui/dates';
import { failureAlert } from '@/ui/failure-alert';
import { settleAndReassertQuietly } from '@/ui/installment-upkeep';

import { Spacing } from '@/constants/theme';

/**
 * One зобов'язання: what it is, and its платежі newest first with the verbs each state allows —
 * «Відв'язати», «Обрати списання», «Позначити сплаченим», «Пропустити», «Зняти позначку» — then
 * «Оновити суму» when the bank charged another, «Редагувати», «Припинити» / «Відновити» and
 * «Видалити». Every decision is `src/ui/commitment-detail.ts`; this file is the wiring. After every
 * change both plans are settled again, so an unmarked платіж finds its списання.
 */
export default function CommitmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      settleInstallmentsOnFocus();
      const commitment = commitmentsRepo.get(id);
      const facts = commitmentsRepo.facts();
      const debits = new Map<string, LinkedDebit>();
      for (const link of facts.links) {
        if (link.commitmentId !== id) continue;
        const t = transactionsRepo.get(link.transactionId);
        if (t && t.type !== 'transfer') {
          debits.set(t.id, { date: t.date, amount: t.amount.amount });
        }
      }
      return {
        commitment,
        facts,
        debits,
        accounts: accountsRepo.list(),
        categories: categoriesRepo.list(),
      };
    }, [id]),
  );

  const model = useMemo(() => {
    const commitment = stored.commitment;
    if (!commitment) return undefined;
    const accountName = stored.accounts.find((a) => a.id === commitment.debitAccountId)?.name ?? '—';
    const categoryName = commitment.categoryId
      ? stored.categories.find((c) => c.id === commitment.categoryId)?.name
      : undefined;
    return commitmentDetail({
      commitment,
      facts: stored.facts,
      debits: stored.debits,
      accountName,
      ...(categoryName === undefined ? {} : { categoryName }),
      now: new Date(),
    });
  }, [stored]);

  /** The платіж whose списання is being picked, if any. */
  const [picking, setPicking] = useState<{ readonly number: number; readonly date: string }>();
  const closePicker = useCallback(() => setPicking(undefined), []);
  useCloseOnBack(picking !== undefined, closePicker);

  const currency = stored.commitment?.currency ?? 'UAH';
  const choices = useMemo(
    () =>
      picking === undefined
        ? []
        : commitmentChoiceRows(commitmentsRepo.choices(id, picking.number), currency, new Date()),
    [currency, id, picking],
  );

  /** One write, then both plans settled again and the screen read again. */
  const act = useCallback(
    (where: string, write: () => void) => {
      try {
        write();
      } catch (error) {
        Alert.alert(...failureAlert({ title: 'Не збережено', where, error, report: reportBug }));
        return;
      }
      reload();
      void settleAndReassertQuietly(INSTALLMENT_UPKEEP_PORTS).then(reload);
    },
    [reload, reportBug],
  );

  const verb = useCallback(
    (number: number, date: string, which: DueVerb) => {
      switch (which) {
        case 'pick':
          setPicking({ number, date });
          return;
        case 'unlink':
          act('commitment-unlink', () => commitmentsRepo.unlink(id, number));
          return;
        case 'mark':
          act('commitment-mark', () => commitmentsRepo.mark(id, number, 'paid'));
          return;
        case 'skip':
          act('commitment-skip', () => commitmentsRepo.mark(id, number, 'skipped'));
          return;
        case 'unmark':
          act('commitment-unmark', () => commitmentsRepo.unmark(id, number));
          return;
      }
    },
    [act, id],
  );

  const pick = useCallback(
    (transactionId: string) => {
      const number = picking?.number;
      if (number === undefined) return;
      setPicking(undefined);
      act('commitment-link', () => commitmentsRepo.link(id, number, transactionId));
    },
    [act, id, picking],
  );

  const remove = useCallback(() => {
    if (!stored.commitment) return;
    const asked = deleteCommitmentConfirmation(stored.commitment.name);
    Alert.alert(asked.title, asked.message, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => {
          act('commitment-delete', () => commitmentsRepo.remove(id));
          router.back();
        },
      },
    ]);
  }, [act, id, router, stored.commitment]);

  if (!model || !stored.commitment) {
    return (
      <Screen>
        <ScreenHeader title="Зобов'язання" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Цього зобовʼязання вже немає.
        </ThemedText>
      </Screen>
    );
  }
  const commitment = stored.commitment;

  return (
    <Screen>
      <ScreenHeader
        title={model.name}
        subtitle={model.stoppedOn ? `${model.amount} · ${model.stoppedOn}` : model.amount}
        back={() => router.back()}
      />

      <Card style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          Рахунок списання: {model.account}
          {model.category ? ` · ${model.category}` : ''}
        </ThemedText>
        {model.marker ? (
          <ThemedText type="small" themeColor="textSecondary">
            {model.marker}
          </ThemedText>
        ) : null}
        {model.newAmount ? (
          <>
            <ThemedText type="small">{model.newAmount.message}</ThemedText>
            <View style={styles.actions}>
              <RowAction
                title={UPDATE_AMOUNT}
                onPress={() =>
                  act('commitment-update-amount', () =>
                    commitmentsRepo.save({ ...commitment, amount: model.newAmount!.amount }),
                  )
                }
              />
            </View>
          </>
        ) : null}
        <View style={styles.actions}>
          <RowAction
            title="Редагувати"
            onPress={() => router.push({ pathname: '/manage/commitments', params: { edit: id } })}
          />
          <RowAction
            tone="quiet"
            title={stoppingVerb(model.stopped)}
            onPress={() =>
              model.stopped
                ? act('commitment-resume', () => commitmentsRepo.resume(id))
                : act('commitment-stop', () => commitmentsRepo.stop(id, todayIso(new Date())))
            }
          />
          <RowAction tone="danger" title="Видалити" onPress={remove} />
        </View>
      </Card>

      {picking !== undefined ? (
        <>
          <SectionLabel>{`Списання платежу ${picking.date}`}</SectionLabel>
          <Card style={styles.card}>
            {choices.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {NO_COMMITMENT_DEBIT_CHOICES}
              </ThemedText>
            ) : (
              choices.map((choice, index) => (
                <View key={choice.id}>
                  {index > 0 ? <Divider /> : null}
                  <Tap onPress={() => pick(choice.id)} accessibilityRole="button" style={styles.choice}>
                    <ThemedText type="small">{choice.label}</ThemedText>
                  </Tap>
                </View>
              ))
            )}
            <RowAction tone="quiet" title="Скасувати" onPress={closePicker} />
          </Card>
        </>
      ) : null}

      <SectionLabel>Платежі</SectionLabel>
      <ListCard>
        {model.dues.map((due, index) => (
          <ListRow key={due.number} last={index === model.dues.length - 1} style={styles.due}>
            <View style={styles.rowTop}>
              <ThemedText type="small" style={styles.grow}>
                {due.date}
              </ThemedText>
              <ThemedText type="small" tabular>
                {due.amount}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor={due.missed ? 'textDanger' : 'textSecondary'}>
              {due.state}
              {due.debit ? ` · ${due.debit}` : ''}
            </ThemedText>
            {due.verbs.length > 0 ? (
              <View style={styles.actions}>
                {due.verbs.map((which) => (
                  <RowAction
                    key={which}
                    tone="quiet"
                    title={DUE_VERB_LABELS[which]}
                    onPress={() => verb(due.number, due.date, which)}
                  />
                ))}
              </View>
            ) : null}
          </ListRow>
        ))}
      </ListCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  due: { gap: Spacing.one },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  grow: { flex: 1 },
  choice: { paddingVertical: Spacing.two },
});
