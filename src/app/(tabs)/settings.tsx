import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { SETTINGS_SECTIONS } from '@/ui/settings-sections';

import { Spacing } from '@/constants/theme';

/**
 * Налаштування — the one place the owner configures the app. Today it is a menu of the three
 * management lists and the one-time Saldo import; monobank-токен, ліміти, цілі and бекап join
 * them in later steps, which is why it is a menu rather than the lists themselves.
 *
 * The sections themselves are `src/ui/settings-sections.ts`, where `verify` can reach them.
 */

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Налаштування</ThemedText>

          {SETTINGS_SECTIONS.map((section) => (
            <Pressable key={section.href} onPress={() => router.push(section.href)}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText type="smallBold">{section.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {section.hint}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.one },
});
