import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Action, Field } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { progress as progressRepo } from '@/db/repos';
import { evaluateProgress, progressScreenData } from '@/hooks/progress-ports';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import type { ChallengeAction } from '@/progress/challenges';
import { proposeNorm } from '@/progress/norm';
import { parseAmount } from '@/ui/amount-input';
import { todayIso } from '@/ui/dates';
import { monthLabel } from '@/ui/months';
import { challengeDetail, normRefusal, normStep } from '@/ui/progress-screen';

import { Spacing } from '@/constants/theme';

/**
 * One виклик, in full: why it was proposed from the owner's own numbers, how far it has come, the
 * one sentence that says when it is finished, and the single action that begins it.
 *
 * Accepting and dismissing are the owner's, and both are one row of stored decision — no progress,
 * no target and no count is ever written. **Dismissing costs nothing**: it is not counted, it
 * reduces nothing, and a dismissed виклик can be brought back from here.
 *
 * «Фінансова подушка» on a currency with no норма begins with the one question the whole виклик is
 * measured against: what a month costs. The app proposes the median of the last six завершені
 * активні місяці and names them; the owner confirms it or types their own. Confirming is one of
 * the named moments, so the evaluation runs right after it.
 */
export default function ChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(params.key ?? '');
  const [stored, reload] = useReloadOnFocus(useCallback(() => progressScreenData(), []));
  const [typed, setTyped] = useState('');

  const detail = useMemo(
    () =>
      challengeDetail({
        key,
        challenges: stored.all,
        accepted: stored.accepted,
        now: new Date(),
      }),
    [key, stored],
  );

  const challenge = stored.all.find((one) => one.key === key);

  const step = useMemo(() => {
    if (!detail?.firstStep) {
      return null;
    }
    const currency = detail.firstStep.currency;
    const proposal = proposeNorm(stored.summary, currency, todayIso(new Date()));
    return normStep({ currency, proposal: proposal ?? null });
  }, [detail, stored.summary]);

  const decide = useCallback(
    (decision: 'accepted' | 'dismissed') => {
      progressRepo.decide({ key, decision, decidedAtMs: Date.now() });
      reload();
    },
    [key, reload],
  );

  const bringBack = useCallback(() => {
    progressRepo.undecide(key);
    reload();
  }, [key, reload]);

  const confirmNorm = useCallback(() => {
    if (!step) {
      return;
    }
    // The typed сума wins over the proposal; an empty field means «I accept what you propose».
    // A сума that is not one is refused in the parser's own words rather than swallowed.
    let amount;
    try {
      amount =
        typed.trim() === ''
          ? proposeNorm(stored.summary, step.currency, todayIso(new Date()))?.amount
          : parseAmount(typed, step.currency);
    } catch (error) {
      Alert.alert('Не збережено', error instanceof Error ? error.message : 'Це не сума.');
      return;
    }
    if (!amount) {
      Alert.alert('Не збережено', 'Впишіть суму місячної норми витрат.');
      return;
    }
    const refusal = normRefusal(amount);
    if (refusal) {
      Alert.alert('Не збережено', refusal);
      return;
    }
    progressRepo.confirmNorm({ amount, confirmedAtMs: Date.now() });
    // A норма was confirmed — one of the named moments, and the one that makes every резерв and
    // інвестиційний milestone in that currency exist at all.
    evaluateProgress();
    setTyped('');
    reload();
  }, [reload, step, stored.summary, typed]);

  const begin = useCallback(
    (action: ChallengeAction) => {
      switch (action.kind) {
        case 'answer-month':
          router.push('/transactions');
          return;
        case 'record-transfer':
          router.push('/transaction/new');
          return;
        case 'open-goal':
          router.push(`/goal/${action.goalId}`);
          return;
        case 'open-category-month':
          router.push(`/category/${action.month}/${action.categoryId}`);
          return;
        case 'confirm-norm':
          // The question is asked on this screen; there is nowhere else to go.
          return;
      }
    },
    [router],
  );

  if (!detail || !challenge) {
    return (
      <Screen>
        <ScreenHeader title="Виклик" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Цього виклика зараз немає.
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={detail.name} back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText type="overline">Чому</ThemedText>
        <ThemedText>{detail.reason}</ThemedText>
        <ThemedText type="overline">Поступ</ThemedText>
        <ThemedText>{detail.progress}</ThemedText>
        <ThemedText type="overline">Коли завершено</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail.criterion}
        </ThemedText>
      </Card>

      {step ? (
        <Card style={styles.card}>
          <ThemedText type="overline">{step.question}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {step.hint}
          </ThemedText>
          {step.months.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {step.months.map(monthLabel).join(', ')}
            </ThemedText>
          ) : null}
          <Field
            label={`Місячна норма витрат (${step.currency})`}
            value={typed}
            onChangeText={setTyped}
            keyboardType="decimal-pad"
            {...(step.proposal ? { placeholder: step.proposal } : {})}
          />
          <Action title="Підтвердити норму" onPress={confirmNorm} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Action title="Почати" onPress={() => begin(challenge.action)} />
        </Card>
      )}

      <Card style={styles.card}>
        {detail.accepted ? (
          <ThemedText type="small" themeColor="textSecondary">
            Прийнято. Нічого не станеться, якщо він так і залишиться незавершеним.
          </ThemedText>
        ) : (
          <Action variant="secondary" title="Прийняти" onPress={() => decide('accepted')} />
        )}
        <Action
          variant="secondary"
          title="Відхилити"
          onPress={() => decide('dismissed')}
        />
        <Action variant="secondary" title="Повернути" onPress={bringBack} />
        <ThemedText type="small" themeColor="textSecondary">
          Відмова нічого не коштує й ніде не рахується.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.half },
});
