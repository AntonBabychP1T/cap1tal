import { Pressable, StyleSheet, View } from 'react-native';

import { IconTile, Mark } from './surfaces';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import type { ThemeColor } from '@/constants/theme';
import type { IconName } from '@/ui/icons';

/**
 * One line of транзакції, drawn the same way on Головний, «Транзакції», a рахунок's рухи and a
 * категорія's month (main-screen, "A transaction line keeps its сума beside its title").
 *
 * The сума stands beside the title only; the second row and the опис take the whole width under
 * it. The four screens used to draw their own copy with the сума as a column as tall as the row,
 * and at 130% font that column squeezed «гаманець · 2026-09-23» into two rows on all four at once.
 *
 * Every string arrives decided — `src/ui/transaction-line.ts` says what a line reads — so this
 * file holds no rule. A переказ's title may take a second row, because «platinum ··6628 → інжур»
 * cut to «platinum ··6628 → ін…» names neither end.
 */
export function TransactionRow({
  icon,
  iconTone,
  title,
  titleTone,
  titleLines = 1,
  subtitle,
  description,
  amount,
  amountTone,
  marked,
  onPress,
}: {
  icon: IconName;
  iconTone: ThemeColor;
  title: string;
  /** A категорія over its ліміт turns the title red, and nothing else on the line changes. */
  titleTone?: ThemeColor;
  titleLines?: number;
  subtitle: string;
  /** The опис, when the транзакція carries one. Absent draws no empty row. */
  description?: string;
  amount: string;
  amountTone: ThemeColor;
  /** «Без категорії»: the mark before the title, not a repainted row. */
  marked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
      <IconTile name={icon} tone={iconTone} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.titleWrap}>
            {marked ? <Mark /> : null}
            <ThemedText numberOfLines={titleLines} style={styles.title} themeColor={titleTone}>
              {title}
            </ThemedText>
          </View>
          <ThemedText tabular style={styles.amount} themeColor={amountTone} numberOfLines={1}>
            {amount}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textMuted">
            {description}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  pressed: { opacity: 0.75 },
  body: { flex: 1, minWidth: 0, gap: Spacing.half },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two - Spacing.half,
  },
  title: { flexShrink: 1 },
  amount: { fontWeight: 600, flexShrink: 0 },
});
