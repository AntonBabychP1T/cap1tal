import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { progress as progressRepo } from '@/db/repos';
import { progressScreenData } from '@/hooks/progress-ports';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { progressViewModel } from '@/ui/progress-screen';

import { Spacing } from '@/constants/theme';

/**
 * «Прогрес» — what the owner has already reached, what is on the way, and the few things worth
 * doing now.
 *
 * Pushed over the tabs from Головний and from «Звіти», like «Транзакції»: прогрес is somewhere you
 * go, not a sixth tab. The five tabs are unchanged.
 *
 * Everything this screen decides is decided in `src/ui/progress-screen.ts` under `verify` — the
 * three sections, their order, their empty sentences, the plurals, and the rule that a досягнення
 * with no measurable progress is not listed «У процесі». This file is the wiring.
 *
 * It **earns nothing**. `progressScreenData` reads and does not evaluate, and the one write this
 * screen makes is marking the unseen досягнення seen — which is what opening «Прогрес» means, and
 * is the whole of design D11's quiet celebration.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(useCallback(() => progressScreenData(), []));

  /**
   * Opening «Прогрес» is being shown them. One write for all of them, so twelve retroactive
   * досягнення are one announcement rather than twelve — and Головний stops announcing them.
   */
  useEffect(() => {
    if (progressRepo.markAllSeen(new Date()) > 0) {
      reload();
    }
  }, [reload]);

  const model = useMemo(
    () => progressViewModel({ ...stored, now: new Date() }),
    [stored],
  );

  if (model.nothingYet) {
    return (
      <Screen>
        <ScreenHeader title="Прогрес" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          {model.nothingYet}
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Прогрес"
        subtitle="Що вже вийшло і що варто зробити далі"
        back={() => router.back()}
      />

      <SectionLabel>{model.challengesTitle}</SectionLabel>
      {model.challengesEmpty ? (
        <ThemedText type="small" themeColor="textSecondary">
          {model.challengesEmpty}
        </ThemedText>
      ) : (
        model.challenges.map((row) => (
          <Pressable key={row.key} onPress={() => router.push(row.route)}>
            <Card style={styles.row}>
              <ThemedText type="subtitle">{row.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.reason}
              </ThemedText>
              <View style={styles.line}>
                <ThemedText type="small">{row.progress}</ThemedText>
                {row.accepted ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    прийнято
                  </ThemedText>
                ) : null}
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <SectionLabel>{model.inProgressTitle}</SectionLabel>
      {model.inProgressEmpty ? (
        <ThemedText type="small" themeColor="textSecondary">
          {model.inProgressEmpty}
        </ThemedText>
      ) : (
        model.inProgress.map((row) => (
          <Pressable key={row.key} onPress={() => router.push(row.route)}>
            <Card style={styles.row}>
              <ThemedText>{row.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.progress}
              </ThemedText>
            </Card>
          </Pressable>
        ))
      )}

      <SectionLabel>{model.earnedTitle}</SectionLabel>
      {model.earnedEmpty ? (
        <ThemedText type="small" themeColor="textSecondary">
          {model.earnedEmpty}
        </ThemedText>
      ) : (
        model.earned.map((row) => (
          <Pressable key={row.key} onPress={() => router.push(row.route)}>
            <Card style={styles.row}>
              <ThemedText>{row.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.when}
              </ThemedText>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.half },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.one },
});
