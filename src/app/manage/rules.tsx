import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import { Card, ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { accounts as accountsRepo, categories as categoriesRepo, rules as rulesRepo } from '@/db/repos';
import { namesById } from '@/domain/category';
import type { Rule } from '@/domain/rules';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountChoicesFor } from '@/ui/account-choices';
import { expenseCategoryChoices } from '@/ui/category-choices';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { accountChoiceLabel } from '@/ui/labels';
import { ruleFromDraft, ruleLine, storeRule, type RuleDraft } from '@/ui/list-management';

import { Spacing } from '@/constants/theme';

/**
 * The «Правила» section: «продавець і/або MCC → категорія», or — a правило-переказ — «→ переказ
 * на рахунок». Both are ranked on one ladder (categorisation-rules).
 *
 * A rule's target may be an archived категорія or рахунок: archiving hides either from pickers,
 * not from rules. So the list resolves names against every категорія and every рахунок, while the
 * form offers only the unarchived ones — retargeting an archived rule is the owner's decision, not
 * a silent one.
 */

const EMPTY: RuleDraft = { merchant: '', mcc: '', target: 'category', categoryId: undefined };

const TARGET_CHOICES = [
  { value: 'category' as const, label: 'Категорія' },
  { value: 'transfer' as const, label: 'Переказ' },
];

export default function RulesScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        rules: rulesRepo.list(),
        categories: categoriesRepo.list(),
        accounts: accountsRepo.list(),
      }),
      [],
    ),
  );

  /** `undefined` — the form is closed; a draft with no id — a new rule; with one — an edit. */
  const [draft, setDraft] = useState<(RuleDraft & { id?: string }) | undefined>();

  const names = useMemo(() => namesById(stored.categories), [stored.categories]);
  const accountNames = useMemo(() => namesById(stored.accounts), [stored.accounts]);
  const choices = useMemo(
    () =>
      expenseCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    [stored.categories],
  );
  const accountChoices = useMemo(
    () =>
      accountChoicesFor(stored.accounts, draft?.toAccountId).map((a) => ({
        value: a.id,
        label: accountChoiceLabel(a),
      })),
    [draft?.toAccountId, stored.accounts],
  );

  /** What the last save's розбір moved, in the owner's words — nothing when it moved nothing. */
  const [sweptMessage, setSweptMessage] = useState<string>();

  const save = useCallback(async () => {
    if (!draft) return;
    try {
      const existing = draft.id ? rulesRepo.get(draft.id) : undefined;
      const message = await storeRule(
        ruleFromDraft(draft, {
          id: draft.id ?? newId(),
          // An edited rule keeps the moment it was created: `createdAt` is what breaks a tie
          // between two equally specific rules, so editing one must not jump it to the front.
          createdAt: existing?.createdAt ?? new Date(),
        }),
        rulesRepo.save,
      );
      setDraft(undefined);
      setSweptMessage(message);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'rule-save', error, report: reportBug }),
      );
    }
  }, [draft, reload, reportBug]);

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
        subtitle="«Продавець / MCC → категорія», або → переказ на рахунок."
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
            label="Мета"
            choices={TARGET_CHOICES}
            selected={draft.target}
            // Switching drops the other choice — a rule is never submitted naming both
            // (categorisation-rules, "A rule naming both a category and a рахунок is rejected").
            onSelect={(target) => setDraft({ ...draft, target })}
          />
          {draft.target === 'transfer' ? (
            <Choices
              label="Переказ на"
              choices={accountChoices}
              selected={draft.toAccountId}
              onSelect={(toAccountId: string) => setDraft({ ...draft, toAccountId })}
            />
          ) : (
            <Choices
              label="Категорія"
              choices={choices}
              selected={draft.categoryId}
              onSelect={(categoryId: string) => setDraft({ ...draft, categoryId })}
            />
          )}
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={() => setDraft(undefined)} />
        </Card>
      ) : (
        <Action
          title="Нове правило"
          onPress={() => {
            setSweptMessage(undefined);
            setDraft({ ...EMPTY });
          }}
        />
      )}
      {/* Where the owner is already looking, without scrolling: what the розбір just moved. A
          pass that moved nothing says nothing (rules-everywhere design D7). */}
      {sweptMessage ? (
        <ThemedText type="small" themeColor="textPositive">
          {sweptMessage}
        </ThemedText>
      ) : null}

      {stored.rules.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки жодного правила.
        </ThemedText>
      ) : (
        <ListCard>
          {stored.rules.map((rule, index) => {
            const line = ruleLine(rule, names, accountNames);
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
                    onPress={() => {
                      setSweptMessage(undefined);
                      setDraft({
                        id: rule.id,
                        merchant: rule.merchant ?? '',
                        mcc: rule.mcc === undefined ? '' : String(rule.mcc),
                        target: rule.target.kind,
                        ...(rule.target.kind === 'category'
                          ? { categoryId: rule.target.categoryId }
                          : { toAccountId: rule.target.toAccountId }),
                      });
                    }}
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
