import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { progressScreenData } from '@/hooks/progress-ports';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { achievementDetail } from '@/ui/progress-screen';

import { Spacing } from '@/constants/theme';

/**
 * One досягнення, explained: its exact condition in a sentence the owner can check against their
 * own data, the **свідчення** it froze when it was earned, and — beside it, never in its place —
 * the number recomputed from the транзакції now.
 *
 * The two are shown together on purpose (design D2). «1000 транзакцій» is what was true then; the
 * count beside it is what is stored today, and a drift between them is the honest state of a
 * history the owner has since corrected. Everything the screen says is decided in
 * `src/ui/progress-screen.ts`; this file is the wiring.
 *
 * The key travels through the route encoded — `reserve.norm:100:UAH` carries both a dot and two
 * colons — and is decoded here before anything is looked up.
 */
export default function AchievementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(params.key ?? '');
  const [stored] = useReloadOnFocus(useCallback(() => progressScreenData(), []));

  const detail = useMemo(
    () =>
      achievementDetail({
        key,
        candidates: stored.candidates,
        earned: stored.earned,
        now: new Date(),
      }),
    [key, stored],
  );

  if (!detail) {
    return (
      <Screen>
        <ScreenHeader title="Досягнення" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Цього досягнення тут немає.
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={detail.name}
        {...(detail.when ? { subtitle: detail.when } : {})}
        back={() => router.back()}
      />

      <Card style={styles.card}>
        <ThemedText type="overline">Умова</ThemedText>
        <ThemedText>{detail.condition}</ThemedText>
      </Card>

      {detail.evidence ? (
        <Card style={styles.card}>
          <ThemedText type="overline">Як було тоді</ThemedText>
          <ThemedText>{detail.evidence}</ThemedText>
          {detail.current ? (
            <>
              <ThemedText type="overline">Як є зараз</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {detail.current}
              </ThemedText>
            </>
          ) : null}
        </Card>
      ) : detail.current ? (
        <Card style={styles.card}>
          <ThemedText type="overline">Як є зараз</ThemedText>
          <ThemedText>{detail.current}</ThemedText>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.half },
});
