import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, RowAction } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { reporting as reportingRepo } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { bugReportFiles } from '@/platform/bug-report-files-device';
import { confirmScreenshots } from '@/components/bug-report-here';
import { failureAlert } from '@/ui/failure-alert';
import {
  ADD_SCREENSHOT_LABEL,
  addScreenshot,
  COPY_LABEL,
  copyText,
  HAND_OVER_LABEL,
  handOver,
  IDLE,
  REMOVE_LABEL,
  REMOVE_CONFIRMATION,
  removeReport,
  savedReportText,
  savedReportWords,
  type SavedReportState,
} from '@/ui/bug-report-screen';

/**
 * One saved репорт, read whole.
 *
 * **What is on the screen is what would leave.** The text below is `renderReport`'s, the same
 * string «Скопіювати» puts on the clipboard and the same one «Передати» hands over — the file only
 * appends the screenshots' data to it. So the owner's own reading is the last check before
 * anything leaves the phone, and it cannot be checking a summary of something else.
 */
export default function SavedBugReportScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  /** The one refusal this screen can show offers «Повідомити про помилку» like every other. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );
  const [report, reload] = useReloadOnFocus(useCallback(() => reportingRepo.get(id), [id]));
  const [state, setState] = useState<SavedReportState>(IDLE);

  if (!report) {
    return (
      <Screen>
        <ScreenHeader title="Репорт" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Цього репорта вже немає.
        </ThemedText>
      </Screen>
    );
  }

  const words = savedReportWords(state);

  const onHandOver = () => {
    void handOver(
      state,
      {
        report,
        files: bugReportFiles,
        storage: reportingRepo,
        now: () => new Date(),
        // The same dialog the sheet's «Зберегти й передати» shows — one copy, imported, so the two
        // doors cannot drift into warning differently (design D11). A репорт holding no скріншот
        // never reaches it.
        confirmScreenshots,
      },
      setState,
    ).then((next) => {
      setState(next);
      reload();
    });
  };

  const onCopy = () => {
    void Clipboard.setStringAsync(copyText(report)).then(() => setState({ kind: 'copied' }));
  };

  const onAddScreenshot = () => {
    void addScreenshot({
      reportId: report.id,
      files: bugReportFiles,
      storage: reportingRepo,
      now: () => new Date(),
    }).then((outcome) => {
      if (outcome.kind === 'failed') {
        // A refusal inside the репорт section is still a refusal: it goes into the журнал and
        // offers the same way out, which files a *second* репорт about it — the first one is
        // already saved and waiting.
        Alert.alert(
          ...failureAlert({
            title: 'Не додано',
            where: 'bug-report-screenshot',
            error: outcome.message,
            report: reportBug,
          }),
        );
        return;
      }
      reload();
    });
  };

  const onRemove = () => {
    Alert.alert(REMOVE_CONFIRMATION.title, REMOVE_CONFIRMATION.message, [
      { text: REMOVE_CONFIRMATION.cancel, style: 'cancel' },
      {
        text: REMOVE_CONFIRMATION.confirm,
        style: 'destructive',
        onPress: () => {
          void removeReport({
            reportId: report.id,
            files: bugReportFiles,
            storage: reportingRepo,
          }).then(() => router.back());
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader title="Репорт" back={() => router.back()} />

      {words ? (
        <ThemedText type="small" themeColor={state.kind === 'failed' ? 'textDanger' : 'accent'}>
          {words}
        </ThemedText>
      ) : null}

      {/*
        The whole text, wrapped.

        It was inside a horizontal `ScrollView` first, on the theory that a long journal line reads
        better unwrapped. The emulator said otherwise: the `Text` was sized to the card and the
        scroll never engaged, so every entry was cut off mid-word — «екран · /manage/bug‑»,
        «збій · transaction-r» — losing the route and the failure kind, which are the two things
        the reader came for. Wrapping is longer and complete; clipping is shorter and useless, and
        the requirement is that the owner reads the whole of what would leave.
      */}
      <Card>
        <ThemedText type="small" style={styles.text}>
          {savedReportText(report)}
        </ThemedText>
      </Card>

      {report.screenshots.length > 0 ? (
        <View style={styles.shots}>
          {report.screenshots.map((shot) => (
            <View key={shot.name} style={styles.shot}>
              <Image
                source={{ uri: bugReportFiles.uriOf(report.id, shot.name) }}
                style={styles.thumbnail}
                contentFit="contain"
              />
              <ThemedText type="small" themeColor="textSecondary">
                {shot.name}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <RowAction title={ADD_SCREENSHOT_LABEL} onPress={onAddScreenshot} />
        <RowAction title={COPY_LABEL} onPress={onCopy} />
        <RowAction title={REMOVE_LABEL} tone="danger" onPress={onRemove} />
      </View>

      <Action
        title={HAND_OVER_LABEL}
        onPress={onHandOver}
        disabled={state.kind === 'handing-over'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: 'monospace' },
  shots: { gap: Spacing.two },
  shot: { gap: Spacing.half },
  thumbnail: { width: '100%', height: 220 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
