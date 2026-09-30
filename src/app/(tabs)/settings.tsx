import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { TabFade, Tap } from '@/components/motion';
import { ThemedSwitch } from '@/components/form';
import { ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';

import { outboundTrafficNote, SETTINGS_SECTIONS } from '@/ui/settings-sections';
import { isConnected } from '@/backup/drive/state';
import { driveBackupState, hapticsPreference } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';

import { Spacing } from '@/constants/theme';

/**
 * Налаштування — the one place the owner configures the app. Today it is a menu of the three
 * management lists, ліміти, цілі, the one-time Saldo import and the monobank connection; бекап
 * joins them in a later step, which is why it is a menu rather than the lists themselves.
 *
 * The sections themselves are `src/ui/settings-sections.ts`, where `verify` can reach them.
 */

function SettingsScreen() {
  const router = useRouter();
  /**
   * Re-read whenever the tab comes back into focus — not once at mount.
   *
   * Connecting Google Drive happens on a route pushed *above* the tabs, so popping back does not
   * re-render this screen on its own. Read once, the owner would return to «Усе лежить на цьому
   * телефоні» while a sealed бекап was already going to Drive, which is the one thing the
   * outbound-traffic requirement forbids. One row of synchronous SQLite per focus.
   */
  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        driveConnected: isConnected(driveBackupState.read()),
        // Re-read on focus like the rest, so a restored бекап's preference shows on return.
        vibration: hapticsPreference.enabled(),
      }),
      [],
    ),
    // Not read until the tab is first opened; the note and the switch wait for it.
    { whileUnseen: undefined },
  );
  const driveConnected = stored?.driveConnected;
  const vibration = stored?.vibration;

  return (
    <Screen>
      <ScreenHeader title="Налаштування" />

      <ListCard>
        {SETTINGS_SECTIONS.map((section, index) => (
          <ListRow key={section.href} last={index === SETTINGS_SECTIONS.length - 1}>
            <Tap
              onPress={() => router.push(section.href)}
              style={styles.row}>
              <View style={styles.text}>
                <ThemedText>{section.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {section.hint}
                </ThemedText>
              </View>
              <ThemedText type="subtitle" themeColor="textMuted">
                ›
              </ThemedText>
            </Tap>
          </ListRow>
        ))}
      </ListCard>

      {/* «Вібрація»: whether haptics play (motion, "The owner can turn vibration off"). Stored at
          once; the switch's own tick plays after the store, so turning it on ticks and turning it
          off plays nothing. Not a section: it opens nothing. */}
      {vibration === undefined ? null : (
        <ListCard>
          <ListRow last style={styles.row}>
            <ThemedText style={styles.text}>Вібрація</ThemedText>
            <ThemedSwitch
              accessibilityLabel="Вібрація"
              value={vibration}
              onValueChange={(enabled) => {
                hapticsPreference.set(enabled);
                reload();
              }}
            />
          </ListRow>
        </ListCard>
      )}

      {driveConnected === undefined ? null : (
        <ThemedText type="small" themeColor="textMuted">
          {outboundTrafficNote(driveConnected)}
        </ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  text: { flex: 1, gap: Spacing.half },
});

/**
 * The tab as the navigator mounts it: the screen inside the cross-fade every tab shares (motion,
 * "Screens enter from where they come from"; design D8).
 */
export default function SettingsTab() {
  return (
    <TabFade tab="settings">
      <SettingsScreen />
    </TabFade>
  );
}
