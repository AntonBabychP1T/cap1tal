import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action, Field } from './form';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { failureMessage } from '@/ui/labels';
import type { ManagedRow } from '@/ui/list-management';

/**
 * The «Категорії» and «Джерела» sections of Налаштування: one list, the same four verbs, twice.
 * Which verbs a row offers is not decided here — `src/ui/list-management.ts` decides it and is
 * under `verify`; this file only draws what each `ManagedRow` says it can do, so a reserved row
 * simply has no buttons to draw.
 */
export function ManageListScreen({
  title,
  hint,
  load,
  create,
  rename,
  archive,
  unarchive,
}: {
  title: string;
  hint: string;
  /** Must be stable — `useReloadOnFocus` depends on its identity. */
  load: () => ManagedRow[];
  create: (name: string) => void;
  rename: (id: string, name: string) => void;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
}) {
  const router = useRouter();
  const [rows, reload] = useReloadOnFocus(load);
  const [fresh, setFresh] = useState('');
  /** The row being renamed, and the name as it is being typed; nothing else is editable at once. */
  const [editing, setEditing] = useState<{ id: string; name: string }>();

  // Every write goes through here: the repositories reject an empty or duplicate name by
  // throwing, and the owner reads that sentence rather than watching nothing happen.
  const attempt = useCallback(
    (write: () => void) => {
      try {
        write();
        reload();
        return true;
      } catch (error) {
        Alert.alert('Не збережено', failureMessage(error));
        return false;
      }
    },
    [reload],
  );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Field label="Нова назва" value={fresh} onChangeText={setFresh} placeholder="Назва" />
            <Action
              title="Додати"
              onPress={() => {
                if (attempt(() => create(fresh))) {
                  setFresh('');
                }
              }}
            />
          </ThemedView>

          {rows.map((row) => (
            <ThemedView key={row.id} type="backgroundElement" style={styles.row}>
              {editing?.id === row.id ? (
                <>
                  <Field
                    label="Назва"
                    value={editing.name}
                    onChangeText={(name) => setEditing({ id: row.id, name })}
                  />
                  <Action
                    title="Зберегти"
                    onPress={() => {
                      if (attempt(() => rename(row.id, editing.name))) {
                        setEditing(undefined);
                      }
                    }}
                  />
                  <Action title="Скасувати" onPress={() => setEditing(undefined)} />
                </>
              ) : (
                <>
                  <View style={styles.rowTop}>
                    <ThemedText type="smallBold">{row.name}</ThemedText>
                    {/* Archived rows stay visible and are set apart, never dropped. */}
                    {row.archived ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        в архіві
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.actions}>
                    {row.canRename ? (
                      <Verb
                        title="Перейменувати"
                        onPress={() => setEditing({ id: row.id, name: row.name })}
                      />
                    ) : null}
                    {row.canArchive ? (
                      <Verb title="В архів" onPress={() => attempt(() => archive(row.id))} />
                    ) : null}
                    {row.canUnarchive ? (
                      <Verb title="З архіву" onPress={() => attempt(() => unarchive(row.id))} />
                    ) : null}
                    {row.reserved ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        службова — застосунок сам її використовує
                      </ThemedText>
                    ) : null}
                  </View>
                </>
              )}
            </ThemedView>
          ))}

          <Action title="Назад" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** A row's verb: smaller than the form's `Action`, since a row may offer two of them side by side. */
function Verb({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      <ThemedText type="small" themeColor="textSecondary">
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.three },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  pressed: { opacity: 0.7 },
});
