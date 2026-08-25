import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action, Choices, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accounts as accountsRepo, transactions as transactionsRepo } from '@/db/repos';
import { account, computeBalance, type Account, type AccountKind } from '@/domain/account';
import { money } from '@/domain/money';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { groupAccountsByKind } from '@/ui/account-groups';
import { formatMinorUnits, formatMoney, parseOpeningBalance } from '@/ui/amount-input';
import { newId } from '@/ui/id';
import { failureMessage, kindLabel, KIND_CHOICES, OFFERED_CURRENCIES } from '@/ui/labels';

import { Spacing } from '@/constants/theme';

/**
 * Рахунки — every account under its вид with its розрахунковий баланс, and the place accounts are
 * created, renamed and archived. No delete action exists: an account is archived, never deleted,
 * so its history keeps explaining the balances it took part in.
 */

const CURRENCY_CHOICES = OFFERED_CURRENCIES.map((c) => ({ value: c, label: c }));

/** An account being created, or an existing one being edited. */
interface Draft {
  readonly editing?: Account;
  name: string;
  kind: AccountKind;
  currency: string;
  opening: string;
}

const blankDraft = (): Draft => ({ name: '', kind: 'spending', currency: 'UAH', opening: '' });

export default function AccountsScreen() {
  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const all = accountsRepo.list();
      const balances = new Map(
        all.map((a) => [a.id, computeBalance(a, transactionsRepo.listByAccount(a.id))]),
      );
      return { all, balances };
    }, []),
  );

  const groups = useMemo(() => groupAccountsByKind(stored.all), [stored.all]);
  const [draft, setDraft] = useState<Draft | undefined>();

  const edit = useCallback((a: Account) => {
    setDraft({
      editing: a,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      // Shown in major units so the owner edits what they see; 0 stays empty rather than "0,00".
      opening: a.openingBalance.amount === 0 ? '' : formatMinorUnits(a.openingBalance.amount),
    });
  }, []);

  const save = useCallback(() => {
    if (!draft) return;
    try {
      if (draft.name.trim() === '') {
        throw new Error('рахунок потребує назви');
      }
      const opening = parseOpeningBalance(draft.opening, draft.currency);
      accountsRepo.save(
        account({
          id: draft.editing?.id ?? newId(),
          name: draft.name.trim(),
          kind: draft.kind,
          currency: draft.currency,
          openingBalance: opening,
          archived: draft.editing?.archived ?? false,
        }),
      );
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert('Не збережено', failureMessage(error));
    }
  }, [draft, reload]);

  const setArchived = useCallback(
    (a: Account, archived: boolean) => {
      try {
        accountsRepo.save(account({ ...a, archived }));
        setDraft(undefined);
        reload();
      } catch (error) {
        Alert.alert('Не збережено', failureMessage(error));
      }
    },
    [reload],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Рахунки</ThemedText>

          {groups.length === 0 && !draft ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText>Ще жодного рахунку. Створіть перший.</ThemedText>
            </ThemedView>
          ) : null}

          {groups.map((group) => (
            <View key={group.kind} style={styles.group}>
              <ThemedText type="smallBold">{kindLabel(group.kind)}</ThemedText>
              {group.accounts.map((a) => (
                <Pressable key={a.id} onPress={() => edit(a)}>
                  <ThemedView type="backgroundElement" style={styles.row}>
                    <ThemedText type="small">{a.name}</ThemedText>
                    <ThemedText type="smallBold">
                      {formatMoney(stored.balances.get(a.id) ?? money(0, a.currency))}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          ))}

          {draft ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                {draft.editing ? 'Редагувати рахунок' : 'Новий рахунок'}
              </ThemedText>
              <Field
                label="Назва"
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                placeholder="mono black"
              />
              <Choices
                label="Вид"
                choices={KIND_CHOICES}
                selected={draft.kind}
                onSelect={(kind) => setDraft({ ...draft, kind })}
                disabled={Boolean(draft.editing)}
              />
              <Choices
                label="Валюта"
                choices={CURRENCY_CHOICES}
                selected={draft.currency}
                onSelect={(currency) => setDraft({ ...draft, currency })}
                disabled={Boolean(draft.editing)}
              />
              {draft.editing ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Вид і валюту після створення змінити не можна.
                </ThemedText>
              ) : null}
              <Field
                label="Початковий залишок"
                value={draft.opening}
                onChangeText={(opening) => setDraft({ ...draft, opening })}
                keyboardType="numbers-and-punctuation"
                placeholder="0,00"
                hint={`${draft.currency} — необовʼязково`}
              />
              <Action title="Зберегти" onPress={save} />
              {draft.editing ? (
                <Action
                  title={draft.editing.archived ? 'Повернути з архіву' : 'До архіву'}
                  onPress={() => setArchived(draft.editing!, !draft.editing!.archived)}
                />
              ) : null}
              <Action title="Скасувати" onPress={() => setDraft(undefined)} />
            </ThemedView>
          ) : (
            <Action title="Створити рахунок" onPress={() => setDraft(blankDraft())} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  group: { gap: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.three },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
