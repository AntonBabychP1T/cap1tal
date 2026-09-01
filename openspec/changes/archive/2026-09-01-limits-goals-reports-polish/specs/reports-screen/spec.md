## ADDED Requirements

### Requirement: Every chart on Звіти states its scale

Each chart the «Звіти» tab draws SHALL state the сума its tallest bar stands for, with the
currency, and SHALL mark the zero its bars grow from. A chart holding a month below zero SHALL
also state the сума at the bottom of its own scale, so a bar under the baseline can be read as
well as one above it; a chart holding no negative month SHALL NOT state a bottom it does not use.
The stated scale SHALL be in the tab's shown currency and SHALL follow it when the owner switches
currency.

A chart every month of which is zero SHALL state a scale of zero rather than none — the answer
"nothing happened" is an answer, and a chart with no scale at all cannot be told from a chart
whose scale was left off.

#### Scenario: The history chart states its tallest сума

- **WHEN** the largest of витрачено, дохід and інвестовано across the shown months is 4500000
  minor units UAH
- **THEN** the history chart states 4500000 minor units UAH as the top of its scale, in UAH, and
  marks zero

#### Scenario: A chart with no negative month states no bottom

- **WHEN** no month of the history chart is below zero
- **THEN** the chart states its top and its zero, and states no bottom

#### Scenario: A chart with a negative month states its bottom

- **WHEN** some month's інвестовано is negative — a month of returns — and the largest absolute
  сума of the chart is 4500000 minor units UAH
- **THEN** the history chart states −4500000 minor units UAH as the bottom of its scale

#### Scenario: The stated scale follows the shown currency

- **WHEN** the owner switches the shown currency from UAH to USD
- **THEN** both charts state their scale in USD, computed from the USD months alone

#### Scenario: An all-zero chart states a scale of zero

- **WHEN** the chosen category has no сума in any month of the shown currency
- **THEN** the category chart states a scale of zero in that currency

### Requirement: One month of each chart is spelled out in full

The «Звіти» tab SHALL spell out one month's exact сума for every chart it draws: витрачено, дохід
and інвестовано for the history chart, and the chosen category's сума for the category chart,
each with its currency and named by the month it belongs to. The newest month of the span SHALL be
the one spelled out until the owner picks another; the owner SHALL be able to pick any month of
the span by choosing it on either chart, and the picked month SHALL be the one spelled out for
both charts and SHALL be visibly marked on them. A picked month that the span no longer holds —
after a currency switch, say — SHALL fall back to the newest month rather than leaving nothing
spelled out.

The spelled-out сума SHALL be the reports capability's own number for that month and currency,
identical to the bar drawn for it.

#### Scenario: The newest month is spelled out first

- **WHEN** the owner opens «Звіти» on a history running June through August and picks nothing
- **THEN** August's витрачено, дохід and інвестовано are spelled out with their currency, named as
  August

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
