import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import { Card, ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { categories as categoriesRepo, rules as rulesRepo } from '@/db/repos';
import { namesById } from '@/domain/category';
import type { Rule } from '@/domain/rules';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { expenseCategoryChoices } from '@/ui/category-choices';
import { newId } from '@/ui/id';
import { failureMessage } from '@/ui/labels';
import { ruleFromDraft, ruleLine, type RuleDraft } from '@/ui/list-management';

import { Spacing } from '@/constants/theme';

/**
 * The «Правила» section: the правила автокатегоризації the import steps (6–8) will run their
 * transactions through. Nothing applies them yet — this screen is where they are written down.
 *
 * A rule's target may be an archived category: archiving hides a category from pickers, not from
 * rules. So the list resolves names against every category, while the form offers only the
 * unarchived ones — retargeting an archived rule is the owner's decision, not a silent one.
 */

const EMPTY: RuleDraft = { merchant: '', mcc: '', categoryId: undefined };

export default function RulesScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(
    useCallback(() => ({ rules: rulesRepo.list(), categories: categoriesRepo.list() }), []),
  );

  const names = useMemo(() => namesById(stored.categories), [stored.categories]);
  const choices = useMemo(
    () =>
      expenseCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    [stored.categories],
  );

  /** `undefined` — the form is closed; a draft with no id — a new rule; with one — an edit. */
  const [draft, setDraft] = useState<(RuleDraft & { id?: string }) | undefined>();

  const save = useCallback(() => {
    if (!draft) return;
    try {
      const existing = draft.id ? rulesRepo.get(draft.id) : undefined;
      rulesRepo.save(
        ruleFromDraft(draft, {
          id: draft.id ?? newId(),
          // An edited rule keeps the moment it was created: `createdAt` is what breaks a tie
          // between two equally specific rules, so editing one must not jump it to the front.
          createdAt: existing?.createdAt ?? new Date(),
        }),
      );
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert('Не збережено', failureMessage(error));
    }
  }, [draft, reload]);

  const remove = useCallback(
    (rule: Rule) => {
      Alert.alert('Видалити правило?', 'Уже категоризовані транзакції лишаться як є.', [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            rulesRepo.remove(rule.id);
            reload();
          },
        },
      ]);
    },
    [reload],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Правила"
        subtitle="«Продавець / MCC → категорія». Застосуються, коли зʼявиться імпорт."
        back={() => router.back()}
      />

      {draft ? (
        <Card style={styles.form}>
          <Field
            label="Продавець"
            value={draft.merchant}
            onChangeText={(merchant) => setDraft({ ...draft, merchant })}
            autoCapitalize="none"
            placeholder="частина опису, напр. сільпо"
          />
          <Field
            label="MCC"
            value={draft.mcc}
            onChangeText={(mcc) => setDraft({ ...draft, mcc })}
            keyboardType="number-pad"
            placeholder="напр. 5411"
          />
          <Choices
            label="Категорія"
            choices={choices}
            selected={draft.categoryId}
            onSelect={(categoryId: string) => setDraft({ ...draft, categoryId })}
          />
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={() => setDraft(undefined)} />
        </Card>
      ) : (
        <Action title="Нове правило" onPress={() => setDraft({ ...EMPTY })} />
      )}

      {stored.rules.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки жодного правила.
        </ThemedText>
      ) : (
        <ListCard>
          {stored.rules.map((rule, index) => {
            const line = ruleLine(rule, names);
            return (
              <ListRow key={line.id} last={index === stored.rules.length - 1} style={styles.row}>
                <View style={styles.rowTop}>
                  <ThemedText numberOfLines={1} style={styles.criteria}>
                    {line.criteria}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    → {line.category}
                  </ThemedText>
                </View>
                <View style={styles.actions}>
                  <RowAction
                    title="Змінити"
                    onPress={() =>
                      setDraft({
                        id: rule.id,
                        merchant: rule.merchant ?? '',
                        mcc: rule.mcc === undefined ? '' : String(rule.mcc),
                        categoryId: rule.categoryId,
                      })
                    }
                  />
                  <RowAction tone="danger" title="Видалити" onPress={() => remove(rule)} />
                </View>
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
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  criteria: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
