import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import { Card, ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { accounts as accountsRepo, goals as goalsRepo } from '@/db/repos';
import type { Goal } from '@/domain/goals';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { formatMinorUnits } from '@/ui/amount-input';
import { todayIso } from '@/ui/dates';
import {
  deleteGoalConfirmation,
  goalAccountChoices,
  goalFromDraft,
  goalRows,
  targetAfterRelink,
  type GoalDraft,
} from '@/ui/goals-section';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { accountChoiceLabel } from '@/ui/labels';

import { Spacing } from '@/constants/theme';

/**
 * The «Цілі» section: «відкласти N до дати» on one рахунок. Every decision — what a row says,
 * which рахунки are offered, what a filled form becomes, when the target has to be typed again —
 * is `src/ui/goals-section.ts`, where `verify` can reach it; this file is the wiring.
 *
 * No progress is entered here and none is stored: a ціль's progress is its рахунок's розрахунковий
 * баланс, shown on «Звіти».
 */

export default function GoalsScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      // Every рахунок, archived included: the picker filters, but a ціль already linked to an
      // archived one keeps showing it.
      () => ({ goals: goalsRepo.list(), accounts: accountsRepo.list() }),
      [],
    ),
  );

  const rows = useMemo(() => goalRows(stored.goals, stored.accounts), [stored.accounts, stored.goals]);

  /** `undefined` — the form is closed; a draft with no id — a new ціль; with one — an edit. */
  const [draft, setDraft] = useState<(GoalDraft & { id?: string }) | undefined>();

  /** The phone's own «назад» closes the open form first, and only then leaves the section. */
  const closeForm = useCallback(() => setDraft(undefined), []);
  useCloseOnBack(draft !== undefined, closeForm);

  /**
   * The рахунок an *edited* ціль already sits on, so an archived one stays in its own picker while
   * being offered for nothing new. A new ціль carries none, and sees only the unarchived рахунки.
   */
  const editedAccountId = draft?.id === undefined ? undefined : draft.accountId;
  const choices = useMemo(
    () =>
      goalAccountChoices(stored.accounts, editedAccountId).map((a) => ({
        value: a.id,
        label: accountChoiceLabel(a),
      })),
    [editedAccountId, stored.accounts],
  );

  /**
   * Choosing a рахунок of another currency clears the typed target: it is entered in the рахунок's
   * own currency, and keeping the digits would reinterpret 200 000 UAH as 200 000 USD.
   */
  const chooseAccount = useCallback(
    (accountId: string) => {
      if (!draft) return;
      const current = stored.accounts.find((a) => a.id === draft.accountId);
      const next = stored.accounts.find((a) => a.id === accountId);
      setDraft({ ...draft, accountId, target: targetAfterRelink(draft.target, current, next) });
    },
    [draft, stored.accounts],
  );

  const save = useCallback(() => {
    if (!draft) return;
    try {
      goalsRepo.save(goalFromDraft(draft, { id: draft.id ?? newId(), accounts: stored.accounts }));
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'goal-save', error, report: reportBug }),
      );
    }
  }, [draft, reload, reportBug, stored.accounts]);

  const remove = useCallback(
    (goal: Goal) => {
      Alert.alert('Видалити ціль?', deleteGoalConfirmation(goal.name), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            goalsRepo.remove(goal.id);
            reload();
          },
        },
      ]);
    },
    [reload],
  );

  const currencyOf = (accountId: string | undefined) =>
    stored.accounts.find((a) => a.id === accountId)?.currency;

  return (
    <Screen>
      <ScreenHeader
        title="Цілі"
        subtitle="«Відкласти суму до дати». Прогрес — це розрахунковий баланс привʼязаного рахунку, його видно у «Звітах»."
        back={() => router.back()}
      />

      {draft ? (
        <Card style={styles.form}>
          <Field
            label="Назва"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            placeholder="напр. Авто"
          />
          <Choices
            label="Рахунок"
            choices={choices}
            selected={draft.accountId}
            onSelect={chooseAccount}
          />
          <Field
            label="Скільки відкласти"
            value={draft.target}
            onChangeText={(target) => setDraft({ ...draft, target })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={currencyOf(draft.accountId)}
          />
          <Field
            label="До дати"
            value={draft.deadline}
            onChangeText={(deadline) => setDraft({ ...draft, deadline })}
            autoCapitalize="none"
            placeholder="РРРР-ММ-ДД"
          />
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={closeForm} />
        </Card>
      ) : (
        <Action
          title="Нова ціль"
          onPress={() =>
            setDraft({
              name: '',
              target: '',
              deadline: todayIso(new Date()),
              accountId: undefined,
            })
          }
        />
      )}

      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки жодної цілі.
        </ThemedText>
      ) : (
        <ListCard>
          {rows.map((row, index) => (
            <ListRow key={row.id} last={index === rows.length - 1} style={styles.row}>
              <View style={styles.rowTop}>
                <ThemedText numberOfLines={1} style={styles.name}>
                  {row.name}
                </ThemedText>
                <ThemedText tabular style={styles.amount}>
                  {row.target}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                до {row.deadline} · {row.accountName}
                {row.accountArchived ? ' (архівний)' : ''}
              </ThemedText>
              <View style={styles.actions}>
                <RowAction
                  title="Змінити"
                  onPress={() => {
                    const goal = stored.goals.find((g) => g.id === row.id);
                    if (!goal) return;
                    setDraft({
                      id: goal.id,
                      name: goal.name,
                      // Back into the field in the form it will be parsed out of it again —
                      // integer string arithmetic, never a division.
                      target: formatMinorUnits(goal.target.amount),
                      deadline: goal.deadline,
                      accountId: goal.accountId,
                    });
                  }}
                />
                <RowAction
                  tone="danger"
                  title="Видалити"
                  onPress={() => {
                    const goal = stored.goals.find((g) => g.id === row.id);
                    if (goal) remove(goal);
                  }}
                />
              </View>
            </ListRow>
          ))}
        </ListCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  name: { flex: 1 },
  amount: { fontWeight: 600 },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
