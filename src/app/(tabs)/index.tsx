import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { askAboutTransfer } from '@/components/transfer-dialog';
import { Action, Choices, Field, RowAction } from '@/components/form';
import {
  Card,
  ListCard,
  ListRow,
  Mark,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
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
import { firstRun } from '@/ui/onboarding';
import { accountChoiceLabel, failureMessage, transactionTypeLabel } from '@/ui/labels';
import { recategorise } from '@/ui/retype';
import {
  accountsById,
  feedSubtitle,
  feedTitle,
  overLimitByMonth,
  transactionLine,
} from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * Головний — the screen the app opens on: record a transaction, and the стрічка of the latest
 * ones with editing one tap away. Everything that can be decided without JSX lives in
 * `src/domain` and `src/ui` and is under `verify` — `buildEntry` decides what a filled form
 * stores, `expenseCategoryChoices` what a picker offers, `transactionLine` what a row reads and
 * whether it is «Без категорії»; this file is the wiring. See design.md §6.
 */

const FEED_SIZE = 50;

/**
 * Whether this launch has already been handed to «Перші кроки». Module state on purpose: the
 * redirect is about *launching* on a device that holds nothing, and once the owner has left the
 * checklist nothing may pull them back into it for the rest of the session — leaving it is always
 * allowed, and «Перші кроки» stays in Налаштування.
 */
let landedOnSetup = false;

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
        limits: limitsRepo.list(),
      }),
      [],
    ),
  );

  /**
   * A device with no рахунок and no транзакція is a device on which this screen can do nothing —
   * the «+» refuses every entry without a рахунок. So the first launch of such a device opens on
   * «Перші кроки» instead. Once anything exists, or once the owner has left the checklist, this
   * never fires again.
   */
  const setupNeeded = firstRun({
    accounts: stored.accounts.length,
    transactions: stored.feed.length,
  });
  useEffect(() => {
    if (landedOnSetup || !setupNeeded) {
      return;
    }
    landedOnSetup = true;
    router.replace('/onboarding');
  }, [router, setupNeeded]);

  const offered = useMemo(() => activeAccounts(stored.accounts), [stored.accounts]);
  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  // The джерела by id too: an imported дохід carries «Без джерела», and the feed has to name it.
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const categoryPicks = useMemo(
    () => expenseCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    [stored.categories],
  );
  const sourcePicks = useMemo(
    () => sourceChoices(stored.sources).map((s) => ({ value: s.id, label: s.name })),
    [stored.sources],
  );
  /**
   * Which categories are over their ліміт, per month of the loaded feed. The feed holds the latest
   * транзакції, not whole months, so each month it touches — one or two, typically — is read in
   * full for its breakdown. `overLimitByMonth` decides everything; this is the read it needs.
   */
  const overLimit = useMemo(
    () =>
      overLimitByMonth({
        feed: stored.feed,
        limits: stored.limits,
        monthTransactions: (month) => transactionsRepo.listMonth(month),
      }),
    [stored.feed, stored.limits],
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
      // Only a переказ can propose anything on top of itself, and the owner decides whether it is.
      if (built.type === 'transfer') {
        // The рахунок the money left decides what may be proposed, and its stored транзакції are
        // what says how much that person still owed before this переказ.
        askAboutTransfer(
          built,
          {
            accounts: offered,
            sourceTransactions: transactionsRepo.listByAccount(built.fromAccountId),
          },
          store,
        );
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
    <Screen>
      <ScreenHeader title="Головний" />

      {offered.length === 0 ? (
        <Card>
          <ThemedText>Спершу створіть рахунок — без нього нічого записати.</ThemedText>
          <Action title="До Рахунків" onPress={() => router.push('/accounts')} />
        </Card>
      ) : (
        <Card style={styles.form}>
          <Choices label="Тип" choices={ENTRY_CHOICES} selected={entry} onSelect={chooseEntry} />
          <Choices
            label={entry === 'transfer' ? 'Звідки' : 'Рахунок'}
            choices={accountChoices}
            selected={fromId}
            onSelect={chooseFrom}
          />
          {entry === 'transfer' ? (
            <Choices label="Куди" choices={accountChoices} selected={toId} onSelect={chooseTo} />
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
                crossCurrency ? to.currency : `${to.currency} — залиште порожнім, якщо без комісії`
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
        </Card>
      )}

      <SectionLabel>Останні транзакції</SectionLabel>
      {stored.feed.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки нічого не записано.
        </ThemedText>
      ) : (
        <ListCard>
          {stored.feed.map((t, index) => {
            const line = transactionLine(t, byId, categoryNames, sourceNames, overLimit);
            return (
              <ListRow key={line.id} last={index === stored.feed.length - 1} style={styles.row}>
                <Pressable onPress={() => router.push(`/transaction/${line.id}`)}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowLabel}>
                      <View style={styles.rowTitle}>
                        {/* The mark, not a repainted row: what is uncategorised is the label. */}
                        {line.uncategorised ? <Mark /> : null}
                        {/* The category over its ліміт for this транзакція's month turns red, and
                            nothing else on the line changes. */}
                        <ThemedText
                          numberOfLines={1}
                          themeColor={line.overLimit ? 'textDanger' : undefined}
                        >
                          {feedTitle(line)}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {feedSubtitle(line)}
                      </ThemedText>
                      {/* The bank's own text, on its own line: what an uncategorised «СІЛЬПО Київ»
                          actually was, before the owner has said. A manual транзакція has none and
                          gets no empty row. */}
                      {line.description ? (
                        <ThemedText type="small" themeColor="textMuted">
                          {line.description}
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText
                      tabular
                      style={styles.amount}
                      themeColor={
                        t.type === 'income'
                          ? 'textPositive'
                          : t.type === 'transfer'
                            ? 'textSecondary'
                            : undefined
                      }
                    >
                      {line.amount}
                    </ThemedText>
                  </View>
                </Pressable>

                {/* The one tap behind the mark: picking here stores the category on the
                    transaction without the editing screen ever opening. */}
                {line.uncategorised ? (
                  <View style={styles.rowActions}>
                    <RowAction
                      title={categorising === line.id ? 'Згорнути' : 'Обрати категорію'}
                      onPress={() =>
                        setCategorising(categorising === line.id ? undefined : line.id)
                      }
                    />
                  </View>
                ) : null}
                {categorising === line.id ? (
                  <Choices
                    label="Категорія"
                    choices={categoryPicks.filter((c) => c.value !== UNCATEGORISED_CATEGORY_ID)}
                    selected={undefined}
                    onSelect={(picked: string) => categorise(t, picked)}
                  />
                ) : null}
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
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowLabel: { flex: 1, gap: Spacing.half },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - Spacing.half },
  rowActions: { flexDirection: 'row' },
  amount: { fontWeight: 600 },
});
