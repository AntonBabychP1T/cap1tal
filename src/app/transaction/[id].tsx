import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { askAboutTransfer } from '@/components/transfer-dialog';
import { Action, Choices, Field, Picker } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  receipts as receiptsRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import type { Account } from '@/domain/account';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { failureAlert } from '@/ui/failure-alert';
import { accountChoicesFor, legsOf } from '@/ui/account-choices';
import { formatMinorUnits } from '@/ui/amount-input';
import { categoryChoicesFor, recentlyUsed, sourceChoicesFor } from '@/ui/category-choices';
import { buildEntry, normaliseDescription, type EntryType } from '@/ui/entry-form';
import { accountChoiceLabel, transactionTypeLabel } from '@/ui/labels';
import { receiptOffer } from '@/ui/receipt-screen';
import { labelsAfterRetype, shapesFor } from '@/ui/retype';
import { PICKER_SIZE } from '@/ui/shortlist';

import { Spacing } from '@/constants/theme';

/**
 * Editing one transaction: its сума, дата, рахунок(и), its category or джерело, retyping under
 * the same id, and deleting it after a confirmation.
 *
 * What a filled form stores is `buildEntry` — the same function «Нова транзакція» uses, so
 * recording and editing cannot drift apart, and giving it the original's id is all that makes
 * this an edit rather than a new transaction. What a retype carries over is `labelsAfterRetype`.
 * Both are pure and under `verify`; this file is the wiring.
 *
 * A коригування is still shown read-only: nothing can record one until «звірити» arrives, so
 * there is no form for it to open into — and therefore no picker on it either.
 */

/**
 * How far back the recents are read, and how many are kept: the same стрічка «Нова транзакція»
 * reads, so a категорія reached for while recording is one tap away while correcting too.
 */
const RECENT_WINDOW = 50;

/** Which picker has its full list open, if any. */
type OpenPicker = 'from' | 'to' | 'category' | 'source';

export default function EditTransactionScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        transaction: transactionsRepo.get(id),
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        receipt: receiptsRepo.forTransaction(id),
        // What the owner reached for last — read, never stored, exactly as on the entry form.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
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
  const categoryRows = useMemo(
    () => categoryChoicesFor(stored.categories, form?.categoryId),
    [form?.categoryId, stored.categories],
  );
  const sourceRows = useMemo(
    () => sourceChoicesFor(stored.sources, form?.sourceId),
    [form?.sourceId, stored.sources],
  );
  const recent = useMemo(() => recentlyUsed(stored.latest, PICKER_SIZE), [stored.latest]);

  /**
   * Which picker has its full list open. Held by the screen, not by the picker, so the phone's
   * «назад» can close it before it leaves the screen.
   */
  const [open, setOpen] = useState<OpenPicker>();
  const closePicker = useCallback(() => setOpen(undefined), []);
  useCloseOnBack(open !== undefined, closePicker);
  const opening = (picker: OpenPicker) => (isOpen: boolean) =>
    setOpen(isOpen ? picker : undefined);

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
      // Retyping unmounts whichever picker the new shape does not have. The open state goes with
      // it, or `useCloseOnBack` swallows a back press for a list that is no longer on the screen.
      setOpen(undefined);
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
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'transaction-save', error, report: reportBug }),
      );
    }
  }, [form, original, reportBug, store, stored.accounts]);

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
        {/* A коригування is shown, never edited, so the stored тип is the only тип there is. */}
        <ReceiptLine
          type={original.type}
          receipt={stored.receipt}
          onScan={() => router.push({ pathname: '/transaction/scan', params: { id: original.id } })}
          onOpen={() => router.push({ pathname: '/transaction/receipt', params: { id: original.id } })}
        />
        <Action variant="destructive" title="Видалити транзакцію" onPress={remove} />
      </Screen>
    );
  }

  /** A рахунок wears its currency, so a search inside «Всі рахунки» matches «USD» too. */
  const asRows = (list: readonly Account[]) =>
    list.map((a) => ({ id: a.id, name: accountChoiceLabel(a) }));

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
        <Picker
          label={form.shape === 'transfer' ? 'Звідки' : 'Рахунок'}
          rows={asRows(sourceChoicesList)}
          recentIds={recent.accounts}
          selected={form.fromId}
          onSelect={chooseFrom}
          noun="accounts"
          expanded={open === 'from'}
          onExpandedChange={opening('from')}
        />
        {form.shape === 'transfer' ? (
          <Picker
            label="Куди"
            rows={asRows(destinationChoices)}
            recentIds={recent.accounts}
            selected={form.toId}
            onSelect={chooseTo}
            noun="accounts"
            expanded={open === 'to'}
            onExpandedChange={opening('to')}
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
          <Picker
            label={form.shape === 'refund' ? 'До якої категорії' : 'Категорія'}
            rows={categoryRows}
            recentIds={recent.categories}
            selected={
              form.shape === 'expense'
                ? (form.categoryId ?? UNCATEGORISED_CATEGORY_ID)
                : form.categoryId
            }
            onSelect={(categoryId: string) => setForm({ ...form, categoryId })}
            noun="categories"
            expanded={open === 'category'}
            onExpandedChange={opening('category')}
          />
        ) : null}
        {form.shape === 'income' ? (
          <Picker
            label="Джерело"
            rows={sourceRows}
            recentIds={recent.sources}
            selected={form.sourceId}
            onSelect={(sourceId: string) => setForm({ ...form, sourceId })}
            noun="sources"
            expanded={open === 'source'}
            onExpandedChange={opening('source')}
          />
        ) : null}
      </Card>
      {/* The form's own «Тип» and «Категорія», not the stored ones: picking «переказ» withdraws
          the scan offer at the tap, and the form is what the owner is looking at. */}
      <ReceiptLine
        type={form.shape}
        {...(form.categoryId ? { categoryId: form.categoryId } : {})}
        receipt={stored.receipt}
        onScan={() => router.push({ pathname: '/transaction/scan', params: { id: original.id } })}
        // The чек is found by its транзакція — one транзакція carries at most one — so its own
        // id is not passed and not read.
        onOpen={() => router.push({ pathname: '/transaction/receipt', params: { id: original.id } })}
      />
      {/* The one accent fill on this screen, and the destructive verb under it as text alone —
          deleting is never the loudest thing here. */}
      <Action title="Зберегти" onPress={apply} />
      <Action variant="destructive" title="Видалити транзакцію" onPress={remove} />
    </Screen>
  );
}

/**
 * Where the фіскальний чек goes on this form: «Сканувати QR чека» while there is none, or the чек
 * line that opens its позиції once there is one.
 *
 * What is shown is `receiptOffer`'s answer and nothing this file decides — the prominence, the
 * label and the «no scan for a переказ» rule are all proven in `src/ui/receipt-screen.test.ts`.
 */
function ReceiptLine({
  type,
  categoryId,
  receipt,
  onScan,
  onOpen,
}: {
  type: Transaction['type'];
  categoryId?: string;
  receipt: ReturnType<typeof receiptsRepo.forTransaction>;
  onScan: () => void;
  onOpen: () => void;
}) {
  const offer = receiptOffer({
    type,
    ...(categoryId ? { categoryId } : {}),
    ...(receipt ? { receipt } : {}),
  });
  if (offer.kind === 'none') {
    return null;
  }
  if (offer.kind === 'attached') {
    return <Action variant="secondary" title={offer.label} onPress={onOpen} />;
  }
  // Two weights, and neither is the accent fill: «Зберегти» is this screen's one filled action
  // (`components/form.tsx` — «the filled action is the loudest thing on its screen»), and a scan
  // offer shouting as loudly as the form's own verb is what the emulator showed on 2026-09-02.
  // A витрата in the seeded groceries category gets the outlined button, which stands out from
  // the fields above it; every other category gets the same offer as a link, a weight quieter.
  return offer.prominent ? (
    <Action variant="secondary" title={offer.label} onPress={onScan} />
  ) : (
    <Pressable onPress={onScan} style={styles.receiptLink} accessibilityRole="button">
      <ThemedText type="link">{offer.label}</ThemedText>
    </Pressable>
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
  // The quieter scan offer: a link with a button's tap target, so it is no harder to hit than
  // the outlined one it stands in for.
  receiptLink: { alignItems: 'center', paddingVertical: Spacing.two },
});
