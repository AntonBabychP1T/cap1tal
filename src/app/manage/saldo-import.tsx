import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action, Choices, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  imports as importsRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { formatMoney } from '@/ui/amount-input';
import { accountChoiceLabel, failureMessage, KIND_CHOICES } from '@/ui/labels';
import {
  accountRows,
  assignDescription,
  assignTransaction,
  canCommit,
  debtRows,
  commitFailed,
  committed,
  confirmSecondImport,
  planSummary,
  redirectAccount,
  redirectName,
  setAccountKind,
  startFlow,
  startWithText,
  toStep,
  unassignedDebts,
  type FlowState,
} from '@/ui/saldo-import';

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
  /** The entry waiting for a target while the owner picks what to merge it into. */
  const [merging, setMerging] = useState<string | undefined>();
  const [person, setPerson] = useState('');

  const rows = useMemo(() => accountRows(flow), [flow]);
  const summary = useMemo(() => planSummary(flow), [flow]);
  const unassigned = useMemo(() => unassignedDebts(flow), [flow]);
  const rowsOfDebts = useMemo(() => debtRows(flow), [flow]);
  /** The рахунки-борги the owner already has — a person they lent to before, not a new name. */
  const debtAccounts = useMemo(
    () => flow.existing.accounts.filter((a) => a.kind === 'debt' && !a.archived),
    [flow.existing.accounts],
  );

  const choose = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const text = await new File(picked.assets[0].uri).text();
      setFlow((current) => startWithText(current, text));
    } catch (error) {
      Alert.alert('Не вдалося прочитати файл', failureMessage(error));
    }
  }, []);

  const commit = useCallback(() => {
    if (!flow.plan) return;
    try {
      const written = importsRepo.commit(flow.plan, new Date());
      setFlow((current) => committed(current, written));
    } catch (error) {
      setFlow((current) => commitFailed(current, failureMessage(error)));
    }
  }, [flow.plan]);

  const mergeOnto = useCallback(
    (targetKey: string) => {
      if (!merging || merging === targetKey) {
        setMerging(undefined);
        return;
      }
      setFlow((current) => redirectAccount(current, merging, { to: 'entry', key: targetKey }));
      setMerging(undefined);
    },
    [merging],
  );

  /**
   * The рахунки already on the device, offered as merge targets. Archived ones are left out for
   * the same reason every other picker leaves them out: an archived рахунок takes no new money.
   */
  const existingAccounts = useMemo(
    () => flow.existing.accounts.filter((a) => !a.archived),
    [flow.existing.accounts],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Імпорт Saldo</ThemedText>

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
              <ThemedText type="smallBold">Рахунки</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {merging
                  ? 'Оберіть рахунок, з яким об’єднати.'
                  : 'Перевірте вид кожного рахунку; дублі однієї картки об’єднайте.'}
              </ThemedText>
              {rows.map((row) => (
                <ThemedView key={row.key} type="backgroundElement" style={styles.row}>
                  <Pressable onPress={() => (merging ? mergeOnto(row.key) : undefined)}>
                    <ThemedText type="smallBold">
                      {`${row.entry.saldoAccount} (${row.entry.currency})`}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {row.ontoExisting
                        ? `→ наявний рахунок «${row.becomes.name}»`
                        : row.mergedInto
                          ? `→ ${row.mergedInto}`
                          : `→ ${row.becomes.name}`}
                    </ThemedText>
                  </Pressable>
                  {row.rejection ? <Warning>{row.rejection}</Warning> : null}
                  {row.mergedInto || row.ontoExisting ? (
                    <Action
                      title="Скасувати об’єднання"
                      onPress={() => setFlow((c) => redirectAccount(c, row.key))}
                    />
                  ) : (
                    <>
                      <Choices
                        label="Вид"
                        selected={row.becomes.kind}
                        choices={KIND_CHOICES}
                        onSelect={(kind) => setFlow((c) => setAccountKind(c, row.key, kind))}
                      />
                      {flow.decisions.accountKinds?.[row.key] ? (
                        <Action
                          title="Повернути вид із Saldo"
                          onPress={() => setFlow((c) => setAccountKind(c, row.key))}
                        />
                      ) : null}
                      <Action
                        title={merging === row.key ? 'Скасувати' : 'Об’єднати з…'}
                        onPress={() => setMerging(merging === row.key ? undefined : row.key)}
                      />
                      {existingAccounts.length > 0 ? (
                        <Choices
                          label="Або на наявний рахунок"
                          selected={undefined}
                          choices={existingAccounts.map((a) => ({
                            value: a.id,
                            label: accountChoiceLabel(a),
                          }))}
                          onSelect={(accountId) =>
                            setFlow((c) =>
                              redirectAccount(c, row.key, { to: 'account', accountId }),
                            )
                          }
                        />
                      ) : null}
                    </>
                  )}
                </ThemedView>
              ))}

              <ThemedText type="smallBold">Нові категорії та джерела</ThemedText>
              {flow.plan!.categories.map((proposal) => (
                <NameRow
                  key={`c-${proposal.saldoName}`}
                  name={proposal.saldoName}
                  choices={categoriesRepo.list().map((row) => ({ value: row.id, label: row.name }))}
                  onPick={(id) =>
                    setFlow((c) => redirectName(c, 'categories', proposal.saldoName, id))
                  }
                />
              ))}
              {flow.plan!.sources.map((proposal) => (
                <NameRow
                  key={`s-${proposal.saldoName}`}
                  name={proposal.saldoName}
                  choices={sourcesRepo.list().map((row) => ({ value: row.id, label: row.name }))}
                  onPick={(id) => setFlow((c) => redirectName(c, 'sources', proposal.saldoName, id))}
                />
              ))}
              <Action title="Далі — борги" onPress={() => setFlow((c) => toStep(c, 'debts'))} />
            </>
          ) : null}

          {flow.step === 'debts' ? (
            <>
              <ThemedText type="smallBold">Борги</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Кожен запис «Борг» має належати людині. Поки хоч один без людини, імпорт не
                відбудеться.
              </ThemedText>
              <Field label="Ім’я людини" value={person} onChangeText={setPerson} />

              <ThemedText type="smallBold">За описом</ThemedText>
              {(flow.survey?.debtDescriptions ?? []).map((debt) => (
                <ThemedView key={debt.description} type="backgroundElement" style={styles.row}>
                  <ThemedText type="smallBold">{debt.description || '(без опису)'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`${debt.transactionIds.length} запис(ів)`}
                  </ThemedText>
                  <PersonPick
                    person={person}
                    existing={debtAccounts}
                    onAssign={(to) => setFlow((c) => assignDescription(c, debt.description, to))}
                  />
                </ThemedView>
              ))}

              {/* A description is a convenience, not an identity: two «Борг» transactions may
                  share one, and two of the owner's carry none at all. So every transaction is
                  here too, with what it is and where it is going. */}
              <ThemedText type="smallBold">Кожен запис окремо</ThemedText>
              {rowsOfDebts.map((row) => (
                <ThemedView key={row.transactionId} type="backgroundElement" style={styles.row}>
                  <ThemedText type="smallBold">
                    {`${row.date} · ${formatMoney(row.amount)}`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.assigned ? `→ ${row.person}` : 'без людини'}
                    {row.description ? ` · «${row.description}»` : ''}
                  </ThemedText>
                  <PersonPick
                    person={person}
                    existing={debtAccounts}
                    onAssign={(to) => setFlow((c) => assignTransaction(c, row.transactionId, to))}
                  />
                </ThemedView>
              ))}

              {unassigned.length > 0 ? (
                <Warning>{`Без людини: ${unassigned.length}`}</Warning>
              ) : null}
              <Action title="Назад — рахунки" onPress={() => setFlow((c) => toStep(c, 'accounts'))} />
              <Action title="Далі — звірка" onPress={() => setFlow((c) => toStep(c, 'report'))} />
            </>
          ) : null}

          {flow.step === 'report' && flow.report ? (
            <>
              <ThemedText type="smallBold">Звірка з Saldo</ThemedText>
              {flow.report.accounts.map((reconciliation) => (
                <ThemedView
                  key={reconciliation.accountId}
                  type="backgroundElement"
                  style={styles.row}
                >
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
                </ThemedView>
              ))}

              {flow.report.debts.length > 0 ? (
                <>
                  <ThemedText type="smallBold">Борги після імпорту</ThemedText>
                  {flow.report.debts.map((debt) => (
                    <ThemedText key={debt.accountId} type="small" themeColor="textSecondary">
                      {`${debt.name}: ${formatMoney(debt.balance)}`}
                    </ThemedText>
                  ))}
                </>
              ) : null}

              {flow.report.droppedRows.length > 0 ? (
                <>
                  <ThemedText type="smallBold">
                    {`Рядки, які нічого не рухають (${flow.report.droppedRows.length})`}
                  </ThemedText>
                  {flow.report.droppedRows.slice(0, 50).map((row, index) => (
                    <ThemedText key={index} type="small" themeColor="textSecondary">
                      {`${row.reason}: ${row.detail}`}
                    </ThemedText>
                  ))}
                </>
              ) : null}

              {summary ? (
                <ThemedText type="small">
                  {`Буде записано: ${summary.transactions} транзакцій, ${summary.newAccounts} рахунків, ${summary.categories} категорій, ${summary.sources} джерел.`}
                </ThemedText>
              ) : null}

              {unassigned.length > 0 ? (
                <Warning>{`Спершу призначте людину для ${unassigned.length} запис(ів) «Борг».`}</Warning>
              ) : null}

              {/* The report is where the owner learns a «Борг» row is still unassigned, so it is
                  also where they need the way back to assign it. */}
              <Action title="Назад — борги" onPress={() => setFlow((c) => toStep(c, 'debts'))} />

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
                  {`Записано: ${flow.outcome.summary.transactions} транзакцій, ${flow.outcome.summary.accounts} рахунків, ${flow.outcome.summary.categories} категорій, ${flow.outcome.summary.sources} джерел.`}
                </ThemedText>
              ) : (
                <Warning>{`Не записано нічого: ${flow.outcome.reason}`}</Warning>
              )}
              <Action title="Готово" onPress={() => router.back()} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Who a «Борг» transaction belongs to: the name typed above — a new рахунок-борг — or one of the
 * рахунки-борги the owner already has, which is what keeps a person from getting two.
 */
function PersonPick({
  person,
  existing,
  onAssign,
}: {
  person: string;
  existing: readonly { id: string; name: string }[];
  onAssign: (to: { to: 'person'; name: string } | { to: 'account'; accountId: string }) => void;
}) {
  return (
    <>
      <Action
        title={`Це ${person.trim() || '…'}`}
        onPress={() => person.trim() && onAssign({ to: 'person', name: person.trim() })}
      />
      {existing.length > 0 ? (
        <Choices
          label="Або наявний рахунок-борг"
          selected={undefined}
          choices={existing.map((a) => ({ value: a.id, label: a.name }))}
          onSelect={(accountId) => onAssign({ to: 'account', accountId })}
        />
      ) : null}
    </>
  );
}

/**
 * Something the owner has to read before going on. The palette has no red — the app has never
 * needed one — so a warning is said in bold rather than coloured; inventing a colour here would
 * be a design decision this change has no requirement for.
 */
function Warning({ children }: { children: string }) {
  return <ThemedText type="smallBold">{children}</ThemedText>;
}

function NameRow({
  name,
  choices,
  onPick,
}: {
  name: string;
  choices: { value: string; label: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small">{`Створити «${name}»`}</ThemedText>
      {open ? (
        <Choices label="Замість створення" selected={undefined} choices={choices} onSelect={onPick} />
      ) : (
        <Action title="Обрати наявну" onPress={() => setOpen(true)} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.one },
});
