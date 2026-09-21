import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryIconDefinition } from '@/ui/category-icons';
import type { CategoryIconKey } from '@/domain/category-icon';

export interface PickableCategoryIcon extends CategoryIconDefinition { readonly key: CategoryIconKey }

/** Accessible, compact catalogue used while a category is created or changed. */
export function CategoryIconPicker({
  icons,
  value,
  onChange,
}: {
  icons: readonly PickableCategoryIcon[];
  value: CategoryIconKey;
  onChange: (key: CategoryIconKey) => void;
}) {
  const theme = useTheme();
  const groups = [...new Set(icons.map((icon) => icon.group))];
  const selected = icons.find((icon) => icon.key === value);
  return (
    <View style={styles.root}>
      <ThemedText type="small">Обрано: {selected?.name ?? 'Інше'}</ThemedText>
      {groups.map((group) => (
        <View key={group} style={styles.group}>
          <ThemedText type="overline" themeColor="textSecondary">{group}</ThemedText>
          <View style={styles.grid}>
            {icons.filter((icon) => icon.group === group).map((icon) => {
              const checked = value === icon.key;
              return (
                <Pressable
                  key={icon.key}
                  accessibilityRole="radio"
                  accessibilityLabel={icon.name}
                  accessibilityState={{ checked }}
                  onPress={() => onChange(icon.key)}
                  style={[styles.cell, { backgroundColor: theme.backgroundInset, borderColor: checked ? theme.accent : 'transparent' }]}>
                  <Icon name={icon.glyph} color={checked ? 'accent' : 'textSecondary'} size={22} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two }, group: { gap: Spacing.one }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  cell: { width: TouchTarget, height: TouchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: Radius.tile },
});
