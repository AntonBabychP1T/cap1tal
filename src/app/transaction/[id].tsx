import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Tap } from '@/components/motion';
import { askAboutTransfer } from '@/components/transfer-dialog';
import { Action, Choices, DateField, Field, Picker } from '@/components/form';
import { MerchantNamingSheet } from '@/components/merchant-naming-sheet';
import { RuleOfferSheet } from '@/components/rule-offer-sheet';
import { Card, Chevron, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  merchants as merchantsRepo,
  persistRetyped,
  receipts as receiptsRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import type { Account } from '@/domain/account';
import { namesById } from '@/domain/category';
import { merchantIndex } from '@/domain/merchants';
import { UNCATEGORISED_CATEGORY_ID, type Transaction } from '@/domain/transaction';
import { useHaptics } from '@/hooks/haptics-ports';
import { judgeProgressLater } from '@/hooks/progress-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useRuleOffer } from '@/hooks/use-rule-offer';
import { failureAlert } from '@/ui/failure-alert';
import { accountChoicesFor, legsOf } from '@/ui/account-choices';
import { categoryChoicesFor, recentlyUsed, sourceChoicesFor } from '@/ui/category-choices';
import {
  buildEntry,
  entryDateCheck,
  entryHoldsEdits,
  normaliseDescription,
  type EntryType,
} from '@/ui/entry-form';
import { accountChoiceLabel, transactionTypeLabel } from '@/ui/labels';
import { savedRuleTarget } from '@/ui/list-management';
import { transactionMerchantRow, type NamingForm } from '@/ui/merchants-screen';
import { receiptOffer } from '@/ui/receipt-screen';
import {
  correctionDeleteQuestion,
  correctionReadOut,
  initialForm,
  labelsAfterRetype,
  shapesFor,
  transferWriteNeedsPairing,
  withCorrectedDescription,
} from '@/ui/retype';
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
 * A коригування is what «Звірити» wrote: its сума, рахунок and дата are read out
 * (`correctionReadOut`), its опис is the one field, and deleting it names the сума and the рахунок
 * it goes from (transactions, "A коригування opened from a list shows what it did").
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
  const haptics = useHaptics();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const { id, as } = useLocalSearchParams<{ id: string; as?: string }>();
  // Only «Це переказ» sends this, and only a витрата honours it (design D7) — `initialShape`
  // decides which; anything else here is simply not the shape this param asks for.
  const openAsTransfer = as === 'transfer' ? 'transfer' : undefined;

  const [stored, reloadStored] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        transaction: transactionsRepo.get(id),
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        receipt: receiptsRepo.forTransaction(id),
        // What the owner reached for last — read, never stored, exactly as on the entry form.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
        // The продавці: what the stored опис is recognised as, for the «Продавець» row.
        merchants: merchantsRepo.list(),
      }),
      [id],
    ),
  );
  const original = stored.transaction;
  /**
   * The «Продавець» row, read from the опис as stored — an опис changed in this editing is read once
   * it is saved, since the продавець is what the stored опис is recognised as (main-screen).
   */
  const merchantRow = useMemo(
    () => transactionMerchantRow(original?.description, merchantIndex(stored.merchants)),
    [original?.description, stored.merchants],
  );
  /** The naming form opened from «Назвати продавця», and what its розбір then moved. */
  const [naming, setNaming] = useState<NamingForm>();
  const [merchantSaid, setMerchantSaid] = useState<string>();

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

  const [form, setForm] = useState(() => initialForm(original, openAsTransfer));
  /** The full form, when this is not a коригування's опис-only one. */
  const entry = form?.shape === 'correction' ? undefined : form;

  const from = sourceChoicesList.find((a) => a.id === entry?.fromId);
  const to = destinationChoices.find((a) => a.id === entry?.toId);
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);

  /** The same reasoning as the account pickers: an archived label the transaction carries stays. */
  const categoryRows = useMemo(
    () => categoryChoicesFor(stored.categories, entry?.categoryId),
    [entry?.categoryId, stored.categories],
  );
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);
  const accountNames = useMemo(() => namesById(stored.accounts), [stored.accounts]);
  const sourceRows = useMemo(
    () => sourceChoicesFor(stored.sources, entry?.sourceId),
    [entry?.sourceId, stored.sources],
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
   * What the form opened on (the first draw's `form`, kept by `useState`). While the form differs,
   * «назад» asks «Відкинути зміни?» first and «Відкинути» leaves as the gesture would have
   * (app-shell). A коригування's form is its опис alone, so it asks once that changed. Registered after the picker's hook and
   * only while no picker is open, so an open list still closes first.
   */
  const [opened] = useState(form);
  const dirty = entryHoldsEdits(form, opened);
  const leave = useCallback(() => router.back(), [router]);
  useCloseOnBack(false, leave, open === undefined && dirty);

  /**
   * Choosing an account of another currency clears the сума touching it: the spec says it is
   * entered anew in the new account's currency. Keeping the digits would reinterpret 125,50 UAH
   * as 125,50 USD — not a conversion, but it would look like one.
   */
  const chooseFrom = useCallback(
    (fromId: string) => {
      if (!form || form.shape === 'correction') return;
      const next = sourceChoicesList.find((a) => a.id === fromId);
      const currencyChanged = Boolean(next && from && next.currency !== from.currency);
      setForm({ ...form, fromId, ...(currencyChanged ? { amount: '' } : {}) });
    },
    [form, from, sourceChoicesList],
  );

  const chooseTo = useCallback(
    (toId: string) => {
      if (!form || form.shape === 'correction') return;
      const next = destinationChoices.find((a) => a.id === toId);
      const currencyChanged = Boolean(next && to && next.currency !== to.currency);
      setForm({ ...form, toId, ...(currencyChanged ? { arrived: '' } : {}) });
    },
    [destinationChoices, form, to],
  );

  /** Flipping the type: `labelsAfterRetype` decides what the pickers keep showing. */
  const chooseShape = useCallback(
    (shape: EntryType) => {
      if (!form || form.shape === 'correction' || !original) return;
      const carried = labelsAfterRetype(original, shape);
      setForm({ ...form, shape, categoryId: carried.categoryId, sourceId: carried.sourceId });
      // Retyping unmounts whichever picker the new shape does not have. The open state goes with
      // it, or `useCloseOnBack` swallows a back press for a list that is no longer on the screen.
      setOpen(undefined);
    },
    [form, original],
  );

  /**
   * Writes what a save decided, all of it in one database transaction — the переказ (or whatever
   * it retyped from) and any second leg such as a «Комісія» витрата or a «Відсотки» дохід land
   * together or not at all (design D5). A written переказ goes through the shared pairing step
   * when the original was a витрата, or was itself a переказ still awaiting its зустрічний дохід —
   * `transferWriteNeedsPairing` decides which; everything else is the plain write.
   * Navigation is a separate decision (see `apply` below).
   */
  const persist = useCallback(
    (...written: Transaction[]) => {
      persistRetyped(
        written.map((transaction) => ({
          transaction,
          needsPairing: transferWriteNeedsPairing(original, transaction),
        })),
        new Date(),
      );
      // A транзакція was edited. Nothing already earned is ever taken back by it (design D2);
      // only what the change newly makes true is earned.
      judgeProgressLater();
      // Stored: felt once, and before any правило offer the save raises (motion, "An outcome
      // the owner caused is felt once").
      haptics.play('stored');
    },
    [haptics, original],
  );

  /** The offer to remember today's edit as a правило — raised only after the категорія is stored. */
  const ruleOffer = useRuleOffer(reportBug);

  /**
   * Stores whatever a переказ decision produced and, only when the original was a витрата, offers
   * to remember it as a правило-переказ — the переказ is already stored by the time the offer can
   * show (design D6), so declining or the back gesture can never lose it. A cross-currency переказ
   * offers nothing: `ruleOffer` itself refuses one there.
   */
  const storeTransfer = useCallback(
    (...written: Transaction[]) => {
      persist(...written);
      const transferred = written.find((t) => t.type === 'transfer');
      const offered =
        original?.type === 'expense' && transferred?.description
          ? ruleOffer.raise({
              description: transferred.description,
              target: { kind: 'transfer', toAccountId: transferred.toAccountId },
              fromAccount: { accountId: transferred.fromAccountId, currency: transferred.left.currency },
              accounts: stored.accounts,
            })
          : undefined;
      if (offered) {
        return;
      }
      router.back();
    },
    [original, persist, ruleOffer, router, stored.accounts],
  );

  const apply = useCallback(() => {
    if (!form || !original) return;
    /**
     * One attempt at the form as it stands. The date question's «Зберегти все одно» runs it again
     * with the answer, from the top — the same form rebuilt, through the same catch — rather than
     * storing something it closed over.
     */
    const attempt = (dateConfirmed: boolean) => {
      try {
        if (form.shape === 'correction') {
          // A коригування stores its опис and nothing else: the rest is what «Звірити» wrote.
          if (original.type === 'correction') {
            persist(withCorrectedDescription(original, form.description));
          }
          router.back();
          return;
        }
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
            // The import's MCC rides along whatever shape the транзакція takes; nobody edits it.
            mcc: original.mcc,
          },
          { id: original.id, accounts: stored.accounts },
        );
        // The дата is judged only when it moved: the stored one is passed, so a транзакція dated
        // before this rule existed stays editable as it is. A moved one outside 2000…a year from
        // today throws into the catch below; one after today is asked about first (`entryDateCheck`).
        const verdict = entryDateCheck(built.date, new Date(), original.date);
        if (verdict.kind === 'confirm' && !dateConfirmed) {
          Alert.alert(verdict.title, verdict.message, [
            { text: 'Скасувати', style: 'cancel' },
            { text: 'Зберегти все одно', onPress: () => attempt(true) },
          ]);
          return;
        }
        if (built.type === 'transfer') {
          // The рахунок the money left decides what may be proposed, and its stored транзакції are
          // what says how much that person still owed before this переказ. `storeTransfer` offers a
          // правило-переказ only when the original was a витрата — editing an already-переказ offers
          // none, whatever the опис says.
          askAboutTransfer(
            built,
            {
              accounts: stored.accounts,
              sourceTransactions: transactionsRepo.listByAccount(built.fromAccountId),
            },
            storeTransfer,
          );
          return;
        }
        persist(built);
        // The категорія or джерело is already stored by the time the offer could show, exactly as
        // design D5 requires — leaving this screen (accepting, declining, or the back gesture) can
        // never lose it. Offered only when saving actually changed the категорія of a витрата or
        // повернення, or the джерело of a дохід, that carries an опис — never when nothing moved.
        const target = savedRuleTarget(original, built);
        const offered = target ? ruleOffer.raise({ description: built.description, target }) : undefined;
        // `ruleOffer.raise` legitimately answers "no offer" too — «Без категорії», a правило that
        // already covers this опис — and only a real offer keeps the screen open for the sheet;
        // anything else leaves exactly where saving always left before this offer existed.
        if (offered) {
          return;
        }
        router.back();
      } catch (error) {
        // The one refusal site: `buildEntry`'s refusal lands here too, so a refusal plays once.
        haptics.play('refused');
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'transaction-save', error, report: reportBug }),
        );
      }
    };
    attempt(false);
  }, [form, haptics, original, persist, reportBug, router, ruleOffer, storeTransfer, stored.accounts]);

  const remove = useCallback(() => {
    if (!original) return;
    // A коригування is named by its сума and рахунок: deleting it moves that balance by exactly it.
    const question =
      original.type === 'correction'
        ? correctionDeleteQuestion(original, accountNames)
        : 'Її не буде ні у стрічці, ні в історії рахунку.';
    Alert.alert('Видалити транзакцію?', question, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => {
          transactionsRepo.remove(original.id);
          // A транзакція was deleted. The engine only ever adds: nothing is unearned by this.
          judgeProgressLater();
          // The answer to the question, not the question itself, is what is felt.
          haptics.play('removed');
          router.back();
        },
      },
    ]);
  }, [accountNames, haptics, original, router]);

  if (!original || !form) {
    return (
      <Screen>
        <ScreenHeader title="Транзакція" back={() => router.back()} />
        <ThemedText>Транзакцію не знайдено.</ThemedText>
      </Screen>
    );
  }

  if (form.shape === 'correction') {
    // `initialForm` gives this form to a коригування and to nothing else.
    if (original.type !== 'correction') return null;
    const readOut = correctionReadOut(original, accountNames, new Date());
    return (
      <Screen>
        <ScreenHeader title="Коригування" back={() => router.back()} />
        <Card style={styles.form}>
          {/* What «Звірити» wrote, read out — none of it is offered for change. */}
          <ReadOut label="Сума" value={readOut.amount} />
          <ReadOut label="Рахунок" value={readOut.account} />
          <ReadOut label="Дата" value={readOut.date} />
          <Field
            label="Опис"
            value={form.description}
            onChangeText={(description) => setForm({ ...form, description })}
          />
          <MerchantLine
            row={merchantRow}
            said={merchantSaid}
            onOpen={(merchantId) => router.push({ pathname: '/merchant/[id]', params: { id: merchantId } })}
            onName={(naming) => {
              setMerchantSaid(undefined);
              setNaming(naming);
            }}
          />
        </Card>
        {/* A коригування keeps its тип, so the stored тип is the only тип there is. */}
        <ReceiptLine
          type={original.type}
          receipt={stored.receipt}
          onScan={() => router.push({ pathname: '/transaction/scan', params: { id: original.id } })}
          onOpen={() => router.push({ pathname: '/transaction/receipt', params: { id: original.id } })}
        />
        <Action title="Зберегти" onPress={apply} />
        <Action variant="destructive" title="Видалити транзакцію" onPress={remove} />
        <MerchantNamingSheet
          form={naming}
          merchants={stored.merchants}
          onClose={() => setNaming(undefined)}
          onStored={(said) => {
            setNaming(undefined);
            setMerchantSaid(said);
            reloadStored();
          }}
          reportBug={reportBug}
        />
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
        <DateField value={form.date} onChange={(date) => setForm({ ...form, date })} now={new Date()} />
        {/* The опис, editable whatever put it there — an import, a чернетка or the owner's own
            hand. No placeholder: a транзакція carrying none shows an empty field and nothing
            standing in for a description it does not have. */}
        <Field
          label="Опис"
          value={form.description}
          onChangeText={(description) => setForm({ ...form, description })}
        />
        <MerchantLine
          row={merchantRow}
          said={merchantSaid}
          onOpen={(merchantId) => router.push({ pathname: '/merchant/[id]', params: { id: merchantId } })}
          onName={(naming) => {
            setMerchantSaid(undefined);
            setNaming(naming);
          }}
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
      <MerchantNamingSheet
        form={naming}
        merchants={stored.merchants}
        onClose={() => setNaming(undefined)}
        onStored={(said) => {
          setNaming(undefined);
          setMerchantSaid(said);
          reloadStored();
        }}
        reportBug={reportBug}
      />
      <RuleOfferSheet
        offer={ruleOffer.offer}
        categoryNames={categoryNames}
        accountNames={accountNames}
        sourceNames={sourceNames}
        // The save this offer follows already wrote the транзакція; leaving the editing screen —
        // by accepting, declining or the back gesture that `Sheet` treats the same as «Не треба» —
        // is what «Зберегти» was always going to do next. The choice is stored at once; the editor
        // closes once the sheet has left (motion, "A choice is stored at once and the screen
        // changes after the sheet leaves").
        onAccept={(merchant) => ruleOffer.accept(merchant)}
        onDecline={ruleOffer.decline}
        onExited={() => router.back()}
      />
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
    <Tap onPress={onScan} style={styles.receiptLink} accessibilityRole="button">
      <ThemedText type="link">{offer.label}</ThemedText>
    </Tap>
  );
}

/**
 * The «Продавець» row (main-screen, "Editing names the транзакція's продавець"): the продавець the
 * stored опис is recognised as, which opens its screen, or «Назвати продавця», which opens the
 * naming form for that опис. No опис, no row — `transactionMerchantRow` decides which.
 */
function MerchantLine({
  row,
  said,
  onOpen,
  onName,
}: {
  row: ReturnType<typeof transactionMerchantRow>;
  said: string | undefined;
  onOpen: (merchantId: string) => void;
  onName: (form: NamingForm) => void;
}) {
  if (!row) {
    return null;
  }
  return (
    <View style={styles.field}>
      <ThemedText type="overline">Продавець</ThemedText>
      {row.kind === 'recognised' ? (
        <Tap
          accessibilityRole="button"
          accessibilityHint="Відкрити продавця"
          onPress={() => onOpen(row.merchantId)}
          style={styles.merchantRow}>
          <ThemedText style={styles.merchantName}>{row.name}</ThemedText>
          <Chevron />
        </Tap>
      ) : (
        <Tap accessibilityRole="button" onPress={() => onName(row.form)} style={styles.merchantRow}>
          <ThemedText type="link">Назвати продавця</ThemedText>
        </Tap>
      )}
      {said ? (
        <ThemedText type="small" themeColor="textPositive">
          {said}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** One read-out line of a коригування: what «Звірити» wrote, named and never editable. */
function ReadOut({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <ThemedText type="overline">{label}</ThemedText>
      <ThemedText>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  // The quieter scan offer: a link with a button's tap target, so it is no harder to hit than
  // the outlined one it stands in for.
  receiptLink: { alignItems: 'center', paddingVertical: Spacing.two },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 40 },
  merchantName: { flex: 1 },
});
