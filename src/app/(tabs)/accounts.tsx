import { useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import {
  Card,
  ListCard,
  ListRow,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  accounts as accountsRepo,
  monobank as monobankRepo,
  rates as ratesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { computeBalance, reconcile, type Account } from '@/domain/account';
import type { Money } from '@/domain/money';
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountFromDraft, blankDraft, type AccountDraft } from '@/ui/account-form';
import { accountRows, groupAccountsByKind, reconcileConfirmation } from '@/ui/account-groups';
import { accountTotals, approximateTotals, totalsLine } from '@/ui/account-totals';
import { todayIso } from '@/ui/dates';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { kindLabel, KIND_CHOICES, OFFERED_CURRENCIES } from '@/ui/labels';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';

/**
 * Рахунки — every account under its вид with its розрахунковий баланс, how much money there is in
 * total, and the place a рахунок is created. Renaming, the opening balance and archiving live on
 * the рахунок's own рухи (`src/app/account/[id].tsx`), which is where the tap on a row goes: the
 * most natural gesture on this screen shows the money's movements, not a form. No delete action
 * exists anywhere — an account is archived, never deleted, so its history keeps explaining the
 * balances it took part in.
 *
 * A рахунок a monobank account feeds also shows the latest known баланс банку beside its own
 * computed one, and offers «Звірити» when the two differ. Neither number is ever written over the
 * other: «Звірити» records the domain's коригування for the difference, and the розрахунковий
 * баланс then explains itself exactly as before.
 */

const CURRENCY_CHOICES = OFFERED_CURRENCIES.map((c) => ({ value: c, label: c }));

export default function AccountsScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const all = accountsRepo.list();
      const balances = new Map(
        all.map((a) => [a.id, computeBalance(a, transactionsRepo.listByAccount(a.id))]),
      );
      // The bank's own side, joined at the screen and not on the `Account`: a link keyed by
      // рахунок id, and the last known баланс банку of the monobank account it names.
      const bankBalances = new Map<string, Money>();
      for (const link of monobankRepo.listLinks()) {
        const bankAccount = monobankRepo.getAccount(link.monobankAccountId);
        if (bankAccount) {
          bankBalances.set(link.accountId, bankAccount.bankBalance);
        }
      }
      return { all, balances, bankBalances, rates: ratesRepo.all() };
    }, []),
  );

  // The «≈ … грн» beside the totals is the only reason this screen touches the network, and its
  // absence changes nothing else here.
  useCurrentRates(reload);

  const groups = useMemo(() => groupAccountsByKind(stored.all), [stored.all]);
  /**
   * «Скільки всього грошей», decided in `src/ui/account-totals.ts`: a total per вид and one across
   * every unarchived рахунок, per currency. The archived group gets none — it is not a вид, and an
   * archived рахунок counts toward nothing.
   */
  const totals = useMemo(
    () => accountTotals(stored.all, stored.balances),
    [stored.all, stored.balances],
  );
  const approximate = useMemo(
    () => approximateTotals(totals.total, stored.rates),
    [stored.rates, totals.total],
  );
  const rowsById = useMemo(
    () =>
      new Map(
        accountRows(stored.all, stored.balances, stored.bankBalances).map((row) => [
          row.account.id,
          row,
        ]),
      ),
    [stored.all, stored.balances, stored.bankBalances],
  );
  const [draft, setDraft] = useState<AccountDraft | undefined>();

  const save = useCallback(() => {
    if (!draft) return;
    try {
      accountsRepo.save(accountFromDraft(draft, newId()));
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'account-save', error, report: reportBug }),
      );
    }
  }, [draft, reload, reportBug]);

  /**
   * «Звірити»: the owner confirms the exact signed difference, and what is then written is the
   * domain's own коригування — never an assignment of the bank's figure to the рахунок. Equal
   * balances produce nothing, which is why the action is offered only when they differ.
   */
  const confirmReconcile = useCallback(
    (a: Account) => {
      const row = rowsById.get(a.id);
      const bank = stored.bankBalances.get(a.id);
      const computed = stored.balances.get(a.id);
      if (!row || !row.reconcilable || !bank || !computed) return;
      Alert.alert('Звірити', reconcileConfirmation(row), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Створити коригування',
          onPress: () => {
            try {
              const correction = reconcile({
                accountId: a.id,
                computed,
                actual: bank,
                date: todayIso(new Date()),
                newId,
              });
              if (correction) {
                transactionsRepo.save(correction, new Date());
              }
              reload();
            } catch (error) {
              Alert.alert(
                ...failureAlert({ title: 'Не збережено', where: 'account-reconcile', error, report: reportBug }),
              );
            }
          },
        },
      ]);
    },
    [reload, reportBug, rowsById, stored.balances, stored.bankBalances],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Рахунки"
        right={
          // Creating moves under the thumb of the hand already holding the phone; the empty state
          // still says it in words, because a lone «+» explains nothing to an empty screen — and
          // while it is saying them, the «+» stands down. Two controls for one action, one of them
          // wordless, is one accessible name read twice by a screen reader with nothing to tell
          // them apart. The condition is the empty state's own, so exactly one is ever drawn.
          draft || groups.length === 0 ? undefined : (
            <Pressable
              onPress={() => setDraft(blankDraft())}
              accessibilityLabel="Створити рахунок"
              style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
              <ThemedView type="backgroundElement" style={styles.add}>
                <ThemedText type="subtitle">+</ThemedText>
              </ThemedView>
            </Pressable>
          )
        }
      />

      {/* The money held, above the рахунки it is the sum of. Named, so it is never read as the
          month's «Залишилось» — that number lives on Місяць and nowhere else. */}
      {totals.total.length > 0 ? (
        <Card style={styles.totals}>
          <ThemedText type="overline">Усього грошей</ThemedText>
          <ThemedText type="subtitle" tabular>
            {totalsLine(totals.total)}
          </ThemedText>
          {approximate ? (
            <ThemedText type="small" themeColor="textSecondary" tabular>
              {approximate}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {groups.length === 0 && !draft ? (
        <Card>
          <ThemedText>Ще жодного рахунку. Створіть перший.</ThemedText>
          <Action title="Створити рахунок" onPress={() => setDraft(blankDraft())} />
        </Card>
      ) : null}

      {groups.map((group) => (
        <Fragment key={group.kind}>
          {/* The вид's own total on its heading — what is in hand, saved, invested or lent, kept
              apart. The архів carries none. */}
          <SectionLabel
            note={
              group.kind === 'archived'
                ? undefined
                : totalsLine(totals.perKind.get(group.kind) ?? [])
            }>
            {kindLabel(group.kind)}
          </SectionLabel>
          <ListCard>
            {group.accounts.map((a, index) => {
              const row = rowsById.get(a.id);
              return (
                <ListRow
                  key={a.id}
                  last={index === group.accounts.length - 1}
                  style={styles.accountRow}>
                  {/* The tap opens the рахунок's рухи — what the owner is reaching for. Renaming
                      and archiving are actions on that screen, not consequences of this gesture. */}
                  <Pressable
                    onPress={() => router.push(`/account/${a.id}`)}
                    style={styles.accountBody}>
                    <View style={styles.line}>
                      <ThemedText numberOfLines={1} style={styles.name}>
                        {a.name}
                      </ThemedText>
                      <ThemedText tabular style={styles.amount}>
                        {row?.computed}
                      </ThemedText>
                    </View>
                    {/* The bank's figure under the рахунок's own, named so neither is mistaken
                        for the other. Only a linked рахунок has one. */}
                    {row?.bankBalance ? (
                      <View style={styles.line}>
                        <ThemedText type="small" themeColor="textSecondary">
                          останній баланс банку
                        </ThemedText>
                        <ThemedText type="small" tabular themeColor="textSecondary">
                          {row.bankBalance}
                        </ThemedText>
                      </View>
                    ) : null}
                  </Pressable>
                  {/* The difference is in the button, so what «Звірити» would write is readable
                      before it is tapped. */}
                  {row?.reconcilable ? (
                    <View style={styles.reconcile}>
                      <RowAction
                        title={`Звірити · ${row.difference}`}
                        onPress={() => confirmReconcile(a)}
                      />
                    </View>
                  ) : null}
                </ListRow>
              );
            })}
          </ListCard>
        </Fragment>
      ))}

      {draft ? (
        <Card style={styles.form}>
          <ThemedText type="overline">Новий рахунок</ThemedText>
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
          />
          <Choices
            label="Валюта"
            choices={CURRENCY_CHOICES}
            selected={draft.currency}
            onSelect={(currency) => setDraft({ ...draft, currency })}
          />
          <Field
            label="Початковий залишок"
            value={draft.opening}
            onChangeText={(opening) => setDraft({ ...draft, opening })}
            keyboardType="numbers-and-punctuation"
            placeholder="0,00"
            hint={`${draft.currency} — необовʼязково`}
          />
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={() => setDraft(undefined)} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    width: TouchTarget - Spacing.two,
    height: TouchTarget - Spacing.two,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: Spacing.three },
  totals: { gap: Spacing.two - Spacing.half },
  accountRow: { gap: Spacing.two },
  accountBody: { gap: Spacing.two - Spacing.half },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: { flex: 1 },
  amount: { fontWeight: 600 },
  reconcile: { flexDirection: 'row', justifyContent: 'flex-end' },
  pressed: { opacity: 0.7 },
});
