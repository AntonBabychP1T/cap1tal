import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedSwitch } from '@/components/form';
import { Appear, ChangingFigure, Tap } from '@/components/motion';
import { NetWorthChart } from '@/components/net-worth-chart';
import { Card, Chevron, Divider, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { investments as investmentsRepo, netWorth as netWorthRepo, rates as ratesRepo, storedHistory } from '@/db/repos';
import type { Month } from '@/domain/transaction';
import { netWorthSelection, useNetWorthSelection } from '@/hooks/net-worth-selection';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/ui/dates';
import { netWorthSeries, type ChangeDirection } from '@/ui/net-worth';
import { netWorthScreenModel } from '@/ui/net-worth-screen';

/**
 * «Статок» — the whole history of the статок month by month (net-worth-screen spec), pushed from
 * the widget on Головний. Everything it shows is decided in `src/ui/net-worth-screen.ts` under
 * `verify`; this file reads storage once per focus and draws the model.
 *
 * The reading, the period and the view are the shared in-memory selection, so they survive leaving
 * and reopening the screen and Головний reads the same one. «Прогноз» and the selected month are
 * this screen's own state: «Прогноз» is off whenever the screen opens. Nothing here requests
 * anything — the rate refresh is Головний's, as before.
 */
export default function NetWorthScreen() {
  const router = useRouter();
  const selection = useNetWorthSelection();
  const [forecastOn, setForecastOn] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Month>();
  const [chartWidth, setChartWidth] = useState<number>();
  const [explanationOpen, setExplanationOpen] = useState(false);
  // Month names under the chart widen with the system text size (net-worth-screen).
  const { fontScale } = useWindowDimensions();

  const [stored] = useReloadOnFocus(
    useCallback(() => {
      const history = storedHistory.read();
      const now = new Date();
      const today = todayIso(now);
      return {
        today,
        accounts: history.accounts,
        transactions: history.transactions,
        balances: history.balances(),
        currentValues: investmentsRepo.all(),
        monthlyMovement: netWorthRepo.monthlyMovement(today),
        monthlyMovementByType: netWorthRepo.monthlyMovementByType(today),
        firstDates: netWorthRepo.firstDates(today),
        firstDateMovement: netWorthRepo.firstDateMovement(today),
        accountsWithFutureRecords: netWorthRepo.accountsWithFutureRecords(today),
        rates: ratesRepo.all(),
      };
    }, []),
  );

  // Once per data reload and reading; the period, the view and the month only re-slice it.
  const series = useMemo(
    () =>
      netWorthSeries({
        ...stored,
        ...(selection.history ? { requestedHistory: selection.history } : {}),
        now: new Date(),
      }),
    [stored, selection.history],
  );
  const model = useMemo(
    () =>
      netWorthScreenModel({
        series,
        accounts: stored.accounts,
        rates: stored.rates,
        choices: {
          period: selection.period,
          view: selection.view,
          forecast: forecastOn,
          ...(selectedMonth ? { selectedMonth } : {}),
        },
        now: new Date(),
        today: stored.today,
        ...(chartWidth ? { chartWidth } : {}),
        fontScale,
      }),
    [chartWidth, fontScale, forecastOn, selectedMonth, selection.period, selection.view, series, stored.accounts, stored.rates, stored.today],
  );

  const colorOf = (direction: ChangeDirection | undefined) =>
    direction === 'up' ? 'textPositive' : direction === 'down' ? 'textDanger' : 'textSecondary';

  return (
    <Screen>
      <ScreenHeader title="Статок" back={() => router.back()} />

      {model.emptyMessage ? (
        <ThemedText themeColor="textSecondary">{model.emptyMessage}</ThemedText>
      ) : (
        <>
          <ChipRow
            choices={model.choices}
            onSelect={(id) => {
              netWorthSelection.set({ history: id });
              setSelectedMonth(undefined);
            }}
          />
          <ThemedText type="small" themeColor="textMuted" tabular>
            {model.exactLine}
          </ThemedText>

          {model.withheldMessage ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {model.withheldMessage}
              </ThemedText>
            </Card>
          ) : null}

          {model.card ? (
            <Card style={styles.card}>
              <ThemedText type="overline">{model.card.title}</ThemedText>
              <ChangingFigure type="title" tabular numberOfLines={1} adjustsFontSizeToFit>
                {model.card.value}
              </ChangingFigure>
              {model.card.investmentLine ? (
                <ThemedText type="caption" themeColor="textMuted">
                  {model.card.investmentLine}
                </ThemedText>
              ) : null}
              {model.card.futureLine ? (
                <ThemedText type="caption" themeColor="textMuted">
                  {model.card.futureLine}
                </ThemedText>
              ) : null}
              <ThemedText
                type="small"
                themeColor={colorOf(model.card.changeDirection)}
                tabular
                accessibilityLabel={model.card.changeA11yLabel}>
                {model.card.changeText}
              </ThemedText>
              {model.card.breakdown.map((line) => (
                <View key={line.label} style={styles.row}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
                    {line.label}
                  </ThemedText>
                  <ThemedText type="small" tabular>
                    {line.text}
                  </ThemedText>
                </View>
              ))}
            </Card>
          ) : null}

          {model.chart ? (
            <Card style={styles.card}>
              <ChipRow
                choices={model.periods.map((p) => ({ ...p, id: String(p.id) }))}
                onSelect={(id) => {
                  netWorthSelection.set({ period: id === 'all' ? 'all' : (Number(id) as 6 | 12 | 24) });
                  setSelectedMonth(undefined);
                }}
              />
              <ChipRow
                choices={model.views}
                onSelect={(id) => netWorthSelection.set({ view: id as typeof selection.view })}
              />
              <NetWorthChart
                chart={model.chart}
                view={selection.view}
                onSelect={(index) => setSelectedMonth(model.chart!.months[index])}
                onWidth={setChartWidth}
              />
              {model.forecastSwitch ? (
                <View style={styles.row}>
                  <ThemedText type="small" style={styles.grow}>
                    Прогноз
                  </ThemedText>
                  <ThemedSwitch
                    value={model.forecastSwitch.on}
                    onValueChange={setForecastOn}
                    accessibilityLabel="Прогноз"
                  />
                </View>
              ) : null}
              {model.forecastCaption ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  {model.forecastCaption}
                </ThemedText>
              ) : null}
              {model.forecastWithheld ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  {model.forecastWithheld}
                </ThemedText>
              ) : null}
            </Card>
          ) : null}

          {model.summary ? (
            <Card style={styles.card}>
              <ThemedText type="overline">{model.summary.period}</ThemedText>
              {[model.summary.change, model.summary.average, model.summary.best, model.summary.worst, model.summary.cutNote]
                .filter((line): line is string => line !== undefined)
                .map((line) => (
                  <ThemedText key={line} type="small" themeColor="textSecondary" tabular>
                    {line}
                  </ThemedText>
                ))}
            </Card>
          ) : null}

          {model.table.length > 0 ? (
            <>
              <SectionLabel>Місяці</SectionLabel>
              <ListCard>
                {model.table.map((row, i) => (
                  <Tap
                    key={row.month}
                    onPress={() => setSelectedMonth(row.month)}
                    accessibilityRole="button"
                    accessibilityLabel={row.accessibilityLabel}
                    accessibilityState={{ selected: row.selected }}>
                    <ListRow last={i === model.table.length - 1} style={styles.tableRow}>
                      <View style={styles.grow}>
                        <ThemedText type="small" themeColor={row.selected ? 'accent' : undefined}>
                          {row.label}
                        </ThemedText>
                        {row.note ? (
                          <ThemedText type="caption" themeColor="textMuted">
                            {row.note}
                          </ThemedText>
                        ) : null}
                      </View>
                      <View style={styles.amounts}>
                        <ThemedText type="small" tabular>
                          {row.value}
                        </ThemedText>
                        {row.change ? (
                          <ThemedText type="caption" themeColor={colorOf(row.direction)} tabular>
                            {row.change}
                          </ThemedText>
                        ) : null}
                      </View>
                    </ListRow>
                  </Tap>
                ))}
              </ListCard>
            </>
          ) : null}

          <Divider />
          <Tap
            onPress={() => setExplanationOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: explanationOpen }}
            style={styles.toggle}>
            <ThemedText type="small" themeColor="accent">
              {explanationOpen ? 'Сховати пояснення' : 'Пояснення'}
            </ThemedText>
          </Tap>
          {explanationOpen ? (
            <Appear style={styles.card}>
              {model.explanation.lines.map((line) => (
                <View key={line.accountId} style={styles.row}>
                  <View style={styles.grow}>
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
              <ThemedText type="small" themeColor="textSecondary">
                {model.explanation.accountsDifference}
              </ThemedText>
              <ThemedText
                type="caption"
                themeColor="textMuted"
                accessibilityLabel={model.explanation.captionAccessibilityLabel}>
                {model.explanation.caption}
              </ThemedText>
              {model.explanation.rateFreshness ? (
                <ThemedText type="caption" themeColor="textMuted">
                  {model.explanation.rateFreshness}
                </ThemedText>
              ) : null}
              <Tap onPress={() => router.push('/accounts')} accessibilityRole="button" style={styles.toggle}>
                <ThemedText type="small" themeColor="accent">
                  Рахунки
                </ThemedText>
                <Chevron />
              </Tap>
            </Appear>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** A row of chips: each a 48 dp target, the pill inside it what is drawn, wrapping on 360 dp. */
function ChipRow({
  choices,
  onSelect,
}: {
  readonly choices: readonly {
    readonly id: string;
    readonly label: string;
    readonly accessibilityLabel: string;
    readonly selected: boolean;
  }[];
  readonly onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  if (choices.length < 2) return null;
  return (
    <View style={styles.chips}>
      {choices.map((choice) => (
        <Tap
          key={choice.id}
          onPress={() => onSelect(choice.id)}
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
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: TouchTarget },
  grow: { flex: 1 },
  amounts: { alignItems: 'flex-end' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: TouchTarget },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half, minHeight: TouchTarget },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chipTarget: { minHeight: TouchTarget, minWidth: TouchTarget, justifyContent: 'center', alignItems: 'center' },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
});
