import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Action } from '@/components/form';
import { Banner, Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { backup as backupRepo } from '@/db/repos';
import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';
import { journal } from '@/ui/journal';
import { backupFiles } from '@/platform/backup-file-device';
import {
  backOut,
  BACKUP_EXPLANATION,
  confirmRestore,
  pickForRestore,
  RESTORE_WARNING,
  saveToFile,
  type BackupScreenState,
} from '@/ui/backup-screen';

import { Spacing } from '@/constants/theme';

/**
 * «Бекап» — where the owner saves their whole state to one file and brings it back from one.
 *
 * Every decision belongs to `src/ui/backup-screen.ts`, where `verify` can reach it: what the file
 * is called, what a saved бекап is reported as, why a picked file is refused, and what the preview
 * puts beside what. This file is the wiring, plus the one thing that cannot be tested off a device
 * — handing the file to Android and taking one back.
 *
 * Nothing is replaced without passing the preview, and the preview holds the бекап it described,
 * so «Відновити» can only ever restore the file whose numbers the owner just read.
 */

/** The two singletons this section works over: the device's storage, and the device's files. */
const PORTS = { store: backupRepo, files: backupFiles };

export default function BackupScreen() {
  const router = useRouter();
  const [state, setState] = useState<BackupScreenState>({ kind: 'idle' });

  /** The phone's own «назад» closes an open preview first, and only then leaves the section. */
  const closePreview = useCallback(() => setState(backOut()), []);
  useCloseOnBack(state.kind === 'previewing', closePreview);

  const busy = state.kind === 'saving' || state.kind === 'picking' || state.kind === 'restoring';

  /**
   * What saving or restoring came to, announced. The бекап the owner asked for is the one work in
   * this app they are most likely to start and then leave — Android's own folder chooser takes
   * them out of the app to begin with — so the failure that matters is the one they never see.
   */
  const settle = useCallback((next: BackupScreenState) => {
    setState(next);
    if (next.kind === 'failed') {
      // Shown on the screen rather than in a dialog, so there is no button to hang «Повідомити
      // про помилку» on — the журнал still gets it, and the owner reports it from the section.
      journal.failure('backup', next.message);
      void raiseAlert('backup', { attended: attended() }, ALERT_PORTS);
      return;
    }
    if (next.kind === 'saved' || next.kind === 'restored') {
      void clearAlert('backup', ALERT_PORTS);
    }
    // A cancelled chooser and a refused file are neither: nothing was attempted, and the owner is
    // holding the file they picked — the screen's own words are the whole answer.
  }, []);

  /** Opening «Бекап» is the owner looking at the failure this section explains (design D6). */
  useClearAlertOnOpen('backup');

  const save = useCallback(() => {
    setState({ kind: 'saving' });
    void saveToFile(PORTS, new Date()).then(settle);
  }, [settle]);

  const pick = useCallback(() => {
    setState({ kind: 'picking' });
    void pickForRestore(PORTS).then(settle);
  }, [settle]);

  const restore = useCallback(() => {
    // The бекап the owner was just shown, and no other: nothing here re-reads the file.
    if (state.kind !== 'previewing') return;
    const preview = state.preview;
    setState({ kind: 'restoring' });
    void confirmRestore(PORTS, preview).then(settle);
  }, [settle, state]);

  const message =
    state.kind === 'saved' || state.kind === 'restored' || state.kind === 'failed' || state.kind === 'refused'
      ? state.message
      : undefined;

  return (
    <Screen>
      <ScreenHeader title="Бекап" back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {BACKUP_EXPLANATION}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {RESTORE_WARNING}
        </ThemedText>
      </Card>

      {message ? <Banner>{message}</Banner> : null}

      {state.kind === 'previewing' ? (
        <>
          <SectionLabel note={`Бекап від ${state.preview.made}`}>Що буде замінено</SectionLabel>
          <ListCard>
            {state.preview.rows.map((row, index) => (
              <ListRow key={row.label} last={index === state.preview.rows.length - 1} style={styles.row}>
                <ThemedText type="smallBold">{row.label}</ThemedText>
                <View style={styles.columns}>
                  <View style={styles.column}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Бекап
                    </ThemedText>
                    <ThemedText>{row.backup}</ThemedText>
                  </View>
                  <View style={styles.column}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Телефон
                    </ThemedText>
                    <ThemedText>{row.phone}</ThemedText>
                  </View>
                </View>
              </ListRow>
            ))}
          </ListCard>
          <ThemedText type="small" themeColor="textSecondary">
            {state.preview.warning}
          </ThemedText>
          <Action title="Відновити" variant="destructive" onPress={restore} />
          <Action title="Скасувати" variant="secondary" onPress={closePreview} />
        </>
      ) : (
        <>
          <Action title="Зберегти у файл" onPress={save} disabled={busy} />
          <Action title="Відновити з файлу" variant="secondary" onPress={pick} disabled={busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.two },
  columns: { flexDirection: 'row', gap: Spacing.four },
  // The two halves share the row evenly, so a long value wraps inside its own column instead of
  // pushing the other past the card. «Місяці» is the row that proves it: the бекап's
  // «Червень 2026 — Вересень 2026» used to take the width it wanted and clip the phone's span to
  // «Червень 2026 — В», which is the half of the comparison the preview exists for.
  column: { flex: 1, gap: Spacing.half },
});
