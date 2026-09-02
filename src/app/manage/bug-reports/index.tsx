import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Action } from '@/components/form';
import { ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { reporting as reportingRepo } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import {
  EMPTY_LIST,
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
  const [rows] = useReloadOnFocus(useCallback(() => listRows(reportingRepo.list()), []));

  return (
    <Screen>
      <ScreenHeader title={LIST_TITLE} back={() => router.back()} />

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
});
