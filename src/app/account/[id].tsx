import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
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
  monobank as monobankRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { account } from '@/domain/account';
import { namesById } from '@/domain/category';
import type { Money } from '@/domain/money';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountFromDraft, draftFrom, type AccountDraft } from '@/ui/account-form';
import { accountMovements, reconcileTyped } from '@/ui/account-movements';
import { todayIso } from '@/ui/dates';
import { newId } from '@/ui/id';
import { failureMessage, kindLabel, KIND_CHOICES, OFFERED_CURRENCIES } from '@/ui/labels';
import {
  accountsById,
  feedSubtitle,
  feedTitle,
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
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const all = accountsRepo.list();
      const found = all.find((a) => a.id === id);
      // The bank's own side, joined at the screen and not on the `Account`, exactly as Рахунки
      // does it: a link keyed by рахунок id names the monobank account whose баланс банку this is.
      let bankBalance: Money | undefined;
      for (const link of monobankRepo.listLinks()) {
        if (link.accountId !== id) continue;
        bankBalance = monobankRepo.getAccount(link.monobankAccountId)?.bankBalance;
      }
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

  /** The same marks the стрічка carries, judged per month of the транзакції shown here. */
  const overLimit = useMemo(
    () =>
      overLimitByMonth({
        feed: stored.transactions,
        limits: stored.limits,
        monthTransactions: (month) => transactionsRepo.listMonth(month),
      }),
    [stored.limits, stored.transactions],
  );

  const [draft, setDraft] = useState<AccountDraft | undefined>();
  /** What the owner counted, as typed. Only ever read by «Звірити». */
  const [actual, setActual] = useState('');

  const save = useCallback(() => {
    if (!draft) return;
    try {
      accountsRepo.save(accountFromDraft(draft, newId()));
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert('Не збережено', failureMessage(error));
    }
  }, [draft, reload]);

  const setArchived = useCallback(
    (archived: boolean) => {
      if (!stored.account) return;
      try {
        accountsRepo.save(account({ ...stored.account, archived }));
        setDraft(undefined);
        reload();
      } catch (error) {
        Alert.alert('Не збережено', failureMessage(error));
      }
    },
    [reload, stored.account],
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
        Alert.alert('Звірити', answer.message);
        setActual('');
        return;
      }
      Alert.alert('Звірити', answer.confirmation, [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Створити коригування',
          onPress: () => {
            try {
              transactionsRepo.save(answer.correction, new Date());
              setActual('');
              reload();
            } catch (error) {
              Alert.alert('Не збережено', failureMessage(error));
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Не звірено', failureMessage(error));
    }
  }, [actual, movements, reload, stored.account]);

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

  return (
    <Screen>
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
        {draft ? null : (
          <Action
            variant="secondary"
            title="Редагувати рахунок"
            onPress={() => setDraft(draftFrom(a))}
          />
        )}
      </Card>

      {/* Звірити, offered for every unarchived рахунок — готівка included. An archived one is
          offered for no new транзакція, and a коригування is a транзакція like any other. */}
      {a.archived ? null : (
        <Card style={styles.form}>
          <ThemedText type="overline">Звірити</ThemedText>
          <Field
            label="Фактичний залишок"
            value={actual}
            onChangeText={setActual}
            keyboardType="numbers-and-punctuation"
            placeholder="0,00"
            hint={`${a.currency} — скільки насправді на рахунку`}
          />
          <Action title="Звірити" onPress={confirmReconcile} />
        </Card>
      )}

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
          <Action variant="secondary" title="Скасувати" onPress={() => setDraft(undefined)} />
        </Card>
      ) : null}

      <SectionLabel>Рухи</SectionLabel>
      {movements.emptyMessage ? (
        <ThemedText type="small" themeColor="textSecondary">
          {movements.emptyMessage}
        </ThemedText>
      ) : (
        <ListCard>
          {movements.transactions.map((t, index) => {
            const line = transactionLine(t, byId, categoryNames, sourceNames, overLimit);
            return (
              <ListRow key={line.id} last={index === movements.transactions.length - 1}>
                <Pressable
                  onPress={() => router.push(`/transaction/${line.id}`)}
                  style={styles.row}>
                  <View style={styles.label}>
                    <View style={styles.rowTitle}>
                      {line.uncategorised ? <Mark /> : null}
                      <ThemedText
                        numberOfLines={1}
                        themeColor={line.overLimit ? 'textDanger' : undefined}>
                        {feedTitle(line)}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {feedSubtitle(line)}
                    </ThemedText>
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
                    }>
                    {line.amount}
                  </ThemedText>
                </Pressable>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balances: { gap: Spacing.two - Spacing.half },
  form: { gap: Spacing.three },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  label: { flex: 1, gap: Spacing.half },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - Spacing.half },
  amount: { fontWeight: 600 },
});
