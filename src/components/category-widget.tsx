import { Pressable, StyleSheet, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { donutGeometry } from '@/ui/dashboard-charts';
import type { CategoryPresentation } from '@/ui/home-categories';
import { formatMoney } from '@/ui/amount-input';
import { Card } from './surfaces';
import { ThemedText } from './themed-text';

/**
 * «Топ категорій витрат»: the donut, its currency chips and the legend/remainder rows one tap
 * opens the existing month-scoped detail for (main-screen, "Top categories read the same signed
 * monthly breakdown", "Category currencies never mix", "Signed or empty breakdowns never claim
 * false shares"). Every number is `categoryPresentation`'s; this file only draws it.
 *
 * One hue — the design's own single accent, graduated by opacity — because the theme
 * (`src/constants/theme.ts`) defines no category palette at all: a multi-hue chart would be a
 * second design system next to this one's "Графіт і вохра". Meaning never depends on it alone:
 * every sector's name and exact amount is also the legend row beside it.
 */

const SIZE = 160;
const OUTER_RADIUS = 72;
const INNER_RADIUS = 44;
const CENTER = SIZE / 2;
const REMAINDER_ID = '__remainder__';
/** Sector 1 full strength, each after it a step quieter — up to five rows plus the remainder. */
const SECTOR_OPACITY = [1, 0.82, 0.64, 0.48, 0.34, 0.2];

function polarPoint(radius: number, angleDeg: number): { x: number; y: number } {
  // -90 so 0° is 12 o'clock, matching `donutGeometry`'s own convention, sweeping clockwise.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

/** One annular wedge from `startAngle` to `endAngle`, both degrees, clockwise from 12 o'clock. */
function sectorPath(startAngle: number, endAngle: number): string {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarPoint(OUTER_RADIUS, startAngle);
  const outerEnd = polarPoint(OUTER_RADIUS, endAngle);
  const innerEnd = polarPoint(INNER_RADIUS, endAngle);
  const innerStart = polarPoint(INNER_RADIUS, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function CategoryWidget({
  presentation,
  onSelectCurrency,
  onOpenCategory,
  onOpenRemainder,
}: {
  readonly presentation: CategoryPresentation;
  readonly onSelectCurrency: (currency: string) => void;
  readonly onOpenCategory: (categoryId: string) => void;
  readonly onOpenRemainder: () => void;
}) {
  const theme = useTheme();

  if (presentation.emptyMessage) {
    return (
      <Card>
        <ThemedText type="overline">Топ категорій витрат</ThemedText>
        <ThemedText themeColor="textSecondary">{presentation.emptyMessage}</ThemedText>
      </Card>
    );
  }

  // The remainder groups into the donut's own last sector — reconciling the ring to the exact
  // signed center the legend already shows (design D2, "Donut groups their amounts into the
  // corresponding remainder segment").
  const geometry = donutGeometry([
    ...presentation.rows.map((r) => ({ categoryId: r.categoryId, amount: r.amount.amount })),
    ...(presentation.remainder
      ? [{ categoryId: REMAINDER_ID, amount: presentation.remainder.amount.amount }]
      : []),
  ]);

  const centerText = presentation.center ? formatMoney(presentation.center) : '';
  const neutralMessage = presentation.rows.some((r) => r.amount.amount < 0)
    ? 'Повернення перевищили витрати в окремих категоріях'
    : 'Витрати за вирахуванням повернень — 0';

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <ThemedText type="overline">Топ категорій витрат</ThemedText>
        {presentation.currencyChips.length > 0 ? (
          <View style={styles.chips}>
            {presentation.currencyChips.map((chip) => (
              <Pressable
                key={chip.currency}
                onPress={() => onSelectCurrency(chip.currency)}
                accessibilityRole="button"
                accessibilityLabel={chip.accessibilityLabel}
                accessibilityState={{ selected: chip.selected }}
                style={[styles.chip, chip.selected ? { backgroundColor: theme.accentSurface } : null]}>
                <ThemedText type="small" themeColor={chip.selected ? 'accent' : 'textSecondary'}>
                  {chip.currency}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View
          style={styles.donutWrap}
          accessible
          accessibilityLabel={
            geometry.kind === 'neutral' ? `${centerText}. ${neutralMessage}` : `Разом ${centerText}`
          }>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {geometry.kind === 'positive' ? (
              geometry.sectors.map((sector, i) => (
                <Path
                  key={sector.categoryId}
                  d={sectorPath(sector.startAngle, sector.endAngle)}
                  fill={theme.accent}
                  fillOpacity={SECTOR_OPACITY[i] ?? SECTOR_OPACITY.at(-1)}
                />
              ))
            ) : (
              // Neutral ring: no proportional sectors at all — a negative or all-zero total is
              // mathematically misleading as a share-of-total pie (main-screen, "Signed or empty
              // breakdowns never claim false shares").
              <Path
                d={sectorPath(0, 359.999)}
                fill="none"
                stroke={theme.border}
                strokeWidth={OUTER_RADIUS - INNER_RADIUS}
              />
            )}
          </Svg>
          <View style={styles.donutCenter} pointerEvents="none">
            <ThemedText type="title" tabular numberOfLines={1} adjustsFontSizeToFit>
              {centerText}
            </ThemedText>
          </View>
        </View>

        <View style={styles.legend}>
          {presentation.rows.map((row) => (
            <Pressable
              key={row.categoryId}
              onPress={() => onOpenCategory(row.categoryId)}
              accessibilityRole="button"
              accessibilityLabel={row.accessibilityLabel}
              style={styles.legendRow}>
              <ThemedText type="small" numberOfLines={1}>
                {row.name}
              </ThemedText>
              <ThemedText type="small" tabular numberOfLines={1} themeColor="textSecondary">
                {formatMoney(row.amount)}
              </ThemedText>
            </Pressable>
          ))}
          {presentation.remainder ? (
            <Pressable
              onPress={onOpenRemainder}
              accessibilityRole="button"
              accessibilityLabel={presentation.remainder.accessibilityLabel}
              style={styles.legendRow}>
              <ThemedText type="small" numberOfLines={1} themeColor="textSecondary">
                {presentation.remainder.label}
              </ThemedText>
              <ThemedText type="small" tabular numberOfLines={1} themeColor="textSecondary">
                {formatMoney(presentation.remainder.amount)}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
      {geometry.kind === 'neutral' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {neutralMessage}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', gap: Spacing.one },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
  /* flex-start, not center: the legend is taller than the donut whenever it holds more than a
     couple of rows (each is now name-over-amount), and centering the row on the taller legend
     pushed the donut down past where the legend starts — the numbers read as floating above the
     chart rather than beside it. */
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  donutWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', paddingHorizontal: Spacing.two },
  legend: { flex: 1, minWidth: 0, gap: Spacing.two },
  /* Name over its amount, not beside it: beside the donut's fixed diameter, a row wide enough for
     a long Ukrainian category name AND a six-digit сума in one line does not exist on a phone. */
  legendRow: { gap: Spacing.half },
});
