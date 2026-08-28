import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
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
import { accountChoiceLabel, failureMessage, KIND_CHOICES } from '@/ui/labels';
import type { AccountRedirect } from '@/saldo/survey';
import {
  accountRows,
  applyMerges,
  assignDescription,
  assignTransaction,
  canCommit,
  debtRows,
  commitFailed,
  committed,
  mergeSuggestions,
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
  const [person, setPerson] = useState('');
  /** Proposals the owner has waved off. Refusing one changes no decision and writes nothing. */
  const [refusedMerges, setRefusedMerges] = useState<ReadonlySet<string>>(() => new Set<string>());

  const rows = useMemo(() => accountRows(flow), [flow]);
  /**
   * What the app thinks is one рахунок written twice, recomputed from the map as it now stands —
   * a proposal is never remembered, so accepting one simply leaves one proposal fewer.
   */
  const proposedMerges = useMemo(() => mergeSuggestions(flow), [flow]);
  const acceptedMerges = useMemo(
    () => proposedMerges.filter((suggestion) => !refusedMerges.has(suggestion.key)),
    [proposedMerges, refusedMerges],
  );
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

  /** Every standing proposal at once — one transition, so the engine runs once over the map. */
  const acceptMerges = useCallback(() => {
    setFlow((current) => applyMerges(current, acceptedMerges));
  }, [acceptedMerges]);

  const toggleRefusedMerge = useCallback((key: string) => {
    setRefusedMerges((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /**
   * The рахунки already on the device, offered as merge targets. Archived ones are left out for
   * the same reason every other picker leaves them out: an archived рахунок takes no new money.
   */
  const existingAccounts = useMemo(
    () => flow.existing.accounts.filter((a) => !a.archived),
    [flow.existing.accounts],
  );

  /**
   * Everything one entry could merge into, by name: the other entries that are still рахунки of
   * their own, and the рахунки the owner already keeps. An entry that is itself merging away is
   * not offered — merging onto it would make a chain nobody displayed.
   *
   * The currency rides every label because it is the one thing that can turn a redirect into a
   * refusal, and the owner should see it before they pick rather than after.
   */
  const mergeTargets = useCallback(
    (key: string) => [
      ...rows
        .filter((row) => row.key !== key && !row.mergedInto && !row.ontoExisting)
        .map((row) => ({
          value: `entry:${row.key}`,
          label: `${row.becomes.name} · ${row.entry.currency}`,
        })),
      ...existingAccounts.map((a) => ({
        value: `account:${a.id}`,
        label: `${accountChoiceLabel(a)} — наявний`,
      })),
    ],
    [existingAccounts, rows],
  );

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
          {proposedMerges.length > 0 ? (
            <>
              <SectionLabel>Схоже на дублі</SectionLabel>
              <Card style={styles.row}>
                <ThemedText type="small" themeColor="textSecondary">
                  Застосунок звірив назви й пропонує об’єднати ці записи. Нічого не змінюється, доки
                  ви не підтвердите, і кожне об’єднання можна скасувати нижче.
                </ThemedText>
                {proposedMerges.map((suggestion) => {
                  const skipped = refusedMerges.has(suggestion.key);
                  return (
                    <View key={suggestion.key} style={styles.row}>
                      <ThemedText type="smallBold">{suggestion.entryName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {skipped
                          ? '→ не об’єднувати'
                          : `→ ${suggestion.ontoExisting ? 'наявний рахунок ' : ''}«${suggestion.targetName}» · ${suggestion.reason}`}
                      </ThemedText>
                      <Action
                        variant="secondary"
                        title={skipped ? 'Повернути' : 'Пропустити'}
                        onPress={() => toggleRefusedMerge(suggestion.key)}
                      />
                    </View>
                  );
                })}
                <Action
                  title={`Об’єднати все (${acceptedMerges.length})`}
                  onPress={acceptMerges}
                  disabled={acceptedMerges.length === 0}
                />
              </Card>
            </>
          ) : null}

          <SectionLabel>Рахунки</SectionLabel>
          <ThemedText type="small" themeColor="textSecondary">
            Перевірте вид кожного рахунку; дублі однієї картки об’єднайте.
          </ThemedText>
          {rows.map((row) => (
            <Card key={row.key} style={styles.row}>
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
              {row.rejection ? <Warning>{row.rejection}</Warning> : null}
              {row.mergedInto || row.ontoExisting ? (
                <Action
                  variant="secondary"
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
                      variant="secondary"
                      title="Повернути вид із Saldo"
                      onPress={() => setFlow((c) => setAccountKind(c, row.key))}
                    />
                  ) : null}
                  {/* The targets by name, on the row that is merging — no mode to be in and no
                      second card to hunt for somewhere else on the screen. */}
                  <Choices
                    label="Об’єднати з"
                    selected={undefined}
                    choices={mergeTargets(row.key)}
                    onSelect={(value) =>
                      setFlow((c) => redirectAccount(c, row.key, targetOf(value)))
                    }
                  />
                </>
              )}
            </Card>
          ))}

          <SectionLabel>Нові категорії та джерела</SectionLabel>
          {flow.plan!.categories.map((proposal) => (
            <NameRow
              key={`c-${proposal.saldoName}`}
              name={proposal.saldoName}
              choices={categoriesRepo.list().map((row) => ({ value: row.id, label: row.name }))}
              onPick={(id) => setFlow((c) => redirectName(c, 'categories', proposal.saldoName, id))}
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
          <SectionLabel>Борги</SectionLabel>
          <ThemedText type="small" themeColor="textSecondary">
            Кожен запис «Борг» має належати людині. Поки хоч один без людини, імпорт не відбудеться.
          </ThemedText>
          <Field label="Ім’я людини" value={person} onChangeText={setPerson} />

          <SectionLabel>За описом</SectionLabel>
          {(flow.survey?.debtDescriptions ?? []).map((debt) => (
            <Card key={debt.description} style={styles.row}>
              <ThemedText type="smallBold">{debt.description || '(без опису)'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${debt.transactionIds.length} запис(ів)`}
              </ThemedText>
              <PersonPick
                person={person}
                existing={debtAccounts}
                onAssign={(to) => setFlow((c) => assignDescription(c, debt.description, to))}
              />
            </Card>
          ))}

          {/* A description is a convenience, not an identity: two «Борг» transactions may
              share one, and two of the owner's carry none at all. So every transaction is
              here too, with what it is and where it is going. */}
          <SectionLabel>Кожен запис окремо</SectionLabel>
          {rowsOfDebts.map((row) => (
            <Card key={row.transactionId} style={styles.row}>
              <ThemedText type="smallBold">{`${row.date} · ${formatMoney(row.amount)}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.assigned ? `→ ${row.person}` : 'без людини'}
                {row.description ? ` · «${row.description}»` : ''}
              </ThemedText>
              <PersonPick
                person={person}
                existing={debtAccounts}
                onAssign={(to) => setFlow((c) => assignTransaction(c, row.transactionId, to))}
              />
            </Card>
          ))}

          {unassigned.length > 0 ? <Warning>{`Без людини: ${unassigned.length}`}</Warning> : null}
          <Action
            variant="secondary"
            title="Назад — рахунки"
            onPress={() => setFlow((c) => toStep(c, 'accounts'))}
          />
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
              {`Буде записано: ${summary.transactions} транзакцій, ${summary.newAccounts} рахунків, ${summary.categories} категорій, ${summary.sources} джерел.`}
            </ThemedText>
          ) : null}

          {unassigned.length > 0 ? (
            <Warning>{`Спершу призначте людину для ${unassigned.length} запис(ів) «Борг».`}</Warning>
          ) : null}

          {/* The report is where the owner learns a «Борг» row is still unassigned, so it is
              also where they need the way back to assign it. */}
          <Action
            variant="secondary"
            title="Назад — борги"
            onPress={() => setFlow((c) => toStep(c, 'debts'))}
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
              {`Записано: ${flow.outcome.summary.transactions} транзакцій, ${flow.outcome.summary.accounts} рахунків, ${flow.outcome.summary.categories} категорій, ${flow.outcome.summary.sources} джерел.`}
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
 * The value a merge choice carries back, decoded. Two kinds of target live in one list, and the
 * prefix is what keeps «an entry of this import» and «a рахунок the owner already has» apart —
 * they are indistinguishable by name, and very different decisions.
 */
function targetOf(value: string): AccountRedirect {
  return value.startsWith('account:')
    ? { to: 'account', accountId: value.slice('account:'.length) }
    : { to: 'entry', key: value.slice('entry:'.length) };
}

/**
 * Something the owner has to read before going on — the app's one red, on the surface that goes
 * with it. Every one of these says a state that stops something: an import already run, a «Борг»
 * with nobody behind it, a file that cannot be read.
 */
function Warning({ children }: { children: string }) {
  return <Banner tone="danger">{children}</Banner>;
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
    <Card style={styles.row}>
      <ThemedText>{`Створити «${name}»`}</ThemedText>
      {open ? (
        <Choices
          label="Замість створення"
          selected={undefined}
          choices={choices}
          onSelect={onPick}
        />
      ) : (
        <Action variant="secondary" title="Обрати наявну" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
});
