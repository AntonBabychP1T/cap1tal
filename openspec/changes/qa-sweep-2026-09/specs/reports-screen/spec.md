## MODIFIED Requirements

### Requirement: One month of each chart is spelled out in full

The «Звіти» tab SHALL spell out one month's exact сума for every chart it draws: витрачено, дохід
and інвестовано for the history chart, and the chosen category's сума for the category chart,
each with its currency and named by the month it belongs to. Until the owner picks another, the
month spelled out SHALL be the newest month of the span in which any of the tab's three history
numbers is other than zero in the shown currency — so the current month, which holds nothing until
the first транзакція of it is recorded, is not the month the tab opens on. WHEN no month of the
span holds such a сума, the newest month of the span SHALL be the one spelled out: an all-zero
history is still spelled out rather than left blank. The owner SHALL be able to pick any month of
the span by choosing it on either chart, and the picked month SHALL be the one spelled out for
both charts and SHALL be visibly marked on them. A picked month that the span no longer holds —
after a currency switch, say — SHALL fall back to the month the tab would have opened on rather
than leaving nothing spelled out.

The spelled-out сума SHALL be the reports capability's own number for that month and currency,
identical to the bar drawn for it.

The mark on the picked month SHALL be fully visible. WHEN a chart is wider than the space it is
drawn in and its marked month is not already whole inside that space, the chart SHALL be moved so
that it is — on opening, whenever the picked month changes, and whenever the span the chart draws
changes under it. A chart whose marked month is already whole SHALL NOT move: picking a month on
the chart under the owner's finger SHALL leave that chart where it is. No month's mark SHALL be
drawn under the edge the chart is clipped at.

#### Scenario: The newest month is spelled out first

- **WHEN** the owner opens «Звіти» on a history running June through August, every month holding
  UAH транзакції, and picks nothing
- **THEN** August's витрачено, дохід and інвестовано are spelled out with their currency, named as
  August

#### Scenario: A month that has not started yet is not the one spelled out

- **WHEN** the span runs June through September, September holds no транзакція, and the owner
  opens «Звіти» on 1 September
- **THEN** August is the month spelled out and visibly marked, not September, while September is
  still drawn on the charts

#### Scenario: An all-zero history still spells out its newest month

- **WHEN** every month of the span is zero in the shown currency
- **THEN** the newest month of the span is the one spelled out, at zero

#### Scenario: Choosing a month spells that month out

- **WHEN** the owner chooses June on the history chart
- **THEN** June's витрачено, дохід and інвестовано are spelled out, June is visibly marked on the
  chart, and August's numbers are no longer the ones shown

#### Scenario: The picked month governs both charts

- **WHEN** the owner has chosen Groceries as the category and chooses June on either chart
- **THEN** June's three history numbers and June's Groceries сума are both spelled out

#### Scenario: A negative month is spelled out with its sign

- **WHEN** the picked month's Groceries сума is −20000 minor units UAH, повернення having outrun
  the витрати
- **THEN** the category chart spells that month out as a negative сума in UAH

#### Scenario: A spelled-out month equals its bar

- **WHEN** any month is spelled out
- **THEN** the сума spelled out for it is the same number the reports capability computes for that
  month, currency and chart

#### Scenario: The chart opens on the month it marks

- **WHEN** the owner opens «Звіти» on a history of twelve months, more than fit across the screen,
  and the newest month holding a сума is the one spelled out
- **THEN** that month's column and its mark are whole on screen without the owner scrolling

#### Scenario: A mark never sits under the chart's edge

- **WHEN** any month of either chart is marked
- **THEN** its mark is drawn whole, not clipped by the edge of the chart's scrollable area

#### Scenario: A pick on one chart brings the other to the same month

- **WHEN** both charts are wider than the space they are drawn in, the history chart is scrolled to
  a month the category chart does not currently show, and the owner picks that month on the history
  chart
- **THEN** the category chart moves so that month is whole on screen, and the history chart — where
  the owner just tapped — does not move

#### Scenario: A span that grows under the tab still shows its mark

- **WHEN** «Звіти» is open on a history running February through September, and a транзакція is
  recorded in the previous June so the span becomes June through September of the next year
- **THEN** the chart shows the marked month whole again rather than staying where it was, which
  after the span grew is a stretch of months the mark is not among
