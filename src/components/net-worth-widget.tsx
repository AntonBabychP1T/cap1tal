import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { historyGeometry } from '@/ui/dashboard-charts';
import type { NetWorthWidgetModel } from '@/ui/net-worth';
import { Appear, ChangingFigure, MorphLine, Reflow, Swap, Tap } from './motion';
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

/**
 * The chevron beside a show/hide toggle, pointing where the list will go: down while it is shut,
 * up once it is open. A fixed `›` read the same in both states — QA found «Сховати точки» with the
 * same glyph as «Показати точки», so only the words said the list was open. `Chevron` itself is
 * the navigation `›` every row on Рахунки ends in; turned, it is the same glyph at the same weight.
 */
function DisclosureChevron({ open }: { readonly open: boolean }) {
  return (
    <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
      <Chevron />
    </View>
  );
}

export function NetWorthWidget({
  model,
  onSelectHistory,
  onOpenAccounts,
}: {
  readonly model: NetWorthWidgetModel;
  /** A currency code or the combined «Усе ≈ грн» id — the model's `historyChoices` say which. */
  readonly onSelectHistory: (choice: string) => void;
  readonly onOpenAccounts: () => void;
}) {
  const theme = useTheme();
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  /** The chart spans the card: measured, because a fixed 280 left a wide card's right third empty. */
  const [chartWidth, setChartWidth] = useState(FALLBACK_CHART_WIDTH);
  // Once per history, so the line morphs only when what it draws has changed.
  const geometry = useMemo(() => historyGeometry(model.historySeries), [model.historySeries]);

  if (model.emptyMessage) {
    return (
      <Card>
        <ThemedText type="overline">Статок</ThemedText>
        <ThemedText themeColor="textSecondary">{model.emptyMessage}</ThemedText>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <ThemedText type="overline">Статок</ThemedText>
        <Tap onPress={onOpenAccounts} accessibilityRole="button" style={styles.accountsLink}>
          <ThemedText type="small" themeColor="accent">
            Рахунки
          </ThemedText>
          <Chevron />
        </Tap>
      </View>

      {model.readouts.map((readout, i) => (
        // One figure per currency, so a UAH change leaves USD and EUR still (motion, "Only the
        // currency that changed moves").
        <ChangingFigure
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
        </ChangingFigure>
      ))}
      {model.approximate.status === 'available' ? (
        <ThemedText type="small" themeColor="textMuted" tabular>
          {model.approximate.text}
        </ThemedText>
      ) : null}

      {model.historyChoices.length > 1 ? (
        <View style={styles.chips}>
          {model.historyChoices.map((choice) => (
            // The `Tap` is the 48 dp touch target, the pill inside it is what is drawn — the
            // same split as the category widget's chips (`chipTarget` there).
            <Tap
              key={choice.id}
              onPress={() => onSelectHistory(choice.id)}
              accessibilityRole="button"
              accessibilityLabel={choice.accessibilityLabel}
              accessibilityState={{ selected: choice.selected }}
              style={styles.chipTarget}>
              <View style={[styles.chip, choice.selected ? { backgroundColor: theme.accentSurface } : null]}>
                <ThemedText type="small" themeColor={choice.selected ? 'accent' : 'textSecondary'}>
                  {choice.label}
                </ThemedText>
              </View>
            </Tap>
          ))}
        </View>
      ) : null}

      {/* A message and the chart replace each other with a cross-fade (motion, "A chart moves
          from its old shape to its new one"); the chart itself morphs. */}
      {model.historyUnavailableMessage ? (
        <Swap key="unavailable">
          <ThemedText type="small" themeColor="textSecondary">
            {model.historyUnavailableMessage}
          </ThemedText>
        </Swap>
      ) : model.historyWithheldMessage ? (
        // The combined history has no rate to convert at: nothing else of it is drawn, and the
        // currency choices above still read their own histories.
        <Swap key="withheld">
          <ThemedText type="small" themeColor="textSecondary">
            {model.historyWithheldMessage}
          </ThemedText>
        </Swap>
      ) : (
        <Swap key="chart" style={styles.card}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel={model.historyCaptionAccessibilityLabel}>
            {model.historyCaption}
          </ThemedText>
          {model.historyRateFreshness ? (
            <ThemedText type="caption" themeColor="textMuted">
              {model.historyRateFreshness}
            </ThemedText>
          ) : null}
          <View
            accessible
            accessibilityLabel={model.historyChartLabel}
            onLayout={({ nativeEvent }) => {
              const width = Math.round(nativeEvent.layout.width);
              if (width > 0 && width !== chartWidth) setChartWidth(width);
            }}>
            {/* Only the line moves: the caption, the span and the points are the new history's own
                text from the moment it changes. */}
            <MorphLine
              geometry={geometry}
              width={chartWidth}
              height={CHART_HEIGHT}
              color={theme.accent}
              strokeWidth={2}
            />
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

          <Tap
            onPress={() => setPointsOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: pointsOpen }}
            style={styles.toggleRow}>
            <ThemedText type="small" themeColor="accent">
              {pointsOpen ? 'Сховати точки' : 'Показати точки'}
            </ThemedText>
            <DisclosureChevron open={pointsOpen} />
          </Tap>
          {pointsOpen ? (
            <Appear style={styles.pointsList}>
              {model.historyPoints.map((point) => (
                <ThemedText key={point.key} type="small" themeColor="textSecondary">
                  {point.label}
                </ThemedText>
              ))}
            </Appear>
          ) : null}
        </Swap>
      )}

      {/* Moves down with the points list opening above it rather than jumping. */}
      <Reflow style={styles.card}>
        <Divider />
        <Tap
          onPress={() => setExplanationOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: explanationOpen }}
          style={styles.toggleRow}>
          <ThemedText type="small" themeColor="accent">
            {explanationOpen ? 'Сховати пояснення' : 'Пояснення'}
          </ThemedText>
          <DisclosureChevron open={explanationOpen} />
        </Tap>
        {explanationOpen ? (
          <Appear style={styles.explanation}>
            <ThemedText type="small" themeColor="textSecondary">
              {model.accountsDifference}
            </ThemedText>
            {model.explanation.map((line) => (
              <View key={line.accountId} style={styles.explanationRow}>
                {/* The basis under the name, not in a third column: most рахунки have none, and a
                    column that is empty on most rows pushed every сума to a different edge. */}
                <View style={styles.explanationName}>
                  {/* Two lines: at a large font a рахунок's name cut to one reads as its neighbour's. */}
                  <ThemedText type="small" numberOfLines={2}>
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
          </Appear>
        ) : null}
      </Reflow>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // «Рахунки ›» is a link, but still a 48 dp target (the row grows to it, the text does not).
  accountsLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half, minHeight: TouchTarget },
  chips: { flexDirection: 'row', gap: Spacing.one },
  chipTarget: { minHeight: TouchTarget, minWidth: TouchTarget, justifyContent: 'center', alignItems: 'center' },
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
    minHeight: TouchTarget,
  },
  pointsList: { gap: Spacing.half },
  span: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  explanation: { gap: Spacing.two - Spacing.half },
  explanationRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'baseline' },
  explanationName: { flex: 1 },
});
