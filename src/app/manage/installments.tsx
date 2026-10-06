import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, DateField, Field, Picker, RowAction, ThemedSwitch } from '@/components/form';
import { Tap } from '@/components/motion';
import { Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  installments as installmentsRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import type { InstallmentField } from '@/domain/installments';
import {
  INSTALLMENT_UPKEEP_PORTS,
  settleInstallmentsOnFocus,
} from '@/hooks/installment-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useOnForeground } from '@/hooks/use-on-foreground';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import type { LocalNotificationPermission } from '@/platform/local-notifications';
import { localNotifications } from '@/platform/local-notifications-device';
import { recentlyUsed } from '@/ui/category-choices';
import { todayIso } from '@/ui/dates';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { settleAndReassertQuietly } from '@/ui/installment-upkeep';
import {
  INSTALLMENT_FIELD_LABELS,
  debitAccountChoices,
  editInstallmentDraft,
  installmentAccountRows,
  installmentCategoryRows,
  installmentDraftOf,
  installmentDraftProblems,
  installmentFromDraft,
  lastPartOf,
  newInstallmentDraft,
  sameInstallmentFields,
  type InstallmentDraft,
} from '@/ui/installment-form';
import {
  INSTALLMENT_REMINDER_SWITCH,
  askOnceForReminders,
  installmentList,
  reminderLine,
  setRemindersOn,
  type InstallmentRow,
} from '@/ui/installments-screen';
import { PICKER_SIZE } from '@/ui/shortlist';

import { Spacing } from '@/constants/theme';

/**
 * «Розстрочки» — the active розстрочки nearest платіж first, the closed ones under «Закриті», the
 * form that records or edits one, and the switch of the нагадування про платіж. Every decision is
 * `src/ui/installments-screen.ts` and `src/ui/installment-form.ts`, where `verify` can reach it;
 * this file is the wiring.
 *
 * Opened from Налаштування, from Місяць's block and from the warning of a платіж tomorrow; one
 * розстрочка's «Редагувати» opens it with `?edit=<id>`, which opens the form on that розстрочка.
 */

const SWITCH_PORTS = { notifications: localNotifications, storage: installmentsRepo };

/** How far back the pickers look for what the owner reached for last — the entry form's window. */
const RECENT_WINDOW = 50;

/** Which picker has its full list open, if any — the one thing «назад» closes before the form. */
type OpenPicker = 'debitAccount' | 'category';

/** An open form: a new розстрочка, or the one being edited. */
type Editor = {
  readonly id?: string;
  readonly draft: InstallmentDraft;
  /** What the form opened on — «назад» asks «Відкинути зміни?» only once the draft differs. */
  readonly opened: InstallmentDraft;
  readonly tried: boolean;
};

export default function InstallmentsScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      // Linking first, so the rows below read what the debits already say.
      settleInstallmentsOnFocus();
      return {
        installments: installmentsRepo.list(),
        facts: installmentsRepo.facts(),
        reminder: installmentsRepo.reminder(),
        // Every рахунок and категорія: the pickers filter, a stored one keeps its name.
        accounts: accountsRepo.list(),
        categories: categoriesRepo.list(),
        // What the owner reached for last, read off the latest транзакції, as the entry form does.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
      };
    }, []),
  );

  const list = useMemo(
    () => installmentList(stored.installments, stored.facts, new Date()),
    [stored.facts, stored.installments],
  );

  /** What the phone allows — asked on focus and on every return to the app. */
  const [permission, setPermission] = useState<LocalNotificationPermission>();
  const readPermission = useCallback(() => {
    void localNotifications.permission().then(setPermission);
  }, []);
  useFocusEffect(readPermission);
  useOnForeground(readPermission);

  const [editor, setEditor] = useState<Editor>();
  // Which picker has its full list open: «назад» closes it first, and asks nothing.
  const [openPicker, setOpenPicker] = useState<OpenPicker>();
  const closePicker = useCallback(() => setOpenPicker(undefined), []);
  const opening = (picker: OpenPicker) => (isOpen: boolean) => setOpenPicker(isOpen ? picker : undefined);
  const closeForm = useCallback(() => setEditor(undefined), []);
  // WHILE the form is open the phone's back gesture closes it, storing nothing — after «Відкинути
  // зміни?» when the form holds edits. Only while no picker is open, so an open list closes first.
  const dirty = editor !== undefined && !sameInstallmentFields(editor.draft, editor.opened);
  const pickerClosed = openPicker === undefined;
  useCloseOnBack(editor !== undefined && pickerClosed, closeForm, pickerClosed && dirty);
  useCloseOnBack(!pickerClosed, closePicker);

  const debitAccounts = useMemo(() => debitAccountChoices(stored.accounts), [stored.accounts]);
  // The рахунок a stored розстрочка already sits on stays offered while it is edited, even when it
  // is a рахунок-борг that a new one would not be offered.
  const storedDebitId = editor?.id
    ? stored.installments.find((i) => i.id === editor.id)?.debitAccountId
    : undefined;
  // The pickers: five — the last reached for, topped up by name — and «Всі … (N)» with a search.
  const accountRows = useMemo(
    () => installmentAccountRows(stored.accounts, storedDebitId),
    [stored.accounts, storedDebitId],
  );
  const categoryRows = useMemo(() => installmentCategoryRows(stored.categories), [stored.categories]);
  const recent = useMemo(() => recentlyUsed(stored.latest, PICKER_SIZE), [stored.latest]);

  // «Редагувати» on one розстрочка lands here with its id: the form opens on it, once — on the
  // first render whose read holds that розстрочка, not merely the first render.
  const [openedEdit, setOpenedEdit] = useState<string>();
  const toEdit = edit && edit !== openedEdit ? stored.installments.find((i) => i.id === edit) : undefined;
  if (toEdit) {
    setOpenedEdit(toEdit.id);
    const draft = installmentDraftOf(toEdit);
    setOpenPicker(undefined);
    setEditor({ id: toEdit.id, draft, opened: draft, tried: false });
  }

  const startNew = useCallback(() => {
    const draft = newInstallmentDraft(todayIso(new Date()), debitAccounts);
    setOpenPicker(undefined);
    setEditor({ draft, opened: draft, tried: false });
  }, [debitAccounts]);

  const change = useCallback(
    (fields: Parameters<typeof editInstallmentDraft>[1]) => {
      if (!editor) return;
      setEditor({ ...editor, draft: editInstallmentDraft(editor.draft, fields, todayIso(new Date())) });
    },
    [editor],
  );

  const editingId = editor?.id;
  const context = useMemo(() => {
    const existing = editingId ? stored.installments.find((i) => i.id === editingId) : undefined;
    return {
      accounts: stored.accounts,
      categories: stored.categories,
      ...(existing ? { existing } : {}),
    };
  }, [editingId, stored.accounts, stored.categories, stored.installments]);
  const problems = editor?.tried ? installmentDraftProblems(editor.draft, context).problems : {};
  const problemOf = (field: InstallmentField) => problems[field];

  const save = useCallback(() => {
    if (!editor) return;
    const { problems: now } = installmentDraftProblems(editor.draft, context);
    if (Object.keys(now).length > 0) {
      // Nothing is stored while any refusal stands; each is said beside its field.
      setEditor({ ...editor, tried: true });
      return;
    }
    try {
      installmentsRepo.save(
        installmentFromDraft(editor.draft, { ...context, id: editor.id ?? newId(), now: new Date() }),
      );
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'installment-save', error, report: reportBug }),
      );
      return;
    }
    setEditor(undefined);
    reload();
    void (async () => {
      // The first розстрочка on a phone that does not allow notifications asks, once.
      setPermission(await askOnceForReminders(SWITCH_PORTS));
      await settleAndReassertQuietly(INSTALLMENT_UPKEEP_PORTS);
      reload();
    })();
  }, [context, editor, reload, reportBug]);

  const toggle = useCallback(
    (on: boolean) => {
      void (async () => {
        setPermission(await setRemindersOn(on, SWITCH_PORTS));
        await settleAndReassertQuietly(INSTALLMENT_UPKEEP_PORTS);
        reload();
      })();
    },
    [reload],
  );

  const line = permission ? reminderLine(stored.reminder.enabled, permission) : undefined;

  const open = (row: InstallmentRow) =>
    router.push({ pathname: '/installment/[id]', params: { id: row.id } });

  return (
    <Screen>
      <ScreenHeader
        title="Розстрочки"
        subtitle="Покупки частинами: які витрати — це їхні платежі, скільки ще сплатити і коли."
        back={() => router.back()}
      />

      {editor ? (
        <Card style={styles.form}>
          <Field
            label={INSTALLMENT_FIELD_LABELS.name}
            value={editor.draft.name}
            onChangeText={(name) => change({ name })}
            placeholder="напр. iPhone"
            hint={problemOf('name')}
          />
          <Field
            label={INSTALLMENT_FIELD_LABELS.total}
            value={editor.draft.total}
            onChangeText={(total) => change({ total })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={problemOf('total') ?? 'UAH'}
          />
          <Field
            label={INSTALLMENT_FIELD_LABELS.partsCount}
            value={editor.draft.partsCount}
            onChangeText={(partsCount) => change({ partsCount })}
            keyboardType="number-pad"
            placeholder="від 2 до 60"
            hint={problemOf('partsCount')}
          />
          <Field
            label={INSTALLMENT_FIELD_LABELS.part}
            value={editor.draft.part}
            onChangeText={(part) => change({ part })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={
              problemOf('part') ??
              (lastPartOf(editor.draft) ? `Останній платіж ${lastPartOf(editor.draft)}` : undefined)
            }
            reserveHint
          />
          <DateField
            label={INSTALLMENT_FIELD_LABELS.firstDue}
            value={editor.draft.firstDue}
            onChange={(firstDue) => change({ firstDue })}
            now={new Date()}
            hint={problemOf('firstDue')}
          />
          <Picker
            label={INSTALLMENT_FIELD_LABELS.debitAccount}
            rows={accountRows}
            recentIds={recent.accounts}
            selected={editor.draft.debitAccountId || undefined}
            onSelect={(debitAccountId) => change({ debitAccountId })}
            noun="accounts"
            expanded={openPicker === 'debitAccount'}
            onExpandedChange={opening('debitAccount')}
          />
          {problemOf('debitAccount') ? (
            <ThemedText type="small" themeColor="textDanger">
              {problemOf('debitAccount')}
            </ThemedText>
          ) : null}
          <Field
            label={INSTALLMENT_FIELD_LABELS.paidBefore}
            value={editor.draft.paidBefore}
            onChangeText={(paidBefore) => change({ paidBefore })}
            keyboardType="number-pad"
            hint={problemOf('paidBefore')}
          />
          <Picker
            label={`${INSTALLMENT_FIELD_LABELS.category} (необовʼязково)`}
            rows={categoryRows}
            recentIds={recent.categories}
            selected={editor.draft.categoryId}
            onSelect={(categoryId) => change({ categoryId })}
            noun="categories"
            expanded={openPicker === 'category'}
            onExpandedChange={opening('category')}
          />
          {problemOf('category') ? (
            <ThemedText type="small" themeColor="textDanger">
              {problemOf('category')}
            </ThemedText>
          ) : null}
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={closeForm} />
        </Card>
      ) : (
        <Action title="Нова розстрочка" onPress={startNew} />
      )}

      {list.empty ? (
        <ThemedText type="small" themeColor="textSecondary">
          {list.empty}
        </ThemedText>
      ) : null}

      {list.active.length > 0 ? (
        <ListCard>
          {list.active.map((row, index) => (
            <Row key={row.id} row={row} last={index === list.active.length - 1} onPress={() => open(row)} />
          ))}
        </ListCard>
      ) : null}

      {list.closed.length > 0 ? (
        <>
          <SectionLabel>Закриті</SectionLabel>
          <ListCard>
            {list.closed.map((row, index) => (
              <Row key={row.id} row={row} last={index === list.closed.length - 1} onPress={() => open(row)} />
            ))}
          </ListCard>
        </>
      ) : null}

      <SectionLabel>Нагадування</SectionLabel>
      <Card style={styles.form}>
        <View style={styles.switchRow}>
          <ThemedText type="small" style={styles.grow}>
            {INSTALLMENT_REMINDER_SWITCH}
          </ThemedText>
          <ThemedSwitch
            accessibilityLabel={INSTALLMENT_REMINDER_SWITCH}
            value={stored.reminder.enabled}
            onValueChange={toggle}
          />
        </View>
        {line?.text ? (
          <ThemedText type="small" themeColor="textSecondary">
            {line.text}
          </ThemedText>
        ) : null}
        {line?.offerSettings ? (
          <View style={styles.actions}>
            <RowAction
              title="Налаштування сповіщень"
              onPress={() => void localNotifications.openSettings()}
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function Row({ row, last, onPress }: { row: InstallmentRow; last: boolean; onPress: () => void }) {
  return (
    <ListRow last={last}>
      <Tap onPress={onPress} accessibilityRole="button" style={styles.row}>
        <View style={styles.rowTop}>
          <ThemedText numberOfLines={1} style={styles.grow}>
            {row.name}
          </ThemedText>
          <ThemedText tabular style={styles.amount}>
            {row.remaining}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {row.closedEarly ? `${row.progress} · закрито достроково` : row.progress}
          {row.next ? ` · наступний ${row.next}` : ''}
        </ThemedText>
        {row.missed ? (
          <ThemedText type="small" themeColor="textDanger">
            {row.missed}
          </ThemedText>
        ) : null}
      </Tap>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  row: { gap: Spacing.one },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  grow: { flex: 1 },
  amount: { fontWeight: 600 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
