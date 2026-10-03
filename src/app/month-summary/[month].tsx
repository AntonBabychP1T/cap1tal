import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ObservationsList } from '@/components/observations-list';
import { Tap } from '@/components/motion';
import { Card, Chevron, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  categories as categoriesRepo,
  duplicateAnswers as duplicateAnswersRepo,
  goals as goalsRepo,
  limits as limitsRepo,
  netWorth as netWorthRepo,
  notifications as notificationsRepo,
  storedHistory,
} from '@/db/repos';
import { monthOf } from '@/domain/transaction';
import { answerNotDuplicate } from '@/hooks/observations-reads';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { monthSummaryOf } from '@/month-summary/summary';
import { todayIso } from '@/ui/dates';
import { monthSummaryRoute, monthSummaryScreen, type SummaryRow } from '@/ui/month-summary-screen';
import { netWorthFigures } from '@/ui/net-worth';

import { Spacing } from '@/constants/theme';

/**
 * «Підсумок <місяця>» (month-summary-screen): one finished month read as a whole, pushed over the
 * tab it was opened from — Місяць, Звіти or Головний — and left with back.
 *
 * It re-reads the stored state on focus, so a транзакція categorised from here and returned from is
 * no longer counted «Без категорії». It writes nothing but a «Не дубль» the owner gives in place,
 * and requests nothing. Every number is `monthSummaryOf`'s, every word `monthSummaryScreen`'s;
 * «AI-аналіз <місяця>» is a route — nothing is built or handed over from here.
 */
export default function MonthSummaryScreen() {
  const router = useRouter();
  const { month: param } = useLocalSearchParams<{ month?: string }>();

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const today = todayIso(new Date());
      // The whole stored history through the stamp memo Головний, Місяць and Звіти share.
      const history = storedHistory.read();
      const route = monthSummaryRoute(param, today, new Set(history.months));
      if (route.status !== 'available') {
        return { today, route, summary: null };
      }
      const accounts = history.accounts;
      const summary = monthSummaryOf({
        month: route.month,
        today,
        transactions: history.transactions,
        accounts,
        categories: categoriesRepo.list(),
        limits: limitsRepo.list(),
        goals: goalsRepo.list(),
        waitingDrafts: notificationsRepo.pendingDrafts().filter((d) => monthOf(d.date) === route.month).length,
        // «Статок»'s own month-by-month reading, from the same bounded reads that screen makes.
        figures: netWorthFigures({
          accounts,
          monthlyMovement: netWorthRepo.monthlyMovement(today),
          monthlyMovementByType: netWorthRepo.monthlyMovementByType(today),
          firstDates: netWorthRepo.firstDates(today),
          firstDateMovement: netWorthRepo.firstDateMovement(today),
          today,
        }),
        answers: duplicateAnswersRepo.list(),
      });
      return {
        today,
        route,
        summary,
        names: {
          categoryNames: new Map(categoriesRepo.list().map((c) => [c.id, c.name])),
          accountNames: new Map(accounts.map((a) => [a.id, a.name])),
        },
      };
    }, [param]),
  );

  const screen = useMemo(
    () =>
      stored.summary && stored.names
        ? monthSummaryScreen(stored.summary, { ...stored.names, now: new Date() }, stored.today)
        : null,
    [stored],
  );

  const open = (route: string) => router.push(route);

  if (!screen) {
    return (
      <Screen>
        <ScreenHeader title={stored.route.title} back={() => router.back()} />
        <ThemedText themeColor="textSecondary">
          {stored.route.status === 'available' ? '' : stored.route.sentence}
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={screen.title} back={() => router.back()} />
      {screen.sections.map((section) => (
        <View key={section.key} style={styles.section}>
          <SectionLabel>{section.title}</SectionLabel>
          {section.observations && section.observations.length > 0 ? (
            <ObservationsList
              lines={section.observations}
              onOpen={open}
              onNotDuplicate={(pair) => {
                // Stored at once; the reload re-derives the підсумок without the pair, in place.
                answerNotDuplicate(pair);
                reload();
              }}
            />
          ) : null}
          {section.empty ? (
            <ThemedText type="small" themeColor="textSecondary">
              {section.empty}
            </ThemedText>
          ) : null}
          {section.groups.map((group) => (
            <Fragment key={group.key}>
              {group.currency && section.groups.length > 1 ? (
                <ThemedText type="overline" themeColor="textSecondary">
                  {group.currency}
                </ThemedText>
              ) : null}
              {group.note ? (
                <Card>
                  <ThemedText type="small" themeColor="textSecondary">
                    {group.note}
                  </ThemedText>
                </Card>
              ) : null}
              {group.rows.length > 0 ? (
                <ListCard>
                  {group.rows.map((row, index) => (
                    <ListRow key={row.key} last={index === group.rows.length - 1}>
                      <SummaryLine row={row} onOpen={open} />
                    </ListRow>
                  ))}
                </ListCard>
              ) : null}
            </Fragment>
          ))}
        </View>
      ))}
    </Screen>
  );
}

/** One row: a button when it leads somewhere, its words otherwise — announced either way. */
function SummaryLine({ row, onOpen }: { row: SummaryRow; onOpen: (route: string) => void }) {
  const body = (
    <View style={styles.line}>
      <View style={styles.text}>
        <View style={styles.head}>
          <ThemedText style={styles.label}>{row.label}</ThemedText>
          {row.value ? (
            <ThemedText tabular style={styles.value}>
              {row.value}
            </ThemedText>
          ) : null}
        </View>
        {row.detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {row.detail}
          </ThemedText>
        ) : null}
        {/* A mark is said in words — «перевищено на …», «2 % або більше» — never by colour alone. */}
        {row.mark ? (
          <ThemedText type="smallBold" themeColor="textSecondary">
            {row.mark}
          </ThemedText>
        ) : null}
      </View>
      {row.route ? <Chevron /> : null}
    </View>
  );
  return row.route ? (
    <Tap
      onPress={() => onOpen(row.route!)}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      style={styles.row}>
      {body}
    </Tap>
  ) : (
    <View accessible accessibilityLabel={row.accessibilityLabel} style={styles.row}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  row: { paddingVertical: Spacing.twoHalf },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  text: { flex: 1, gap: Spacing.half },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: Spacing.two },
  label: { flexShrink: 1 },
  value: { flexShrink: 0 },
});
