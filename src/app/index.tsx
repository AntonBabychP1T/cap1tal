import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { askAboutFee } from '@/components/fee-dialog';
import { Action, Choices, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accounts as accountsRepo, transactions as transactionsRepo } from '@/db/repos';
import { activeAccounts } from '@/domain/account';
import { expenseByDefault, transfer, type Transaction } from '@/domain/transaction';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { parseAmount } from '@/ui/amount-input';
import { todayIso } from '@/ui/dates';
import { newId } from '@/ui/id';
import { accountChoiceLabel, failureMessage } from '@/ui/labels';
import { accountsById, transactionLine } from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * Головний — the screen the app opens on: record a transaction, and the стрічка of the latest
 * ones with editing one tap away. Everything that can be decided without JSX lives in
 * `src/domain` and `src/ui` and is under `verify`; this file is the wiring. See design.md §6.
 */

const FEED_SIZE = 50;

type Entry = 'expense' | 'transfer';

export default function MainScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        feed: transactionsRepo.listLatest(FEED_SIZE),
      }),
      [],
    ),
  );

  const offered = useMemo(() => activeAccounts(stored.accounts), [stored.accounts]);
  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);

  const [entry, setEntry] = useState<Entry>('expense');
  const [fromId, setFromId] = useState<string>();
  const [toId, setToId] = useState<string>();
  const [amount, setAmount] = useState('');
  const [arrived, setArrived] = useState('');
  const [date, setDate] = useState(() => todayIso(new Date()));

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

  const clear = useCallback(() => {
    setAmount('');
    setArrived('');
    setDate(todayIso(new Date()));
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
      if (!from) {
        throw new Error('оберіть рахунок');
      }
      if (entry === 'expense') {
        store(
          expenseByDefault({
            id: newId(),
            date,
            accountId: from.id,
            amount: parseAmount(amount, from.currency),
          }),
        );
        return;
      }
      if (!to) {
        throw new Error('оберіть рахунок, куди прийшли гроші');
      }
      const left = parseAmount(amount, from.currency);
      // Same currency: «скільки прийшло» is optional and defaults to the сума that left, so an
      // untouched field records the same amount on both legs and proposes no комісія.
      const arrivedMoney = crossCurrency
        ? parseAmount(arrived, to.currency)
        : arrived.trim() === ''
          ? left
          : parseAmount(arrived, to.currency);
      // `transfer` rejects the same account on both legs; the error surfaces below.
      const candidate = transfer({
        id: newId(),
        date,
        fromAccountId: from.id,
        toAccountId: to.id,
        left,
        arrived: arrivedMoney,
      });
      askAboutFee(candidate, store);
    } catch (error) {
      Alert.alert('Не записано', failureMessage(error));
    }
  }, [amount, arrived, crossCurrency, date, entry, from, store, to]);

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
                choices={[
                  { value: 'expense' as const, label: 'витрата' },
                  { value: 'transfer' as const, label: 'переказ' },
                ]}
                selected={entry}
                onSelect={setEntry}
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
              {entry === 'expense' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Категорія: Без категорії
                </ThemedText>
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
              const line = transactionLine(t, byId);
              return (
                <Pressable key={line.id} onPress={() => router.push(`/transaction/${line.id}`)}>
                  <ThemedView type="backgroundElement" style={styles.row}>
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
                  </ThemedView>
                </Pressable>
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
