import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action, Choices, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Правила</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            «Продавець / MCC → категорія». Застосуються, коли зʼявиться імпорт.
          </ThemedText>

          {draft ? (
            <ThemedView type="backgroundElement" style={styles.card}>
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
              <Action title="Скасувати" onPress={() => setDraft(undefined)} />
            </ThemedView>
          ) : (
            <Action title="Нове правило" onPress={() => setDraft({ ...EMPTY })} />
          )}

          {stored.rules.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Поки жодного правила.
            </ThemedText>
          ) : (
            stored.rules.map((rule) => {
              const line = ruleLine(rule, names);
              return (
                <ThemedView key={line.id} type="backgroundElement" style={styles.row}>
                  <View style={styles.rowTop}>
                    <ThemedText type="smallBold">{line.criteria}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      → {line.category}
                    </ThemedText>
                  </View>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() =>
                        setDraft({
                          id: rule.id,
                          merchant: rule.merchant ?? '',
                          mcc: rule.mcc === undefined ? '' : String(rule.mcc),
                          categoryId: rule.categoryId,
                        })
                      }>
                      <ThemedText type="small" themeColor="textSecondary">
                        Змінити
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => remove(rule)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Видалити
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              );
            })
          )}

          <Action title="Назад" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.three },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.three },
});
