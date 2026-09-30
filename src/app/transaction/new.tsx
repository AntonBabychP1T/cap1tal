import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Action, Choices, DateField, Field, Picker } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { askAboutTransfer } from '@/components/transfer-dialog';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  entryDefaults as entryDefaultsRepo,
  rules as rulesRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';

import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useHaptics } from '@/hooks/haptics-ports';
import { ALERT_PORTS, attended } from '@/hooks/use-alerting';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountChoicesFor } from '@/ui/account-choices';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';
import { expenseCategoryChoices, recentlyUsed, sourceChoices } from '@/ui/category-choices';
import { todayIso } from '@/ui/dates';
import {
  entryFromRoute,
  buildEntry,
  defaultAccountId,
  entryDateCheck,
  normaliseDescription,
  proposedCategoryId,
  type EntryType,
} from '@/ui/entry-form';
import { failureAlert } from '@/ui/failure-alert';
import { judgeProgressLater } from '@/hooks/progress-ports';
import { newId } from '@/ui/id';
import { accountChoiceLabel, transactionTypeLabel } from '@/ui/labels';
import { PICKER_SIZE } from '@/ui/shortlist';

import { Spacing } from '@/constants/theme';

/**
 * «Нова транзакція» — the entry form, pushed over Головний from its «+». It was Головний's own
 * content until this screen existed; nothing about what it records has changed, only where it
 * stands. Everything it decides is still `src/ui/entry-form.ts` — `buildEntry` decides what a
 * filled form stores, `proposeForTransfer` what a переказ may propose — and this file is the
 * wiring. See design.md §D1, §D7.
 *
 * A successful «Записати» leaves the screen for wherever the owner came from (Головний, as a
 * rule), whose стрічка now opens on what was just recorded. It used to clear the form and stay,
 * which the owner reported (2026-09-23) as the form refusing to let go after every витрата.
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
  const haptics = useHaptics();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored] = useReloadOnFocus(
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
        // Re-read at the moment the опис is typed, so a правило created since the form opened is
        // honoured (design D8's reasoning for the offer applies here too).
        rules: rulesRepo.list(),
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

  /**
   * The form opens on a витрата — «anything not explicitly typed otherwise is a витрата» — unless
   * the route asked for another type, which is how a виклик whose action is «recording a переказ
   * onto a рахунок of вид `savings`» opens the work it actually names rather than a витрата form.
   * `entryFromRoute` is what decides whether the route's text is a type at all, under `verify`.
   */
  const asked = useLocalSearchParams<{ type?: string; to?: string; account?: string }>();
  const [entry, setEntry] = useState<EntryType>(() => entryFromRoute(asked.type));
  /**
   * The form opens on the рахунок the route names (the «+» on a рахунок's own screen), else on the
   * one last recorded on by hand — an offer, freely changed before recording. A remembered рахунок that has since been archived pre-chooses nothing, and
   * `defaultAccountId` is what decides that; read once, at mount, because only `store()` moves it
   * and `store()` is recording on this very screen.
   */
  const [fromId, setFromId] = useState<string | undefined>(() =>
    defaultAccountId(
      stored.rememberedAccountId,
      accountChoicesFor(stored.accounts, undefined),
      asked.account,
    ),
  );
  // The destination a route may name, and nothing pre-chosen otherwise. It is an offer like every
  // other on this form: the picker below changes it freely.
  const [toId, setToId] = useState<string | undefined>(() =>
    stored.accounts.some((one) => one.id === asked.to) ? asked.to : undefined,
  );
  const [amount, setAmount] = useState('');
  const [arrived, setArrived] = useState('');
  const [date, setDate] = useState(() => todayIso(new Date()));
  const [categoryId, setCategoryId] = useState<string>();
  const [sourceId, setSourceId] = useState<string>();
  /**
   * Whether the owner has tapped a категорія themselves for this recording. While false, the
   * витрата's категорія follows the опис as it is typed (design D4); the first tap sets this and
   * the form stops following the опис, however the опис changes next.
   */
  const [pickedByOwner, setPickedByOwner] = useState(false);
  /** The опис, optional for every type. Empty is the normal case and stores nothing. */
  const [description, setDescription] = useState('');
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
    setPickedByOwner(false);
    // «Тип» sits above the pickers and stays tappable while one has its full list open. Switching
    // unmounts that picker, so the open state has to go with it — otherwise `useCloseOnBack` keeps
    // swallowing the back press for a list that is no longer on the screen, which is the opposite
    // of what `backGesture` promises.
    setOpen(undefined);
  }, []);

  /**
   * The категорія shown as chosen and the one «Записати» stores — one computation for both, so
   * they cannot disagree (`proposedCategoryId`, design D4).
   */
  const displayedCategoryId = useMemo(
    () =>
      proposedCategoryId(
        { type: entry, description: normaliseDescription(description), categoryId, pickedByOwner },
        stored.rules,
      ),
    [categoryId, description, entry, pickedByOwner, stored.rules],
  );

  /** The owner's own tap on a категорія chip: it stands, and the form stops following the опис. */
  const chooseCategory = useCallback((picked: string) => {
    setPickedByOwner(true);
    setCategoryId(picked);
  }, []);

  const store = useCallback(
    (...written: Transaction[]) => {
      const now = new Date();
      for (const t of written) {
        transactionsRepo.save(t, now);
      }
      // A транзакція was recorded: one of the named moments the прогрес is evaluated at.
      judgeProgressLater();
      // Recording by hand is the one thing that moves the memory — for a переказ, the рахунок the
      // money left, which is the one this picker names. Nothing else in the app calls `remember`.
      if (fromId) {
        entryDefaultsRepo.remember(fromId);
      }
      // Storing worked, so whatever the last failure to store was is no longer true.
      void clearAlert('local-save', ALERT_PORTS);
      // Felt, not only seen: a store made while looking away is confirmed too (motion, "Storing a
      // транзакція is felt").
      haptics.play('stored');
      router.back();
    },
    [fromId, haptics, router],
  );

  const record = useCallback(() => {
    /**
     * One attempt at the form as it stands. The date question's «Записати все одно» runs it again
     * with the answer, from the top — the same form rebuilt, through the same catch — rather than
     * storing something it closed over.
     */
    const attempt = (dateConfirmed: boolean) => {
      try {
        const built = buildEntry(
          {
            type: entry,
            accountId: fromId,
            toAccountId: toId,
            amount,
            arrived,
            date,
            categoryId: displayedCategoryId,
            sourceId,
            description: normaliseDescription(description),
          },
          { id: newId(), accounts: offered },
        );
        // A дата outside 2000…a year from today throws here, into the catch below, and nothing is
        // stored; one after today but within that year is asked about first (`entryDateCheck`).
        // Asked before the переказ question, so the owner is never asked about a комісія of a
        // транзакція they are about to cancel.
        const verdict = entryDateCheck(built.date, new Date());
        if (verdict.kind === 'confirm' && !dateConfirmed) {
          Alert.alert(verdict.title, verdict.message, [
            { text: 'Скасувати', style: 'cancel' },
            { text: 'Записати все одно', onPress: () => attempt(true) },
          ]);
          return;
        }
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
        // The one refusal site: `buildEntry`'s refusal lands here too, so a refusal plays once.
        haptics.play('refused');
        Alert.alert(
          ...failureAlert({ title: 'Не записано', where: 'transaction-record', error, report: reportBug }),
        );
        // The Alert above is the report, and it is on the screen the owner is standing on — so this
        // almost always answers «attended» and posts nothing. It is here for the case that is not:
        // a store that fails as they leave (design D5).
        void raiseAlert('local-save', { attended: attended() }, ALERT_PORTS);
      }
    };
    attempt(false);
  }, [
    amount,
    arrived,
    date,
    description,
    displayedCategoryId,
    entry,
    fromId,
    haptics,
    offered,
    reportBug,
    sourceId,
    store,
    toId,
  ]);

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
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={from ? from.currency : undefined}
            // The currency arrives with the рахунок; its line is held until then so the form
            // does not jump by a line under the owner's thumb when it does.
            reserveHint
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
          <DateField value={date} onChange={setDate} now={new Date()} />
          {/* A витрата arrives carrying «Без категорії» and the owner may pick another; a
              повернення has no default and is not stored until one is picked. */}
          {entry === 'expense' || entry === 'refund' ? (
            <Picker
              label={entry === 'refund' ? 'До якої категорії' : 'Категорія'}
              rows={categoryRows}
              recentIds={recent.categories}
              selected={
                entry === 'expense'
                  ? (displayedCategoryId ?? UNCATEGORISED_CATEGORY_ID)
                  : categoryId
              }
              onSelect={entry === 'expense' ? chooseCategory : setCategoryId}
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
              onSelect={setSourceId}
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
            onChangeText={setDescription}
            placeholder="напр. шини на зиму"
            hint="необовʼязково"
          />
          <Action title="Записати" onPress={record} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
});
