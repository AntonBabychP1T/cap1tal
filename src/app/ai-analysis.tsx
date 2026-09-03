import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Action, Choices, Field } from '@/components/form';
import { Banner, Card, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  goals as goalsRepo,
  limits as limitsRepo,
  rates as ratesRepo,
  sources as sourcesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useTheme } from '@/hooks/use-theme';
import { analysisShare } from '@/platform/analysis-share-device';
import {
  aiAnalysisModel,
  ALWAYS_INCLUDED,
  defaultChoices,
  fileToShare,
  KIND_CHOICES,
  nextState,
  PERIOD_CHOICES,
  runOutcomeWords,
  shortRequestToCopy,
  textToCopy,
  type PeriodChoiceId,
  type RunState,
} from '@/ui/ai-analysis-screen';
import { todayIso } from '@/ui/dates';

import { Spacing } from '@/constants/theme';

/**
 * «AI-аналіз» — where the owner chooses what to have explained, reads exactly what would leave the
 * phone, and then, by one explicit action, hands that one файл to an app they pick in the phone's
 * own chooser.
 *
 * Pushed over the tabs from «Звіти», like «Транзакції»: an AI-аналіз is somewhere you go, not
 * somewhere you live.
 *
 * Everything this screen decides is decided in `src/ui/ai-analysis-screen.ts` under `verify` —
 * which period the choices mean, what the preview counts, what the size is, which state the run is
 * in, every word shown. This file is the wiring: it reads the repositories on focus, calls the
 * model, and calls the port or the clipboard on the two actions. It creates, changes and deletes
 * nothing, and it stores nothing at all — the two switches live in React state and are gone the
 * moment the screen is.
 *
 * The chooser opens on the owner's action and on nothing else. Building the пакет, rendering the
 * файл and showing the preview all happen in memory; no файл exists outside the app's own private
 * storage until «Поділитися з AI» is pressed.
 */
export default function AiAnalysisScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [stored] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        transactions: transactionsRepo.listAll(),
        // Archived категорії and джерела included: a транзакція keeps the label it was recorded
        // under, and the пакет names it rather than falling back to anything.
        categories: categoriesRepo.list(),
        sources: sourcesRepo.list(),
        limits: limitsRepo.list(),
        goals: goalsRepo.list(),
        rates: ratesRepo.all(),
      }),
      [],
    ),
  );

  // The day the пакет is built for, read once on the screen and passed down — nothing below reads
  // a clock, which is what lets the whole model be tested against a fixed date.
  const today = useMemo(() => todayIso(new Date()), []);
  const [choices, setChoices] = useState(() => defaultChoices(today));
  const [run, setRun] = useState<RunState>({ kind: 'preview' });
  const [showingFile, setShowingFile] = useState(false);

  const model = useMemo(
    () => aiAnalysisModel({ choices, stored, today }),
    [choices, stored, today],
  );

  /** Every change of a choice returns the screen to what would leave *now*. */
  const change = useCallback((update: Partial<typeof choices>) => {
    setChoices((current) => ({ ...current, ...update }));
    setRun((current) => nextState(current, { kind: 'choices-changed' }));
    setShowingFile(false);
  }, []);

  const share = useCallback(async () => {
    const file = fileToShare(model);
    if (!file) {
      return;
    }
    setRun((current) => nextState(current, { kind: 'share' }));
    const outcome = await analysisShare.share(file);
    setRun((current) => nextState(current, { kind: 'outcome', outcome }));
  }, [model]);

  const copy = useCallback(async () => {
    const text = textToCopy(model);
    if (!text) {
      return;
    }
    await Clipboard.setStringAsync(text);
    setRun((current) => nextState(current, { kind: 'copy' }));
  }, [model]);

  /** The короткий запит alone — for the app that took the attachment and no message with it. */
  const copyRequest = useCallback(async () => {
    const text = shortRequestToCopy(model);
    if (!text) {
      return;
    }
    await Clipboard.setStringAsync(text);
    setRun((current) => nextState(current, { kind: 'copy-request' }));
  }, [model]);

  const outcome = runOutcomeWords(run);

  return (
    <Screen>
      <ScreenHeader
        title="AI-аналіз"
        subtitle="Пояснення чисел, які застосунок уже порахував"
        back={() => router.back()}
      />

      <SectionLabel>Що аналізувати</SectionLabel>
      <Card style={styles.card}>
        <Choices
          label="Вид"
          choices={KIND_CHOICES.map((kind) => ({ value: kind.id, label: kind.label }))}
          selected={choices.kind}
          onSelect={(kind) => change({ kind })}
        />
        <Choices
          label="Період"
          choices={PERIOD_CHOICES.map((period) => ({ value: period.id, label: period.label }))}
          selected={choices.period}
          onSelect={(period: PeriodChoiceId) => change({ period })}
        />
        {choices.period === 'custom' ? (
          <View style={styles.range}>
            <View style={styles.rangeField}>
              <Field
                label="Від"
                value={choices.from}
                onChangeText={(from) => change({ from })}
                placeholder="2026-01"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.rangeField}>
              <Field
                label="До"
                value={choices.to}
                onChangeText={(to) => change({ to })}
                placeholder="2026-06"
                autoCapitalize="none"
              />
            </View>
          </View>
        ) : null}
        <ThemedText type="small" themeColor="textMuted">
          {ALWAYS_INCLUDED}
        </ThemedText>
      </Card>

      <SectionLabel>Що включити</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="small">Продавці</ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Описи транзакцій — текст, який надіслав банк
            </ThemedText>
          </View>
          <Switch
            value={choices.descriptions}
            onValueChange={(descriptions) => change({ descriptions })}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="small">Окремі транзакції</ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Кожна транзакція періоду, з датою і сумою
            </ThemedText>
          </View>
          <Switch
            value={choices.transactions}
            onValueChange={(transactions) => change({ transactions })}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>
      </Card>

      <SectionLabel>Що буде передано</SectionLabel>
      {model.preview ? (
        <Card style={styles.card}>
          <ThemedText type="small">{model.preview.handOver}</ThemedText>
          <ThemedText type="small">{model.preview.requestIncluded}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {model.preview.periodLabel}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {model.preview.summary}
          </ThemedText>
          {model.warning ? (
            <ThemedText type="small" themeColor="textMuted">
              {model.warning}
            </ThemedText>
          ) : null}
          <Action
            variant="secondary"
            title={showingFile ? 'Сховати файл' : 'Показати файл'}
            onPress={() => setShowingFile((shown) => !shown)}
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          <ThemedText type="small">{model.message}</ThemedText>
          {model.state === 'empty-history' ? (
            <Action
              variant="secondary"
              title="Записати першу"
              onPress={() => router.push('/transaction/new')}
            />
          ) : null}
        </Card>
      )}

      {showingFile && model.document ? (
        <Card style={styles.card}>
          {/* Raw text, and not a rendering of it: what is shown has to be exactly what leaves. */}
          <ScrollView style={styles.file} nestedScrollEnabled>
            <ThemedText type="small" themeColor="textSecondary">
              {model.document.text}
            </ThemedText>
          </ScrollView>
        </Card>
      ) : null}

      {outcome ? <Banner tone="quiet">{outcome}</Banner> : null}

      {model.canShare ? (
        <Action
          variant="primary"
          title="Поділитися з AI"
          disabled={run.kind === 'sharing'}
          onPress={() => void share()}
        />
      ) : null}
      {model.canCopy ? (
        <Action variant="secondary" title="Скопіювати" onPress={() => void copy()} />
      ) : null}
      {model.canCopy ? (
        <Action variant="secondary" title="Скопіювати запит" onPress={() => void copyRequest()} />
      ) : null}
      {model.canCopy && model.preview ? (
        // Standing beside the action from the moment it is offered, and not only after it is used.
        <ThemedText type="small" themeColor="textMuted" style={styles.hint}>
          {model.preview.requestHint}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  rowText: { flex: 1, gap: Spacing.half },
  range: { flexDirection: 'row', gap: Spacing.three },
  rangeField: { flex: 1 },
  // Tall enough to read a section of the файл in, short enough that the actions stay reachable.
  file: { maxHeight: 320 },
  // The sentence under «Скопіювати запит», inset to the width the actions above it occupy.
  hint: { paddingHorizontal: Spacing.two },
});
