import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { askAboutFee } from '@/components/fee-dialog';
import { Action, Choices, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { activeAccounts } from '@/domain/account';
import { namesById } from '@/domain/category';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { expenseCategoryChoices, sourceChoices } from '@/ui/category-choices';
import { todayIso } from '@/ui/dates';
import { buildEntry, type EntryType } from '@/ui/entry-form';
import { newId } from '@/ui/id';
import { accountChoiceLabel, failureMessage, transactionTypeLabel } from '@/ui/labels';
import { recategorise } from '@/ui/retype';
import { accountsById, transactionLine } from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * Головний — the screen the app opens on: record a transaction, and the стрічка of the latest
 * ones with editing one tap away. Everything that can be decided without JSX lives in
 * `src/domain` and `src/ui` and is under `verify` — `buildEntry` decides what a filled form
 * stores, `expenseCategoryChoices` what a picker offers, `transactionLine` what a row reads and
 * whether it is «Без категорії»; this file is the wiring. See design.md §6.
 */

const FEED_SIZE = 50;

/** The order the vision names them in; the words themselves are the glossary's, via `labels`. */
const ENTRY_CHOICES: readonly { value: EntryType; label: string }[] = (
  ['expense', 'transfer', 'income', 'refund'] as const
).map((value) => ({ value, label: transactionTypeLabel(value) }));

export default function MainScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        feed: transactionsRepo.listLatest(FEED_SIZE),
        // Every row, archived included: pickers filter, but a feed line still shows the name of a
        // category that has since been archived.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
      }),
      [],
    ),
  );

  const offered = useMemo(() => activeAccounts(stored.accounts), [stored.accounts]);
  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const categoryPicks = useMemo(
    () => expenseCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    [stored.categories],
  );
  const sourcePicks = useMemo(
    () => sourceChoices(stored.sources).map((s) => ({ value: s.id, label: s.name })),
    [stored.sources],
  );

  const [entry, setEntry] = useState<EntryType>('expense');
  const [fromId, setFromId] = useState<string>();
  const [toId, setToId] = useState<string>();
  const [amount, setAmount] = useState('');
  const [arrived, setArrived] = useState('');
  const [date, setDate] = useState(() => todayIso(new Date()));
  const [categoryId, setCategoryId] = useState<string>();
  const [sourceId, setSourceId] = useState<string>();
  /** The «Без категорії» line whose one-tap picker is open, if any. */
  const [categorising, setCategorising] = useState<string>();

  const from = offered.find((a) => a.id === fromId);
  const to = offered.find((a) => a.id === toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);

  /**
   * Choosing an account of another currency clears the сума touching it: an amount is entered in
   * its account's currency, and keeping the digits would reinterpret 125,50 UAH as 125,50 USD.
   */
  const chooseFrom = useCallback(
    (nextId: string) => {
      const next = offered.find((a) => a.id === nextId);
      if (next && from && next.currency !== from.currency) {
        setAmount('');
      }
      setFromId(nextId);
    },
    [from, offered],
  );

  const chooseTo = useCallback(
    (nextId: string) => {
      const next = offered.find((a) => a.id === nextId);
      if (next && to && next.currency !== to.currency) {
        setArrived('');
      }
      setToId(nextId);
    },
    [offered, to],
  );

  /**
   * Switching the type drops the label picked for the previous one. A повернення and a дохід take
   * no default, so carrying a category picked while recording a витрата over into a повернення
   * would be exactly the default the spec forbids.
   */
  const chooseEntry = useCallback((next: EntryType) => {
    setEntry(next);
    setCategoryId(undefined);
    setSourceId(undefined);
  }, []);

  const clear = useCallback(() => {
    setAmount('');
    setArrived('');
    setDate(todayIso(new Date()));
    setCategoryId(undefined);
    setSourceId(undefined);
    reload();
  }, [reload]);

  const store = useCallback(
    (...written: Transaction[]) => {
      const now = new Date();
      for (const t of written) {
        transactionsRepo.save(t, now);
      }
      clear();
    },
    [clear],
  );

  const record = useCallback(() => {
    try {
      const built = buildEntry(
        {
          type: entry,
          accountId: fromId,
          toAccountId: toId,
          amount,
          arrived,
          date,
          categoryId,
          sourceId,
        },
        { id: newId(), accounts: offered },
      );
      // Only a переказ can arrive short, and only the owner decides whether that was a комісія.
      if (built.type === 'transfer') {
        askAboutFee(built, store);
        return;
      }
      store(built);
    } catch (error) {
      Alert.alert('Не записано', failureMessage(error));
    }
  }, [amount, arrived, categoryId, date, entry, fromId, offered, sourceId, store, toId]);

  /** One tap from the feed: the same transaction under the same id, now carrying the pick. */
  const categorise = useCallback(
    (t: Transaction, picked: string) => {
      try {
        transactionsRepo.save(recategorise(t, picked), new Date());
        setCategorising(undefined);
        reload();
      } catch (error) {
        Alert.alert('Не збережено', failureMessage(error));
      }
    },
    [reload],
  );

  const accountChoices = offered.map((a) => ({ value: a.id, label: accountChoiceLabel(a) }));

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Головний</ThemedText>

          {offered.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText>Спершу створіть рахунок — без нього нічого записати.</ThemedText>
              <Action title="До Рахунків" onPress={() => router.push('/accounts')} />
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <Choices
                label="Тип"
                choices={ENTRY_CHOICES}
                selected={entry}
                onSelect={chooseEntry}
              />
              <Choices
                label={entry === 'transfer' ? 'Звідки' : 'Рахунок'}
                choices={accountChoices}
                selected={fromId}
                onSelect={chooseFrom}
              />
              {entry === 'transfer' ? (
                <Choices
                  label="Куди"
                  choices={accountChoices}
                  selected={toId}
                  onSelect={chooseTo}
                />
              ) : null}
              <Field
                label={entry === 'transfer' ? 'Скільки пішло' : 'Сума'}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                hint={from ? from.currency : undefined}
              />
              {entry === 'transfer' && from && to ? (
                <Field
                  label="Скільки прийшло"
                  value={arrived}
                  onChangeText={setArrived}
                  keyboardType="decimal-pad"
                  placeholder={crossCurrency ? '0,00' : 'стільки ж'}
                  hint={
                    crossCurrency
                      ? to.currency
                      : `${to.currency} — залиште порожнім, якщо без комісії`
                  }
                />
              ) : null}
              <Field
                label="Дата"
                value={date}
                onChangeText={setDate}
                autoCapitalize="none"
                placeholder="РРРР-ММ-ДД"
              />
              {/* A витрата arrives carrying «Без категорії» and the owner may pick another; a
                  повернення has no default and is not stored until one is picked. */}
              {entry === 'expense' || entry === 'refund' ? (
                <Choices
                  label={entry === 'refund' ? 'До якої категорії' : 'Категорія'}
                  choices={categoryPicks}
                  selected={
                    entry === 'expense' ? (categoryId ?? UNCATEGORISED_CATEGORY_ID) : categoryId
                  }
                  onSelect={setCategoryId}
                />
              ) : null}
              {entry === 'income' ? (
                <Choices
                  label="Джерело"
                  choices={sourcePicks}
                  selected={sourceId}
                  onSelect={setSourceId}
                />
              ) : null}
              <Action title="Записати" onPress={record} />
            </ThemedView>
          )}

          <ThemedText type="smallBold">Останні транзакції</ThemedText>
          {stored.feed.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Поки нічого не записано.
            </ThemedText>
          ) : (
            stored.feed.map((t) => {
              const line = transactionLine(t, byId, categoryNames);
              return (
                <ThemedView key={line.id} type="backgroundElement" style={styles.row}>
                  <Pressable onPress={() => router.push(`/transaction/${line.id}`)}>
                    <View style={styles.rowTop}>
                      <ThemedText type="smallBold">{line.amount}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {line.date}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {line.type} · {line.accounts}
                      {line.category ? ` · ${line.category}` : ''}
                    </ThemedText>
                  </Pressable>

                  {/* The mark, and the one tap behind it: picking here stores the category on the
                      transaction without the editing screen ever opening. */}
                  {line.uncategorised ? (
                    <Pressable
                      onPress={() =>
                        setCategorising(categorising === line.id ? undefined : line.id)
                      }>
                      <ThemedText type="smallBold">
                        {categorising === line.id ? 'Згорнути' : '● Обрати категорію'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {categorising === line.id ? (
                    <Choices
                      label="Категорія"
                      choices={categoryPicks.filter((c) => c.value !== UNCATEGORISED_CATEGORY_ID)}
                      selected={undefined}
                      onSelect={(picked: string) => categorise(t, picked)}
                    />
                  ) : null}
                </ThemedView>
              );
            })
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
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.three },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.one },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
