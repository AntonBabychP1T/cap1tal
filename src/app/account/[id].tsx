import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, Picker } from '@/components/form';
import {
  Card,
  Fab,
  ListRow,
  ListScreen,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/surfaces';
import { TransactionRow } from '@/components/transaction-row';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  limits as limitsRepo,
  mergeAccounts,
  monobank as monobankRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { account } from '@/domain/account';
import { mergePreview, mergeRefusal } from '@/domain/account-merge';
import { namesById } from '@/domain/category';
import type { Money } from '@/domain/money';
import type { Transaction } from '@/domain/transaction';
import { judgeProgressLater } from '@/hooks/progress-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useSinglePush } from '@/hooks/use-single-push';
import { accountFromDraft, draftFrom, type AccountDraft } from '@/ui/account-form';
import { mergeConfirmation, mergeTargets } from '@/ui/account-merge';
import { accountMovements, reconcileTyped, shownMovements } from '@/ui/account-movements';
import { todayIso } from '@/ui/dates';
import { failureAlert, refusalAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { accountChoiceLabel, kindLabel, KIND_CHOICES, OFFERED_CURRENCIES } from '@/ui/labels';
import {
  accountsById,
  accountSideLine,
  overLimitByMonth,
  transactionLine,
} from '@/ui/transaction-line';

import { Spacing } from '@/constants/theme';

/**
 * Рухи рахунку — where a tap on a рахунок lands: its розрахунковий баланс, the баланс банку a link
 * feeds, and every транзакція touching it, newest first. Rows render through the same
 * `transactionLine` the Головний feed uses and a tap opens the same editing screen, so a
 * транзакція found here is edited exactly as one found there.
 *
 * This is also where a рахунок's own actions live — renaming it, its opening balance, archiving —
 * behind an explicit action rather than as the consequence of the tap that used to open them.
 * Everything decided lives in `src/ui/account-movements.ts` and `src/ui/account-form.ts`; this
 * file is the wiring.
 */

const CURRENCY_CHOICES = OFFERED_CURRENCIES.map((c) => ({ value: c, label: c }));

export default function AccountMovementsScreen() {
  const router = useRouter();
  /** Rows and «+» open one screen per tap, however many taps land while it opens. */
  const push = useSinglePush();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const all = accountsRepo.list();
      const found = all.find((a) => a.id === id);
      // The bank's own side, joined at the screen and not on the `Account`, exactly as Рахунки
      // does it: a link keyed by рахунок id names the monobank account whose баланс банку this is.
      const bankBalance: Money | undefined = monobankRepo.bankBalances().get(id);
      return {
        account: found,
        // Every рахунок, archived included: a переказ on this one names the other, and a line has
        // to say which рахунок that was even after it has been archived.
        accounts: all,
        transactions: found ? transactionsRepo.listByAccount(found.id) : [],
        bankBalance,
        // Archived ones included: this list shows a рахунок's history, and archiving takes a
        // категорія out of pickers, never out of the транзакції it already has.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        limits: limitsRepo.list(),
      };
    }, [id]),
  );

  const byId = useMemo(() => accountsById(stored.accounts), [stored.accounts]);
  const categoryNames = useMemo(() => namesById(stored.categories), [stored.categories]);
  const categoryIconKeys = useMemo(() => new Map(stored.categories.map((c) => [c.id, c.iconKey])), [stored.categories]);
  const sourceNames = useMemo(() => namesById(stored.sources), [stored.sources]);

  const movements = useMemo(
    () =>
      stored.account
        ? accountMovements({
            account: stored.account,
            transactions: stored.transactions,
            bankBalance: stored.bankBalance,
          })
        : undefined,
    [stored.account, stored.bankBalance, stored.transactions],
  );

  /**
   * How many pages of рухи the owner has asked for. Only these are drawn — the balance above is
   * still every транзакція's — so a рахунок with a thousand of them opens at once
   * (`shownMovements`).
   */
  const [pages, setPages] = useState(1);
  const page = useMemo(
    () => shownMovements(movements?.transactions ?? [], pages),
    [movements, pages],
  );

  /** The same marks the стрічка carries, judged per month of the транзакції drawn here. */
  const overLimit = useMemo(
    () =>
      overLimitByMonth({
        feed: page.shown,
        limits: stored.limits,
        monthTransactions: (month) => transactionsRepo.listMonth(month),
      }),
    [page.shown, stored.limits],
  );

  const [draft, setDraft] = useState<AccountDraft | undefined>();
  /** What the owner counted, as typed. Only ever read by «Звірити». */
  const [actual, setActual] = useState('');
  /** Whether the «Звірити» form is open. The phone's «назад» closes it before leaving. */
  const [reconciling, setReconciling] = useState(false);
  const closeReconcile = useCallback(() => {
    setActual('');
    setReconciling(false);
  }, []);
  useCloseOnBack(reconciling, closeReconcile);

  /**
   * «Обʼєднати з іншим рахунком»: whether the picker of рахунки to fold this one into is shown, and
   * whether its full list is open — «назад» closes the list first, then the picker.
   */
  const [merging, setMerging] = useState(false);
  const [mergeListOpen, setMergeListOpen] = useState(false);
  const closeMerge = useCallback(() => {
    if (mergeListOpen) {
      setMergeListOpen(false);
      return;
    }
    setMerging(false);
  }, [mergeListOpen]);
  useCloseOnBack(merging, closeMerge);

  const save = useCallback(() => {
    if (!draft) return;
    try {
      accountsRepo.save(accountFromDraft(draft, newId()));
      // A рахунок was edited: its початковий залишок moves the резерв with no транзакція behind it.
      judgeProgressLater();
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'account-save', error, report: reportBug }),
      );
    }
  }, [draft, reload, reportBug]);

  const setArchived = useCallback(
    (archived: boolean) => {
      if (!stored.account) return;
      try {
        accountsRepo.save(account({ ...stored.account, archived }));
        // Archiving takes no money away — an archived рахунок still counts toward the резерв — so
        // the зведення is the same and this evaluation writes nothing. It is here because the
        // moment is named, not because it is expected to earn.
        judgeProgressLater();
        setDraft(undefined);
        reload();
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'account-archive', error, report: reportBug }),
        );
      }
    },
    [reload, reportBug, stored.account],
  );

  /**
   * «Звірити» for any рахунок, bank or no bank: the owner types what they counted, the signed
   * difference is named before anything exists, and what is then stored is exactly the коригування
   * the domain returned — never an assignment of one balance onto the other. Equal balances create
   * nothing and say so, and an entry that is not a сума is refused in the parser's own words.
   */
  const confirmReconcile = useCallback(() => {
    if (!stored.account || !movements) return;
    const a = stored.account;
    try {
      const answer = reconcileTyped({
        account: a,
        computed: movements.computed,
        typed: actual,
        date: todayIso(new Date()),
        newId,
      });
      if (answer.kind === 'agree') {
        // Said, and left open with what was typed: the owner may have mistyped the count.
        Alert.alert('Звірити', answer.message);
        return;
      }
      Alert.alert('Звірити', answer.confirmation, [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Створити коригування',
          onPress: () => {
            try {
              transactionsRepo.save(answer.correction, new Date());
              judgeProgressLater();
              setActual('');
              setReconciling(false);
              reload();
            } catch (error) {
              Alert.alert(
                ...failureAlert({ title: 'Не збережено', where: 'account-reconcile-save', error, report: reportBug }),
              );
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не звірено', where: 'account-reconcile', error, report: reportBug }),
      );
    }
  }, [actual, movements, reload, reportBug, stored.account]);

  /**
   * Folds this рахунок into the one picked: the confirmation names what moves and the balance the
   * picked one will then show, and only «Обʼєднати» writes (`src/ui/account-merge.ts`). This
   * рахунок is gone afterwards, so the screen becomes the one it was folded into.
   */
  const confirmMerge = useCallback(
    (intoId: string) => {
      const from = stored.account;
      const into = stored.accounts.find((one) => one.id === intoId);
      if (!from || !into) return;
      const fromLinked = monobankRepo.linkForAccount(from.id) !== undefined;
      const refusal = mergeRefusal({
        from,
        into,
        fromLinked,
        intoLinked: monobankRepo.linkForAccount(into.id) !== undefined,
      });
      if (refusal) {
        // Decided here, before anything is written: a refusal the owner reads and accepts, not a
        // failure to report.
        Alert.alert(...refusalAlert({ title: 'Не обʼєднано', where: 'account-merge', message: refusal }));
        return;
      }
      const preview = mergePreview({
        from,
        into,
        fromTransactions: stored.transactions,
        intoTransactions: transactionsRepo.listByAccount(into.id),
      });
      const merge = (dropCorrections: boolean) => () => {
        try {
          mergeAccounts({ fromId: from.id, intoId: into.id, dropCorrections });
          judgeProgressLater();
          router.replace(`/account/${into.id}`);
        } catch (error) {
          Alert.alert(
            ...failureAlert({ title: 'Не обʼєднано', where: 'account-merge', error, report: reportBug }),
          );
        }
      };
      Alert.alert('Обʼєднати рахунки?', mergeConfirmation({ from, into, preview, linkMoves: fromLinked }), [
        { text: 'Скасувати', style: 'cancel' },
        // Offered only when there is a коригування to leave behind; otherwise it is the same merge.
        ...(preview.corrections > 0
          ? [{ text: 'Без коригувань', onPress: merge(true) }]
          : []),
        { text: 'Обʼєднати', style: 'destructive', onPress: merge(false) },
      ]);
    },
    [reportBug, router, stored.account, stored.accounts, stored.transactions],
  );

  /**
   * Every shown movement's line, told from this рахунок's side, once per page rather than on every
   * render — one clock for the whole list, so «сьогодні» cannot change halfway down it
   * (app-speed-pass design D7).
   */
  const accountId = stored.account?.id;
  const lines = useMemo(() => {
    const now = new Date();
    return new Map(
      accountId === undefined
        ? []
        : page.shown.map((t) => {
            const line = transactionLine(t, byId, categoryNames, sourceNames, overLimit, categoryIconKeys);
            // Told from this рахунок's side: its own name is the screen's title, and a переказ
            // says whether it brought money in or took it out (design D3).
            return [t.id, { line, side: accountSideLine(t, line, accountId, byId, now) }] as const;
          }),
    );
  }, [accountId, byId, categoryIconKeys, categoryNames, overLimit, page.shown, sourceNames]);

  // A рахунок that has been deleted from under the screen — or an id that never named one — says
  // so rather than rendering a blank list of someone else's money.
  if (!stored.account || !movements) {
    return (
      <Screen>
        <ScreenHeader title="Рахунок" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Такого рахунку немає.
        </ThemedText>
      </Screen>
    );
  }

  const a = stored.account;

  /** One movement — drawn only while it is on or near the screen. */
  const renderRow = (t: Transaction, index: number) => {
    const { line, side } = lines.get(t.id)!;
    return (
      <ListRow key={line.id} last={index === page.shown.length - 1}>
        <TransactionRow
          icon={line.icon}
          iconTone={line.iconTone}
          marked={line.uncategorised}
          title={side.title}
          titleTone={line.overLimit ? 'textDanger' : undefined}
          subtitle={side.subtitle}
          description={line.description}
          amount={side.amount}
          amountTone={side.amountTone}
          onPress={() => push(`/transaction/${line.id}`)}
        />
      </ListRow>
    );
  };

  return (
    <ListScreen
      // The same «+» Головний has, opening the form on this рахунок. An archived one is offered
      // for no new транзакція, so it has none — and neither does the screen while one of its own
      // forms is open: editing, звірка or обʼєднання end in a column of full-width buttons, and
      // the «+» floating over their right edge covered «Обʼєднати з іншим рахунком» and
      // «Скасувати» (QA, 2026-09-29). Recording a транзакція is not what that moment is for.
      overlay={
        a.archived || draft || reconciling || merging ? undefined : (
          <Fab onPress={() => push({ pathname: '/transaction/new', params: { account: a.id } })} />
        )
      }
      header={
        <>
          <ScreenHeader
            title={movements.name}
            subtitle={a.archived ? `${kindLabel(a.kind)} · в архіві` : kindLabel(a.kind)}
            back={() => router.back()}
          />

          <Card style={styles.balances}>
            <ThemedText type="overline">Розрахунковий баланс</ThemedText>
            <ThemedText type="subtitle" tabular>
              {movements.balance}
            </ThemedText>
            {/* The bank's figure under the рахунок's own, named so neither is mistaken for the
                other. Only a linked рахунок has one. */}
            {movements.bankBalance ? (
              <View style={styles.line}>
                <ThemedText type="small" themeColor="textSecondary">
                  останній баланс банку
                </ThemedText>
                <ThemedText type="small" tabular themeColor="textSecondary">
                  {movements.bankBalance}
                </ThemedText>
              </View>
            ) : null}
            {/* The two things done to a рахунок, side by side under its balance, so the рухи follow
                directly. «Звірити» only for an unarchived one: a коригування is a транзакція. */}
            {draft || reconciling ? null : (
              <View style={styles.actions}>
                {a.archived ? null : (
                  <View style={styles.action}>
                    <Action variant="secondary" title="Звірити" onPress={() => setReconciling(true)} />
                  </View>
                )}
                <View style={styles.action}>
                  <Action
                    variant="secondary"
                    title="Редагувати"
                    onPress={() => setDraft(draftFrom(a))}
                  />
                </View>
              </View>
            )}
          </Card>

          {/* Звірити, offered for every unarchived рахунок — готівка included. An archived one is
              offered for no new транзакція, and a коригування is a транзакція like any other. Closed
              until asked for: it is the rare action here, and open it pushed the рухи the owner came
              for a third of a screen down (accounts-screen, "Звірити opens when the owner asks"). */}
          {a.archived ? null : reconciling ? (
            <Card style={styles.form}>
              <ThemedText type="overline">Звірити</ThemedText>
              <Field
                label="Фактичний залишок"
                value={actual}
                onChangeText={setActual}
                keyboardType="numbers-and-punctuation"
                placeholder="0,00"
                hint={`${a.currency} — скільки насправді на рахунку`}
                autoFocus
              />
              <Action title="Звірити" onPress={confirmReconcile} />
              <Action
                variant="secondary"
                title="Скасувати"
                onPress={() => {
                  setActual('');
                  setReconciling(false);
                }}
              />
            </Card>
          ) : null}

          {draft ? (
            <Card style={styles.form}>
              <ThemedText type="overline">Редагувати рахунок</ThemedText>
              <Field
                label="Назва"
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                placeholder="mono black"
              />
              <Choices
                label="Вид"
                choices={KIND_CHOICES}
                selected={draft.kind}
                onSelect={(kind) => setDraft({ ...draft, kind })}
                disabled
              />
              <Choices
                label="Валюта"
                choices={CURRENCY_CHOICES}
                selected={draft.currency}
                onSelect={(currency) => setDraft({ ...draft, currency })}
                disabled
              />
              <ThemedText type="small" themeColor="textSecondary">
                Вид і валюту після створення змінити не можна.
              </ThemedText>
              <Field
                label="Початковий залишок"
                value={draft.opening}
                onChangeText={(opening) => setDraft({ ...draft, opening })}
                keyboardType="numbers-and-punctuation"
                placeholder="0,00"
                hint={`${draft.currency} — необовʼязково`}
              />
              <Action title="Зберегти" onPress={save} />
              <Action
                variant="secondary"
                title={a.archived ? 'Повернути з архіву' : 'До архіву'}
                onPress={() => setArchived(!a.archived)}
              />
              <Action
                variant="secondary"
                title="Обʼєднати з іншим рахунком"
                onPress={() => {
                  setDraft(undefined);
                  setMerging(true);
                }}
              />
              <Action variant="secondary" title="Скасувати" onPress={() => setDraft(undefined)} />
            </Card>
          ) : null}

          {/* Two рахунки that are the same money — a monobank банка linked on its own рахунок beside
              the one the owner kept by hand — become the one picked here. */}
          {merging ? (
            <Card style={styles.form}>
              <ThemedText type="overline">Обʼєднати з іншим рахунком</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`Усе з «${a.name}» — транзакції, привʼязка monobank — перейде в обраний рахунок, а «${a.name}» зникне.`}
              </ThemedText>
              {mergeTargets(a, stored.accounts).length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`Немає іншого рахунку в ${a.currency}.`}
                </ThemedText>
              ) : (
                <Picker
                  label="У який рахунок"
                  rows={mergeTargets(a, stored.accounts).map((one) => ({
                    id: one.id,
                    name: accountChoiceLabel(one),
                  }))}
                  recentIds={[]}
                  selected={undefined}
                  onSelect={confirmMerge}
                  noun="accounts"
                  expanded={mergeListOpen}
                  onExpandedChange={setMergeListOpen}
                />
              )}
              <Action
                variant="secondary"
                title="Скасувати"
                onPress={() => {
                  setMergeListOpen(false);
                  setMerging(false);
                }}
              />
            </Card>
          ) : null}

          <SectionLabel>Рухи</SectionLabel>
        </>
      }
      data={movements.emptyMessage ? [] : page.shown}
      keyExtractor={(t) => t.id}
      renderRow={renderRow}
      empty={
        movements.emptyMessage ? (
          <ThemedText type="small" themeColor="textSecondary">
            {movements.emptyMessage}
          </ThemedText>
        ) : null
      }
      footer={
        !movements.emptyMessage && page.more ? (
          <Action
            variant="secondary"
            title="Показати ще"
            onPress={() => setPages((asked) => asked + 1)}
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  balances: { gap: Spacing.two - Spacing.half },
  form: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  action: { flex: 1 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
