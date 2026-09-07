import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Field } from '@/components/form';
import {
  Banner,
  Card,
  ListCard,
  ListRow,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  acknowledgeCode,
  adoptRecoveryCode,
  connect,
  disconnect,
  showRecoveryCode,
  startFreshLine,
} from '@/backup/drive/connection';
import { runBackup } from '@/backup/drive/run-backup';
import { checksumOf } from '@/backup/backup';
import { shouldUpload } from '@/backup/drive/schedule';
import {
  adoptKeyFrom,
  confirmRestore,
  listVersions,
  openVersion,
  type RestorePreview,
} from '@/backup/drive/run-restore';
import { backup as backupRepo, driveBackupState } from '@/db/repos';
import { driveBackupPorts } from '@/hooks/drive-backup-ports';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { evaluateProgress } from '@/hooks/progress-ports';
import { syncDriveBackupTask } from '@/platform/drive-backup-task';
import {
  ANOTHER_LINE_MESSAGE,
  DISCONNECT_WARNING,
  DRIVE_EXPLANATION,
  DRIVE_SCOPE_PROMISE,
  FRESH_LINE_WARNING,
  MISTYPED_CODE_MESSAGE,
  RECOVERY_CODE_EXPLANATION,
  RESTORE_WARNING,
  busyMessage,
  backupFailureMessage,
  connectFailureMessage,
  existingVersionsExplanation,
  restoreOutcomeMessage,
  restoreConfirmation,
  restoreFailureMessage,
  restoreRefusalMessage,
  sectionState,
  versionRows,
  type DriveSectionState,
  type VersionRow,
} from '@/ui/drive-backup';
import { journal } from '@/ui/journal';

import { Spacing } from '@/constants/theme';

/**
 * «Google Drive» — where the owner connects their account, reads whether their history is safe,
 * keeps the код відновлення, saves or restores a версія бекапу by hand, and disconnects.
 *
 * Every decision and every sentence belongs somewhere `verify` can reach it: the runs in
 * `src/backup/drive/`, the words in `src/ui/drive-backup.ts`. This file is the wiring and the
 * flow's own state — which step the owner is on — and nothing else. A test reads it by path to
 * assert no Ukrainian sentence is built here instead of imported.
 *
 * Two rules the flow keeps that the ports cannot:
 * - the код відновлення is shown only from a step a deliberate action produced, never as part of
 *   the section's ordinary body;
 * - «Відновити» passes through the named confirmation, and confirming applies the версія whose
 *   date and figures the owner has just read — never one fetched again afterwards.
 */

const PORTS = driveBackupPorts();

/** Where the flow is, over and above what the section itself says. */
type Step =
  | { kind: 'section' }
  /** An act is in flight, and which one — so the screen says what is happening rather than blanking. */
  | { kind: 'busy'; doing: 'saving' | 'restoring' | 'connecting' }
  /** The код відновлення, from connecting or from «Показати код відновлення». */
  | { kind: 'code'; code: string; acknowledge: boolean }
  /** The folder already holds версії: ask for a код відновлення, or offer starting afresh. */
  | { kind: 'ask-code'; versions: number }
  | { kind: 'versions'; rows: readonly VersionRow[]; needsCode: boolean }
  /**
   * A версія opened and awaiting the owner's word. `openedWith` is the код відновлення this
   * particular версія was actually opened with, carried here rather than read from the field —
   * a stale value left in the field belongs to a different attempt, and adopting a key from it
   * would silently move this phone onto another line.
   */
  | {
      kind: 'preview';
      preview: RestorePreview;
      confirmation: string;
      openedWith?: string;
    };

export default function DriveBackupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'section' });
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [typed, setTyped] = useState('');

  /**
   * What the phone remembers — re-read when the section comes back into focus, and on demand after
   * every act that could have changed it. No cache: synchronous SQLite makes re-querying the
   * simplest correct thing, and a stale «останній бекап» is the one thing this screen may not show.
   */
  const [section, refresh] = useReloadOnFocus<DriveSectionState>(
    useCallback(() => {
      const state = driveBackupState.read();
      // Whether the бекап on the phone now differs from the one last uploaded. Without it the
      // section shows an ageing date with nothing beside it, which by day three reads like a
      // silent failure — and the phone is the only place that can answer the question, because the
      // whole point is that the copy in Drive was not re-uploaded.
      const changed = state.lastUploadedChecksum
        ? shouldUpload({
            // The бекап's own integrity value, by the one rule that defines it — the same call
            // `makeBackup` makes, so this screen's «копія актуальна» and the run's «unchanged»
            // cannot ever disagree about what sameness is. It is the heaviest work here, which is
            // why it is asked only when there is a last upload to compare against.
            checksum: checksumOf(backupRepo.snapshot()),
            lastUploadedChecksum: state.lastUploadedChecksum,
          })
        : undefined;
      return sectionState({ state, now: new Date(), ...(changed === undefined ? {} : { changed }) });
    }, []),
  );

  /** The phone's own «назад» closes whichever step is open before it leaves the section. */
  const back = useCallback(() => {
    setStep({ kind: 'section' });
    setTyped('');
    refresh();
  }, [refresh]);
  useCloseOnBack(step.kind !== 'section' && step.kind !== 'busy', back);

  const say = useCallback((text?: string) => setMessage(text), []);

  const doConnect = useCallback(() => {
    setStep({ kind: 'busy', doing: 'connecting' });
    say(undefined);
    void connect(PORTS, new Date()).then((outcome) => {
      switch (outcome.kind) {
        case 'show-code':
          setStep({ kind: 'code', code: outcome.recoveryCode, acknowledge: true });
          break;
        case 'ask-code':
          setStep({ kind: 'ask-code', versions: outcome.versions });
          break;
        case 'connected':
          void syncDriveBackupTask();
          setStep({ kind: 'section' });
          break;
        case 'cancelled':
          // Nothing happened, so nothing is said — the same rule «Бекап» keeps for its chooser.
          setStep({ kind: 'section' });
          break;
        case 'failed':
          journal.failure('backup', outcome.why);
          say(connectFailureMessage(outcome.why));
          setStep({ kind: 'section' });
          break;
      }
      refresh();
    });
  }, [refresh, say]);

  /** The acknowledgement that completes a connection made with a freshly minted key. */
  const doAcknowledge = useCallback(() => {
    setTyped('');
    acknowledgeCode(PORTS, new Date());
    void syncDriveBackupTask();
    setStep({ kind: 'section' });
    refresh();
  }, [refresh]);

  /** A код відновлення typed on a phone joining a line that already exists. */
  const doAdopt = useCallback(() => {
    // The door as it stands, so a failed attempt returns to the same door rather than a blank one.
    const door: Step = step.kind === 'ask-code' ? step : { kind: 'ask-code', versions: 0 };
    setStep({ kind: 'busy', doing: 'connecting' });
    void adoptRecoveryCode(PORTS, typed, new Date()).then((outcome) => {
      switch (outcome.kind) {
        case 'ok':
          // Typing the code was the acknowledgement (design D14): connected from here.
          void syncDriveBackupTask();
          setTyped('');
          say(undefined);
          setStep({ kind: 'section' });
          break;
        // Every retry keeps the count the door was opened with. Rebuilding it as zero made the
        // section say «У цій теці вже є 0 версій бекапу» after a single mistyped character — the
        // opposite of what the door exists to say, on the retry path of the new-phone flow.
        case 'mistyped':
          say(MISTYPED_CODE_MESSAGE);
          setStep(door);
          break;
        case 'another-line':
          say(ANOTHER_LINE_MESSAGE);
          setStep(door);
          break;
        case 'failed':
          say(connectFailureMessage(outcome.why));
          setStep(door);
          break;
      }
      refresh();
    });
  }, [refresh, say, step, typed]);

  /**
   * The код відновлення again, on the owner's deliberate request — the spec's "retrievable later
   * while connected". It comes from the keystore through `showRecoveryCode` and is held only in
   * this step, which leaving discards.
   */
  const doShowCode = useCallback(() => {
    setStep({ kind: 'busy', doing: 'connecting' });
    say(undefined);
    void showRecoveryCode(PORTS).then((outcome) => {
      if (outcome.kind === 'ok') {
        // `acknowledge: false` — the connection is already complete; this is only a reading.
        setStep({ kind: 'code', code: outcome.recoveryCode, acknowledge: false });
        return;
      }
      say(connectFailureMessage('no-key'));
      setStep({ kind: 'section' });
    });
  }, [say]);

  const startFreshConfirmed = useCallback(() => {
    // The line the typed code belonged to is being abandoned; leaving it in the field would let a
    // later restore adopt it.
    setTyped('');
    setStep({ kind: 'busy', doing: 'connecting' });
    void startFreshLine(PORTS).then((outcome) => {
      if (outcome.kind === 'ok') {
        setStep({ kind: 'code', code: outcome.recoveryCode, acknowledge: true });
        return;
      }
      say(connectFailureMessage(outcome.why));
      setStep({ kind: 'section' });
    });
  }, [say]);

  /**
   * Starting a fresh line, behind the app's own confirmation gesture — and it needs one more than
   * anything else on this screen.
   *
   * A new key is irreversible **from inside the app**: once one is held, `connect` no longer offers
   * the code field, `startFreshLine` refuses, «Відновити» asks for a код відновлення only on a
   * phone that holds none, and nothing calls `backupKeyStore.remove`. So an owner who mistaps here
   * while holding a perfectly good old код відновлення could never type it again on this device,
   * and every версія it opens would become unreachable — the exact loss D14 exists to prevent. The
   * button sits between «Продовжити» and «Скасувати», which is where a mistap happens.
   */
  const doStartFresh = useCallback(() => {
    Alert.alert('Google Drive', FRESH_LINE_WARNING, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Почати заново', style: 'destructive', onPress: startFreshConfirmed },
    ]);
  }, [startFreshConfirmed]);

  const doSaveNow = useCallback(() => {
    setStep({ kind: 'busy', doing: 'saving' });
    say(undefined);
    void runBackup(PORTS, new Date(), { force: true }).then((outcome) => {
      if (outcome.kind === 'failed') {
        journal.failure('backup', outcome.why);
        say(backupFailureMessage(outcome.why));
      }
      setStep({ kind: 'section' });
      refresh();
    });
  }, [refresh, say]);

  const doListVersions = useCallback(() => {
    setStep({ kind: 'busy', doing: 'connecting' });
    say(undefined);
    void listVersions(PORTS).then((listed) => {
      if (listed.kind === 'failed') {
        say(restoreFailureMessage(listed.why));
        setStep({ kind: 'section' });
        return;
      }
      setStep({
        kind: 'versions',
        rows: versionRows(listed.versions, new Date()),
        needsCode: listed.needsCode,
      });
    });
  }, [say]);

  /** A chosen версія, opened and previewed. Nothing local is touched by any of this. */
  const doOpen = useCallback(
    (id: string, needsCode: boolean) => {
      setStep({ kind: 'busy', doing: 'restoring' });
      void openVersion(PORTS, id, needsCode ? { recoveryCode: typed } : {}).then((opened) => {
        switch (opened.kind) {
          case 'ok':
            setStep({
              kind: 'preview',
              preview: opened.preview,
              // Only when this версія was actually opened with a typed code. A phone that opened it
              // with its own key adopts nothing: it is already on that line.
              ...(needsCode ? { openedWith: typed } : {}),
              confirmation: restoreConfirmation({
                made: opened.preview.createdAt,
                backupTransactions: opened.preview.backupFigures.transactions,
                phoneTransactions: opened.preview.phoneFigures.transactions,
                now: new Date(),
              }),
            });
            break;
          case 'mistyped':
            say(MISTYPED_CODE_MESSAGE);
            setStep({ kind: 'section' });
            break;
          case 'refused':
            say(restoreRefusalMessage(opened.why));
            setStep({ kind: 'section' });
            break;
          case 'failed':
            say(restoreFailureMessage(opened.why));
            setStep({ kind: 'section' });
            break;
        }
      });
    },
    [say, typed],
  );

  /** The owner's word. The версія applied is the one whose figures they have just read. */
  const doRestore = useCallback(() => {
    if (step.kind !== 'preview') return;
    const preview = step.preview;
    // The code *this версія* was opened with, and not whatever is left in the field.
    const code = step.openedWith;
    setStep({ kind: 'busy', doing: 'restoring' });
    void confirmRestore(PORTS, preview).then(async (outcome) => {
      if (outcome.kind === 'restored') {
        // A phone that opened this версія with a typed code joins that line rather than starting a
        // second one (design D14) — and only now, after the restore actually landed.
        if (code) {
          await adoptKeyFrom(PORTS, code, new Date());
          void syncDriveBackupTask();
        }
        // The restored history brought its own earned set; the evaluation earns what it still proves.
        evaluateProgress();
        setTyped('');
        say(undefined);
      } else {
        // Its own words: at the most dangerous moment in the app the owner must read about the
        // відновлення they just confirmed, not about a бекап — and the журнал gets the sentence
        // rather than the bare outcome name, as «Бекап» already does.
        const said = restoreOutcomeMessage(outcome.why);
        journal.failure('backup', said);
        say(said);
      }
      setStep({ kind: 'section' });
      refresh();
    });
  }, [refresh, say, step]);

  const disconnectConfirmed = useCallback(() => {
    setStep({ kind: 'busy', doing: 'connecting' });
    void disconnect(PORTS).then(() => {
      void syncDriveBackupTask();
      say(undefined);
      setStep({ kind: 'section' });
      refresh();
    });
  }, [refresh, say]);

  /** «Відʼєднати Google Drive» — confirmed, with what stays said in the dialog itself. */
  const doDisconnect = useCallback(() => {
    Alert.alert('Google Drive', DISCONNECT_WARNING, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Відʼєднати', style: 'destructive', onPress: disconnectConfirmed },
    ]);
  }, [disconnectConfirmed]);

  const connected = section.kind === 'connected';
  // Google took the app's access away. Not connected — the spec forbids the app saying otherwise —
  // but not a blank offer either: the owner needs to know why the section changed under them.
  const withdrawn = section.kind === 'withdrawn' ? section : undefined;

  return (
    <Screen>
      <ScreenHeader title="Google Drive" back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {DRIVE_EXPLANATION}
        </ThemedText>
        {!connected && !withdrawn ? (
          <ThemedText type="small" themeColor="textSecondary">
            {DRIVE_SCOPE_PROMISE}
          </ThemedText>
        ) : null}
      </Card>

      {message ? <Banner>{message}</Banner> : null}

      {step.kind === 'busy' ? (
        <Card style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {busyMessage(step.doing)}
          </ThemedText>
        </Card>
      ) : null}

      {withdrawn && step.kind === 'section' ? (
        <Card style={styles.card}>
          <ThemedText type="smallBold">{withdrawn.account}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {withdrawn.explanation}
          </ThemedText>
        </Card>
      ) : null}

      {connected && step.kind === 'section' ? (
        <Card style={styles.card}>
          <ThemedText type="smallBold">{section.account}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {section.lastBackup}
          </ThemedText>
          {section.stillCurrent ? (
            <ThemedText type="small" themeColor="textSecondary">
              {section.stillCurrent}
            </ThemedText>
          ) : null}
          {section.failure ? (
            <ThemedText type="small" themeColor="textSecondary">
              {section.failure}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {step.kind === 'code' ? (
        <>
          <SectionLabel>Код відновлення</SectionLabel>
          <Card style={styles.card}>
            <ThemedText type="smallBold" style={styles.code}>
              {step.code}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {RECOVERY_CODE_EXPLANATION}
            </ThemedText>
          </Card>
          <Action
            title="Скопіювати"
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(step.code);
            }}
          />
          {step.acknowledge ? (
            <Action title="Я записав код" onPress={doAcknowledge} />
          ) : (
            <Action title="Скасувати" variant="secondary" onPress={back} />
          )}
        </>
      ) : null}

      {step.kind === 'ask-code' ? (
        <>
          <Card style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              {existingVersionsExplanation(step.versions)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {FRESH_LINE_WARNING}
            </ThemedText>
          </Card>
          <Field
            label="Код відновлення"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            multiline
          />
          <Action title="Продовжити" onPress={doAdopt} disabled={typed.length === 0} />
          <Action title="Почати заново" variant="destructive" onPress={doStartFresh} />
          <Action title="Скасувати" variant="secondary" onPress={back} />
        </>
      ) : null}

      {step.kind === 'versions' ? (
        <>
          <SectionLabel>Версії бекапу</SectionLabel>
          {step.needsCode ? (
            <Field
              label="Код відновлення"
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              multiline
            />
          ) : null}
          <ListCard>
            {step.rows.map((row, index) => (
              <ListRow key={row.id} last={index === step.rows.length - 1} style={styles.row}>
                <ThemedText type="smallBold">{row.made}</ThemedText>
                {row.refusal ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.refusal}
                  </ThemedText>
                ) : (
                  <Action
                    title="Відновити"
                    variant="secondary"
                    onPress={() => doOpen(row.id, step.needsCode)}
                    disabled={step.needsCode && typed.length === 0}
                  />
                )}
              </ListRow>
            ))}
          </ListCard>
          <Action title="Скасувати" variant="secondary" onPress={back} />
        </>
      ) : null}

      {step.kind === 'preview' ? (
        <>
          <Card style={styles.card}>
            <ThemedText type="small">{step.confirmation}</ThemedText>
          </Card>
          <Action title="Замінити все" variant="destructive" onPress={doRestore} />
          <Action title="Скасувати" variant="secondary" onPress={back} />
        </>
      ) : null}

      {step.kind === 'section' ? (
        connected ? (
          <>
            <Action title="Зберегти зараз" onPress={doSaveNow} />
            <Action title="Відновити" variant="secondary" onPress={doListVersions} />
            <Action title="Показати код відновлення" variant="secondary" onPress={doShowCode} />
            <View style={styles.spacer} />
            <Card style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                {DISCONNECT_WARNING}
              </ThemedText>
            </Card>
            <Action title="Відʼєднати Google Drive" variant="destructive" onPress={doDisconnect} />
          </>
        ) : (
          // The way out of both states: a phone that never connected, and one whose access Google
          // withdrew — for the second, connecting again continues the very same line, because the
          // sealing key was deliberately kept.
          <Action title="Підключити Google Drive" onPress={doConnect} />
        )
      ) : null}

      {step.kind === 'section' && connected ? (
        <ThemedText type="small" themeColor="textMuted">
          {RESTORE_WARNING}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.two },
  // The код відновлення is eight groups of seven; letting it wrap on the group boundaries is what
  // makes it copyable by hand without losing the place.
  code: { letterSpacing: 2 },
  spacer: { height: Spacing.four },
});
