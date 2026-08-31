import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Action } from '@/components/form';
import { Card, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { accounts as accountsRepo, imports as importsRepo } from '@/db/repos';
import { notificationAccess } from '@/platform/notification-access-device';
import type { NotificationAccess } from '@/platform/notification-access';
import { tokenKept } from '@/platform/monobank-token';
import { monobankTokenStore } from '@/platform/monobank-token-store';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { onboardingSteps, onboardingSummary, type OnboardingStep } from '@/ui/onboarding';

import { Spacing } from '@/constants/theme';

/**
 * «Перші кроки» — what the app needs before it can answer «куди пішли гроші» and «скільки
 * лишилося», in one list, each with the one screen that settles it.
 *
 * The screen reads and links. It creates nothing, changes nothing and asks the system for no
 * permission by itself: every step's state comes from what the device already holds, and every
 * action opens a screen that was already there. What each step says is `src/ui/onboarding.ts`'s,
 * where `verify` can reach it.
 */

export default function OnboardingScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list().length,
        saldoImported: importsRepo.committedAt() !== undefined,
      }),
      [],
    ),
  );
  const [connected, setConnected] = useState(false);
  const [access, setAccess] = useState<NotificationAccess>('unsupported');

  // The two answers that are not a database read. Both are asked once per opening, and neither
  // can change anything: the token is read straight from secure storage — no network port and no
  // account-cache port is wired here at all — and the permission is a platform question.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [token, permission] = await Promise.all([
        monobankTokenStore.read(),
        notificationAccess.state(),
      ]);
      if (!alive) {
        return;
      }
      setConnected(tokenKept(token));
      setAccess(permission);
    })();
    return () => {
      alive = false;
    };
  }, [stored]);

  const steps = useMemo(
    () =>
      onboardingSteps({
        accounts: stored.accounts,
        monobankConfigured: connected,
        saldoImported: stored.saldoImported,
        notificationAccess: access,
      }),
    [access, connected, stored.accounts, stored.saldoImported],
  );

  const act = useCallback(
    (step: OnboardingStep) => {
      if (!step.action) {
        return;
      }
      if (step.action.kind === 'notification-settings') {
        void notificationAccess.openSettings();
        return;
      }
      router.push(step.action.href);
    },
    [router],
  );

  return (
    <Screen>
      <ScreenHeader title="Перші кроки" back={() => router.back()} />

      <ThemedText type="small" themeColor="textSecondary">
        Усе, що потрібно застосунку, щоб бути корисним. Порядок довільний, пропустити можна будь-що
        — список завжди тут, у Налаштуваннях.
      </ThemedText>
      <SectionLabel note={onboardingSummary(steps)}>Налаштування застосунку</SectionLabel>

      {steps.map((step) => (
        <Card key={step.id} style={styles.step}>
          <ThemedText type="smallBold">{step.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {step.hint}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            {STATE_LABELS[step.state]}
          </ThemedText>
          {step.action ? (
            <Action
              variant={step.state === 'done' ? 'secondary' : 'primary'}
              title={step.action.title}
              onPress={() => act(step)}
            />
          ) : null}
        </Card>
      ))}

      <Action variant="secondary" title="До застосунку" onPress={() => router.replace('/')} />
      {/* Coming back from a system screen or a management screen re-reads everything. */}
      <Action variant="secondary" title="Оновити стан" onPress={reload} />
    </Screen>
  );
}

const STATE_LABELS: Readonly<Record<OnboardingStep['state'], string>> = {
  done: 'готово',
  todo: 'ще не зроблено',
  unavailable: 'поки недоступно',
};

const styles = StyleSheet.create({
  step: { gap: Spacing.two },
});
