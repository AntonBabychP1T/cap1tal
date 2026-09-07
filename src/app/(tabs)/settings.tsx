import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';

import { outboundTrafficNote, SETTINGS_SECTIONS } from '@/ui/settings-sections';
import { isConnected } from '@/backup/drive/state';
import { driveBackupState } from '@/db/repos';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';

import { Spacing } from '@/constants/theme';

/**
 * Налаштування — the one place the owner configures the app. Today it is a menu of the three
 * management lists, ліміти, цілі, the one-time Saldo import and the monobank connection; бекап
 * joins them in a later step, which is why it is a menu rather than the lists themselves.
 *
 * The sections themselves are `src/ui/settings-sections.ts`, where `verify` can reach them.
 */

export default function SettingsScreen() {
  const router = useRouter();
  /**
   * Re-read whenever the tab comes back into focus — not once at mount.
   *
   * Connecting Google Drive happens on a route pushed *above* the tabs, so popping back does not
   * re-render this screen on its own. Read once, the owner would return to «Усе лежить на цьому
   * телефоні» while a sealed бекап was already going to Drive, which is the one thing the
   * outbound-traffic requirement forbids. One row of synchronous SQLite per focus.
   */
  const [driveConnected] = useReloadOnFocus(
    useCallback(() => isConnected(driveBackupState.read()), []),
  );

  return (
    <Screen>
      <ScreenHeader title="Налаштування" />

      <ListCard>
        {SETTINGS_SECTIONS.map((section, index) => (
          <ListRow key={section.href} last={index === SETTINGS_SECTIONS.length - 1}>
            <Pressable
              onPress={() => router.push(section.href)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.text}>
                <ThemedText>{section.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {section.hint}
                </ThemedText>
              </View>
              <ThemedText type="subtitle" themeColor="textMuted">
                ›
              </ThemedText>
            </Pressable>
          </ListRow>
        ))}
      </ListCard>

      <ThemedText type="small" themeColor="textMuted">
        {outboundTrafficNote(driveConnected)}
      </ThemedText>
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
  pressed: { opacity: 0.7 },
});
