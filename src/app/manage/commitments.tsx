import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
import { Tap } from '@/components/motion';
import { Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  commitments as commitmentsRepo,
} from '@/db/repos';
import type { CommitmentField } from '@/domain/commitments';
import { INSTALLMENT_UPKEEP_PORTS, settleInstallmentsOnFocus } from '@/hooks/installment-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import {
  COMMITMENT_FIELD_LABELS,
  FIRST_DUE_HINT,
  MARKER_HINT,
  PERIODICITY_CHOICES,
  commitmentAccountChoices,
  commitmentCategoryChoices,
  commitmentDraftOf,
  commitmentDraftProblems,
  commitmentFromDraft,
  draftCurrency,
  editCommitmentDraft,
  newCommitmentDraft,
  type CommitmentDraft,
} from '@/ui/commitment-form';
import { NEW_COMMITMENT, STOPPED_COMMITMENTS, commitmentList, type CommitmentRow } from '@/ui/commitments-screen';
import { todayIso } from '@/ui/dates';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { settleAndReassertQuietly } from '@/ui/installment-upkeep';

import { Spacing } from '@/constants/theme';

/**
 * «Зобов'язання» — the running ones nearest платіж first, the stopped ones under «Припинені», and
 * the form that records or edits one. Every decision is `src/ui/commitments-screen.ts` and
 * `src/ui/commitment-form.ts`, where `verify` can reach it; this file is the wiring.
 *
 * Opened from Налаштування; one зобов'язання's «Редагувати» opens it with `?edit=<id>`, which opens
 * the form on that зобов'язання.
 */

/** An open form: a new зобов'язання, or the one being edited. */
type Editor = { readonly id?: string; readonly draft: CommitmentDraft; readonly tried: boolean };

export default function CommitmentsScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      // Both plans linked first, so the rows below read what the debits already say.
      settleInstallmentsOnFocus();
      return {
        commitments: commitmentsRepo.list(),
        facts: commitmentsRepo.facts(),
        // Every рахунок and категорія: the pickers filter, a stored one keeps its name.
        accounts: accountsRepo.list(),
        categories: categoriesRepo.list(),
      };
    }, []),
  );

  const list = useMemo(
    () => commitmentList(stored.commitments, stored.facts, new Date()),
    [stored.commitments, stored.facts],
  );

  const [editor, setEditor] = useState<Editor>();
  const closeForm = useCallback(() => setEditor(undefined), []);
  // WHILE the form is open the phone's back gesture closes it, storing nothing.
  useCloseOnBack(editor !== undefined, closeForm);

  const debitAccounts = useMemo(() => commitmentAccountChoices(stored.accounts), [stored.accounts]);

  // «Редагувати» on one зобов'язання lands here with its id: the form opens on it, once — on the
  // first render whose read holds that зобов'язання, not merely the first render.
  const [openedEdit, setOpenedEdit] = useState<string>();
  const toEdit = edit && edit !== openedEdit ? stored.commitments.find((c) => c.id === edit) : undefined;
  if (toEdit) {
    setOpenedEdit(toEdit.id);
    setEditor({ id: toEdit.id, draft: commitmentDraftOf(toEdit), tried: false });
  }

  const startNew = useCallback(() => {
    setEditor({ draft: newCommitmentDraft(todayIso(new Date()), debitAccounts), tried: false });
  }, [debitAccounts]);

  const change = useCallback(
    (fields: Partial<CommitmentDraft>) => {
      if (!editor) return;
      setEditor({ ...editor, draft: editCommitmentDraft(editor.draft, fields, stored.accounts) });
    },
    [editor, stored.accounts],
  );

  const editingId = editor?.id;
  const context = useMemo(() => {
    const existing = editingId ? stored.commitments.find((c) => c.id === editingId) : undefined;
    return {
      accounts: stored.accounts,
      categories: stored.categories,
      ...(existing ? { existing } : {}),
    };
  }, [editingId, stored.accounts, stored.categories, stored.commitments]);
  const problems = editor?.tried ? commitmentDraftProblems(editor.draft, context).problems : {};
  const problemOf = (field: CommitmentField) => problems[field];

  const save = useCallback(() => {
    if (!editor) return;
    const { problems: now } = commitmentDraftProblems(editor.draft, context);
    if (Object.keys(now).length > 0) {
      // Nothing is stored while any refusal stands; each is said beside its field.
      setEditor({ ...editor, tried: true });
      return;
    }
    try {
      commitmentsRepo.save(
        commitmentFromDraft(editor.draft, { ...context, id: editor.id ?? newId(), now: new Date() }),
      );
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не збережено', where: 'commitment-save', error, report: reportBug }),
      );
      return;
    }
    setEditor(undefined);
    reload();
    // An old дата першого платежу links the витрати already recorded.
    void settleAndReassertQuietly(INSTALLMENT_UPKEEP_PORTS).then(reload);
  }, [context, editor, reload, reportBug]);

  const categoryChoices = useMemo(
    () => [
      { value: '', label: 'Без категорії' },
      ...commitmentCategoryChoices(stored.categories).map((c) => ({ value: c.id, label: c.name })),
    ],
    [stored.categories],
  );

  const open = (row: CommitmentRow) =>
    router.push({ pathname: '/commitment/[id]', params: { id: row.id } });

  const currency = editor ? draftCurrency(editor.draft, stored.accounts) : undefined;

  return (
    <Screen>
      <ScreenHeader
        title="Зобов'язання"
        subtitle="Оренда, інтернет, підписки: які витрати — їхні платежі, і що ще має списатися."
        back={() => router.back()}
      />

      {editor ? (
        <Card style={styles.form}>
          <Field
            label={COMMITMENT_FIELD_LABELS.name}
            value={editor.draft.name}
            onChangeText={(name) => change({ name })}
            placeholder="напр. Netflix"
            hint={problemOf('name')}
          />
          <Choices
            label={COMMITMENT_FIELD_LABELS.debitAccount}
            choices={debitAccounts.map((a) => ({ value: a.id, label: a.name }))}
            selected={editor.draft.debitAccountId || undefined}
            onSelect={(debitAccountId) => change({ debitAccountId })}
            scroll
          />
          {problemOf('debitAccount') ? (
            <ThemedText type="small" themeColor="textDanger">
              {problemOf('debitAccount')}
            </ThemedText>
          ) : null}
          <Field
            label={COMMITMENT_FIELD_LABELS.amount}
            value={editor.draft.amount}
            onChangeText={(amount) => change({ amount })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint={problemOf('amount') ?? currency ?? 'у валюті рахунку списання'}
          />
          <Choices
            label={COMMITMENT_FIELD_LABELS.periodicity}
            choices={PERIODICITY_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
            selected={editor.draft.periodicity}
            onSelect={(periodicity) => change({ periodicity })}
          />
          <Field
            label={COMMITMENT_FIELD_LABELS.firstDue}
            value={editor.draft.firstDue}
            onChangeText={(firstDue) => change({ firstDue })}
            autoCapitalize="none"
            placeholder="РРРР-ММ-ДД"
            hint={problemOf('firstDue') ?? FIRST_DUE_HINT}
          />
          <Choices
            label={`${COMMITMENT_FIELD_LABELS.category} (необовʼязково)`}
            choices={categoryChoices}
            selected={editor.draft.categoryId}
            onSelect={(categoryId) => change({ categoryId })}
            scroll
          />
          {problemOf('category') ? (
            <ThemedText type="small" themeColor="textDanger">
              {problemOf('category')}
            </ThemedText>
          ) : null}
          <Field
            label={`${COMMITMENT_FIELD_LABELS.marker} (необовʼязково)`}
            value={editor.draft.marker}
            onChangeText={(marker) => change({ marker })}
            autoCapitalize="none"
            placeholder="напр. netflix"
            hint={problemOf('marker') ?? MARKER_HINT}
          />
          <Action title="Зберегти" onPress={save} />
          <Action variant="secondary" title="Скасувати" onPress={closeForm} />
        </Card>
      ) : (
        <Action title={NEW_COMMITMENT} onPress={startNew} />
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

      {list.stopped.length > 0 ? (
        <>
          <SectionLabel>{STOPPED_COMMITMENTS}</SectionLabel>
          <ListCard>
            {list.stopped.map((row, index) => (
              <Row key={row.id} row={row} last={index === list.stopped.length - 1} onPress={() => open(row)} />
            ))}
          </ListCard>
        </>
      ) : null}
    </Screen>
  );
}

function Row({ row, last, onPress }: { row: CommitmentRow; last: boolean; onPress: () => void }) {
  return (
    <ListRow last={last}>
      <Tap onPress={onPress} accessibilityRole="button" style={styles.row}>
        <View style={styles.rowTop}>
          <ThemedText numberOfLines={1} style={styles.grow}>
            {row.name}
          </ThemedText>
          <ThemedText tabular style={styles.amount}>
            {row.amount}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {[row.periodicity, row.next ? `наступний ${row.next}` : undefined, row.stopped]
            .filter(Boolean)
            .join(' · ')}
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
});
