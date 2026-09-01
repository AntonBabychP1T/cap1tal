import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Action, Field } from '@/components/form';
import { Banner, Card, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { reminders as remindersRepo } from '@/db/repos';
import { useOnForeground } from '@/hooks/use-on-foreground';
import { useTheme } from '@/hooks/use-theme';
import { localNotifications } from '@/platform/local-notifications-device';
import { formatTimeOfDay, DEFAULT_REMINDER_TIME } from '@/reminders/time';
import {
  reconcileOnLaunch,
  setTime,
  turnOff,
  turnOn,
  type ReminderState,
} from '@/ui/reminder-schedule';
import { changeTime, remindersSection } from '@/ui/reminders-screen';

import { Spacing } from '@/constants/theme';

/**
 * «Нагадування» — the one place the owner decides whether the app may speak first: the permission
 * in plain words, the daily нагадування's switch and its time, and what the app will and will not
 * ever put in a notification.
 *
 * Every decision belongs to `src/ui/reminders-screen.ts` and `src/ui/reminder-schedule.ts`, where
 * `verify` can reach it: what each permission answer offers, what the switch may show, in what
 * order a нагадування is cancelled and arranged, and what a typed time comes to. This file is the
 * wiring, plus the one thing that cannot be tested off a device — asking the phone.
 */

/** The two singletons this section works over: the device's shade, and the device's storage. */
const PORTS = { notifications: localNotifications, storage: remindersRepo };

export default function RemindersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [state, setState] = useState<ReminderState>();
  const [typed, setTyped] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  const [busy, setBusy] = useState(false);

  /**
   * The device's own answer, never a remembered one — and the reconciliation with it, so opening
   * the section is one more of the launches design D12 talks about rather than a special case.
   */
  const read = useCallback(() => {
    void reconcileOnLaunch(PORTS).then((next) => {
      setState(next);
      setTyped(undefined);
    });
  }, []);

  /** Opening the section asks the phone. */
  useFocusEffect(read);

  /**
   * And so does coming back to the app. The permission is granted on Android's own screen, which
   * is another app: our screen never loses navigation focus while the owner is over there, so the
   * focus effect alone would still be showing «не надано» when they return (design D12).
   */
  useOnForeground(read);

  const section = state ? remindersSection(state) : undefined;
  /** What the field shows: what the owner is typing, or the time actually in force. */
  const shown = typed ?? section?.time ?? formatTimeOfDay(DEFAULT_REMINDER_TIME);

  const settle = useCallback((next: ReminderState) => {
    setState(next);
    setTyped(undefined);
    setRefusal(undefined);
    setBusy(false);
  }, []);

  /**
   * The switch. On asks for the permission — the one moment the app does — for whatever time the
   * field currently holds; off takes effect at once and asks nothing.
   */
  const toggle = useCallback(
    (on: boolean) => {
      if (busy) return;
      setBusy(true);
      if (!on) {
        void turnOff(PORTS).then(settle);
        return;
      }
      const change = changeTime(shown);
      if (change.kind === 'refused') {
        // The switch cannot go on for a time that is not one; the field says why and stays put.
        setRefusal(change.message);
        setBusy(false);
        return;
      }
      void turnOn(change.time, PORTS).then(settle);
    },
    [busy, settle, shown],
  );

  /** The time, taken when the field is left. A value that is not a time changes nothing. */
  const commitTime = useCallback(() => {
    if (typed === undefined || busy) return;
    const change = changeTime(typed);
    if (change.kind === 'refused') {
      setRefusal(change.message);
      return;
    }
    setBusy(true);
    void setTime(change.time, PORTS).then(settle);
  }, [busy, settle, typed]);

  return (
    <Screen>
      <ScreenHeader title="Нагадування" back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {section?.explanation ?? ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {section?.privacy ?? ''}
        </ThemedText>
      </Card>

      {refusal ? <Banner>{refusal}</Banner> : null}

      {section ? (
        <>
          <SectionLabel>Дозвіл</SectionLabel>
          <Card style={styles.card}>
            <ThemedText type="small">{section.permission.status}</ThemedText>
            {section.permission.grant ? (
              <Action
                variant="secondary"
                title={section.permission.grant}
                onPress={() => void localNotifications.openSettings()}
              />
            ) : null}
          </Card>

          <SectionLabel>Щоденне нагадування</SectionLabel>
          <Card style={styles.card}>
            <View style={styles.row}>
              <ThemedText type="small">Нагадувати щодня</ThemedText>
              <Switch
                value={section.on}
                onValueChange={toggle}
                disabled={busy || !section.permission.switchable}
                trackColor={{ true: theme.accent, false: theme.border }}
              />
            </View>
            <Field
              label="Час"
              value={shown}
              onChangeText={setTyped}
              onBlur={commitTime}
              onSubmitEditing={commitTime}
              keyboardType="numbers-and-punctuation"
              placeholder="21:00"
              hint={section.arrival}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
