import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Card,
  Chevron,
  Divider,
  IconTile,
  Meter,
  Screen,
  SectionLabel,
} from '@/components/surfaces';
import { ChangingFigure, SteppedBody, TabFade, Tap } from '@/components/motion';
import { RowAction } from '@/components/form';
import { ObservationsList } from '@/components/observations-list';
import { ThemedText } from '@/components/themed-text';
import {
  accounts as accountsRepo,
  categories as categoriesRepo,
  commitments as commitmentsRepo,
  installments as installmentsRepo,
  limits as limitsRepo,
  rates as ratesRepo,
  transactions as transactionsRepo,
} from '@/db/repos';
import { namesById } from '@/domain/category';
import { NO_COMMITMENT_FACTS } from '@/domain/commitments';
import { NO_INSTALLMENT_FACTS } from '@/domain/installments';
import { settleInstallmentsOnFocus } from '@/hooks/installment-ports';
import { useHaptics } from '@/hooks/haptics-ports';
import { useCurrentRates } from '@/hooks/use-current-rates';
import {
  answerNotDuplicate,
  deleteOneOfDuplicate,
  forgetNotDuplicate,
  monthObservations,
} from '@/hooks/observations-reads';
import { todayIso } from '@/ui/dates';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { monthViewModel } from '@/ui/month-screen';
import { choiceEvent } from '@/ui/haptics';
import { stepDirection } from '@/ui/motion';
import { currentMonth, prevMonth, reachableMonths, stepBack, stepForward } from '@/ui/months';

import { Spacing, TouchTarget } from '@/constants/theme';

/**
 * The step arrows. Drawn, never removed: at the edge the disabled one keeps the title centred, and
 * says it is spent both ways — muted to the eye, `disabled` to TalkBack. The box itself is the
 * touch target, `TouchTarget` square, rather than a glyph widened by `hitSlop`.
 */
function Step({
  arrow,
  label,
  onPress,
}: {
  arrow: string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      style={styles.step}>
      <ThemedText type="subtitle" themeColor={onPress ? 'text' : 'textMuted'}>
        {arrow}
      </ThemedText>
    </Tap>
  );
}

/**
 * Місяць — where the owner reads one calendar month: витрачено, інвестовано, відкладено,
 * позичено, дохід and залишилось per currency, spent broken down by category, and the secondary
 * «≈ … грн» line. Every decision is already made and tested in `src/ui/month-screen.ts`,
 * `src/ui/months.ts` and `src/ui/approx-uah.ts`; this file is the wiring. See design.md §6.
 */

/**
 * What this tab holds until it is first opened: Android builds every tab at launch, and this one
 * reads nothing until the owner looks at it (app-shell, "A tab reads storage only once it is first
 * opened"). Every hook below runs over it without touching storage, and the tab draws an empty body.
 */
const UNSEEN = {
  accounts: [],
  transactions: [],
  previousTransactions: [],
  rates: [],
  categories: [],
  limits: [],
  recorded: undefined,
  month: undefined,
  installments: [],
  installmentFacts: NO_INSTALLMENT_FACTS,
  commitments: [],
  commitmentFacts: NO_COMMITMENT_FACTS,
  observations: [],
} as const;

function MonthScreen() {
  const router = useRouter();
  const haptics = useHaptics();
  const [shown, setShownMonth] = useState(() => currentMonth(new Date()));
  /**
   * Which side the shown month entered from, and whether the owner has stepped at all: the body
   * slides in from the side of the step (motion, "Stepping a month slides from the side of the
   * step"), and before the first step it is the tab's own first drawing.
   */
  const [step, setStep] = useState<{ direction: 'from-left' | 'from-right'; stepped: boolean }>({
    direction: 'from-right',
    stepped: false,
  });
  /** Shows `month`, entering from the side of the step. */
  const shift = (month: string) => {
    if (month === shown) return;
    setStep({ direction: stepDirection(shown, month), stepped: true });
    setShownMonth(month);
  };
  /** The owner stepped: the month changes and one tick is felt (motion, "Stepping a month ticks"). */
  const setShown = (month: string) => {
    const event = choiceEvent(shown, month, 'stepped');
    if (event) haptics.play(event);
    shift(month);
  };

  // Головний's month card always names the current month explicitly (main-screen, "The month
  // card always opens the current month"), overriding whatever month stepping had retained here.
  // Arriving through the tab bar itself carries no `month` param, so retained stepping is
  // untouched — adjusted during render, React's own way to react to a changed param without the
  // extra render an effect would cost (https://react.dev/learn/you-might-not-need-an-effect).
  const { month: forcedMonth } = useLocalSearchParams<{ month?: string }>();
  const [appliedForcedMonth, setAppliedForcedMonth] = useState(forcedMonth);
  if (forcedMonth !== appliedForcedMonth) {
    setAppliedForcedMonth(forcedMonth);
    if (forcedMonth) {
      // Arriving from Головний's month card is not a step taken here, and a render plays nothing.
      shift(forcedMonth);
    }
  }

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => {
        // The платежі of both plans linked to what the debits already say, before the block below
        // reads them (installments design D4, commitments design D4). Writes nothing — and so moves
        // no stamp — when nothing changed.
        settleInstallmentsOnFocus();
        return {
          // Every account, archived included: a month may hold a transfer touching one that has
          // since been archived, and classifying it needs its вид (design decision 8).
          accounts: accountsRepo.list(),
          transactions: transactionsRepo.listMonth(shown),
          // One more bounded month, so an empty screen can name the month that has numbers. Read
          // unconditionally rather than in a second effect: it is one month, and the alternative is
          // a reload the owner would watch happen.
          previousTransactions: transactionsRepo.listMonth(prevMonth(shown)),
          rates: ratesRepo.all(),
          // Every category, archived included: a month keeps showing the categories its витрати
          // already carry, and an archived one appears there like any other.
          categories: categoriesRepo.list(),
          // Every ліміт, so the breakdown can mark the categories this month went over.
          limits: limitsRepo.list(),
          // The first and last recorded дата — two values off the date index, never the history —
          // which bound the arrows. Re-read with the rest on focus, so a транзакція recorded or
          // deleted elsewhere moves the bounds the next time Місяць is looked at.
          recorded: transactionsRepo.recordedSpan(),
          // The month this answer is for, so the body is replaced when the new month's numbers
          // arrive rather than one render earlier with the previous month's.
          month: shown,
          // Every розстрочка and зобов'язання: «Платежі місяця» and «Вільно після зобов'язань»
          // read them.
          installments: installmentsRepo.list(),
          installmentFacts: installmentsRepo.facts(),
          commitments: commitmentsRepo.list(),
          commitmentFacts: commitmentsRepo.facts(),
          // The shown month's спостереження, through the stamp memo Головний and Звіти fill too:
          // after the first read per write it costs nothing (observations design D8).
          observations: monthObservations(shown, todayIso(new Date())),
        };
      },
      [shown],
    ),
    { whileUnseen: UNSEEN },
  );

  useCurrentRates(reload);

  const reach = useMemo(() => reachableMonths(stored.recorded, new Date()), [stored.recorded]);

  /** The month whose «Ще N» the owner chose; stepping to another month folds its list again. */
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const model = useMemo(
    () =>
      monthViewModel({
        month: stored.month ?? shown,
        accounts: stored.accounts,
        transactions: stored.transactions,
        rates: stored.rates,
        categoryNames: namesById(stored.categories),
        categoryIconKeys: new Map(stored.categories.map((c) => [c.id, c.iconKey])),
        limits: stored.limits,
        previousTransactions: stored.previousTransactions,
        now: new Date(),
        reach,
        installments: { installments: stored.installments, facts: stored.installmentFacts },
        commitments: { commitments: stored.commitments, facts: stored.commitmentFacts },
        observations: stored.observations,
        observationsExpanded: expandedMonth === (stored.month ?? shown),
      }),
    [expandedMonth, reach, shown, stored],
  );

  if (stored === UNSEEN) {
    return <Screen>{null}</Screen>;
  }

  return (
    <Screen>
      <View style={styles.stepper}>
        {/* Back as far as the month of the first record; forward as far as the current month, or
            the month of a record dated after it. Both bounds are `reachableMonths`'. */}
        <Step
          arrow="←"
          label="Попередній місяць"
          onPress={model.canStepBack ? () => setShown(stepBack(shown, reach)) : undefined}
        />
        <View style={styles.heading}>
          <ThemedText type="subtitle">{model.title}</ThemedText>
          {/* One tap home from wherever stepping led — drawn only away from the current month. */}
          {model.currentMonth ? (
            <Tap
              onPress={() => setShown(model.currentMonth ?? shown)}
              accessibilityRole="button"
              style={styles.today}>
              <ThemedText type="link">Сьогодні</ThemedText>
            </Tap>
          ) : null}
        </View>
        <Step
          arrow="→"
          label="Наступний місяць"
          onPress={
            model.canStepForward ? () => setShown(stepForward(shown, new Date(), reach)) : undefined
          }
        />
      </View>

      {/* The month itself: replaced as a whole when the owner steps, entering from the side of
          the step, its meters drawn at their values. */}
      <SteppedBody
        stepKey={stored.month ?? shown}
        direction={step.direction}
        stepped={step.stepped}
        style={styles.body}>
        {/* A finished month's підсумок, directly beneath its name and above its numbers. */}
        {model.summaryOffer ? (
          <Tap
            onPress={() => router.push(model.summaryOffer!.route)}
            accessibilityRole="button"
            accessibilityLabel={model.summaryOffer.accessibilityLabel}>
            <Card tone="accent" style={styles.summaryOffer}>
              <ThemedText type="smallBold" style={styles.label}>
                {model.summaryOffer.label}
              </ThemedText>
              <Chevron />
            </Card>
          </Tap>
        ) : null}

        {model.emptyMessage ? (
          <Card style={styles.empty}>
            <ThemedText>{model.emptyMessage}</ThemedText>
            {/* The month before it, when that one has something to read: its витрачено and one way
                to get there — the same state the back arrow writes, so there is one way to be on it. */}
            {model.previous ? (
              <>
                <Divider />
                <ThemedText type="small" themeColor="textSecondary">
                  {model.previous.label}
                </ThemedText>
                {model.previous.spent.map((row) => (
                  <View key={row.amount} style={styles.line}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {row.label}
                    </ThemedText>
                    <ThemedText type="small" tabular style={styles.amount}>
                      {row.amount}
                    </ThemedText>
                  </View>
                ))}
                <View style={styles.previousAction}>
                  <RowAction
                    title={`Показати ${model.previous.label}`}
                    onPress={() => setShown(stepBack(shown, reach))}
                  />
                </View>
              </>
            ) : null}
          </Card>
        ) : null}

        {model.groups.map((group) => {
          const leading = group.numbers.find((row) => row.key === group.lead);
          const rest = group.numbers.filter((row) => row.key !== group.lead);
          return (
            <Fragment key={group.currency}>
              <Card style={styles.numbers}>
                <ThemedText type="overline">{group.currency}</ThemedText>
                {/* One number leads the card. Which one is the model's decision, tested there: the
                    screen adds none of its own, and every one of the six is shown either way. */}
                {leading ? (
                  <View style={styles.hero}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {leading.label}
                    </ThemedText>
                    <ChangingFigure key={leading.key} type="title" adjustsFontSizeToFit>
                      {leading.amount}
                    </ChangingFigure>
                    {/* Why залишилось is not the number above, when it is not. */}
                    {group.note ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {group.note}
                      </ThemedText>
                    ) : null}
                    {/* Directly beneath залишилось when залишилось leads. */}
                    {leading.key === 'left' && group.freeAfterCommitments ? (
                      <FreeAfterCommitments line={group.freeAfterCommitments} />
                    ) : null}
                  </View>
                ) : null}
                <Divider />
                <View style={styles.numberRows}>
                  {rest.map((row) => (
                    <Fragment key={row.key}>
                      <View style={styles.line}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {row.label}
                        </ThemedText>
                        {row.key === 'spent' || row.key === 'left' ? (
                          <ChangingFigure type="small" tabular style={styles.amount}>
                            {row.amount}
                          </ChangingFigure>
                        ) : (
                          <ThemedText
                            type="small"
                            tabular
                            style={styles.amount}
                            themeColor={row.key === 'income' ? 'textPositive' : undefined}>
                            {row.amount}
                          </ThemedText>
                        )}
                      </View>
                      {/* Directly beneath залишилось when витрачено leads and it is among these. */}
                      {row.key === 'left' && group.freeAfterCommitments ? (
                        <FreeAfterCommitments line={group.freeAfterCommitments} />
                      ) : null}
                    </Fragment>
                  ))}
                </View>
              </Card>

              {group.breakdown.length > 0 ? (
                <>
                  <SectionLabel note={group.currency}>Витрачено за категоріями</SectionLabel>
                  <Card style={styles.breakdown}>
                    {group.breakdown.map((row) => (
                      <Tap
                        key={row.categoryId}
                        onPress={() => router.push(`/category/${model.month}/${row.categoryId}`)}>
                        <View style={styles.breakdownLine}>
                          {/* Over its ліміт for this month, in this row's own currency: the amount
                              and its category turn red, and nothing else about the row changes. */}
                          <IconTile name={row.icon} tone={row.iconTone} />
                          <ThemedText
                            numberOfLines={1}
                            style={styles.label}
                            themeColor={row.overLimit ? 'textDanger' : undefined}>
                            {row.label}
                          </ThemedText>
                          <ThemedText
                            tabular
                            style={styles.amount}
                            themeColor={row.overLimit ? 'textDanger' : undefined}>
                            {row.amount}
                          </ThemedText>
                        </View>
                        {/* The bar is the month's shape at a glance: the largest категорія fills it
                            and the rest are read against it. */}
                        <View style={styles.meter}>
                          <Meter
                            value={row.share}
                            color={row.overLimit ? 'textDanger' : 'textSecondary'}
                            track={row.overLimit ? 'dangerSurface' : 'backgroundSelected'}
                          />
                        </View>
                      </Tap>
                    ))}
                  </Card>
                </>
              ) : null}
            </Fragment>
          );
        })}

        {/* The month's спостереження: directly beneath the breakdown, before any block of the
            month's платежі. «Не дубль» is stored at once and the list re-derived in place. */}
        {model.observations ? (
          <>
            <SectionLabel>Спостереження</SectionLabel>
            <ObservationsList
              lines={model.observations.lines}
              empty={model.observations.empty}
              more={model.observations.more}
              onMore={() => setExpandedMonth(model.month)}
              onOpen={(route) => router.push(route)}
              onNotDuplicate={(pair) => {
                answerNotDuplicate(pair);
                reload();
              }}
              onUndoNotDuplicate={(pair) => {
                forgetNotDuplicate(pair);
                reload();
              }}
              onDeleteOne={(id) => {
                deleteOneOfDuplicate(id);
                reload();
              }}
            />
          </>
        ) : null}

        {/* «Платежі місяця» — the платежі of розстрочки and зобов'язання, also on an empty month,
            beside its statement. It changes none of the six numbers; each row opens its own plan. */}
        {model.dues ? (
          <>
            <SectionLabel>{model.dues.title}</SectionLabel>
            <Card style={styles.breakdown}>
              {model.dues.rows.map((row) => (
                <Tap
                  key={row.key}
                  onPress={() => router.push(row.href as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.name}, ${row.date}, ${row.stateLabel}`}
                  style={styles.installment}>
                  <View style={styles.line}>
                    <ThemedText numberOfLines={1} style={styles.label}>
                      {row.name}
                    </ThemedText>
                    <ThemedText tabular style={styles.amount}>
                      {row.amount}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="small"
                    themeColor={row.state === 'notFound' ? 'textDanger' : 'textSecondary'}>
                    {[row.date, row.number, row.stateLabel].filter(Boolean).join(' · ')}
                  </ThemedText>
                </Tap>
              ))}
              {model.dues.totals.length > 0 ? <Divider /> : null}
              {model.dues.totals.map((total) => (
                <Fragment key={total.currency}>
                  <View style={styles.line}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Разом за місяць
                    </ThemedText>
                    <ThemedText type="small" tabular style={styles.amount}>
                      {total.total}
                    </ThemedText>
                  </View>
                  {total.unpaid ? (
                    <View style={styles.line}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Ще не сплачено
                      </ThemedText>
                      <ThemedText type="small" tabular style={styles.amount}>
                        {total.unpaid}
                      </ThemedText>
                    </View>
                  ) : null}
                </Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {/* One «≈» line per monthly number, across every currency of that number — never one
            total per currency group. Absent whenever it cannot be honest. */}
        {model.approximate ? (
          <>
            <SectionLabel>Приблизно в гривні</SectionLabel>
            <Card>
              {model.approximate.map((row) => (
                <View key={row.key} style={styles.line}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.label}
                  </ThemedText>
                  <ThemedText type="small" tabular themeColor="textSecondary">
                    {row.amount}
                  </ThemedText>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </SteppedBody>
    </Screen>
  );
}

/** «Вільно після зобов'язань» — a secondary line under залишилось, never the lead. */
function FreeAfterCommitments({ line }: { line: { label: string; amount: string } }) {
  return (
    <View style={styles.line}>
      <ThemedText type="small" themeColor="textSecondary">
        {line.label}
      </ThemedText>
      <ThemedText type="small" tabular style={styles.amount}>
        {line.amount}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The gap `Screen` puts between its children, kept between the body's own.
  body: { gap: Spacing.three },
  summaryOffer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  step: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { flex: 1, alignItems: 'center' },
  // A link's weight with a button's target, like the other quiet actions (`receiptLink`).
  today: {
    minHeight: TouchTarget,
    minWidth: TouchTarget,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { gap: Spacing.two },
  previousAction: { flexDirection: 'row' },
  numbers: { gap: Spacing.three },
  hero: { gap: Spacing.half },
  numberRows: { gap: Spacing.two + Spacing.half },
  breakdown: { gap: Spacing.three },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  /* Same row, plus an IconTile: baseline alignment only knows about text, and a View mixed into
     it throws off the row's own height, which is what pushed `meter` up into the label below
     (baseline aligns `line` above; a category row's tile needs its own centred alignment). */
  breakdownLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  label: { flex: 1, minWidth: 0 },
  installment: { gap: Spacing.half },
  meter: { marginTop: Spacing.two - Spacing.half },
  amount: { fontWeight: 600 },
});

/**
 * The tab as the navigator mounts it: the screen inside the cross-fade every tab shares (motion,
 * "Screens enter from where they come from"; design D8).
 */
export default function MonthTab() {
  return (
    <TabFade tab="month">
      <MonthScreen />
    </TabFade>
  );
}
