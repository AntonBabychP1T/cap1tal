import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Action, Field, RowAction } from './form';
import { CategoryIconPicker, type PickableCategoryIcon } from './category-icon-picker';
import { Card, Chevron, IconTile, ListCard, ListRow, Screen, ScreenHeader } from './surfaces';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { failureAlert } from '@/ui/failure-alert';
import type { ManagedRow } from '@/ui/list-management';
import { suggestCategoryIcon, type CategoryIconKey } from '@/domain/category-icon';

/**
 * The «Категорії» and «Джерела» sections of Налаштування: one list, the same four verbs, twice.
 * Which verbs a row offers is not decided here — `src/ui/list-management.ts` decides it and is
 * under `verify`; this file only draws what each `ManagedRow` says it can do, so a reserved row
 * simply has no buttons to draw.
 */
export function ManageListScreen({
  title,
  hint,
  createLabel,
  where,
  load,
  create,
  rename,
  archive,
  unarchive,
  categoryIcons,
}: {
  title: string;
  hint: string;
  /** The one action above the list: «Нова категорія» or «Нове джерело». */
  createLabel: string;
  /**
   * Which list this is, as the журнал names it — `categories` or `sources`. Composed with the
   * verb into the action's kind, so a репорт about a refused rename says which of the two it was
   * without carrying the назва the owner typed.
   */
  where: string;
  /** Must be stable — `useReloadOnFocus` depends on its identity. */
  load: () => ManagedRow[];
  create: (name: string, iconKey?: CategoryIconKey) => void;
  rename: (id: string, name: string, iconKey?: CategoryIconKey) => void;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  /** Present only for categories; sources intentionally stay name-only. */
  categoryIcons?: readonly PickableCategoryIcon[];
}) {
  const router = useRouter();
  const [rows, reload] = useReloadOnFocus(load);
  /** Every refusal below offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );
  const [fresh, setFresh] = useState('');
  const [freshIcon, setFreshIcon] = useState<CategoryIconKey>('tag');
  const [freshIconPicked, setFreshIconPicked] = useState(false);
  /** The row being renamed, and the name as it is being typed; nothing else is editable at once. */
  const [editing, setEditing] = useState<{ id: string; name: string; iconKey?: CategoryIconKey }>();
  /** Whether the create form is open. Closed by default: the list is what the section is for. */
  const [creating, setCreating] = useState(false);
  const closeCreate = useCallback(() => {
    setCreating(false);
    setFresh('');
    setFreshIcon('tag');
    setFreshIconPicked(false);
  }, []);
  const closeEditor = useCallback(() => setEditing(undefined), []);
  // The phone's «назад» closes what the owner opened last before it leaves the section, and what
  // was typed into it is discarded — the same rule «Ліміти» already keeps.
  useCloseOnBack(creating, closeCreate);
  useCloseOnBack(editing !== undefined, closeEditor);

  // Every write goes through here: the repositories reject an empty or duplicate name by
  // throwing, and the owner reads that sentence rather than watching nothing happen.
  //
  // One door for four verbs, so the журнал learns which one was refused — `categories-rename` and
  // `sources-create` are different bugs, and «Рахунок «X» вже існує» is exactly the refusal whose
  // wording a repro needs. This screen is drawn by two routes and is the reason the sweep in
  // `screens.test.ts` walks `src/components/` as well as `src/app/`.
  const attempt = useCallback(
    (verb: 'create' | 'rename' | 'archive' | 'unarchive', write: () => void) => {
      try {
        write();
        reload();
        return true;
      } catch (error) {
        Alert.alert(
          ...failureAlert({
            title: 'Не збережено',
            where: `${where}-${verb}`,
            error,
            report: reportBug,
          }),
        );
        return false;
      }
    },
    [reload, reportBug, where],
  );

  return (
    <Screen>
      <ScreenHeader title={title} subtitle={hint} back={() => router.back()} />

      {/* The list leads; creating is one action above it (settings-screen, "A management list
          leads with its rows and edits a row from the row"). Open by default, the form and its
          icon grid pushed the owner's own thirty категорії two screens down. */}
      {creating ? (
        <Card style={styles.form}>
          <Field label="Нова назва" value={fresh} onChangeText={(name) => {
            setFresh(name);
            if (!freshIconPicked) setFreshIcon(suggestCategoryIcon(name));
          }} placeholder="Назва" autoFocus />
          {categoryIcons ? <CategoryIconPicker icons={categoryIcons} value={freshIcon} onChange={(iconKey) => { setFreshIcon(iconKey); setFreshIconPicked(true); }} /> : null}
          <Action
            title="Додати"
            onPress={() => {
              if (attempt('create', () => create(fresh, categoryIcons ? freshIcon : undefined))) {
                closeCreate();
              }
            }}
          />
          <Action variant="secondary" title="Скасувати" onPress={closeCreate} />
        </Card>
      ) : (
        <Action
          variant="secondary"
          title={createLabel}
          onPress={() => {
            setEditing(undefined);
            setCreating(true);
          }}
        />
      )}

      <ListCard>
        {rows.map((row, index) => (
          <ListRow key={row.id} last={index === rows.length - 1} style={styles.row}>
            {editing?.id === row.id ? (
              <>
                <Field
                  label="Назва"
                  value={editing.name}
                  onChangeText={(name) => setEditing({ ...editing, name })}
                />
                {categoryIcons && editing.iconKey ? <CategoryIconPicker icons={categoryIcons} value={editing.iconKey} onChange={(iconKey) => setEditing({ ...editing, iconKey })} /> : null}
                <View style={styles.actions}>
                  {row.canRename ? (
                    <RowAction
                      title="Зберегти"
                      onPress={() => {
                        if (attempt('rename', () => rename(row.id, editing.name, editing.iconKey))) {
                          setEditing(undefined);
                        }
                      }}
                    />
                  ) : null}
                  <RowAction tone="quiet" title="Скасувати" onPress={() => setEditing(undefined)} />
                  {row.canArchive ? (
                    <RowAction
                      tone="quiet"
                      title="В архів"
                      onPress={() => {
                        if (attempt('archive', () => archive(row.id))) setEditing(undefined);
                      }}
                    />
                  ) : null}
                  {row.canUnarchive ? (
                    <RowAction
                      tone="quiet"
                      title="З архіву"
                      onPress={() => {
                        if (attempt('unarchive', () => unarchive(row.id))) setEditing(undefined);
                      }}
                    />
                  ) : null}
                </View>
              </>
            ) : (
              // The row itself is the way into its editor; a reserved row has nothing to open and
              // says why instead.
              <Pressable
                disabled={row.reserved}
                accessibilityRole={row.reserved ? undefined : 'button'}
                accessibilityHint={row.reserved ? undefined : 'Змінити або перенести в архів'}
                onPress={() => {
                  setCreating(false);
                  setEditing({ id: row.id, name: row.name, iconKey: row.iconKey as CategoryIconKey | undefined });
                }}
                style={({ pressed }) => [styles.rowTap, pressed ? styles.pressed : null]}>
                <View style={styles.rowTop}>
                  {row.icon ? <IconTile name={row.icon} /> : null}
                  {/* Archived rows stay visible and are set apart, never dropped. */}
                  <View style={styles.name}>
                    <ThemedText
                      numberOfLines={1}
                      themeColor={row.archived ? 'textMuted' : undefined}>
                      {row.name}
                    </ThemedText>
                    {row.reserved ? (
                      <ThemedText type="small" themeColor="textMuted">
                        службова — застосунок сам її використовує
                      </ThemedText>
                    ) : null}
                  </View>
                  {row.archived ? (
                    <ThemedText type="overline" themeColor="textMuted">
                      в архіві
                    </ThemedText>
                  ) : null}
                  {row.reserved ? null : <Chevron />}
                </View>
              </Pressable>
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
  name: { flex: 1, gap: Spacing.half },
  rowTap: { minHeight: 40, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
});
