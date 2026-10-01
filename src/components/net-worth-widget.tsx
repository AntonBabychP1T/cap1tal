import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { historyGeometry } from '@/ui/dashboard-charts';
import type { NetWorthWidgetModel } from '@/ui/net-worth';
import { ChangingFigure, MorphLine, Swap, Tap } from './motion';
import { Card, Chevron } from './surfaces';
import { ThemedText } from './themed-text';

/**
 * «Статок» on Головний, compact (main-screen, "The Статок widget is a compact summary that opens
 * «Статок»"): the headline, every exact currency on one line, the change since the preceding
 * month-end, the investment line and a twelve-month chart with each month named under it. The
 * whole card is one button opening the «Статок» screen, which holds the selector, the explanation
 * and everything else. Every word and number is `netWorthWidgetModel`'s.
 */

/** The width the chart is drawn at before the card has measured itself. */
const FALLBACK_CHART_WIDTH = 280;
const CHART_HEIGHT = 72;

export function NetWorthWidget({
  model,
  onOpen,
}: {
  readonly model: NetWorthWidgetModel;
  /** Opens the «Статок» screen on the same selection. */
  readonly onOpen: () => void;
}) {
  const theme = useTheme();
  /** The chart spans the card: measured, because a fixed width left a wide card's right third empty. */
  const [chartWidth, setChartWidth] = useState(FALLBACK_CHART_WIDTH);
  // Each month at the centre of its own column, so the line's points sit over their names.
  const geometry = useMemo(
    () =>
      historyGeometry(
        model.chartValues.map((value, i) => ({ x: (i + 0.5) / model.chartValues.length, value })),
      ),
    [model.chartValues],
  );

  if (model.emptyMessage) {
    return (
      <Card>
        <ThemedText type="overline">Статок</ThemedText>
        <ThemedText themeColor="textSecondary">{model.emptyMessage}</ThemedText>
      </Card>
    );
  }

  const changeColor =
    model.changeDirection === 'up'
      ? 'textPositive'
      : model.changeDirection === 'down'
        ? 'textDanger'
        : 'textSecondary';

  return (
    <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={model.accessibilityLabel}>
      <Card style={styles.card}>
        <View style={styles.head} importantForAccessibility="no-hide-descendants">
          <ThemedText type="overline">Статок</ThemedText>
          <Chevron />
        </View>
        <View style={styles.card} importantForAccessibility="no-hide-descendants">
          {model.headline ? (
            <ChangingFigure type="title" tabular numberOfLines={1} adjustsFontSizeToFit>
              {model.headline}
            </ChangingFigure>
          ) : null}
          {/* Every exact currency on one line, one figure each, so a UAH change leaves USD and EUR
              still (motion, "Only the currency that changed moves"). */}
          <View style={styles.exact}>
            {model.readouts.map((readout, i) => (
              <ChangingFigure
                key={readout.currency}
                type="small"
                themeColor={readout.available ? 'textMuted' : 'textDanger'}
                tabular>
                {i === 0 ? readout.text : `· ${readout.text}`}
              </ChangingFigure>
            ))}
          </View>
          {model.withheldMessage ? (
            // The combined history has no rate to convert at: no chart and no change are drawn.
            <Swap key="withheld">
              <ThemedText type="small" themeColor="textSecondary">
                {model.withheldMessage}
              </ThemedText>
            </Swap>
          ) : (
            <Swap key="chart" style={styles.card}>
              {model.changeText ? (
                <ThemedText type="small" themeColor={changeColor} tabular>
                  {model.changeText}
                </ThemedText>
              ) : null}
              {model.investmentLine ? (
                <ThemedText type="caption" themeColor="textMuted">
                  {model.investmentLine}
                </ThemedText>
              ) : null}
              {model.futureLine ? (
                <ThemedText type="caption" themeColor="textMuted">
                  {model.futureLine}
                </ThemedText>
              ) : null}
              <View
                onLayout={({ nativeEvent }) => {
                  const width = Math.round(nativeEvent.layout.width);
                  if (width > 0 && width !== chartWidth) setChartWidth(width);
                }}>
                <MorphLine
                  geometry={geometry}
                  width={chartWidth}
                  height={CHART_HEIGHT}
                  color={theme.accent}
                  strokeWidth={2}
                />
                <View style={styles.ticks}>
                  {model.chartTicks.map((tick) => (
                    <ThemedText
                      key={tick.index}
                      type="caption"
                      themeColor={tick.current ? 'accent' : 'textMuted'}
                      numberOfLines={1}
                      style={styles.tick}>
                      {tick.text}
                    </ThemedText>
                  ))}
                </View>
              </View>
            </Swap>
          )}
        </View>
      </Card>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exact: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.one },
  ticks: { flexDirection: 'row', marginTop: Spacing.half },
  tick: { flex: 1, textAlign: 'center' },
});
