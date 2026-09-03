import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { reporting as reportingRepo } from '@/db/repos';
import type { CaptureSettings } from '@/db/reporting-repo';
import { buildInfo, deviceInfo } from '@/platform/app-build-device';
import { bugReportFiles } from '@/platform/bug-report-files-device';
import { screenCapture } from '@/platform/screen-capture-device';
import {
  activate,
  CANCEL_LABEL,
  discardCapture,
  EMPTY_SHEET,
  EXPECTED_HINT,
  EXPECTED_LABEL,
  GESTURE,
  HANDLE_LABEL,
  HAPPENED_HINT,
  HAPPENED_LABEL,
  handOverFailed,
  HAND_OVER_UNAVAILABLE,
  keepCapture,
  SAVE_AND_HAND_OVER_LABEL,
  SAVE_LABEL,
  SHEET_TITLE,
  submitHere,
  type SheetCapture,
  type SheetFields,
} from '@/ui/bug-report-here';
import { handOver, IDLE, SCREENSHOT_CONFIRMATION } from '@/ui/bug-report-screen';
import { newId } from '@/ui/id';
import { journal } from '@/ui/journal';

/**
 * The two doors onto a репорт about the screen the owner is on, and the sheet behind them.
 *
 * **It decides nothing.** Every word, every refusal, the ordering of the capture and the UI, and
 * what is cleaned up on each way out come from `src/ui/bug-report-here.ts`, which `npm run verify`
 * proves without a device. What is here is the recognizer, the pixels and the effects — the parts
 * `verify` cannot run — so the emulator pass (tasks 8.1–8.12) is what checks this file and nothing
 * else has to.
 *
 * **It is an overlay in the shell, not a route** (design D4). A pushed screen would write a
 * `screen` entry and the репорт would name itself as the screen the owner was complaining about;
 * it would also put a navigation animation between the gesture and the capture, which is exactly
 * the frame that must not be photographed. An overlay writes nothing and animates nothing, so
 * «Скасувати» returns the owner to a half-typed form with the keyboard still up.
 */
export function BugReportHere({ settings }: { settings: CaptureSettings }) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [capture, setCapture] = useState<SheetCapture | null>(null);
  const [fields, setFields] = useState<SheetFields>(EMPTY_SHEET);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether this sheet has already written its репорт — see `save`.
  const [stored, setStored] = useState(false);
  // The handle hides itself for the duration of the capture so it is never in its own скріншот.
  const [handleHidden, setHandleHidden] = useState(false);

  const open = capture !== null;

  /**
   * Two frames, awaited, so that hiding the handle has actually reached the glass before
   * `PixelCopy` reads the surface. One `requestAnimationFrame` schedules the commit; the second
   * fires after it has been composited.
   */
  const settle = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    [],
  );

  /** The one path both doors take. `activate` owns the ordering and the in-flight guard. */
  const start = useCallback(() => {
    void activate({
      capture: screenCapture,
      hideHandle: () => setHandleHidden(true),
      showHandle: () => setHandleHidden(false),
      settle,
      openSheet: (taken) => {
        setFields(EMPTY_SHEET);
        setRefusal(null);
        setNotice(taken.notice);
        setStored(false);
        setCapture(taken);
      },
    });
  }, [settle]);

  /**
   * Closing without a stored репорт: the captured file goes, and nothing is left on the phone.
   *
   * Deliberately not called on a refused save — a refusal keeps the sheet, what was typed and the
   * picture, so the next attempt carries the same скріншот (design D5).
   */
  const dismiss = useCallback(() => {
    const taken = capture;
    setCapture(null);
    setFields(EMPTY_SHEET);
    setRefusal(null);
    setNotice(null);
    setStored(false);
    if (taken !== null) {
      void discardCapture(taken, screenCapture);
    }
  }, [capture]);

  /** The device's back gesture is «Скасувати» and nothing else — one way out, not two. */
  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [open, dismiss]);

  const save = useCallback(
    async (thenHandOver: boolean) => {
      // `stored` is the guard against a second репорт: once one is written, the only thing left
      // for this sheet to do is close.
      if (capture === null || busy || stored) {
        return;
      }
      setBusy(true);
      try {
        const id = newId();
        const outcome = submitHere({
          id,
          fields,
          capture,
          context: {
            build: buildInfo(),
            device: deviceInfo(),
            migrationsApplied: reportingRepo.migrationsApplied(),
            counts: reportingRepo.counts(),
            journal: journal.tail(),
            prompting: null,
            now: new Date(),
          },
          save: (report) => reportingRepo.create(report),
        });

        if (outcome.kind === 'refused') {
          // The sheet stays exactly as it is, picture and typing included.
          setRefusal(outcome.message);
          return;
        }

        await keepCapture({
          reportId: id,
          capture,
          files: bugReportFiles,
          screen: screenCapture,
          storage: reportingRepo,
          now: () => new Date(),
        });

        if (!thenHandOver) {
          setCapture(null);
          setFields(EMPTY_SHEET);
          return;
        }

        const stored = reportingRepo.get(id);
        if (stored === null) {
          setCapture(null);
          return;
        }
        const state = await handOver(
          IDLE,
          {
            report: stored,
            files: bugReportFiles,
            storage: reportingRepo,
            now: () => new Date(),
            confirmScreenshots: () => confirmScreenshots(),
          },
          () => undefined,
        );
        // The репорт is stored either way; only the hand-over can still fail, and it says which.
        //
        // `setStored` is what stops a second press storing a *second* репорт: the first one is
        // already in storage and its скріншот already kept, so «Зберегти» has nothing left to do
        // and the sheet says so rather than quietly minting a duplicate with no picture.
        if (state.kind === 'unavailable') {
          setNotice(HAND_OVER_UNAVAILABLE);
          setStored(true);
          return;
        }
        if (state.kind === 'failed') {
          setNotice(handOverFailed(state.reason));
          setStored(true);
          return;
        }
        setCapture(null);
        setFields(EMPTY_SHEET);
      } finally {
        setBusy(false);
      }
    },
    [capture, busy, fields, stored],
  );

  /**
   * The recognizer. Its numbers are `GESTURE`'s, asserted as values under `verify`, so this
   * component cannot quietly drift from the design.
   *
   * `runOnJS` because the callback captures the screen and touches React state — it must not be a
   * worklet. `enabled` is the owner's switch: off, and the recognizer never activates, while every
   * other way of filing a репорт keeps working.
   */
  const longPress = Gesture.LongPress()
    .numberOfPointers(GESTURE.pointers)
    .minDuration(GESTURE.minDurationMs)
    .maxDistance(GESTURE.maxDistanceDp)
    .enabled(settings.gestureEnabled && !open)
    .runOnJS(true)
    .onStart(() => start());

  return (
    <>
      {/* The detector fills the screen but lets every touch through: `pointerEvents="box-none"`
          means it is not itself a target, so taps, scrolls and one-finger long-presses reach the
          app exactly as before and only a two-pointer hold is claimed here. */}
      <GestureDetector gesture={longPress}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {settings.handleEnabled && !handleHidden && !open ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={HANDLE_LABEL}
              onPress={start}
              style={[styles.handle, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Text style={[styles.handleMark, { color: theme.accent }]}>⚑</Text>
            </Pressable>
          ) : null}
        </View>
      </GestureDetector>

      <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
        <View style={[styles.backdrop, { backgroundColor: '#0008' }]}>
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.title, { color: theme.text }]}>{SHEET_TITLE}</Text>

              {capture?.uri ? (
                <Image
                  source={{ uri: capture.uri }}
                  style={styles.shot}
                  contentFit="contain"
                  accessibilityLabel="Скріншот екрана, з якого заведено репорт"
                />
              ) : null}
              {notice ? (
                <Text style={[styles.notice, { color: theme.textMuted }]}>{notice}</Text>
              ) : null}

              <Text style={[styles.label, { color: theme.text }]}>{HAPPENED_LABEL}</Text>
              <TextInput
                value={fields.happened}
                onChangeText={(happened) => setFields((f) => ({ ...f, happened }))}
                placeholder={HAPPENED_HINT}
                placeholderTextColor={theme.textMuted}
                multiline
                autoFocus
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              <Text style={[styles.label, { color: theme.text }]}>{EXPECTED_LABEL}</Text>
              <TextInput
                value={fields.expected}
                onChangeText={(expected) => setFields((f) => ({ ...f, expected }))}
                placeholder={EXPECTED_HINT}
                placeholderTextColor={theme.textMuted}
                multiline
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />

              {refusal ? (
                <Text style={[styles.refusal, { color: theme.textDanger }]}>{refusal}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy || stored}
                onPress={() => void save(false)}
                style={[styles.action, { backgroundColor: theme.accent }]}>
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{SAVE_LABEL}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || stored}
                onPress={() => void save(true)}
                style={[styles.action, { borderColor: theme.border, borderWidth: 1 }]}>
                <Text style={[styles.actionText, { color: theme.text }]}>
                  {SAVE_AND_HAND_OVER_LABEL}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={dismiss} style={styles.action}>
                <Text style={[styles.actionText, { color: theme.textMuted }]}>{CANCEL_LABEL}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * The скріншот warning, as the phone's own dialog — one copy, imported by both screens.
 *
 * Its words are `bug-report-screen.ts`'s, beside `REMOVE_CONFIRMATION`, so the sheet's hand-over
 * and the saved репорт's «Передати» warn in exactly the same sentence (design D11). Exported
 * rather than duplicated: two copies of the one thing standing between a скріншот and the chooser
 * would drift, and the half that drifted would be a warning the owner stopped being shown.
 */
export function confirmScreenshots(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(SCREENSHOT_CONFIRMATION.title, SCREENSHOT_CONFIRMATION.message, [
      { text: SCREENSHOT_CONFIRMATION.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: SCREENSHOT_CONFIRMATION.confirm, onPress: () => resolve(true) },
    ]);
  });
}

const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
    right: Spacing.three,
    bottom: TouchTarget * 2,
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleMark: { fontSize: 20 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: Spacing.four,
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: Spacing.three },
  shot: { width: '100%', height: 220, borderRadius: Radius.control, marginBottom: Spacing.three },
  notice: { marginBottom: Spacing.three },
  label: { marginTop: Spacing.two, marginBottom: Spacing.one, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.two, minHeight: 64 },
  refusal: { marginTop: Spacing.two },
  action: {
    marginTop: Spacing.two,
    minHeight: TouchTarget,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontWeight: '600' },
});
