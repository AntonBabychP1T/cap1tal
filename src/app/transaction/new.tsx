import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Action, Choices, Field, Picker } from '@/components/form';
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

import { namesById } from '@/domain/category';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { ALERT_PORTS, attended } from '@/hooks/use-alerting';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountChoicesFor } from '@/ui/account-choices';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';
import { expenseCategoryChoices, recentlyUsed, sourceChoices } from '@/ui/category-choices';
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
import { PICKER_SIZE } from '@/ui/shortlist';
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
 * How far back the pickers look for what the owner reached for last. The same window Головний read
 * when the form lived there: the recents are read off the latest транзакції, never counted and
 * never stored.
 */
const RECENT_WINDOW = 50;

/**
 * How many recently used рахунки, категорії and джерела are worth reading off the стрічка: exactly
 * as many as a picker draws, since a sixth would be read and never shown.
 */
const RECENT_SIZE = PICKER_SIZE;

/** Which picker has its full list open, if any — the one thing «назад» closes before the screen. */
type OpenPicker = 'from' | 'to' | 'category' | 'source';

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

  /**
   * The рахунки this form offers, in the order every рахунок picker uses — `accountChoicesFor`
   * owns that order, so the recording form and the editing form cannot show the same question two
   * different ways. Passing no current рахунок is what makes it exactly the unarchived ones:
   * nothing is being edited here, so there is no carried row to keep.
   *
   * It was `activeAccounts` straight from storage until the emulator showed what that meant —
   * SQLite's BINARY sort, every Cyrillic назва after every Latin one, two fields above a категорія
   * picker in real Ukrainian order.
   */
  const offered = useMemo(() => accountChoicesFor(stored.accounts, undefined), [stored.accounts]);
  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  /**
   * What each picker offers, in the order it already has. A рахунок wears its currency, which is
   * also what a search inside «Всі рахунки» then matches — «USD» finds the USD ones.
   */
  const accountRows = useMemo(
    () => offered.map((a) => ({ id: a.id, name: accountChoiceLabel(a) })),
    [offered],
  );
  const categoryRows = useMemo(
    () => expenseCategoryChoices(stored.categories),
    [stored.categories],
  );
  const sourceRows = useMemo(() => sourceChoices(stored.sources), [stored.sources]);
  /**
   * What the owner reached for last. Resolved against those same offered lists by `shortlist`, so
   * an archived категорія is not resurrected by having been used and «Без джерела» is not offered
   * by having been imported onto.
   */
  const recent = useMemo(() => recentlyUsed(stored.latest, RECENT_SIZE), [stored.latest]);

  const [entry, setEntry] = useState<EntryType>('expense');
  /**
   * The form opens on the рахунок last recorded on by hand — an offer, freely changed before
   * recording. A remembered рахунок that has since been archived pre-chooses nothing, and
   * `defaultAccountId` is what decides that; read once, at mount, because only `store()` moves it
   * and `store()` is recording on this very screen.
   */
  const [fromId, setFromId] = useState<string | undefined>(() =>
    defaultAccountId(stored.rememberedAccountId, accountChoicesFor(stored.accounts, undefined)),
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
  /**
   * Which picker has its full list open. One at a time, and held here rather than inside each
   * picker, because the phone's «назад» has to close it before it leaves the screen and only the
   * screen can be asked that — `backGesture` decides, `useCloseOnBack` subscribes.
   */
  const [open, setOpen] = useState<OpenPicker>();
  const closePicker = useCallback(() => setOpen(undefined), []);
  useCloseOnBack(open !== undefined, closePicker);
  const opening = (picker: OpenPicker) => (isOpen: boolean) =>
    setOpen(isOpen ? picker : undefined);

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
    // «Тип» sits above the pickers and stays tappable while one has its full list open. Switching
    // unmounts that picker, so the open state has to go with it — otherwise `useCloseOnBack` keeps
    // swallowing the back press for a list that is no longer on the screen, which is the opposite
    // of what `backGesture` promises.
    setOpen(undefined);
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
    setOpen(undefined);
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
          <Picker
            label={entry === 'transfer' ? 'Звідки' : 'Рахунок'}
            rows={accountRows}
            recentIds={recent.accounts}
            selected={fromId}
            onSelect={chooseFrom}
            noun="accounts"
            expanded={open === 'from'}
            onExpandedChange={opening('from')}
          />
          {entry === 'transfer' ? (
            <Picker
              label="Куди"
              rows={accountRows}
              recentIds={recent.accounts}
              selected={toId}
              onSelect={chooseTo}
              noun="accounts"
              expanded={open === 'to'}
              onExpandedChange={opening('to')}
            />
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
            <Picker
              label={entry === 'refund' ? 'До якої категорії' : 'Категорія'}
              rows={categoryRows}
              recentIds={recent.categories}
              selected={
                entry === 'expense' ? (categoryId ?? UNCATEGORISED_CATEGORY_ID) : categoryId
              }
              onSelect={changing(setCategoryId)}
              noun="categories"
              expanded={open === 'category'}
              onExpandedChange={opening('category')}
            />
          ) : null}
          {entry === 'income' ? (
            <Picker
              label="Джерело"
              rows={sourceRows}
              recentIds={recent.sources}
              selected={sourceId}
              onSelect={changing(setSourceId)}
              noun="sources"
              expanded={open === 'source'}
              onExpandedChange={opening('source')}
            />
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
