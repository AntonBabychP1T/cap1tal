import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
import { Chevron, ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { categories as categoriesRepo, limits as limitsRepo } from '@/db/repos';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { failureAlert } from '@/ui/failure-alert';
import {
  LIMIT_CURRENCIES,
  LIMIT_IS_A_SPENDING_GOAL,
  limitFromDraft,
  limitDraftFor,
  limitRows,
  type LimitDraft,
} from '@/ui/limits-section';

import { Spacing } from '@/constants/theme';

/**
 * The «Ліміти» section: the optional monthly ceiling each category may carry. Every decision —
 * which categories are listed, what a row says, what a typed сума becomes — is
 * `src/ui/limits-section.ts`, where `verify` can reach it; this file is the wiring.
 *
 * A ліміт colours the category red where its month is shown. It blocks nothing.
 */

const CURRENCY_CHOICES = LIMIT_CURRENCIES.map((currency) => ({ value: currency, label: currency }));

export default function LimitsScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({ categories: categoriesRepo.list(), limits: limitsRepo.list() }),
      [],
    ),
  );

  const rows = useMemo(
    () => limitRows({ categories: stored.categories, limits: stored.limits }),
    [stored.categories, stored.limits],
  );

  /** The category whose ліміт is being set, and the draft beside it; `undefined` — no form open. */
  const [editing, setEditing] = useState<{ categoryId: string; draft: LimitDraft } | undefined>();

  /** The phone's own «назад» closes the open editor first, and only then leaves the section. */
  const closeEditor = useCallback(() => setEditing(undefined), []);
  useCloseOnBack(editing !== undefined, closeEditor);

  const save = useCallback(() => {
    if (!editing) return;
    try {
      limitsRepo.set(limitFromDraft(editing.categoryId, editing.draft));
      setEditing(undefined);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'limit-save', error, report: reportBug }),
      );
    }
  }, [editing, reload, reportBug]);

  const clear = useCallback(
    (categoryId: string, name: string) => {
      Alert.alert('Прибрати ліміт?', `«${name}» більше не матиме місячної стелі.`, [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Прибрати',
          style: 'destructive',
          onPress: () => {
            limitsRepo.clear(categoryId);
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
        title="Ліміти"
        subtitle={`Місячна стеля по категорії. Перевищення лише підсвічує категорію червоним — нічого не блокується. ${LIMIT_IS_A_SPENDING_GOAL}`}
        back={() => router.back()}
      />

      <ListCard>
        {rows.map((row, index) => (
          <ListRow key={row.categoryId} last={index === rows.length - 1} style={styles.row}>
            {/* The row is the way into its editor (settings-screen, "A management list leads
                with its rows and edits a row from the row"): thirty «Встановити» buttons made the
                list a button grid. */}
            <Pressable
              accessibilityRole="button"
              accessibilityHint={row.limit ? 'Змінити або прибрати ліміт' : 'Встановити ліміт'}
              onPress={() =>
                setEditing(
                  editing?.categoryId === row.categoryId
                    ? undefined
                    : {
                        categoryId: row.categoryId,
                        draft: limitDraftFor(stored.limits.find((l) => l.categoryId === row.categoryId)),
                      },
                )
              }
              style={({ pressed }) => [styles.rowTop, pressed ? styles.pressed : null]}>
              <ThemedText
                numberOfLines={1}
                style={styles.name}
                themeColor={row.archived ? 'textMuted' : undefined}>
                {row.name}
              </ThemedText>
              <ThemedText
                type="small"
                tabular
                themeColor={row.limit ? 'textSecondary' : 'textMuted'}>
                {row.limit ?? 'без ліміту'}
              </ThemedText>
              <Chevron />
            </Pressable>
            {/* An archived category is here only because it still carries a ліміт: it is set
                apart so the leftover can be found and cleared, and it leaves once it is. */}
            {row.archived ? (
              <ThemedText type="overline" themeColor="textMuted">
                Архівна категорія
              </ThemedText>
            ) : null}

            {editing?.categoryId === row.categoryId ? (
              <>
                <Field
                  label="Ліміт на місяць"
                  value={editing.draft.amount}
                  onChangeText={(amount) =>
                    setEditing({ ...editing, draft: { ...editing.draft, amount } })
                  }
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  autoFocus
                />
                <Choices
                  label="Валюта"
                  choices={CURRENCY_CHOICES}
                  selected={editing.draft.currency}
                  onSelect={(currency: string) =>
                    setEditing({ ...editing, draft: { ...editing.draft, currency } })
                  }
                />
                <Action title="Зберегти" onPress={save} />
                {row.limit ? (
                  <Action
                    variant="destructive"
                    title="Прибрати ліміт"
                    onPress={() => {
                      closeEditor();
                      clear(row.categoryId, row.name);
                    }}
                  />
                ) : null}
                <Action variant="secondary" title="Скасувати" onPress={closeEditor} />
              </>
            ) : null}
          </ListRow>
        ))}
      </ListCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
  },
  name: { flex: 1 },
  pressed: { opacity: 0.75 },
});
