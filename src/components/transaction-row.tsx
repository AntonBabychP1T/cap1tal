import { StyleSheet, View } from 'react-native';

import { Tap } from './motion';
import { IconTile, Mark } from './surfaces';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import type { ThemeColor } from '@/constants/theme';
import type { IconName } from '@/ui/icons';
import { feedA11yLabel, type TransferEnds } from '@/ui/transaction-line';

/**
 * One line of транзакції, drawn the same way on Головний, «Транзакції», a рахунок's рухи and a
 * категорія's month (main-screen, "A transaction line keeps its сума beside its title").
 *
 * The сума stands beside the title only; the second row and the опис take the whole width under
 * it. The four screens used to draw their own copy with the сума as a column as tall as the row,
 * and at 130% font that column squeezed «гаманець · 2026-09-23» into two rows on all four at once.
 *
 * Every string arrives decided — `src/ui/transaction-line.ts` says what a line reads — so this
 * file holds no rule. A переказ's title is its two рахунки, each on its own single row and «→»
 * leading the second, because «platinum ··6628 → інжур» wrapped as one text could break inside a
 * name at a large text size, and cut to «platinum ··6628 → ін…» names neither end (app-shell, "A
 * name in a line breaks between words, never inside one"). A name too long for its row ends in «…».
 * The row's accessible name is `feedA11yLabel`'s, so the red of an over-limit title is said too.
 */
export function TransactionRow({
  icon,
  iconTone,
  title,
  overLimit = false,
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
  /** A переказ hands its two ends; every other line one string. */
  title: string | TransferEnds;
  /**
   * A категорія over its ліміт turns the title red, and nothing else on the line changes but its
   * accessible name, which says «понад ліміт».
   */
  overLimit?: boolean;
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
  const titleTone: ThemeColor | undefined = overLimit ? 'textDanger' : undefined;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={feedA11yLabel({ title, subtitle, amount, description, overLimit })}
      style={styles.row}>
      <IconTile name={icon} tone={iconTone} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.titleWrap}>
            {marked ? <Mark /> : null}
            {typeof title === 'string' ? (
              <ThemedText numberOfLines={titleLines} style={styles.title} themeColor={titleTone}>
                {title}
              </ThemedText>
            ) : (
              <View style={styles.ends}>
                <ThemedText numberOfLines={1} ellipsizeMode="tail" themeColor={titleTone}>
                  {title.from}
                </ThemedText>
                <ThemedText numberOfLines={1} ellipsizeMode="tail" themeColor={titleTone}>
                  {`→ ${title.to}`}
                </ThemedText>
              </View>
            )}
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
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
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
  ends: { flexShrink: 1, minWidth: 0 },
  amount: { fontWeight: 600, flexShrink: 0 },
});
