import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RowAction } from './form';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryIconDefinition } from '@/ui/category-icons';
import type { CategoryIconKey } from '@/domain/category-icon';

export interface PickableCategoryIcon extends CategoryIconDefinition { readonly key: CategoryIconKey }

/**
 * Accessible, compact catalogue used while a category is created or changed.
 *
 * Closed until asked for. The icon is optional — one is already picked for the назва as it is
 * typed — and the grid is some thirty cells tall: open by default it stood between the name field
 * and «Додати», so adding a category meant scrolling past every icon to reach the button (QA,
 * 2026-09-29). Closed, the form is the field, the icon in use and the button. Picking one closes
 * the grid again, so the choice is read back in the line that opened it.
 */
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
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.root}>
      <View style={styles.summary}>
        {selected ? <Icon name={selected.glyph} color="textSecondary" size={20} /> : null}
        <ThemedText type="small" style={styles.summaryText}>
          Іконка: {selected?.name ?? 'Інше'}
        </ThemedText>
        <RowAction
          tone="quiet"
          title={open ? 'Згорнути' : 'Змінити'}
          onPress={() => setOpen(!open)}
        />
      </View>
      {open ? groups.map((group) => (
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
                  onPress={() => {
                    onChange(icon.key);
                    setOpen(false);
                  }}
                  style={[styles.cell, { backgroundColor: theme.backgroundInset, borderColor: checked ? theme.accent : 'transparent' }]}>
                  <Icon name={icon.glyph} color={checked ? 'accent' : 'textSecondary'} size={22} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Takes the row's slack and wraps, so a long icon name never pushes «Змінити» off the card.
  summaryText: { flex: 1, minWidth: 0 },
  group: { gap: Spacing.one }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  cell: { width: TouchTarget, height: TouchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: Radius.tile },
});
