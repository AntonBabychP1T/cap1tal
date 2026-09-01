import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Action, Choices } from '@/components/form';
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
import { failureMessage, KIND_CHOICES } from '@/ui/labels';
import {
  accountRows,
  canCommit,
  commitFailed,
  committed,
  confirmSecondImport,
  mergeTargets,
  planSummary,
  redirectAccount,
  redirectName,
  setAccountKind,
  startFlow,
  startWithText,
  targetOf,
  toStep,
  type FlowState,
} from '@/ui/saldo-import';

import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
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
  const rows = useMemo(() => accountRows(flow), [flow]);
  const summary = useMemo(() => planSummary(flow), [flow]);

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
      void clearAlert('saldo-import', ALERT_PORTS);
    } catch (error) {
      setFlow((current) => commitFailed(current, failureMessage(error)));
      // A commit runs while the owner walks away from a long import; the screen says why in its
      // own words either way, and only an owner who is not reading them is told again.
      void raiseAlert('saldo-import', { attended: attended() }, ALERT_PORTS);
    }
  }, [flow.plan]);

  /** Opening «Імпорт Saldo» is the owner looking at the failure it explains (design D6). */
  useClearAlertOnOpen('saldo-import');

  /**
   * What each row could merge into. The list itself is `mergeTargets` in `src/ui/saldo-import.ts`,
   * where `verify` can reach it — which entries and рахунки are offered, and how each is named, is
   * the whole of the requirement, and none of it is a drawing decision.
   */
  const targetsFor = useCallback((key: string) => mergeTargets(flow, key), [flow]);

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
                    choices={targetsFor(row.key)}
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
              {`Буде записано: ${summary.transactions} транзакцій, ${summary.newAccounts} рахунків, ${summary.categories} категорій, ${summary.sources} джерел.`}
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
 * Something the owner has to read before going on — the app's one red, on the surface that goes
 * with it. Every one of these says a state that stops something: an import already run, a file
 * that cannot be read, a redirect the import refused.
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
