import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';

import { SETTINGS_SECTIONS } from '@/ui/settings-sections';

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
        Усе лежить на цьому телефоні. Назовні йдуть лише запити до monobank з вашим токеном.
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
