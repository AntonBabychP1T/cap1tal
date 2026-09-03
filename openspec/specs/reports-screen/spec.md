# reports-screen Specification

## Purpose

The «Звіти» tab — where the owner reads the whole history instead of one month: витрачено, дохід
and інвестовано by month, one category by month, and the цілі with their progress. It shows what
the reports and goals capabilities compute; it records nothing.
## Requirements
### Requirement: The Звіти tab shows the history by month

The app SHALL offer a «Звіти» tab, placed between «Рахунки» and «Налаштування». For the whole
stored history it SHALL show витрачено, дохід and інвестовано by calendar month, exactly as the
reports capability computes them, each month identifiable by its month and year. The numbers
SHALL be shown one currency at a time, never mixed: the tab SHALL hold one shown currency that
governs every chart on it — the history chart and the category chart alike. WHEN more than one
currency occurs in the stored history the owner SHALL be able to switch the shown currency, and
the tab SHALL open on UAH when UAH occurs in the history, otherwise on the first of the
occurring currencies in alphabetical order. WHEN no транзакція is stored the tab SHALL say so plainly instead of showing
an empty chart.

#### Scenario: The history is shown by month

- **WHEN** the stored history holds UAH транзакції in June, July and August and the owner opens
  «Звіти»
- **THEN** витрачено, дохід and інвестовано are shown for June, July and August, each equal to
  that month's monthly picture

#### Scenario: One currency at a time, UAH first

- **WHEN** the history holds транзакції in UAH and USD and the owner opens «Звіти»
- **THEN** the UAH series is shown, no number mixes the currencies, and the owner can switch to
  USD

#### Scenario: A single-currency history offers no switch

- **WHEN** every stored транзакція is in UAH
- **THEN** the UAH series is shown and no currency switch is offered

#### Scenario: An empty history says it is empty

- **WHEN** no транзакція is stored and the owner opens «Звіти»
- **THEN** the tab states the history is empty instead of showing a chart

### Requirement: One category can be chosen and read by month

The «Звіти» tab SHALL offer choosing one category among every category some stored транзакція
carries — archived ones included, shown under their names from the editable list — and SHALL
show the chosen category's spent by month over the same span, per the reports capability, in
the tab's shown currency, negative months included — switching the shown currency switches the
category chart with the history chart. A category no stored транзакція carries SHALL NOT be offered — its
series would be an empty answer to an honest question.

#### Scenario: The chooser offers the categories of the history

- **WHEN** stored транзакції carry Groceries and «Комісія», the category Pets is archived with
  stored витрати, and the category book carries no транзакція
- **THEN** the chooser offers Groceries, «Комісія» and Pets, and does not offer book

#### Scenario: The chosen category is shown by month

- **WHEN** the owner chooses Groceries
- **THEN** Groceries' spent is shown for every month of the span, each month equal to its
  breakdown amount, months without Groceries at zero

#### Scenario: A two-currency category follows the shown currency

- **WHEN** Groceries holds витрати in UAH and in USD, and the owner reads Groceries with UAH
  shown, then switches the shown currency to USD
- **THEN** the months first show Groceries' UAH breakdown amounts and, after the switch, its USD
  breakdown amounts, and no month mixes the two

#### Scenario: A renamed category is offered under its new name

- **WHEN** the owner renames Groceries to «Продукти» and opens the chooser
- **THEN** the category is offered as «Продукти» and its series is unchanged

### Requirement: Choosing a ціль on Звіти opens what explains it

Every ціль listed on «Звіти» SHALL be choosable, and choosing one SHALL open what explains that
kind of ціль: a ціль-накопичення SHALL open its own breakdown screen, and a ціль витрат SHALL open
the existing категорія screen for its категорія and the month it is shown for. «Звіти» SHALL NOT
list the транзакції of a ціль itself.

#### Scenario: A ціль-накопичення opens its breakdown

- **WHEN** the owner chooses «Машина» in the цілі list
- **THEN** the breakdown screen of «Машина» opens, showing the внесок of every рахунок of its склад

#### Scenario: A ціль витрат opens its категорія's month

- **WHEN** the owner chooses the ціль витрат «Ресторани», shown for the current month
- **THEN** the категорія screen for Ресторани in that month opens

### Requirement: The цілі are shown with their progress

The «Звіти» tab SHALL list every ціль, and SHALL keep the two kinds visibly apart: the
цілі-накопичення in one group and the цілі витрат in another, each group named, so a ціль moving
toward a сума the owner wants is never read as a ціль moving toward a сума they do not.

A **ціль-накопичення** SHALL be listed with its назва, its progress and its target сума with
currency, the percentage of the target it stands at, its дата where it has one, and how many
рахунки its склад holds. A reached ціль SHALL be visibly marked reached; an overdue ціль SHALL be
visibly marked overdue; an approximate progress SHALL be visibly marked approximate; and a ціль
whose progress cannot be counted SHALL say so in place of its progress and percentage, and SHALL be
marked neither reached nor overdue.

A **ціль витрат** SHALL be listed with its категорія's назва, the current month's spent of that
категорія and the ceiling with their currency, the month it is about, and — while it is within its
ceiling — how much may still be spent, or — once exceeded — by how much it was exceeded. No
percentage SHALL be shown for an exceeded ціль витрат, and nothing about a ціль витрат SHALL read
as reached, done or complete.

A ціль витрат whose категорія is archived SHALL still be listed, visibly set apart the way the
«Ліміти» section sets such a ліміт apart, so a leftover ceiling can be found and cleared rather
than quietly kept — «every ліміт is a ціль витрат» holds for an archived категорія too.

WHEN no ціль of either kind exists the tab SHALL say so plainly. WHEN цілі of only one kind exist,
only that group SHALL be shown.

#### Scenario: A ціль shows its progress

- **WHEN** «Машина» targets 70000000 minor units UAH over four рахунки and its progress is 48730000
  minor units UAH
- **THEN** «Машина» is listed with 48730000 of 70000000 minor units UAH, 69 %, and that it counts
  four рахунки

#### Scenario: A ціль витрат shows what is left of its month

- **WHEN** the ціль витрат «Ресторани» has a ceiling of 200000 minor units UAH and the current
  month's spent in Ресторани is 132000 minor units UAH
- **THEN** «Ресторани» is listed with 132000 of 200000 minor units UAH, the current month, and
  68000 minor units UAH that may still be spent

#### Scenario: An exceeded ціль витрат shows the excess and no percentage

- **WHEN** the current month's spent in Ресторани is 248000 minor units UAH against a ceiling of
  200000
- **THEN** «Ресторани» is listed as exceeded by 48000 minor units UAH, and no percentage is shown
  for it

#### Scenario: The two kinds are not mixed together

- **WHEN** both цілі-накопичення and цілі витрат exist
- **THEN** they are listed in two named groups, and no row of one group is drawn among the other

#### Scenario: A reached ціль is marked

- **WHEN** a ціль-накопичення's progress is at or above its target
- **THEN** it is visibly marked reached

#### Scenario: An overdue ціль is marked

- **WHEN** a ціль-накопичення's дата has passed and its progress is below its target
- **THEN** it is visibly marked overdue

#### Scenario: An approximate progress is marked

- **WHEN** a ціль-накопичення's progress holds a converted внесок
- **THEN** its progress is visibly marked approximate

#### Scenario: A progress that cannot be counted says so

- **WHEN** a ціль-накопичення's склад holds a currency the app has no rate for
- **THEN** the row says the progress cannot be counted now instead of showing a progress and a
  percentage, and it is marked neither reached nor overdue

#### Scenario: A ціль витрат of an archived категорія is set apart, not hidden

- **WHEN** Pets is archived while carrying a ліміт of 100000 minor units UAH
- **THEN** the ціль витрат «Pets» is listed among the цілі витрат, visibly set apart as archived

#### Scenario: No цілі is said plainly

- **WHEN** no ціль of either kind exists and the owner opens «Звіти»
- **THEN** the tab states there are no цілі yet

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

### Requirement: The Звіти tab offers AI-аналіз

The «Звіти» tab SHALL offer «AI-аналіз», which opens the AI-аналіз screen over the tabs. The
offer SHALL be a way in and nothing more: showing it on «Звіти» SHALL compute nothing, build
no пакет для аналізу and hand nothing to any other app — the пакет is built only by the
AI-аналіз screen, once it is open. WHEN no транзакція is stored the offer SHALL still be shown,
and the AI-аналіз screen SHALL be the one to say there is nothing to analyse.

#### Scenario: The offer opens the AI-аналіз screen

- **WHEN** the owner opens «Звіти» and chooses «AI-аналіз»
- **THEN** the AI-аналіз screen opens over the tabs with its choices at their defaults, and
  nothing has left the phone

#### Scenario: The offer says nothing about the data

- **WHEN** the owner opens «Звіти»
- **THEN** «AI-аналіз» is offered without any number, preview or file having been prepared
