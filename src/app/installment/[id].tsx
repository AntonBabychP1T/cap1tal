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
  installments as installmentsRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import {
  INSTALLMENT_UPKEEP_PORTS,
  settleInstallmentsOnFocus,
} from '@/hooks/installment-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { todayIso } from '@/ui/dates';
import { failureAlert } from '@/ui/failure-alert';
import {
  NO_DEBIT_CHOICES,
  PART_VERB_LABELS,
  closingVerb,
  debitChoiceRows,
  deleteInstallmentConfirmation,
  installmentDetail,
  type LinkedDebit,
  type PartVerb,
} from '@/ui/installment-detail';
import { settleAndReassertQuietly } from '@/ui/installment-upkeep';

import { Spacing } from '@/constants/theme';

/**
 * One розстрочка: what it is, how far it is paid, and every платіж with its state and the verbs
 * that state allows — «Відв'язати», «Обрати списання», «Позначити сплаченим», «Зняти позначку» —
 * then «Редагувати», «Закрити достроково» / «Відновити» and «Видалити». Every decision is
 * `src/ui/installment-detail.ts`; this file is the wiring. After every change the warnings are
 * re-asserted, so a платіж that became сплачено or закрито is no longer warned about.
 */
export default function InstallmentScreen() {
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
      const installment = installmentsRepo.get(id);
      const facts = installmentsRepo.facts();
      const debits = new Map<string, LinkedDebit>();
      for (const link of facts.links) {
        if (link.installmentId !== id) continue;
        const t = transactionsRepo.get(link.transactionId);
        if (t && t.type !== 'transfer') {
          debits.set(t.id, { date: t.date, amount: t.amount.amount });
        }
      }
      return {
        installment,
        facts,
        debits,
        accounts: accountsRepo.list(),
        categories: categoriesRepo.list(),
      };
    }, [id]),
  );

  const model = useMemo(() => {
    const installment = stored.installment;
    if (!installment) return undefined;
    const accountName = stored.accounts.find((a) => a.id === installment.debitAccountId)?.name ?? '—';
    const categoryName = installment.categoryId
      ? stored.categories.find((c) => c.id === installment.categoryId)?.name
      : undefined;
    return installmentDetail({
      installment,
      facts: stored.facts,
      debits: stored.debits,
      accountName,
      ...(categoryName === undefined ? {} : { categoryName }),
      now: new Date(),
    });
  }, [stored]);

  /** The платіж whose списання is being picked, if any. */
  const [picking, setPicking] = useState<number>();
  const closePicker = useCallback(() => setPicking(undefined), []);
  useCloseOnBack(picking !== undefined, closePicker);

  const choices = useMemo(
    () => (picking === undefined ? [] : debitChoiceRows(installmentsRepo.choices(id, picking), new Date())),
    [id, picking],
  );

  /** One write, then the warnings re-asserted and the screen read again. */
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
    (number: number, which: PartVerb) => {
      switch (which) {
        case 'pick':
          setPicking(number);
          return;
        case 'unlink':
          act('installment-unlink', () => installmentsRepo.unlink(id, number));
          return;
        case 'mark':
          act('installment-mark', () => installmentsRepo.mark(id, number));
          return;
        case 'unmark':
          act('installment-unmark', () => installmentsRepo.unmark(id, number));
          return;
      }
    },
    [act, id],
  );

  const pick = useCallback(
    (transactionId: string) => {
      const number = picking;
      if (number === undefined) return;
      setPicking(undefined);
      act('installment-link', () => installmentsRepo.link(id, number, transactionId));
    },
    [act, id, picking],
  );

  const remove = useCallback(() => {
    if (!stored.installment) return;
    const asked = deleteInstallmentConfirmation(stored.installment.name);
    Alert.alert(asked.title, asked.message, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => {
          act('installment-delete', () => installmentsRepo.remove(id));
          router.back();
        },
      },
    ]);
  }, [act, id, router, stored.installment]);

  if (!model) {
    return (
      <Screen>
        <ScreenHeader title="Розстрочка" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Цієї розстрочки вже немає.
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={model.name} subtitle={`${model.progress} · ${model.remaining}`} back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText>{model.total}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {model.part}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Рахунок списання: {model.account}
          {model.category ? ` · ${model.category}` : ''}
        </ThemedText>
        <View style={styles.actions}>
          <RowAction
            title="Редагувати"
            onPress={() => router.push({ pathname: '/manage/installments', params: { edit: id } })}
          />
          <RowAction
            tone="quiet"
            title={closingVerb(model.closed)}
            onPress={() =>
              model.closed
                ? act('installment-reopen', () => installmentsRepo.reopen(id))
                : act('installment-close', () => installmentsRepo.close(id, todayIso(new Date())))
            }
          />
          <RowAction tone="danger" title="Видалити" onPress={remove} />
        </View>
      </Card>

      {picking !== undefined ? (
        <>
          <SectionLabel>{`Списання платежу ${picking}`}</SectionLabel>
          <Card style={styles.card}>
            {choices.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {NO_DEBIT_CHOICES}
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

      <SectionLabel>Графік</SectionLabel>
      <ListCard>
        {model.parts.map((part, index) => (
          <ListRow key={part.number} last={index === model.parts.length - 1} style={styles.part}>
            <View style={styles.rowTop}>
              <ThemedText type="small" style={styles.grow}>
                {part.title}
              </ThemedText>
              <ThemedText type="small" tabular>
                {part.scheduled}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor={part.missed ? 'textDanger' : 'textSecondary'}>
              {part.state}
              {part.debit ? ` · ${part.debit}` : ''}
            </ThemedText>
            {part.verbs.length > 0 ? (
              <View style={styles.actions}>
                {part.verbs.map((which) => (
                  <RowAction
                    key={which}
                    tone="quiet"
                    title={PART_VERB_LABELS[which]}
                    onPress={() => verb(part.number, which)}
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
  part: { gap: Spacing.one },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  grow: { flex: 1 },
  choice: { paddingVertical: Spacing.two },
});
