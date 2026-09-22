import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Action } from '@/components/form';
import { Banner, ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { dashboardLayout as dashboardLayoutRepo } from '@/db/repos';
import { useTheme } from '@/hooks/use-theme';
import {
  defaultDashboardLayout,
  moveWidget,
  setWidgetVisibility,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from '@/dashboard/layout';
import { dashboardLayoutEditorRows } from '@/ui/dashboard-layout-editor';
import { failureAlert } from '@/ui/failure-alert';
import { reportFailure } from '@/ui/journal';

import { Spacing, TouchTarget } from '@/constants/theme';

/**
 * «Налаштувати Головний» — visible/hidden and order for the closed registry of known widgets,
 * reached from Головний's own header action. Every toggle and move persists at once: there is no
 * draft state to save or discard, only the one stored preference this screen and Головний both
 * read (design D4).
 *
 * What the rows show and which move action each offers is decided in
 * `src/ui/dashboard-layout-editor.ts`, under `verify`. This file is the wiring, plus the confirm
 * dialog a reset needs before anything is deleted.
 */
export default function HomeDashboardScreen() {
  const router = useRouter();
  const theme = useTheme();

  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [items, setItems] = useState<readonly DashboardLayoutItem[]>(defaultDashboardLayout());

  const read = useCallback(() => {
    const result = dashboardLayoutRepo.read();
    setItems(result.items);
    if (result.diagnostic) {
      // Recoverable: the owner already sees the current default, exactly as Головний does. The
      // journal is where this is noted, not a dialog about a preference nobody broke on purpose.
      reportFailure(
        'dashboard-layout-read',
        new Error(`dashboard layout preference was ${result.diagnostic}`),
      );
    }
  }, []);
  useFocusEffect(read);

  const persist = useCallback(
    (next: readonly DashboardLayoutItem[]) => {
      try {
        dashboardLayoutRepo.save(next);
        setItems(next);
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'dashboard-layout-save', error, report: reportBug }),
        );
      }
    },
    [reportBug],
  );

  const toggle = useCallback(
    (id: DashboardWidgetId, visible: boolean) => persist(setWidgetVisibility(items, id, visible)),
    [items, persist],
  );
  const move = useCallback(
    (id: DashboardWidgetId, direction: 'up' | 'down') => persist(moveWidget(items, id, direction)),
    [items, persist],
  );

  const confirmReset = useCallback(() => {
    Alert.alert(
      'Скинути до стандартного вигляду',
      'Порядок і видимість віджетів повернуться до типових.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Скинути',
          style: 'destructive',
          onPress: () => {
            try {
              dashboardLayoutRepo.reset();
              setItems(defaultDashboardLayout());
            } catch (error) {
              Alert.alert(
                ...failureAlert({
                  title: 'Не скинуто',
                  where: 'dashboard-layout-reset',
                  error,
                  report: reportBug,
                }),
              );
            }
          },
        },
      ],
    );
  }, [reportBug]);

  const rows = dashboardLayoutEditorRows(items);

  return (
    <Screen>
      <ScreenHeader title="Налаштувати Головний" back={() => router.back()} />

      <Banner>
        Приберіть зайве й підніміть важливе. Кожна зміна зберігається одразу.
      </Banner>

      <ListCard>
        {rows.map((row, index) => (
          <ListRow key={row.id} last={index === rows.length - 1} style={styles.row}>
            <View style={styles.rowTop}>
              <View style={styles.label}>
                <ThemedText numberOfLines={1}>{row.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.ordinal}
                </ThemedText>
              </View>
              <Switch
                value={row.visible}
                onValueChange={(visible) => toggle(row.id, visible)}
                trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
              />
            </View>
            <View style={styles.moves}>
              {row.canMoveUp ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={row.moveUpLabel}
                  onPress={() => move(row.id, 'up')}
                  style={styles.moveButton}>
                  <ThemedText type="link" themeColor="accent">
                    Вище
                  </ThemedText>
                </Pressable>
              ) : null}
              {row.canMoveDown ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={row.moveDownLabel}
                  onPress={() => move(row.id, 'down')}
                  style={styles.moveButton}>
                  <ThemedText type="link" themeColor="accent">
                    Нижче
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </ListRow>
        ))}
      </ListCard>

      <Action variant="secondary" title="Скинути до стандартного вигляду" onPress={confirmReset} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  label: { flex: 1, gap: Spacing.half },
  moves: { flexDirection: 'row', gap: Spacing.three },
  moveButton: { minHeight: TouchTarget, minWidth: TouchTarget, alignItems: 'center', justifyContent: 'center' },
});
