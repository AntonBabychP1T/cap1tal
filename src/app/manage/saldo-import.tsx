import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import { Banner, Card, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  imports as importsRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { formatMoney } from '@/ui/amount-input';
import { failureAlert } from '@/ui/failure-alert';
import { reportFailure } from '@/ui/journal';
import { KIND_CHOICES, kindLabel } from '@/ui/labels';
import {
  canCommit,
  commitFailed,
  committed,
  confirmSecondImport,
  dismissHint,
  mapSections,
  mapSummary,
  mergeTargets,
  noTargetsMessage,
  planLine,
  planSummary,
  receivesLine,
  redirectAccount,
  redirectName,
  setAccountKind,
  startFlow,
  startWithText,
  stateLine,
  targetOf,
  toStep,
  writtenLine,
  SEPARATE_TARGET,
  type AccountRow,
  type FlowState,
} from '@/ui/saldo-import';
import { COLLAPSE_LABEL, narrow, NOTHING_FOUND, PICKER_SIZE, type Named } from '@/ui/shortlist';

import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';

import { Spacing } from '@/constants/theme';

/**
 * «Імпорт Saldo» — the one-time move of the owner's history out of Saldo. The screen picks the
 * file, shows what the import would do, and commits it; every decision it displays belongs to
 * `src/ui/saldo-import.ts` and every outcome to the engine in `src/saldo/`, so nothing here is a
 * rule that `verify` cannot reach.
 *
 * Nothing is written until the owner commits, and the commit is one database transaction — so
 * leaving at any point before it leaves the device exactly as it was.
 */

export default function SaldoImportScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [flow, setFlow] = useState<FlowState>(() =>
    startFlow({
      existing: {
        accounts: accountsRepo.list(),
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        transactions: transactionsRepo.listAll(),
      },
      ...(importsRepo.committedAt() ? { previouslyCommittedAt: importsRepo.committedAt() } : {}),
    }),
  );
  const sections = useMemo(() => mapSections(flow), [flow]);
  const opening = useMemo(() => mapSummary(flow), [flow]);
  const summary = useMemo(() => planSummary(flow), [flow]);

  const choose = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const text = await new File(picked.assets[0].uri).text();
      setFlow((current) => startWithText(current, text));
    } catch (error) {
      Alert.alert(
        ...failureAlert({ title: 'Не вдалося прочитати файл', where: 'saldo-file-read', error, report: reportBug }),
      );
    }
  }, [reportBug]);

  const commit = useCallback(() => {
    if (!flow.plan) return;
    try {
      const written = importsRepo.commit(flow.plan, new Date());
      setFlow((current) => committed(current, written));
      void clearAlert('saldo-import', ALERT_PORTS);
    } catch (error) {
      // The one refusal in the app that feeds a screen state rather than a dialog: same journal,
      // same text, no dialog to hang an offer on — this one is reported from the section.
      setFlow((current) => commitFailed(current, reportFailure('saldo-import', error)));
      // A commit runs while the owner walks away from a long import; the screen says why in its
      // own words either way, and only an owner who is not reading them is told again.
      void raiseAlert('saldo-import', { attended: attended() }, ALERT_PORTS);
    }
  }, [flow.plan]);

  /** Opening «Імпорт Saldo» is the owner looking at the failure it explains (design D6). */
  useClearAlertOnOpen('saldo-import');

  /**
   * The one editor the step may have open: a row's merge targets, a row's вид, or the existing
   * rows offered to a proposed категорія or джерело. One at a time, because with twenty-three rows
   * several open selectors mean several search fields, several keyboards and a screen whose height
   * changes under the thumb — and because it gives the phone's «назад» one unambiguous answer.
   *
   * It lives here rather than in `FlowState` for the reason `shortlist-pickers` gave for the same
   * decision: expansion is presentation, and every field of `FlowState` feeds the engine or the
   * commit. The *rule* — that «назад» closes it before leaving the screen — is `backGesture`, and
   * `useCloseOnBack` is the subscription around it.
   */
  const [open, setOpen] = useState<{ key: string; editor: 'merge' | 'kind' | 'name' } | undefined>(
    undefined,
  );
  /** The search inside whichever editor is open; there is only ever one, so it needs only one. */
  const [query, setQuery] = useState('');

  const isOpen = (key: string, editor: 'merge' | 'kind' | 'name') =>
    open?.key === key && open.editor === editor;
  const openEditor = (key: string, editor: 'merge' | 'kind' | 'name') => {
    setQuery('');
    setOpen({ key, editor });
  };
  const close = useCallback(() => {
    setQuery('');
    setOpen(undefined);
  }, []);
  useCloseOnBack(open !== undefined, close);

  /**
   * One row of the account map: назва, валюта, вид, one line of what will happen to it, and its
   * actions. Nothing here decides anything — every line is a field of `AccountRow` and every action
   * a transition of `src/ui/saldo-import.ts`, which is where `verify` can reach them.
   *
   * The вид rides the currency line rather than the state line design D9 sketches it on, so that a
   * Saldo назва too long for the width wraps above a line that still carries both — the words the
   * owner reads are the same words.
   */
  const mapRow = (row: AccountRow) => {
    const targets = isOpen(row.key, 'merge') ? mergeTargets(flow, row.key) : [];
    const narrowed = narrow(targets, query);
    const merge = (value: string) => {
      setFlow((c) => redirectAccount(c, row.key, targetOf(value)));
      close();
    };

    return (
      <Card key={row.key} style={styles.row}>
        <ThemedText type="smallBold">{row.entry.saldoAccount}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`${row.entry.currency} · ${kindLabel(row.becomes.kind)}`}
        </ThemedText>
        <ThemedText type="small">{stateLine(row)}</ThemedText>
        {receivesLine(row) ? (
          <ThemedText type="small" themeColor="textSecondary">
            {receivesLine(row)}
          </ThemedText>
        ) : null}
        {row.rejection ? <Warning>{row.rejection}</Warning> : null}

        {row.duplicateHint ? (
          <>
            <ThemedText type="small">
              {`Схоже, це той самий рахунок → «${row.duplicateHint.name}»`}
            </ThemedText>
            <View style={styles.actions}>
              {/* The same call a pick from the targets makes — the підказка is an offer of one of
                  them, never a merge of its own. */}
              <RowAction title="Об’єднати" onPress={() => merge(row.duplicateHint!.id)} />
              <RowAction
                title="Ні, окремо"
                tone="quiet"
                onPress={() => setFlow((c) => dismissHint(c, row.key))}
              />
            </View>
          </>
        ) : null}

        <View style={styles.actions}>
          <RowAction title="Об’єднати з…" onPress={() => openEditor(row.key, 'merge')} />
          {/* Only a row that becomes its own рахунок has a вид to change: a merged-away entry
              takes the вид of the рахунок it lands on, and `interpret` reads that owner entry's
              kind, so a pick here would be silently dropped. */}
          {row.state === 'new' ? (
            <RowAction title="Вид" onPress={() => openEditor(row.key, 'kind')} />
          ) : null}
          {row.state !== 'new' ? (
            <RowAction
              title="Скасувати об’єднання"
              tone="quiet"
              onPress={() => setFlow((c) => redirectAccount(c, row.key))}
            />
          ) : null}
        </View>

        {isOpen(row.key, 'kind') && row.state === 'new' ? (
          <>
            <Choices
              label="Вид"
              selected={row.becomes.kind}
              choices={KIND_CHOICES}
              onSelect={(kind) => {
                setFlow((c) => setAccountKind(c, row.key, kind));
                close();
              }}
            />
            {row.kindOverridden ? (
              <RowAction
                title="Повернути вид із Saldo"
                tone="quiet"
                onPress={() => {
                  setFlow((c) => setAccountKind(c, row.key));
                  close();
                }}
              />
            ) : null}
            <View style={styles.actions}>
              <RowAction title={COLLAPSE_LABEL} tone="quiet" onPress={close} />
            </View>
          </>
        ) : null}

        {isOpen(row.key, 'merge') ? (
          <>
            {/* The search appears for a list longer than a picker draws — and `SEPARATE_TARGET` is
                not in `targets`, so it neither raises the field nor is taken away by it. */}
            {targets.length > PICKER_SIZE ? (
              <Field
                label="Пошук"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                placeholder="почніть вводити назву"
              />
            ) : null}
            <Choices
              label={`Об’єднати «${row.entry.saldoAccount}» (${row.entry.currency}) з`}
              selected={row.state === 'new' ? SEPARATE_TARGET.id : undefined}
              choices={[
                { value: SEPARATE_TARGET.id, label: SEPARATE_TARGET.name },
                ...narrowed.map((target) => ({
                  value: target.id,
                  label: target.name,
                })),
              ]}
              onSelect={merge}
            />
            {targets.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {noTargetsMessage(row.entry.currency)}
              </ThemedText>
            ) : null}
            {targets.length > 0 && narrowed.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {NOTHING_FOUND}
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              <RowAction title={COLLAPSE_LABEL} tone="quiet" onPress={close} />
            </View>
          </>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Імпорт Saldo" back={() => router.back()} />

      {flow.previouslyCommittedAt ? (
        <Warning>
          {`Імпорт уже виконано ${flow.previouslyCommittedAt.toLocaleString('uk-UA')}. Ще один подвоїть усю історію.`}
        </Warning>
      ) : null}

      {flow.step === 'file' ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Оберіть CSV-експорт із Saldo. До підтвердження нічого не записується.
          </ThemedText>
          {flow.refusal ? <Warning>{flow.refusal}</Warning> : null}
          <Action title="Обрати файл" onPress={() => void choose()} />
        </>
      ) : null}

      {flow.step === 'accounts' && summary ? (
        <>
          <SectionLabel>Рахунки</SectionLabel>
          {/* The step's honest default is «нічого робити не треба», so it says so first — and the
              way on stands right there, before the list rather than after it. */}
          <ThemedText type="small" themeColor="textSecondary">
            {opening.sentence}
          </ThemedText>
          <Action title="Далі — звірка" onPress={() => setFlow((c) => toStep(c, 'report'))} />

          {sections.duplicates.length > 0 ? (
            <>
              <SectionLabel>{`Схоже на дублі (${sections.duplicates.length})`}</SectionLabel>
              {sections.duplicates.map(mapRow)}
            </>
          ) : null}

          {/* A heading over nothing is a heading that says the screen lost something. When every
              row carried a підказка, the group below this is empty and the opening line says so. */}
          {sections.rest.length > 0 ? (
            <>
              <SectionLabel>{`Решта рахунків (${sections.rest.length})`}</SectionLabel>
              {sections.rest.map(mapRow)}
            </>
          ) : null}

          {/* The same rule as the two groups above: an export whose every назва already matches
              proposes nothing, and a heading over nothing reads as something gone missing. */}
          {flow.plan!.categories.length + flow.plan!.sources.length > 0 ? (
            <SectionLabel>Нові категорії та джерела</SectionLabel>
          ) : null}
          {flow.plan!.categories.map((proposal) => (
            <NameRow
              key={`c-${proposal.saldoName}`}
              name={proposal.saldoName}
              rows={categoriesRepo.list()}
              open={isOpen(`c-${proposal.saldoName}`, 'name')}
              onOpen={() => openEditor(`c-${proposal.saldoName}`, 'name')}
              onClose={close}
              query={query}
              onQuery={setQuery}
              onPick={(id) => {
                setFlow((c) => redirectName(c, 'categories', proposal.saldoName, id));
                close();
              }}
            />
          ))}
          {flow.plan!.sources.map((proposal) => (
            <NameRow
              key={`s-${proposal.saldoName}`}
              name={proposal.saldoName}
              rows={sourcesRepo.list()}
              open={isOpen(`s-${proposal.saldoName}`, 'name')}
              onOpen={() => openEditor(`s-${proposal.saldoName}`, 'name')}
              onClose={close}
              query={query}
              onQuery={setQuery}
              onPick={(id) => {
                setFlow((c) => redirectName(c, 'sources', proposal.saldoName, id));
                close();
              }}
            />
          ))}
          <Action title="Далі — звірка" onPress={() => setFlow((c) => toStep(c, 'report'))} />
        </>
      ) : null}

      {flow.step === 'report' && flow.report ? (
        <>
          <SectionLabel>Звірка з Saldo</SectionLabel>
          {flow.report.accounts.map((reconciliation) => (
            <Card key={reconciliation.accountId} style={styles.row}>
              <ThemedText type="smallBold">{reconciliation.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {reconciliation.reconciles
                  ? `Сходиться: ${formatMoney(reconciliation.planBalance)}`
                  : `Розбіжність ${formatMoney(reconciliation.difference)}`}
              </ThemedText>
              {reconciliation.explanations.map((explanation, index) => (
                <ThemedText key={index} type="small" themeColor="textSecondary">
                  {explanation.kind === 'export-row'
                    ? `${formatMoney(explanation.amount)} — ${explanation.row.detail}`
                    : `${formatMoney(explanation.amount)} — вже записано вручну (${explanation.count})`}
                </ThemedText>
              ))}
            </Card>
          ))}

          {flow.report.debts.length > 0 ? (
            <>
              <SectionLabel>Борги після імпорту</SectionLabel>
              {/* Every debt the export carries is closed, so 0 is what this should read; anything
                  else is a «Борг» row whose other half did not pair. */}
              <ThemedText type="small" themeColor="textSecondary">
                Усі борги з експорту закриті — тут має бути 0.
              </ThemedText>
              {flow.report.debts.map((debt) => (
                <ThemedText key={debt.accountId} type="small" themeColor="textSecondary">
                  {`${debt.name}: ${formatMoney(debt.balance)}`}
                </ThemedText>
              ))}
            </>
          ) : null}

          {flow.report.droppedRows.length > 0 ? (
            <>
              <SectionLabel>
                {`Рядки, які нічого не рухають (${flow.report.droppedRows.length})`}
              </SectionLabel>
              {flow.report.droppedRows.slice(0, 50).map((row, index) => (
                <ThemedText key={index} type="small" themeColor="textSecondary">
                  {`${row.reason}: ${row.detail}`}
                </ThemedText>
              ))}
            </>
          ) : null}

          {summary ? (
            <ThemedText type="small">
              {planLine(summary)}
            </ThemedText>
          ) : null}

          <Action
            variant="secondary"
            title="Назад — рахунки"
            onPress={() => setFlow((c) => toStep(c, 'accounts'))}
          />

          {flow.previouslyCommittedAt && !flow.secondImportConfirmed ? (
            <Action
              title="Так, імпортувати ще раз"
              onPress={() => setFlow((c) => confirmSecondImport(c))}
            />
          ) : null}

          {canCommit(flow) ? <Action title="Імпортувати" onPress={commit} /> : null}
        </>
      ) : null}

      {flow.step === 'done' && flow.outcome ? (
        <>
          {flow.outcome.kind === 'written' ? (
            <ThemedText type="small">
              {writtenLine(flow.outcome.summary)}
            </ThemedText>
          ) : (
            <Warning>{`Не записано нічого: ${flow.outcome.reason}`}</Warning>
          )}
          <Action title="Готово" onPress={() => router.back()} />
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Something the owner has to read before going on — the app's one red, on the surface that goes
 * with it. Every one of these says a state that stops something: an import already run, a file
 * that cannot be read, a redirect the import refused.
 */
function Warning({ children }: { children: string }) {
  return <Banner tone="danger">{children}</Banner>;
}

/**
 * A категорія or джерело the plan would create, and the existing rows it can be redirected onto
 * instead. The list is one of the three editors the step opens one at a time — it kept its own
 * `open` flag until this change, which would have left «назад» taking the whole screen out from
 * under the search field below.
 */
function NameRow({
  name,
  rows,
  open,
  onOpen,
  onClose,
  onPick,
  query,
  onQuery,
}: {
  name: string;
  rows: readonly Named[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (id: string) => void;
  query: string;
  onQuery: (value: string) => void;
}) {
  const narrowed = narrow(rows, query);
  return (
    <Card style={styles.row}>
      <ThemedText>{`Створити «${name}»`}</ThemedText>
      {open ? (
        <>
          {rows.length > PICKER_SIZE ? (
            <Field
              label="Пошук"
              value={query}
              onChangeText={onQuery}
              autoCapitalize="none"
              placeholder="почніть вводити назву"
            />
          ) : null}
          {narrowed.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {NOTHING_FOUND}
            </ThemedText>
          ) : (
            <Choices
              label="Замість створення"
              selected={undefined}
              choices={narrowed.map((row) => ({
                value: row.id,
                label: row.name,
              }))}
              onSelect={onPick}
            />
          )}
          <View style={styles.actions}>
            <RowAction title={COLLAPSE_LABEL} tone="quiet" onPress={onClose} />
          </View>
        </>
      ) : (
        <Action variant="secondary" title="Обрати наявну" onPress={onOpen} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  // A row's verbs sit side by side and wrap rather than run off a narrow screen; nothing on this
  // step is ever reached by a horizontal gesture. The gap is `three` and not `two` because each
  // `RowAction` carries `hitSlop` of `two`: eight apart, their hit areas would meet in the middle,
  // and a mis-tap between «Об’єднати» and «Ні, окремо» merges two рахунки.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
