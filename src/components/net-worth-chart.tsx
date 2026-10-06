import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Line, Path, Rect, Svg } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { barGeometry, forecastGeometry, lineRuns, linePath, scaled, valueScale } from '@/ui/dashboard-charts';
import { FALLBACK_CHART_WIDTH, type HistoryView, type ScreenChart } from '@/ui/net-worth-screen';
import { Tap } from './motion';
import { ThemedText } from './themed-text';

/**
 * The «Статок» screen's month chart (net-worth-screen, "Every month is named and its direction
 * readable without colour", "«Прогноз» is off until asked and visibly not history"): «Стовпці» and
 * «Зміна» as bars from a visible zero line, «Лінія» as a line with a dot per month, the forecast
 * dashed (or outlined bars) over a band, after today. Every month is a touch target of its own
 * column, and the month table below reaches every one of them too. All geometry is
 * `dashboard-charts.ts`'s; this file only draws it.
 */

const HEIGHT = 160;

export function NetWorthChart({
  chart,
  view,
  onSelect,
  onWidth,
}: {
  readonly chart: ScreenChart;
  readonly view: HistoryView;
  readonly onSelect: (index: number) => void;
  /** The measured width, so the model can name only as many months as fit it. */
  readonly onWidth?: (width: number) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(FALLBACK_CHART_WIDTH);
  const forecast = chart.forecast;
  const slots = chart.values.length + (forecast ? forecast.values.length : 0);
  const slot = width / Math.max(slots, 1);

  const drawing = useMemo(() => {
    const bars = view !== 'line';
    const projected = forecast
      ? forecast.values.map((value, i) => ({ value, low: forecast.lows[i]!, high: forecast.highs[i]! }))
      : [];
    const shared = forecastGeometry(chart.values, projected, bars);
    const scale = forecast ? shared.scale : valueScale(chart.values, bars);
    return { bars, scale, shared, geometry: barGeometry(chart.values, scale) };
  }, [chart.values, forecast, view]);

  const y = (normalized: number) => HEIGHT - normalized * HEIGHT;
  const zeroY = y(drawing.geometry.zero);
  const barWidth = Math.max(2, slot * 0.6);
  const xOf = (index: number) => (index + 0.5) * slot;

  return (
    <View
      accessible
      accessibilityLabel={chart.accessibilityLabel}
      onLayout={({ nativeEvent }) => {
        const measured = Math.round(nativeEvent.layout.width);
        if (measured > 0 && measured !== width) {
          setWidth(measured);
          onWidth?.(measured);
        }
      }}>
      <View style={{ height: HEIGHT }}>
        <Svg width={width} height={HEIGHT}>
          {forecast ? (
            // The range of «Прогноз», faint, behind everything recorded.
            <Path
              d={bandPath(drawing.shared.projected, chart.values.length, slot, y)}
              fill={theme.accent}
              fillOpacity={0.12}
            />
          ) : null}
          {drawing.bars ? (
            <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={theme.textMuted} strokeWidth={1} />
          ) : null}
          {drawing.bars
            ? drawing.geometry.bars.map((bar) => {
                if (!bar) return null;
                const value = chart.values[bar.index]!;
                const selected = bar.index === chart.selectedIndex;
                const color =
                  view === 'change'
                    ? value < 0
                      ? theme.textDanger
                      : theme.textPositive
                    : theme.accent;
                return (
                  <Rect
                    key={bar.index}
                    x={xOf(bar.index) - barWidth / 2}
                    y={y(bar.top)}
                    width={barWidth}
                    height={Math.max(1, y(bar.bottom) - y(bar.top))}
                    fill={color}
                    fillOpacity={selected ? 1 : 0.55}
                  />
                );
              })
            : null}
          {!drawing.bars ? (
            <Path
              d={linePath(lineRuns(chart.values.map((v) => (v === undefined ? undefined : scaled(v, drawing.scale))), slots), width, HEIGHT)}
              stroke={theme.accent}
              strokeWidth={2}
              fill="none"
            />
          ) : null}
          {!drawing.bars
            ? chart.values.map((v, i) =>
                v === undefined ? null : (
                  <Circle
                    key={i}
                    cx={xOf(i)}
                    cy={y(scaled(v, drawing.scale))}
                    r={i === chart.selectedIndex ? 4 : 2.5}
                    fill={theme.accent}
                  />
                ),
              )
            : null}
          {forecast
            ? drawing.bars
              ? drawing.shared.projected.map((p, i) => {
                  const index = chart.values.length + i;
                  const zero = drawing.geometry.zero;
                  return (
                    <Rect
                      key={`f${i}`}
                      x={xOf(index) - barWidth / 2}
                      y={y(Math.max(zero, p.value))}
                      width={barWidth}
                      height={Math.max(1, Math.abs(y(p.value) - y(zero)))}
                      fill="none"
                      stroke={theme.accent}
                      strokeDasharray="3 3"
                    />
                  );
                })
              : (
                <Path
                  d={forecastLine(chart, drawing.shared, slot, y)}
                  stroke={theme.accent}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  fill="none"
                />
              )
            : null}
          {chart.entryIndexes.map((index) => (
            // «нові рахунки»: a ring under the month a рахунок entered in.
            <Circle
              key={`e${index}`}
              cx={xOf(index)}
              cy={HEIGHT - 4}
              r={3}
              stroke={theme.textSecondary}
              strokeWidth={1.5}
              fill="none"
            />
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.targets]}>
          {chart.values.map((_, index) => (
            <Tap
              key={index}
              onPress={() => onSelect(index)}
              accessibilityRole="button"
              accessibilityLabel={chart.monthLabels[index]}
              accessibilityState={{ selected: index === chart.selectedIndex }}
              style={{ width: slot }}
            />
          ))}
        </View>
      </View>
      <View style={styles.ticks} importantForAccessibility="no-hide-descendants">
        {chart.ticks.map((tick) => (
          <ThemedText
            key={tick.index}
            type="caption"
            themeColor={tick.index === chart.selectedIndex || tick.current ? 'accent' : 'textMuted'}
            numberOfLines={1}
            style={[styles.tick, { left: xOf(tick.index) - 20 }]}>
            {tick.text}
          </ThemedText>
        ))}
      </View>
      {chart.entryIndexes.length > 0 || forecast ? (
        <View style={styles.legend} importantForAccessibility="no-hide-descendants">
          {chart.entryIndexes.length > 0 ? (
            <ThemedText type="caption" themeColor="textMuted">
              ○ нові рахунки
            </ThemedText>
          ) : null}
          {forecast ? (
            <ThemedText type="caption" themeColor="textMuted">
              - - - прогноз
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The band of «Прогноз»: from the last recorded month along the highs and back along the lows. */
function bandPath(
  projected: readonly { readonly low: number; readonly high: number }[],
  offset: number,
  slot: number,
  y: (normalized: number) => number,
): string {
  if (projected.length === 0) return '';
  const xOf = (i: number) => (offset + i + 0.5) * slot;
  const highs = projected.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${y(p.high)}`);
  const lows = [...projected].reverse().map((p, i) => `L ${xOf(projected.length - 1 - i)} ${y(p.low)}`);
  return [...highs, ...lows, 'Z'].join(' ');
}

/** The dashed continuation, starting at today's recorded point. */
function forecastLine(
  chart: ScreenChart,
  shared: ReturnType<typeof forecastGeometry>,
  slot: number,
  y: (normalized: number) => number,
): string {
  const last = shared.recorded.at(-1);
  const start = last === undefined ? [] : [`M ${(chart.values.length - 0.5) * slot} ${y(last)}`];
  const points = shared.projected.map(
    (p, i) => `${start.length === 0 && i === 0 ? 'M' : 'L'} ${(chart.values.length + i + 0.5) * slot} ${y(p.value)}`,
  );
  return [...start, ...points].join(' ');
}

const styles = StyleSheet.create({
  targets: { flexDirection: 'row' },
  ticks: { height: 18, marginTop: Spacing.half },
  tick: { position: 'absolute', width: 40, textAlign: 'center' },
  legend: { flexDirection: 'row', gap: Spacing.two },
});
