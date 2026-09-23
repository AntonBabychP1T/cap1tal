import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { historyGeometry } from '@/ui/dashboard-charts';
import type { NetWorthWidgetModel } from '@/ui/net-worth';
import { Card, Chevron, Divider } from './surfaces';
import { ThemedText } from './themed-text';

/**
 * «Статок»: current per-currency values, the ≈ UAH approximation, the compact history and its
 * basis explanation, and the link to Рахунки (main-screen, "Статок exposes its basis beside its
 * chart"). Every number is `netWorthWidgetModel`'s; this file draws it and holds only the two
 * pieces of state that belong to a screen — which currency the history reads, and whether the
 * explanation/point list are expanded.
 */

/** The width the chart is drawn at before the card has measured itself. */
const FALLBACK_CHART_WIDTH = 280;
const CHART_HEIGHT = 96;

function chartPath(series: ReturnType<typeof historyGeometry>, width: number): string {
  return series.segments
    .map((segment) =>
      segment
        .map((p, i) => {
          const x = p.x * width;
          const y = CHART_HEIGHT - p.y * CHART_HEIGHT;
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' '),
    )
    .join(' ');
}

export function NetWorthWidget({
  model,
  onSelectHistoryCurrency,
  onOpenAccounts,
}: {
  readonly model: NetWorthWidgetModel;
  readonly onSelectHistoryCurrency: (currency: string) => void;
  readonly onOpenAccounts: () => void;
}) {
  const theme = useTheme();
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  /** The chart spans the card: measured, because a fixed 280 left a wide card's right third empty. */
  const [chartWidth, setChartWidth] = useState(FALLBACK_CHART_WIDTH);

  if (model.emptyMessage) {
    return (
      <Card>
        <ThemedText type="overline">Статок</ThemedText>
        <ThemedText themeColor="textSecondary">{model.emptyMessage}</ThemedText>
      </Card>
    );
  }

  const geometry = historyGeometry(model.historySeries);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <ThemedText type="overline">Статок</ThemedText>
        <Pressable onPress={onOpenAccounts} accessibilityRole="button" style={styles.accountsLink}>
          <ThemedText type="small" themeColor="accent">
            Рахунки
          </ThemedText>
          <Chevron />
        </Pressable>
      </View>

      {model.readouts.map((readout, i) => (
        <ThemedText
          key={readout.currency}
          // `title` is the one number a screen leads with; a рахунок in every currency the owner
          // holds is several numbers, so only the first (UAH first, `currencyReadouts`' own order)
          // gets it and the rest read one step under, same as a screen that also says something
          // else (`hero`'s own doc comment).
          type={i === 0 ? 'title' : 'hero'}
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          themeColor={readout.available ? undefined : 'textDanger'}>
          {readout.text}
        </ThemedText>
      ))}
      {model.approximate.status === 'available' ? (
        <ThemedText type="small" themeColor="textMuted" tabular>
          {model.approximate.text}
        </ThemedText>
      ) : null}

      {model.historyCurrencies.length > 1 ? (
        <View style={styles.chips}>
          {model.historyCurrencies.map((currency) => (
            <Pressable
              key={currency}
              onPress={() => onSelectHistoryCurrency(currency)}
              accessibilityRole="button"
              accessibilityLabel={currency === model.historyCurrency ? `${currency}, обрано` : currency}
              accessibilityState={{ selected: currency === model.historyCurrency }}
              style={[
                styles.chip,
                currency === model.historyCurrency ? { backgroundColor: theme.accentSurface } : null,
              ]}>
              <ThemedText
                type="small"
                themeColor={currency === model.historyCurrency ? 'accent' : 'textSecondary'}>
                {currency}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {model.historyUnavailableMessage ? (
        <ThemedText type="small" themeColor="textSecondary">
          {model.historyUnavailableMessage}
        </ThemedText>
      ) : (
        <>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel="Історія розрахункових балансів, інвестиції за вкладеним">
            Історія розрахункових балансів · інвестиції за вкладеним
          </ThemedText>
          <View
            accessible
            accessibilityLabel={
              model.historySpan
                ? `Графік історії статку, з ${model.historySpan.first} по ${model.historySpan.last}`
                : 'Графік історії статку'
            }
            onLayout={({ nativeEvent }) => {
              const width = Math.round(nativeEvent.layout.width);
              if (width > 0 && width !== chartWidth) setChartWidth(width);
            }}>
            <Svg width={chartWidth} height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}>
              <Path
                d={chartPath(geometry, chartWidth)}
                fill="none"
                stroke={theme.accent}
                strokeWidth={2}
              />
            </Svg>
            {/* The span the line covers, so an empty stretch reads as «no data then» rather than
                as a chart that failed to draw. */}
            {model.historySpan ? (
              <View style={styles.span}>
                <ThemedText type="caption" themeColor="textMuted">
                  {model.historySpan.first}
                </ThemedText>
                <ThemedText type="caption" themeColor="textMuted">
                  {model.historySpan.last}
                </ThemedText>
              </View>
            ) : null}
          </View>
          {model.changeText ? (
            <ThemedText type="small" themeColor="textSecondary">
              {model.changeText}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={() => setPointsOpen((open) => !open)}
            accessibilityRole="button"
            style={styles.toggleRow}>
            <ThemedText type="small" themeColor="accent">
              {pointsOpen ? 'Сховати точки' : 'Показати точки'}
            </ThemedText>
            <Chevron />
          </Pressable>
          {pointsOpen ? (
            <View style={styles.pointsList}>
              {model.historyPoints.map((point) => (
                <ThemedText key={point.key} type="small" themeColor="textSecondary">
                  {point.label}
                </ThemedText>
              ))}
            </View>
          ) : null}
        </>
      )}

      <Divider />
      <Pressable
        onPress={() => setExplanationOpen((open) => !open)}
        accessibilityRole="button"
        style={styles.toggleRow}>
        <ThemedText type="small" themeColor="accent">
          {explanationOpen ? 'Сховати пояснення' : 'Пояснення'}
        </ThemedText>
        <Chevron />
      </Pressable>
      {explanationOpen ? (
        <View style={styles.explanation}>
          <ThemedText type="small" themeColor="textSecondary">
            {model.accountsDifference}
          </ThemedText>
          {model.explanation.map((line) => (
            <View key={line.accountId} style={styles.explanationRow}>
              {/* The basis under the name, not in a third column: most рахунки have none, and a
                  column that is empty on most rows pushed every сума to a different edge. */}
              <View style={styles.explanationName}>
                <ThemedText type="small" numberOfLines={1}>
                  {line.name}
                </ThemedText>
                {line.basis ? (
                  <ThemedText type="caption" themeColor="textMuted">
                    {line.basis}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="small" tabular>
                {line.amount}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accountsLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
  chips: { flexDirection: 'row', gap: Spacing.one },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    minHeight: 44,
  },
  pointsList: { gap: Spacing.half },
  span: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  explanation: { gap: Spacing.two - Spacing.half },
  explanationRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'baseline' },
  explanationName: { flex: 1 },
});
