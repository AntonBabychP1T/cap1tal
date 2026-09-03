import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Action } from '@/components/form';
import { Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { reporting as reportingRepo } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useTheme } from '@/hooks/use-theme';
import {
  CAPTURE_SECTION_LABEL,
  CAPTURE_SECTION_WARNING,
  EMPTY_LIST,
  GESTURE_SWITCH_HINT,
  GESTURE_SWITCH_LABEL,
  HANDLE_SWITCH_HINT,
  HANDLE_SWITCH_LABEL,
  LIST_TITLE,
  listRows,
  NEW_REPORT_LABEL,
} from '@/ui/bug-report-screen';

/**
 * «Репорти про помилки» — every репорт the owner has filed, newest first, and the way to file one
 * with nothing prompting it.
 *
 * Every word and every ordering is `src/ui/bug-report-screen.ts`'s. This is the wiring.
 */
export default function BugReportsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [rows] = useReloadOnFocus(useCallback(() => listRows(reportingRepo.list()), []));
  // The row is written here and read by the shell when the owner navigates away, so a switch lands
  // without a restart (design D10).
  const [capture, setCapture] = useState(() => reportingRepo.captureSettings());
  const set = (next: typeof capture) => {
    reportingRepo.setCaptureSettings(next);
    setCapture(next);
  };

  return (
    <Screen>
      <ScreenHeader title={LIST_TITLE} back={() => router.back()} />

      <SectionLabel>{CAPTURE_SECTION_LABEL}</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <ThemedText type="small">{GESTURE_SWITCH_LABEL}</ThemedText>
          <Switch
            value={capture.gestureEnabled}
            onValueChange={(gestureEnabled) => set({ ...capture, gestureEnabled })}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {GESTURE_SWITCH_HINT}
        </ThemedText>

        <View style={styles.switchRow}>
          <ThemedText type="small">{HANDLE_SWITCH_LABEL}</ThemedText>
          <Switch
            value={capture.handleEnabled}
            onValueChange={(handleEnabled) => set({ ...capture, handleEnabled })}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {HANDLE_SWITCH_HINT}
        </ThemedText>

        {/* Said where the owner decides, not only where they hand a file over. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.warning}>
          {CAPTURE_SECTION_WARNING}
        </ThemedText>
      </Card>

      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {EMPTY_LIST}
        </ThemedText>
      ) : (
        <ListCard>
          {rows.map((row, index) => (
            <ListRow key={row.id} last={index === rows.length - 1}>
              <View style={styles.row}>
                <ThemedText numberOfLines={1}>{row.summary}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.moment} · {row.route} · {row.handedOverLabel}
                </ThemedText>
              </View>
              <ThemedText
                accessibilityRole="button"
                themeColor="accent"
                onPress={() => router.push(`/manage/bug-reports/${row.id}`)}>
                Відкрити
              </ThemedText>
            </ListRow>
          ))}
        </ListCard>
      )}

      <Action
        title={NEW_REPORT_LABEL}
        onPress={() => router.push('/manage/bug-reports/new')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, gap: Spacing.half },
  card: { gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  warning: { marginTop: Spacing.two },
});
