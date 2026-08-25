import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { Spacing } from '@/constants/theme';

/**
 * Налаштування — the one place the owner configures the app. Today it is a menu of three
 * management lists; monobank-токен, ліміти, цілі and бекап join them in later steps, which is
 * why it is a menu rather than the lists themselves.
 *
 * The sections live at `/manage/…` rather than `/settings/…`: this tab already owns `/settings`,
 * the same reason the category drill-down lives at `/category/…` and not under `/month`.
 */

const SECTIONS = [
  { href: '/manage/categories', title: 'Категорії', hint: 'Куди пішли гроші' },
  { href: '/manage/sources', title: 'Джерела', hint: 'Звідки прийшли гроші' },
  { href: '/manage/rules', title: 'Правила', hint: 'Автокатегоризація імпорту' },
] as const;

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Налаштування</ThemedText>

          {SECTIONS.map((section) => (
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
