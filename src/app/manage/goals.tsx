import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import { Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  goals as goalsRepo,
  limits as limitsRepo,
} from '@/db/repos';
import type { CurrencyCode } from '@/domain/money';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { formatMinorUnits } from '@/ui/amount-input';
import { failureAlert } from '@/ui/failure-alert';
import {
  accumulationFromDraft,
  COMPOSITION_SHORTCUTS,
  DEFAULT_GOAL_CURRENCY,
  deleteGoalConfirmation,
  goalAccountChoices,
  goalRows,
  GOAL_CURRENCIES,
  GOAL_KIND_CHOICES,
  spendingFromDraft,
  spendingGoalCategoryChoices,
  spendingGoalRows,
  targetAfterCurrencyChange,
  tickedLabel,
  tickKind,
  toggleAccount,
  type AccumulationDraft,
  type GoalKind,
  type SpendingDraft,
} from '@/ui/goals-section';
import { newId } from '@/ui/id';
import { accountChoiceLabel } from '@/ui/labels';

import { Spacing } from '@/constants/theme';

/**
 * The «Цілі» section: a ціль of one of two kinds. Every decision — what a row says, which рахунки
 * are offered, what a filled form becomes, when the target has to be typed again — is
 * `src/ui/goals-section.ts`, where `verify` can reach it; this file is the wiring.
 *
 * A **ціль витрат** is written through `limitsRepo`, not `goalsRepo`, and that is the whole of
 * design D1: it *is* the ліміт of its категорія, so there is one stored сума under two names and no
 * way for two ceilings to disagree. No progress is entered here and none is stored — «Звіти» and
 * the ціль's own screen read it.
 */

type Draft =
  | { readonly kind: 'accumulation'; readonly id?: string; readonly fields: AccumulationDraft }
  | { readonly kind: 'spending'; readonly editing?: string; readonly fields: SpendingDraft };

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
      // Every рахунок and категорія, archived included: the pickers filter, but a ціль already
      // holding an archived one keeps showing it.
      () => ({
        goals: goalsRepo.list(),
        accounts: accountsRepo.list(),
        limits: limitsRepo.list(),
        categories: categoriesRepo.list(),
      }),
      [],
    ),
  );

  const accumulationRows = useMemo(
    () => goalRows(stored.goals, stored.accounts),
    [stored.accounts, stored.goals],
  );
  const spendingRows = useMemo(
    () => spendingGoalRows({ limits: stored.limits, categories: stored.categories }),
    [stored.categories, stored.limits],
  );

  /** `undefined` — nothing open; `'kind'` — the kind is being asked; otherwise a form. */
  const [draft, setDraft] = useState<Draft | 'kind' | undefined>();

  /** The phone's own «назад» closes the open form first, and only then leaves the section. */
  const closeForm = useCallback(() => setDraft(undefined), []);
  useCloseOnBack(draft !== undefined, closeForm);

  /**
   * The рахунки the склад offers: the unarchived ones, plus whatever this ціль already holds even
   * if it has since been archived — so editing never silently drops a рахунок from a склад.
   */
  const accountChoices = useMemo(
    () =>
      goalAccountChoices(
        stored.accounts,
        typeof draft === 'object' && draft.kind === 'accumulation' ? draft.fields.accountIds : [],
      ),
    [draft, stored.accounts],
  );

  const categoryChoices = useMemo(
    () =>
      spendingGoalCategoryChoices({ categories: stored.categories, limits: stored.limits }).map(
        (c) => ({ value: c.id, label: c.name }),
      ),
    [stored.categories, stored.limits],
  );

  const save = useCallback(() => {
    if (typeof draft !== 'object') return;
    try {
      if (draft.kind === 'accumulation') {
        goalsRepo.save(
          accumulationFromDraft(draft.fields, {
            id: draft.id ?? newId(),
            accounts: stored.accounts,
          }),
        );
      } else {
        // The ціль витрат is the ліміт: one row, written under the name the owner used.
        limitsRepo.set(spendingFromDraft(draft.fields));
      }
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'goal-save', error, report: reportBug }),
      );
    }
  }, [draft, reload, reportBug, stored.accounts]);

  const removeAccumulation = useCallback(
    (row: (typeof accumulationRows)[number]) => {
      Alert.alert('Видалити ціль?', deleteGoalConfirmation(row), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            goalsRepo.remove(row.id);
            reload();
          },
        },
      ]);
    },
    [reload],
  );

  const removeSpending = useCallback(
    (row: (typeof spendingRows)[number]) => {
      Alert.alert('Видалити ціль витрат?', deleteGoalConfirmation(row), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          // Deleting the ціль витрат clears the ліміт — they are one row.
          onPress: () => {
            limitsRepo.clear(row.categoryId);
            reload();
          },
        },
      ]);
    },
    [reload],
  );

  const startKind = useCallback((kind: GoalKind) => {
    setDraft(
      kind === 'accumulation'
        ? {
            kind: 'accumulation',
            fields: {
              name: '',
              target: '',
              currency: DEFAULT_GOAL_CURRENCY,
              deadline: '',
              accountIds: [],
            },
          }
        : {
            kind: 'spending',
            fields: { categoryId: undefined, amount: '', currency: DEFAULT_GOAL_CURRENCY },
          },
    );
  }, []);

  const currencyChoices = GOAL_CURRENCIES.map((currency) => ({
    value: currency,
    label: currency,
  }));

  return (
    <Screen>
      <ScreenHeader
        title="Цілі"
        subtitle="«Накопичити суму» на одному чи кількох рахунках, або «не перевищити витрати» в категорії — це і є її ліміт. Прогрес видно у «Звітах»."
        back={() => router.back()}
      />

      {draft === 'kind' ? (
        <Card style={styles.form}>
          <Choices
            label="Яка це ціль"
            choices={GOAL_KIND_CHOICES}
            selected={undefined}
            onSelect={startKind}
          />
          <Action variant="secondary" title="Скасувати" onPress={closeForm} />
        </Card>
      ) : typeof draft === 'object' && draft.kind === 'accumulation' ? (
        <Card style={styles.form}>
          <Field
            label="Назва"
            value={draft.fields.name}
            onChangeText={(name) => setDraft({ ...draft, fields: { ...draft.fields, name } })}
            placeholder="напр. Машина"
          />
          <Choices
            label="Валюта цілі"
            choices={currencyChoices}
            selected={draft.fields.currency}
            onSelect={(currency: CurrencyCode) =>
              setDraft({
                ...draft,
                fields: {
                  ...draft.fields,
                  currency,
                  // Changing the currency asks the target anew: nothing is converted.
                  target: targetAfterCurrencyChange(
                    draft.fields.target,
                    draft.fields.currency,
                    currency,
                  ),
                },
              })
            }
          />
          <Field
            label="Скільки накопичити"
            value={draft.fields.target}
            onChangeText={(target) => setDraft({ ...draft, fields: { ...draft.fields, target } })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={draft.fields.currency}
          />
          <Field
            label="До дати (якщо потрібна)"
            value={draft.fields.deadline}
            onChangeText={(deadline) => setDraft({ ...draft, fields: { ...draft.fields, deadline } })}
            autoCapitalize="none"
            placeholder="РРРР-ММ-ДД"
          />

          <View style={styles.field}>
            <ThemedText type="overline">Що враховувати</ThemedText>
            <View style={styles.shortcuts}>
              {COMPOSITION_SHORTCUTS.map((shortcut) => (
                <RowAction
                  key={shortcut.kind}
                  tone="quiet"
                  title={shortcut.label}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      fields: {
                        ...draft.fields,
                        accountIds: tickKind(
                          draft.fields.accountIds,
                          stored.accounts,
                          shortcut.kind,
                        ),
                      },
                    })
                  }
                />
              ))}
            </View>
            <View style={styles.shortcuts}>
              {accountChoices.map((account) => (
                <RowAction
                  key={account.id}
                  tone={draft.fields.accountIds.includes(account.id) ? 'accent' : 'quiet'}
                  title={`${draft.fields.accountIds.includes(account.id) ? '✓ ' : ''}${accountChoiceLabel(account)}`}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      fields: {
                        ...draft.fields,
                        accountIds: toggleAccount(draft.fields.accountIds, account.id),
                      },
                    })
                  }
                />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {tickedLabel(draft.fields.accountIds)}
            </ThemedText>
          </View>

          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={closeForm} />
        </Card>
      ) : typeof draft === 'object' ? (
        <Card style={styles.form}>
          <Choices
            label="Категорія"
            choices={
              draft.editing
                ? [
                    {
                      value: draft.editing,
                      label:
                        spendingRows.find((row) => row.categoryId === draft.editing)?.name ??
                        draft.editing,
                    },
                  ]
                : categoryChoices
            }
            selected={draft.fields.categoryId}
            // The категорія of an existing ціль витрат is its identity and is not re-chosen.
            disabled={draft.editing !== undefined}
            onSelect={(categoryId) =>
              setDraft({ ...draft, fields: { ...draft.fields, categoryId } })
            }
          />
          <Choices
            label="Валюта"
            choices={currencyChoices}
            selected={draft.fields.currency}
            onSelect={(currency: CurrencyCode) =>
              setDraft({ ...draft, fields: { ...draft.fields, currency } })
            }
          />
          <Field
            label="Максимум на місяць"
            value={draft.fields.amount}
            onChangeText={(amount) => setDraft({ ...draft, fields: { ...draft.fields, amount } })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={draft.fields.currency}
          />
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={closeForm} />
        </Card>
      ) : (
        <Action title="Нова ціль" onPress={() => setDraft('kind')} />
      )}

      {accumulationRows.length === 0 && spendingRows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки жодної цілі.
        </ThemedText>
      ) : null}

      {accumulationRows.length > 0 ? (
        <>
          <SectionLabel>Накопичення</SectionLabel>
          <ListCard>
            {accumulationRows.map((row, index) => (
              <ListRow key={row.id} last={index === accumulationRows.length - 1} style={styles.row}>
                <View style={styles.rowTop}>
                  <ThemedText numberOfLines={1} style={styles.name}>
                    {row.name}
                  </ThemedText>
                  <ThemedText tabular style={styles.amount}>
                    {row.target}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.deadline ? `до ${row.deadline} · ` : ''}
                  {row.accountSummary ?? row.accountNames.join(', ')}
                  {row.hasArchivedAccount ? ' (є архівний)' : ''}
                </ThemedText>
                <View style={styles.actions}>
                  <RowAction
                    title="Змінити"
                    onPress={() => {
                      const goal = stored.goals.find((g) => g.id === row.id);
                      if (!goal) return;
                      setDraft({
                        kind: 'accumulation',
                        id: goal.id,
                        fields: {
                          name: goal.name,
                          // Back into the field in the form it will be parsed out of it again —
                          // integer string arithmetic, never a division.
                          target: formatMinorUnits(goal.target.amount),
                          currency: goal.target.currency,
                          deadline: goal.deadline ?? '',
                          accountIds: [...goal.accountIds],
                        },
                      });
                    }}
                  />
                  <RowAction
                    tone="danger"
                    title="Видалити"
                    onPress={() => removeAccumulation(row)}
                  />
                </View>
              </ListRow>
            ))}
          </ListCard>
        </>
      ) : null}

      {spendingRows.length > 0 ? (
        <>
          <SectionLabel>Ліміти витрат</SectionLabel>
          <ListCard>
            {spendingRows.map((row, index) => (
              <ListRow
                key={row.categoryId}
                last={index === spendingRows.length - 1}
                style={styles.row}>
                <View style={styles.rowTop}>
                  <ThemedText numberOfLines={1} style={styles.name}>
                    {row.name}
                    {row.archived ? ' · в архіві' : ''}
                  </ThemedText>
                  <ThemedText tabular style={styles.amount}>
                    {row.ceiling}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.period} · це і є ліміт категорії
                </ThemedText>
                <View style={styles.actions}>
                  <RowAction
                    title="Змінити"
                    onPress={() => {
                      const limit = stored.limits.find((l) => l.categoryId === row.categoryId);
                      if (!limit) return;
                      setDraft({
                        kind: 'spending',
                        editing: limit.categoryId,
                        fields: {
                          categoryId: limit.categoryId,
                          amount: formatMinorUnits(limit.amount.amount),
                          currency: limit.amount.currency,
                        },
                      });
                    }}
                  />
                  <RowAction tone="danger" title="Видалити" onPress={() => removeSpending(row)} />
                </View>
              </ListRow>
            ))}
          </ListCard>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  field: { gap: Spacing.two },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
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
