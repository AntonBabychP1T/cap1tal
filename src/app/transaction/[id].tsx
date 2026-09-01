import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { askAboutTransfer } from '@/components/transfer-dialog';
import { Action, Choices, Field } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import type { Account } from '@/domain/account';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountChoicesFor, legsOf } from '@/ui/account-choices';
import { formatMinorUnits } from '@/ui/amount-input';
import { categoryChoicesFor, sourceChoicesFor } from '@/ui/category-choices';
import { buildEntry, normaliseDescription, type EntryType } from '@/ui/entry-form';
import { accountChoiceLabel, failureMessage, transactionTypeLabel } from '@/ui/labels';
import { labelsAfterRetype, shapesFor } from '@/ui/retype';

import { Spacing } from '@/constants/theme';

/**
 * Editing one transaction: its сума, дата, рахунок(и), its category or джерело, retyping under
 * the same id, and deleting it after a confirmation.
 *
 * What a filled form stores is `buildEntry` — the same function the Головний entry form uses, so
 * recording and editing cannot drift apart, and giving it the original's id is all that makes
 * this an edit rather than a new transaction. What a retype carries over is `labelsAfterRetype`.
 * Both are pure and under `verify`; this file is the wiring.
 *
 * A коригування is still shown read-only: nothing can record one until «звірити» arrives, so
 * there is no form for it to open into.
 */

export default function EditTransactionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        transaction: transactionsRepo.get(id),
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
      }),
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
  const sourceChoicesList = useMemo(
    () => accountChoicesFor(stored.accounts, legs.source),
    [legs.source, stored.accounts],
  );
  const destinationChoices = useMemo(
    () => accountChoicesFor(stored.accounts, legs.destination),
    [legs.destination, stored.accounts],
  );

  const [form, setForm] = useState(() => initialForm(original));

  const from = sourceChoicesList.find((a) => a.id === form?.fromId);
  const to = destinationChoices.find((a) => a.id === form?.toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);

  /** The same reasoning as the account pickers: an archived label the transaction carries stays. */
  const categoryPicks = useMemo(
    () =>
      categoryChoicesFor(stored.categories, form?.categoryId).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    [form?.categoryId, stored.categories],
  );
  const sourcePicks = useMemo(
    () =>
      sourceChoicesFor(stored.sources, form?.sourceId).map((s) => ({
        value: s.id,
        label: s.name,
      })),
    [form?.sourceId, stored.sources],
  );

  /**
   * Choosing an account of another currency clears the сума touching it: the spec says it is
   * entered anew in the new account's currency. Keeping the digits would reinterpret 125,50 UAH
   * as 125,50 USD — not a conversion, but it would look like one.
   */
  const chooseFrom = useCallback(
    (fromId: string) => {
      if (!form) return;
      const next = sourceChoicesList.find((a) => a.id === fromId);
      const currencyChanged = Boolean(next && from && next.currency !== from.currency);
      setForm({ ...form, fromId, ...(currencyChanged ? { amount: '' } : {}) });
    },
    [form, from, sourceChoicesList],
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

  /** Flipping the type: `labelsAfterRetype` decides what the pickers keep showing. */
  const chooseShape = useCallback(
    (shape: EntryType) => {
      if (!form || !original) return;
      const carried = labelsAfterRetype(original, shape);
      setForm({ ...form, shape, categoryId: carried.categoryId, sourceId: carried.sourceId });
    },
    [form, original],
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
      // The original's id is what makes this an edit: same transaction, whatever shape it takes.
      const built = buildEntry(
        {
          type: form.shape,
          accountId: form.fromId,
          toAccountId: form.toId,
          amount: form.amount,
          arrived: form.arrived,
          date: form.date,
          categoryId: form.categoryId,
          sourceId: form.sourceId,
          // The опис as the form now holds it — the owner's correction, or the bank's text
          // untouched when they left it alone. Every shape the транзакція is retyped into keeps
          // whatever it says, and an emptied field clears it rather than storing «».
          description: normaliseDescription(form.description),
        },
        { id: original.id, accounts: stored.accounts },
      );
      if (built.type === 'transfer') {
        // The рахунок the money left decides what may be proposed, and its stored транзакції are
        // what says how much that person still owed before this переказ.
        askAboutTransfer(
          built,
          {
            accounts: stored.accounts,
            sourceTransactions: transactionsRepo.listByAccount(built.fromAccountId),
          },
          store,
        );
        return;
      }
      store(built);
    } catch (error) {
      Alert.alert('Не збережено', failureMessage(error));
    }
  }, [form, original, store, stored.accounts]);

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
        <ScreenHeader title="Транзакція" back={() => router.back()} />
        <ThemedText>Транзакцію не знайдено.</ThemedText>
      </Screen>
    );
  }

  if (!form) {
    return (
      <Screen>
        <ScreenHeader title="Коригування" back={() => router.back()} />
        <Card>
          <ThemedText>Коригування поки не редагується</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Воно зʼявиться разом зі «звірити», що вміє його записати.
          </ThemedText>
          <StoredDescription of={original} />
        </Card>
        <Action variant="destructive" title="Видалити транзакцію" onPress={remove} />
      </Screen>
    );
  }

  const asChoices = (list: readonly Account[]) =>
    list.map((a) => ({ value: a.id, label: accountChoiceLabel(a) }));

  return (
    <Screen>
      <ScreenHeader title="Транзакція" back={() => router.back()} />
      <Card style={styles.form}>
        <Choices
          label="Тип"
          choices={shapesFor(original).map((shape) => ({
            value: shape,
            label: transactionTypeLabel(shape),
          }))}
          selected={form.shape}
          onSelect={chooseShape}
        />
        <Choices
          label={form.shape === 'transfer' ? 'Звідки' : 'Рахунок'}
          choices={asChoices(sourceChoicesList)}
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
        {/* The опис, editable whatever put it there — an import, a чернетка or the owner's own
            hand. No placeholder: a транзакція carrying none shows an empty field and nothing
            standing in for a description it does not have. */}
        <Field
          label="Опис"
          value={form.description}
          onChangeText={(description) => setForm({ ...form, description })}
        />
        {/* A витрата shows «Без категорії» selected when it carries nothing, because that is what
            saving would store — the same default the Головний form shows. A повернення shows
            nothing selected, because nothing is what saving it would refuse. */}
        {form.shape === 'expense' || form.shape === 'refund' ? (
          <Choices
            label={form.shape === 'refund' ? 'До якої категорії' : 'Категорія'}
            choices={categoryPicks}
            selected={
              form.shape === 'expense'
                ? (form.categoryId ?? UNCATEGORISED_CATEGORY_ID)
                : form.categoryId
            }
            onSelect={(categoryId: string) => setForm({ ...form, categoryId })}
          />
        ) : null}
        {form.shape === 'income' ? (
          <Choices
            label="Джерело"
            choices={sourcePicks}
            selected={form.sourceId}
            onSelect={(sourceId: string) => setForm({ ...form, sourceId })}
          />
        ) : null}
      </Card>
      {/* The one accent fill on this screen, and the destructive verb under it as text alone —
          deleting is never the loudest thing here. */}
      <Action title="Зберегти" onPress={apply} />
      <Action variant="destructive" title="Видалити транзакцію" onPress={remove} />
    </Screen>
  );
}

/**
 * The опис of a коригування — the one транзакція this screen shows rather than edits, so its опис
 * is read here and nowhere corrected. Named «Опис» and not «Опис від банку»: the text is no longer
 * the bank's alone. A транзакція carrying none renders nothing at all, so nothing stands in for a
 * description that does not exist.
 */
function StoredDescription({ of }: { of: Transaction }) {
  if (!of.description) {
    return null;
  }
  return (
    <View style={styles.field}>
      <ThemedText type="overline">Опис</ThemedText>
      <ThemedText>{of.description}</ThemedText>
    </View>
  );
}

interface Form {
  shape: EntryType;
  fromId: string;
  toId: string;
  amount: string;
  arrived: string;
  date: string;
  categoryId?: string;
  sourceId?: string;
  /** The опис as typed. Empty means none — `normaliseDescription` turns it back into `undefined`. */
  description: string;
}

/**
 * A переказ opens on the сума that left and the account it left; retyping it into a витрата
 * therefore keeps exactly those, and drops the arrived leg. `undefined` means a коригування,
 * which this screen shows rather than edits.
 */
function initialForm(t: Transaction | undefined): Form | undefined {
  if (!t) return undefined;
  const common = { toId: '', arrived: '', date: t.date, description: t.description ?? '' };
  if (t.type === 'transfer') {
    return {
      ...common,
      shape: 'transfer',
      fromId: t.fromAccountId,
      toId: t.toAccountId,
      amount: formatMinorUnits(t.left.amount),
      arrived:
        t.left.currency === t.arrived.currency && t.left.amount === t.arrived.amount
          ? ''
          : formatMinorUnits(t.arrived.amount),
    };
  }
  if (t.type === 'correction') {
    return undefined;
  }
  return {
    ...common,
    shape: t.type,
    fromId: t.accountId,
    amount: formatMinorUnits(t.amount.amount),
    ...(t.type === 'income' ? { sourceId: t.sourceId } : { categoryId: t.categoryId }),
  };
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
});
