import { useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
  investments as investmentsRepo,
  monobank as monobankRepo,
  rates as ratesRepo,
  storedHistory,
  transactions as transactionsRepo,
} from '@/db/repos';
import { reconcile, type Account } from '@/domain/account';
import type { CurrentValue } from '@/domain/investments';
import type { Money } from '@/domain/money';
import { useCurrentRates } from '@/hooks/use-current-rates';
import { useTheme } from '@/hooks/use-theme';
import { judgeProgressLater, onProgressJudged } from '@/hooks/progress-ports';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useSinglePush } from '@/hooks/use-single-push';
import { accountFromDraft, blankDraft, type AccountDraft } from '@/ui/account-form';
import {
  accountRows,
  clearValueConfirmation,
  groupAccountsByKind,
  reconcileConfirmation,
} from '@/ui/account-groups';
import { accountTotals, approximateTotals, totalsLine } from '@/ui/account-totals';
import { formatMoney, parseCurrentValue } from '@/ui/amount-input';
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

/**
 * What this tab holds until it is first opened: Android builds every tab at launch, and this one
 * reads nothing until the owner looks at it (app-shell, "A tab reads storage only once it is first
 * opened"). Every hook below runs over it without touching storage, and the tab draws an empty body.
 */
const UNSEEN = {
  all: [],
  balances: new Map<string, Money>(),
  bankBalances: new Map<string, Money>(),
  currentValues: new Map<string, CurrentValue>(),
  rates: [],
};

export default function AccountsScreen() {
  const router = useRouter();
  /** A рахунок opens once, however many rows are tapped while its screen is opening. */
  const push = useSinglePush();
  const theme = useTheme();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload, reloadWhenSeen] = useReloadOnFocus(
    useCallback(() => {
      // The stored history, read at most once per change stamp (app-speed-pass design D1): every
      // рахунок and its розрахунковий баланс, from one pass over the транзакції. An інвестиційний
      // рахунок's розрахунковий баланс **is** its вкладено (`contributed`), so the one number serves
      // both.
      const history = storedHistory.read();
      const all = history.accounts;
      const balances = history.balances();
      // The bank's own side, joined at the screen and not on the `Account`: the last known баланс
      // банку of every linked рахунок, in one read.
      const bankBalances = monobankRepo.bankBalances();
      // The поточні вартості, read on focus like everything else here: one row per інвестиційний
      // рахунок that has one, which is single digits.
      return {
        all,
        balances,
        bankBalances,
        currentValues: investmentsRepo.all(),
        rates: ratesRepo.all(),
      };
    }, []),
    { whileUnseen: UNSEEN },
  );

  // The «≈ … грн» beside the totals is the only reason this screen touches the network, and its
  // absence changes nothing else here.
  useCurrentRates(reload);

  /**
   * A досягнення judged after a save (or a прогін) reaches this screen: at once in sight, on the
   * next focus otherwise (app-speed-pass design D5).
   */
  useEffect(() => onProgressJudged(reloadWhenSeen), [reloadWhenSeen]);

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
        accountRows(
          stored.all,
          stored.balances,
          stored.bankBalances,
          stored.currentValues,
        ).map((row) => [row.account.id, row]),
      ),
    [stored.all, stored.balances, stored.bankBalances, stored.currentValues],
  );
  const [draft, setDraft] = useState<AccountDraft | undefined>();

  const save = useCallback(() => {
    if (!draft) return;
    try {
      accountsRepo.save(accountFromDraft(draft, newId()));
      // A рахунок was created or edited: a початковий залишок moves the резерв with no транзакція
      // behind it, so this is one of the named moments.
      judgeProgressLater();
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
                judgeProgressLater();
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

  /**
   * «Записати вартість»: the сума the owner is typing for one інвестиційний рахунок, and which
   * рахунок it is for. One at a time — the form opens on the row it belongs to, so two of them
   * would be two forms claiming the same keyboard.
   */
  const [valueDraft, setValueDraft] = useState<{ accountId: string; typed: string } | undefined>();

  /**
   * The вартість the owner typed, in the рахунок's own currency, dated the day it was entered
   * (design D5 — no дата field is offered). Nothing else moves: no транзакція is written, and the
   * розрахунковий баланс this row shows is the same number afterwards.
   */
  const saveValue = useCallback(() => {
    if (!valueDraft) return;
    const account = stored.all.find((a) => a.id === valueDraft.accountId);
    if (!account) return;
    try {
      investmentsRepo.set(account.id, {
        amount: parseCurrentValue(valueDraft.typed, account.currency),
        asOf: todayIso(new Date()),
      });
      setValueDraft(undefined);
      reload();
    } catch (error) {
      Alert.alert(
        ...failureAlert({
          title: 'Не збережено',
          where: 'account-current-value',
          error,
          report: reportBug,
        }),
      );
    }
  }, [reload, reportBug, stored.all, valueDraft]);

  /**
   * Clearing is confirmed first, like «Звірити» — not because money moves (none does) but because
   * what goes is the app's only record of what this інвестиція is worth, and nothing can recompute
   * it. The sentence says exactly that before anything is removed.
   */
  const confirmClearValue = useCallback(
    (a: Account) => {
      const row = rowsById.get(a.id);
      if (!row?.investment?.value) return;
      Alert.alert('Забрати вартість', clearValueConfirmation(row), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Забрати',
          style: 'destructive',
          onPress: () => {
            try {
              investmentsRepo.clear(a.id);
              setValueDraft(undefined);
              reload();
            } catch (error) {
              Alert.alert(
                ...failureAlert({
                  title: 'Не збережено',
                  where: 'account-current-value-clear',
                  error,
                  report: reportBug,
                }),
              );
            }
          },
        },
      ]);
    },
    [reload, reportBug, rowsById],
  );

  if (stored === UNSEEN) {
    return <Screen>{null}</Screen>;
  }

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
              accessibilityRole="button"
              style={({ pressed }) => [styles.addTarget, pressed ? styles.pressed : null]}>
              {/* The edge, not just the fill: after the retone a `backgroundElement` square on
                  the page is #0F0D0B on #000000, and the «+» would be floating on nothing. A
                  surface on the page is held by its `cardEdge`, exactly as a card is. */}
              <ThemedView
                type="backgroundElement"
                style={[styles.add, { borderColor: theme.cardEdge }]}>
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
          {/* One currency per line, each whole: joined on one line, «1 300,22 EUR» broke between
              its number and its code at the edge of the card (accounts-screen, "«Усього грошей»
              reads one currency per line"). */}
          {totals.total.map((m) => (
            <ThemedText key={m.currency} type="subtitle" tabular numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(m)}
            </ThemedText>
          ))}
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
                    onPress={() => push(`/account/${a.id}`)}
                    style={styles.accountBody}>
                    <View style={styles.line}>
                      {/* Two lines, not one: at a large system font three рахунки whose names
                          start alike all cut to «Monobank U…» and read as one (QA, 2026-09-29).
                          The tail is what tells them apart, so it has to show. */}
                      <ThemedText numberOfLines={2} style={styles.name}>
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
                    {/* An інвестиційний рахунок's three numbers. The amount above is named rather
                        than repeated — it **is** вкладено — and the вартість, its дата and the
                        прибуток stand under it, each labelled so none is read as another. */}
                    {row?.investment ? (
                      <>
                        <ThemedText
                          type="small"
                          themeColor="textSecondary"
                          style={styles.underAmount}>
                          {row.investment.contributedLabel}
                        </ThemedText>
                        {row.investment.value ? (
                          <>
                            <View style={styles.line}>
                              <ThemedText type="small" themeColor="textSecondary">
                                поточна вартість на {row.investment.value.asOf}
                              </ThemedText>
                              <ThemedText type="small" tabular themeColor="textSecondary">
                                {row.investment.value.amount}
                              </ThemedText>
                            </View>
                            <View style={styles.line}>
                              <ThemedText type="small" themeColor="textSecondary">
                                {row.investment.value.gainLossLabel}
                              </ThemedText>
                              <ThemedText type="small" tabular themeColor="textSecondary">
                                {row.investment.value.gainLoss}
                              </ThemedText>
                            </View>
                          </>
                        ) : null}
                      </>
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
                  {/* Recording, replacing and clearing happen on the рахунок's own row. Nothing
                      here writes a транзакція, and no «Звірити» is offered for the difference
                      between a вартість and вкладено — that difference is the прибуток. */}
                  {row?.investment && valueDraft?.accountId !== a.id ? (
                    <View style={styles.reconcile}>
                      <RowAction
                        title={row.investment.recordLabel}
                        onPress={() => setValueDraft({ accountId: a.id, typed: '' })}
                      />
                      {row.investment.value ? (
                        <RowAction
                          title="Забрати"
                          tone="danger"
                          onPress={() => confirmClearValue(a)}
                        />
                      ) : null}
                    </View>
                  ) : null}
                  {valueDraft?.accountId === a.id ? (
                    <View style={styles.valueForm}>
                      <Field
                        label="Поточна вартість"
                        value={valueDraft.typed}
                        onChangeText={(typed) => setValueDraft({ accountId: a.id, typed })}
                        keyboardType="numbers-and-punctuation"
                        placeholder="0,00"
                        hint={`${a.currency} — станом на сьогодні`}
                        autoFocus
                      />
                      <Action title="Зберегти" onPress={saveValue} />
                      <Action
                        variant="secondary"
                        title="Скасувати"
                        onPress={() => setValueDraft(undefined)}
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
  /**
   * The tap target around the square: a full `TouchTarget`, where the square alone is 40 and an
   * accessibility check measured the control at 40. The negative vertical margin hands the extra
   * back, so the square sits exactly where it did and the header is no taller.
   */
  addTarget: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -Spacing.one,
  },
  add: {
    width: TouchTarget - Spacing.two,
    height: TouchTarget - Spacing.two,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
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
  reconcile: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  underAmount: { textAlign: 'right' },
  valueForm: { gap: Spacing.two },
  pressed: { opacity: 0.7 },
});
