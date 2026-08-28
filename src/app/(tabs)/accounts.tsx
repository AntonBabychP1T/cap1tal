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
  transactions as transactionsRepo,
} from '@/db/repos';
import {
  account,
  computeBalance,
  reconcile,
  type Account,
  type AccountKind,
} from '@/domain/account';
import type { Money } from '@/domain/money';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { accountRows, groupAccountsByKind, reconcileConfirmation } from '@/ui/account-groups';
import { formatMinorUnits, parseOpeningBalance } from '@/ui/amount-input';
import { todayIso } from '@/ui/dates';
import { newId } from '@/ui/id';
import { failureMessage, kindLabel, KIND_CHOICES, OFFERED_CURRENCIES } from '@/ui/labels';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';

/**
 * Рахунки — every account under its вид with its розрахунковий баланс, and the place accounts are
 * created, renamed and archived. No delete action exists: an account is archived, never deleted,
 * so its history keeps explaining the balances it took part in.
 *
 * A рахунок a monobank account feeds also shows the latest known баланс банку beside its own
 * computed one, and offers «Звірити» when the two differ. Neither number is ever written over the
 * other: «Звірити» records the domain's коригування for the difference, and the розрахунковий
 * баланс then explains itself exactly as before.
 */

const CURRENCY_CHOICES = OFFERED_CURRENCIES.map((c) => ({ value: c, label: c }));

/** An account being created, or an existing one being edited. */
interface Draft {
  readonly editing?: Account;
  name: string;
  kind: AccountKind;
  currency: string;
  opening: string;
}

const blankDraft = (): Draft => ({ name: '', kind: 'spending', currency: 'UAH', opening: '' });

export default function AccountsScreen() {
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
      return { all, balances, bankBalances };
    }, []),
  );

  const groups = useMemo(() => groupAccountsByKind(stored.all), [stored.all]);
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
  const [draft, setDraft] = useState<Draft | undefined>();

  const edit = useCallback((a: Account) => {
    setDraft({
      editing: a,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      // Shown in major units so the owner edits what they see; 0 stays empty rather than "0,00".
      opening: a.openingBalance.amount === 0 ? '' : formatMinorUnits(a.openingBalance.amount),
    });
  }, []);

  const save = useCallback(() => {
    if (!draft) return;
    try {
      if (draft.name.trim() === '') {
        throw new Error('рахунок потребує назви');
      }
      const opening = parseOpeningBalance(draft.opening, draft.currency);
      accountsRepo.save(
        account({
          id: draft.editing?.id ?? newId(),
          name: draft.name.trim(),
          kind: draft.kind,
          currency: draft.currency,
          openingBalance: opening,
          archived: draft.editing?.archived ?? false,
        }),
      );
      setDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert('Не збережено', failureMessage(error));
    }
  }, [draft, reload]);

  const setArchived = useCallback(
    (a: Account, archived: boolean) => {
      try {
        accountsRepo.save(account({ ...a, archived }));
        setDraft(undefined);
        reload();
      } catch (error) {
        Alert.alert('Не збережено', failureMessage(error));
      }
    },
    [reload],
  );

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
              Alert.alert('Не збережено', failureMessage(error));
            }
          },
        },
      ]);
    },
    [reload, rowsById, stored.balances, stored.bankBalances],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Рахунки"
        right={
          // Creating moves under the thumb of the hand already holding the phone; the empty state
          // still says it in words, because a lone «+» explains nothing to an empty screen.
          draft ? undefined : (
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

      {groups.length === 0 && !draft ? (
        <Card>
          <ThemedText>Ще жодного рахунку. Створіть перший.</ThemedText>
          <Action title="Створити рахунок" onPress={() => setDraft(blankDraft())} />
        </Card>
      ) : null}

      {groups.map((group) => (
        <Fragment key={group.kind}>
          <SectionLabel>{kindLabel(group.kind)}</SectionLabel>
          <ListCard>
            {group.accounts.map((a, index) => {
              const row = rowsById.get(a.id);
              return (
                <ListRow
                  key={a.id}
                  last={index === group.accounts.length - 1}
                  style={styles.accountRow}>
                  <Pressable onPress={() => edit(a)} style={styles.accountBody}>
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
          <ThemedText type="overline">
            {draft.editing ? 'Редагувати рахунок' : 'Новий рахунок'}
          </ThemedText>
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
            disabled={Boolean(draft.editing)}
          />
          <Choices
            label="Валюта"
            choices={CURRENCY_CHOICES}
            selected={draft.currency}
            onSelect={(currency) => setDraft({ ...draft, currency })}
            disabled={Boolean(draft.editing)}
          />
          {draft.editing ? (
            <ThemedText type="small" themeColor="textSecondary">
              Вид і валюту після створення змінити не можна.
            </ThemedText>
          ) : null}
          <Field
            label="Початковий залишок"
            value={draft.opening}
            onChangeText={(opening) => setDraft({ ...draft, opening })}
            keyboardType="numbers-and-punctuation"
            placeholder="0,00"
            hint={`${draft.currency} — необовʼязково`}
          />
          <Action title="Зберегти" onPress={save} />
          {draft.editing ? (
            <Action
              variant="secondary"
              title={draft.editing.archived ? 'Повернути з архіву' : 'До архіву'}
              onPress={() => setArchived(draft.editing!, !draft.editing!.archived)}
            />
          ) : null}
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
