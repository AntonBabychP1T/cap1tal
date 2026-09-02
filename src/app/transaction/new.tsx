import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { askAboutTransfer } from '@/components/transfer-dialog';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  entryDefaults as entryDefaultsRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { activeAccounts } from '@/domain/account';
import { namesById } from '@/domain/category';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { ALERT_PORTS, attended } from '@/hooks/use-alerting';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';
import {
  expenseCategoryChoices,
  recentlyUsed,
  recentRows,
  sourceChoices,
} from '@/ui/category-choices';
import { todayIso } from '@/ui/dates';
import {
  buildEntry,
  defaultAccountId,
  normaliseDescription,
  recordedConfirmation,
  type EntryType,
} from '@/ui/entry-form';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { accountChoiceLabel, transactionTypeLabel } from '@/ui/labels';
import { accountsById } from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * «Нова транзакція» — the entry form, pushed over Головний from its «+». It was Головний's own
 * content until this screen existed; nothing about what it records has changed, only where it
 * stands. Everything it decides is still `src/ui/entry-form.ts` — `buildEntry` decides what a
 * filled form stores, `proposeForTransfer` what a переказ may propose, `recordedConfirmation` what
 * the owner is told was stored — and this file is the wiring. See design.md §D1, §D7.
 */

/**
 * How far back the «Нещодавні» row looks. The same window Головний read when the form lived
 * there: the recents are read off the latest транзакції, never counted and never stored.
 */
const RECENT_WINDOW = 50;

/**
 * How many recently used категорії (and джерела) the shortcut row holds. Five is a row that fits
 * under the thumb without becoming a second full list.
 */
const RECENT_SIZE = 5;

/** The order the vision names them in; the words themselves are the glossary's, via `labels`. */
const ENTRY_CHOICES: readonly { value: EntryType; label: string }[] = (
  ['expense', 'transfer', 'income', 'refund'] as const
).map((value) => ({ value, label: transactionTypeLabel(value) }));

export default function NewTransactionScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const accounts = accountsRepo.list();
      return {
        accounts,
        // The рахунок the form opens on. Written by `store()` below and by nothing else in the
        // app, so a sync, an import and a confirmed чернетка leave it as the owner left it.
        rememberedAccountId: entryDefaultsRepo.remembered(),
        // What the owner reached for last, read off the latest транзакції.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
      };
    }, []),
  );

  const offered = useMemo(() => activeAccounts(stored.accounts), [stored.accounts]);
  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
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
   * Resolved against the same offered lists, so an archived категорія is not resurrected by having
   * been used and «Без джерела» is not offered by having been imported onto.
   */
  const recent = useMemo(() => recentlyUsed(stored.latest, RECENT_SIZE), [stored.latest]);
  const recentCategoryPicks = useMemo(
    () =>
      recentRows(recent.categories, expenseCategoryChoices(stored.categories)).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    [recent.categories, stored.categories],
  );
  const recentSourcePicks = useMemo(
    () =>
      recentRows(recent.sources, sourceChoices(stored.sources)).map((s) => ({
        value: s.id,
        label: s.name,
      })),
    [recent.sources, stored.sources],
  );

  const [entry, setEntry] = useState<EntryType>('expense');
  /**
   * The form opens on the рахунок last recorded on by hand — an offer, freely changed before
   * recording. A remembered рахунок that has since been archived pre-chooses nothing, and
   * `defaultAccountId` is what decides that; read once, at mount, because only `store()` moves it
   * and `store()` is recording on this very screen.
   */
  const [fromId, setFromId] = useState<string | undefined>(() =>
    defaultAccountId(stored.rememberedAccountId, activeAccounts(stored.accounts)),
  );
  const [toId, setToId] = useState<string>();
  const [amount, setAmount] = useState('');
  const [arrived, setArrived] = useState('');
  const [date, setDate] = useState(() => todayIso(new Date()));
  const [categoryId, setCategoryId] = useState<string>();
  const [sourceId, setSourceId] = useState<string>();
  /** The опис, optional for every type. Empty is the normal case and stores nothing. */
  const [description, setDescription] = useState('');
  /**
   * What the last recording stored, in the owner's words, where they are already looking. Cleared
   * by the next recording and by the next change to any field, so it can never describe a form
   * that has since moved on. No timer: nothing to race in a smoke test, and nothing that
   * disappears before the owner looks up (design D11).
   */
  const [confirmation, setConfirmation] = useState<string>();

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
      setConfirmation(undefined);
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
      setConfirmation(undefined);
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
    setConfirmation(undefined);
  }, []);

  /**
   * What a store leaves behind: the сума, the сума that arrived and the опис cleared, the picked
   * label dropped and the дата back to today, while the type and the рахунок stay as they were —
   * the рахунок being the one this recording has just remembered. So the next транзакція of the
   * same day costs no navigation and no re-picking.
   */
  const clear = useCallback(() => {
    setAmount('');
    setArrived('');
    setDate(todayIso(new Date()));
    setCategoryId(undefined);
    setSourceId(undefined);
    setDescription('');
    reload();
  }, [reload]);

  const store = useCallback(
    (...written: Transaction[]) => {
      const now = new Date();
      for (const t of written) {
        transactionsRepo.save(t, now);
      }
      // Recording by hand is the one thing that moves the memory — for a переказ, the рахунок the
      // money left, which is the one this picker names. Nothing else in the app calls `remember`.
      if (fromId) {
        entryDefaultsRepo.remember(fromId);
      }
      clear();
      setConfirmation(
        recordedConfirmation(written, { accounts: byId, categoryNames, sourceNames }),
      );
      // Storing worked, so whatever the last failure to store was is no longer true.
      void clearAlert('local-save', ALERT_PORTS);
    },
    [byId, categoryNames, clear, fromId, sourceNames],
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
          description: normaliseDescription(description),
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
      setConfirmation(undefined);
      Alert.alert(
        ...failureAlert({ title: 'Не записано', where: 'transaction-record', error, report: reportBug }),
      );
      // The Alert above is the report, and it is on the screen the owner is standing on — so this
      // almost always answers «attended» and posts nothing. It is here for the case that is not:
      // a store that fails as they leave (design D5).
      void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
    }
  }, [
    amount,
    arrived,
    categoryId,
    date,
    description,
    entry,
    fromId,
    offered,
    reportBug,
    sourceId,
    store,
    toId,
  ]);

  const accountChoices = offered.map((a) => ({ value: a.id, label: accountChoiceLabel(a) }));

  /**
   * Any change to any field ends the confirmation: it named what was recorded from the form as it
   * then stood, and a form that has moved on must not still be wearing that sentence.
   */
  const changing =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setConfirmation(undefined);
      set(value);
    };

  return (
    <Screen>
      <ScreenHeader title="Нова транзакція" back={() => router.back()} />

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
            onChangeText={changing(setAmount)}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={from ? from.currency : undefined}
          />
          {entry === 'transfer' && from && to ? (
            <Field
              label="Скільки прийшло"
              value={arrived}
              onChangeText={changing(setArrived)}
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
            onChangeText={changing(setDate)}
            autoCapitalize="none"
            placeholder="РРРР-ММ-ДД"
          />
          {/* A витрата arrives carrying «Без категорії» and the owner may pick another; a
              повернення has no default and is not stored until one is picked. */}
          {entry === 'expense' || entry === 'refund' ? (
            <>
              {/* The shortcut above the full list, not instead of it: a категорія may stand in
                  both, and it is marked selected in both. */}
              {recentCategoryPicks.length > 0 ? (
                <Choices
                  label="Нещодавні"
                  choices={recentCategoryPicks}
                  selected={
                    entry === 'expense' ? (categoryId ?? UNCATEGORISED_CATEGORY_ID) : categoryId
                  }
                  onSelect={changing(setCategoryId)}
                />
              ) : null}
              <Choices
                label={entry === 'refund' ? 'До якої категорії' : 'Категорія'}
                choices={categoryPicks}
                selected={
                  entry === 'expense' ? (categoryId ?? UNCATEGORISED_CATEGORY_ID) : categoryId
                }
                onSelect={changing(setCategoryId)}
              />
            </>
          ) : null}
          {entry === 'income' ? (
            <>
              {recentSourcePicks.length > 0 ? (
                <Choices
                  label="Нещодавні"
                  choices={recentSourcePicks}
                  selected={sourceId}
                  onSelect={changing(setSourceId)}
                />
              ) : null}
              <Choices
                label="Джерело"
                choices={sourcePicks}
                selected={sourceId}
                onSelect={changing(setSourceId)}
              />
            </>
          ) : null}
          {/* The опис: optional for every type, and information only — it moves no total, no
              balance and no classification. Left empty, nothing is stored and the feed shows no
              empty row for it. */}
          <Field
            label="Опис"
            value={description}
            onChangeText={changing(setDescription)}
            placeholder="напр. шини на зиму"
            hint="необовʼязково"
          />
          <Action title="Записати" onPress={record} />
          {/* Where the owner is already looking, without scrolling: what was just recorded, and
              what was stored alongside it. A refusal shows its own words and no confirmation. */}
          {confirmation ? (
            <ThemedText type="small" themeColor="textPositive">
              {confirmation}
            </ThemedText>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
});
