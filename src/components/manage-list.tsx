import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Field, RowAction } from './form';
import { Card, ListCard, ListRow, Screen, ScreenHeader } from './surfaces';
import { ThemedText } from './themed-text';

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
    <Screen>
      <ScreenHeader title={title} subtitle={hint} back={() => router.back()} />

      <Card style={styles.form}>
        <Field label="Нова назва" value={fresh} onChangeText={setFresh} placeholder="Назва" />
        <Action
          title="Додати"
          onPress={() => {
            if (attempt(() => create(fresh))) {
              setFresh('');
            }
          }}
        />
      </Card>

      <ListCard>
        {rows.map((row, index) => (
          <ListRow key={row.id} last={index === rows.length - 1} style={styles.row}>
            {editing?.id === row.id ? (
              <>
                <Field
                  label="Назва"
                  value={editing.name}
                  onChangeText={(name) => setEditing({ id: row.id, name })}
                />
                <View style={styles.actions}>
                  <RowAction
                    title="Зберегти"
                    onPress={() => {
                      if (attempt(() => rename(row.id, editing.name))) {
                        setEditing(undefined);
                      }
                    }}
                  />
                  <RowAction tone="quiet" title="Скасувати" onPress={() => setEditing(undefined)} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.rowTop}>
                  {/* Archived rows stay visible and are set apart, never dropped. */}
                  <ThemedText
                    numberOfLines={1}
                    style={styles.name}
                    themeColor={row.archived ? 'textMuted' : undefined}>
                    {row.name}
                  </ThemedText>
                  {row.archived ? (
                    <ThemedText type="overline" themeColor="textMuted">
                      в архіві
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  {row.canRename ? (
                    <RowAction
                      title="Перейменувати"
                      onPress={() => setEditing({ id: row.id, name: row.name })}
                    />
                  ) : null}
                  {row.canArchive ? (
                    <RowAction
                      tone="quiet"
                      title="В архів"
                      onPress={() => attempt(() => archive(row.id))}
                    />
                  ) : null}
                  {row.canUnarchive ? (
                    <RowAction
                      tone="quiet"
                      title="З архіву"
                      onPress={() => attempt(() => unarchive(row.id))}
                    />
                  ) : null}
                  {row.reserved ? (
                    <ThemedText type="small" themeColor="textMuted">
                      службова — застосунок сам її використовує
                    </ThemedText>
                  ) : null}
                </View>
              </>
            )}
          </ListRow>
        ))}
      </ListCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
});
