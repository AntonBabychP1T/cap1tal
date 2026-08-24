import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { askAboutFee } from '@/components/fee-dialog';
import { Action, Choices, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accounts as accountsRepo, transactions as transactionsRepo } from '@/db/repos';
import type { Account } from '@/domain/account';
import {
  expenseByDefault,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '@/domain/transaction';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountChoicesFor, legsOf } from '@/ui/account-choices';
import { formatMinorUnits, parseAmount } from '@/ui/amount-input';
import { accountChoiceLabel, failureMessage } from '@/ui/labels';

import { Spacing } from '@/constants/theme';

/**
 * Editing one transaction: its сума, дата and рахунок(и), retyping витрата ↔ переказ under the
 * same id, and deleting it after a confirmation. Only витрата and переказ can be edited here —
 * дохід, повернення and коригування arrive with the capabilities that can record them, and are
 * shown read-only rather than half-editable.
 */

type Shape = 'expense' | 'transfer';

export default function EditTransactionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({ accounts: accountsRepo.list(), transaction: transactionsRepo.get(id) }),
      [id],
    ),
  );
  const original = stored.transaction;

  /**
   * One list per leg, not one for the screen: an archived account is offered for nothing new —
   * including as the destination a витрата is retyped onto — yet the leg it already sits on keeps
   * showing it, so opening that transaction never silently moves it off (`src/ui/account-choices`).
   * The lookups below resolve against these same lists, so a transaction on an archived account
   * stays saveable.
   */
  const legs = useMemo(() => (original ? legsOf(original) : {}), [original]);
  const sourceChoices = useMemo(
    () => accountChoicesFor(stored.accounts, legs.source),
    [legs.source, stored.accounts],
  );
  const destinationChoices = useMemo(
    () => accountChoicesFor(stored.accounts, legs.destination),
    [legs.destination, stored.accounts],
  );

  const [form, setForm] = useState(() => initialForm(original));

  const from = sourceChoices.find((a) => a.id === form?.fromId);
  const to = destinationChoices.find((a) => a.id === form?.toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);

  /**
   * Choosing an account of another currency clears the сума touching it: the spec says it is
   * entered anew in the new account's currency. Keeping the digits would reinterpret 125,50 UAH
   * as 125,50 USD — not a conversion, but it would look like one.
   */
  const chooseFrom = useCallback(
    (fromId: string) => {
      if (!form) return;
      const next = sourceChoices.find((a) => a.id === fromId);
      const currencyChanged = Boolean(next && from && next.currency !== from.currency);
      setForm({ ...form, fromId, ...(currencyChanged ? { amount: '' } : {}) });
    },
    [form, from, sourceChoices],
  );

  const chooseTo = useCallback(
    (toId: string) => {
      if (!form) return;
      const next = destinationChoices.find((a) => a.id === toId);
      const currencyChanged = Boolean(next && to && next.currency !== to.currency);
      setForm({ ...form, toId, ...(currencyChanged ? { arrived: '' } : {}) });
    },
    [destinationChoices, form, to],
  );

  const store = useCallback(
    (...written: Transaction[]) => {
      const now = new Date();
      for (const t of written) {
        transactionsRepo.save(t, now);
      }
      router.back();
    },
    [router],
  );

  const apply = useCallback(() => {
    if (!form || !original) return;
    try {
      if (!from) {
        throw new Error('оберіть рахунок');
      }
      if (form.shape === 'expense') {
        // A different-currency рахунок means the сума is entered anew in that currency; nothing
        // is converted, so no amount can land on an account in a foreign currency.
        store(
          expenseByDefault({
            id: original.id,
            date: form.date,
            accountId: from.id,
            amount: parseAmount(form.amount, from.currency),
            categoryId: categoryOf(original),
          }),
        );
        return;
      }
      if (!to) {
        throw new Error('оберіть рахунок, куди прийшли гроші');
      }
      const left = parseAmount(form.amount, from.currency);
      const arrived = crossCurrency
        ? parseAmount(form.arrived, to.currency)
        : form.arrived.trim() === ''
          ? left
          : parseAmount(form.arrived, to.currency);
      askAboutFee(
        transfer({
          id: original.id,
          date: form.date,
          fromAccountId: from.id,
          toAccountId: to.id,
          left,
          arrived,
        }),
        store,
      );
    } catch (error) {
      Alert.alert('Не збережено', failureMessage(error));
    }
  }, [crossCurrency, form, from, original, store, to]);

  const remove = useCallback(() => {
    if (!original) return;
    Alert.alert('Видалити транзакцію?', 'Її не буде ні у стрічці, ні в історії рахунку.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => {
          transactionsRepo.remove(original.id);
          router.back();
        },
      },
    ]);
  }, [original, router]);

  if (!original) {
    return (
      <Screen>
        <ThemedText>Транзакцію не знайдено.</ThemedText>
        <Action title="Назад" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!form) {
    return (
      <Screen>
        <ThemedText type="smallBold">Ця транзакція поки не редагується</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Дохід, повернення і коригування зʼявляться разом із кроками, що вміють їх записувати.
        </ThemedText>
        <Action title="Видалити" onPress={remove} />
        <Action title="Назад" onPress={() => router.back()} />
      </Screen>
    );
  }

  const asChoices = (list: readonly Account[]) =>
    list.map((a) => ({ value: a.id, label: accountChoiceLabel(a) }));

  return (
    <Screen>
      <ThemedText type="subtitle">Транзакція</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <Choices
          label="Тип"
          choices={[
            { value: 'expense' as const, label: 'витрата' },
            { value: 'transfer' as const, label: 'переказ' },
          ]}
          selected={form.shape}
          onSelect={(shape: Shape) => setForm({ ...form, shape })}
        />
        <Choices
          label={form.shape === 'transfer' ? 'Звідки' : 'Рахунок'}
          choices={asChoices(sourceChoices)}
          selected={form.fromId}
          onSelect={chooseFrom}
        />
        {form.shape === 'transfer' ? (
          <Choices
            label="Куди"
            choices={asChoices(destinationChoices)}
            selected={form.toId}
            onSelect={chooseTo}
          />
        ) : null}
        <Field
          label={form.shape === 'transfer' ? 'Скільки пішло' : 'Сума'}
          value={form.amount}
          onChangeText={(amount) => setForm({ ...form, amount })}
          keyboardType="decimal-pad"
          hint={from ? from.currency : undefined}
        />
        {form.shape === 'transfer' && from && to ? (
          <Field
            label="Скільки прийшло"
            value={form.arrived}
            onChangeText={(arrived) => setForm({ ...form, arrived })}
            keyboardType="decimal-pad"
            placeholder={crossCurrency ? '0,00' : 'стільки ж'}
            hint={crossCurrency ? to.currency : `${to.currency} — порожнє означає без комісії`}
          />
        ) : null}
        <Field
          label="Дата"
          value={form.date}
          onChangeText={(date) => setForm({ ...form, date })}
          autoCapitalize="none"
          placeholder="РРРР-ММ-ДД"
        />
        <Action title="Зберегти" onPress={apply} />
        <Action title="Видалити" onPress={remove} />
        <Action title="Назад" onPress={() => router.back()} />
      </ThemedView>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

interface Form {
  shape: Shape;
  fromId: string;
  toId: string;
  amount: string;
  arrived: string;
  date: string;
}

/**
 * A переказ opens on the сума that left and the account it left; retyping it into a витрата
 * therefore keeps exactly those, and drops the arrived leg. `undefined` means the type is one
 * this screen does not edit yet.
 */
function initialForm(t: Transaction | undefined): Form | undefined {
  if (!t) return undefined;
  if (t.type === 'expense') {
    return {
      shape: 'expense',
      fromId: t.accountId,
      toId: '',
      amount: formatMinorUnits(t.amount.amount),
      arrived: '',
      date: t.date,
    };
  }
  if (t.type === 'transfer') {
    return {
      shape: 'transfer',
      fromId: t.fromAccountId,
      toId: t.toAccountId,
      amount: formatMinorUnits(t.left.amount),
      arrived:
        t.left.currency === t.arrived.currency && t.left.amount === t.arrived.amount
          ? ''
          : formatMinorUnits(t.arrived.amount),
      date: t.date,
    };
  }
  return undefined;
}

/** An expense keeps the category it had; a переказ becoming a витрата lands in "Без категорії". */
function categoryOf(t: Transaction): string {
  return t.type === 'expense' ? t.categoryId : UNCATEGORISED_CATEGORY_ID;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.three },
});
