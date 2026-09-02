## Purpose

The пакет для аналізу: the one structured, versioned, deterministic bundle of numbers the app
computes locally from stored транзакції for an AI-аналіз — every figure in it is the domain's
own, per currency, with no identifier, secret or bank text in it, so that whatever reads it
(an external assistant the owner hands it to, or a local model later) only explains and never
computes.

## ADDED Requirements

### Requirement: A пакет для аналізу is built deterministically from stored truth alone

The system SHALL build a пакет для аналізу from the stored рахунки, транзакції, категорії, ліміти
and цілі for a chosen kind of AI-аналіз, a chosen period of whole calendar months and the owner's
detail choices, and from nothing else. Building it SHALL read no clock: the day the пакет is
built for is an input. The same stored state, the same choices and the same day SHALL produce a
пакет equal in every value, whatever the order the stored rows were read in. The пакет SHALL
name its own schema and version, its kind, the period it covers and the day it was built for.
Building a пакет SHALL create, change or delete no транзакція, рахунок, категорія, ліміт or ціль
and SHALL store nothing.

#### Scenario: The same state builds the same пакет

- **WHEN** a пакет для аналізу of kind monthly-picture is built twice for 2026-06 through 2026-08 on
  2026-09-01 from the same stored state, with the транзакції handed over in a different order
  the second time
- **THEN** the two пакети are equal in every value, and each names its schema, version 1, kind
  monthly-picture, the period 2026-06 through 2026-08 and the day 2026-09-01

#### Scenario: Building leaves the stored state untouched

- **WHEN** a пакет для аналізу is built
- **THEN** every рахунок, транзакція, категорія, ліміт and ціль is exactly what it was, and
  nothing about the пакет or the run is stored

#### Scenario: The period is whole calendar months

- **WHEN** the owner asks for the last three months on 2026-09-01
- **THEN** the period is 2026-07 through 2026-09, the month 2026-09 is marked as partial with
  1 of 30 days elapsed, and 2026-07 and 2026-08 are not marked partial

### Requirement: Every сума in the пакет is exact, per currency, and never mixed

Every сума in the пакет SHALL be carried as an exact decimal text of major units with its
currency code beside it — never a floating-point number and never a bare number — and every
number of the пакет SHALL be given per currency. The пакет SHALL never sum, average or compare
amounts of different currencies. A ratio (a share, a rate, a change) SHALL be an integer in basis
points, and SHALL be absent — not zero — when its base is zero. The only figure that crosses
currencies SHALL be the приблизно в гривні (the approximate UAH equivalent), given only when a monobank rate is known
for every foreign currency of the period, marked approximate and carrying, per currency, the
day of the rate it used.

#### Scenario: Two currencies are two reports

- **WHEN** the period holds витрати of 412534 minor units UAH and 10000 minor units USD
- **THEN** the пакет carries a UAH report with витрачено `4125.34 UAH` and a USD report with
  витрачено `100.00 USD`, and no number combines the two

#### Scenario: A ratio with a zero base is absent

- **WHEN** a month holds витрати and no дохід
- **THEN** that month's savings rate and investment rate are absent from the пакет rather than
  zero or infinite

#### Scenario: The approximation is marked and dated

- **WHEN** the period holds UAH and USD and a monobank USD rate obtained on 2026-08-30 is known
- **THEN** the пакет carries a приблизно в гривні (the approximate UAH equivalent) marked approximate and dated
  2026-08-30, and the per-currency reports are unchanged by it

#### Scenario: No rate, no approximation

- **WHEN** the period holds UAH and EUR and no EUR rate is known
- **THEN** the пакет carries no приблизно в гривні at all, rather than a partial one

### Requirement: The monthly-picture пакет carries the monthly picture of every month of the period

For a пакет of kind monthly-picture, for every calendar month of the period and every currency that
occurs in it, the пакет SHALL carry витрачено, дохід, інвестовано, відкладено, позичено and
залишилось exactly as the monthly picture computes them, plus the totals of the six over the
whole period. A currency occurs in the period when any сума of any транзакція of the period
carries it — either leg of a переказ included — so a currency that only arrived in a переказ
still has its report. The сума в оригінальній валюті of a foreign purchase from a hryvnia
картка is information, not a сума of the транзакція: it SHALL neither make its currency occur
nor appear anywhere in the пакет — the витрата is the UAH the bank charged. A month of the
period in which nothing moved in a currency SHALL be present at zero, so the series has no
holes. The month the пакет is built in SHALL be marked partial with the days elapsed and the
days in the month when it lies in the period.

#### Scenario: A month equals its monthly picture

- **WHEN** August 2026 holds a витрата of 100000, a дохід of 500000, an інвестиція of 80000, a
  переказ картка → банка of 50000 and a переказ картка → рахунок-борг of 40000 minor units UAH
- **THEN** the пакет's August UAH row reads витрачено `1000.00`, дохід `5000.00`, інвестовано
  `800.00`, відкладено `500.00`, позичено `400.00` and залишилось `2300.00`

#### Scenario: An empty month is present at zero

- **WHEN** the period is June through August and July holds no UAH транзакція
- **THEN** the UAH series carries July with every number at `0.00`

#### Scenario: The glossary distinctions hold in the пакет

- **WHEN** a month holds a переказ картка → банка, a переказ картка → інвестиційний рахунок, a
  переказ картка → рахунок-борг, a повернення and a negative коригування
- **THEN** none of the три перекази enters витрачено, the повернення reduces витрачено, and the
  коригування adds to витрачено under «Коригування»

#### Scenario: A комісія is витрачено under «Комісія» and the переказ is not

- **WHEN** August holds a same-currency переказ картка → картка that left 100000 and arrived
  99000 minor units UAH, and the витрата of 1000 minor units UAH in «Комісія» recorded for it
- **THEN** August's витрачено includes the 1000 under «Комісія» and nothing of the переказ

#### Scenario: A repayment reduces позичено and only the відсотки are дохід

- **WHEN** August holds a переказ рахунок-борг → картка of 40000 minor units UAH and a дохід of
  1000 minor units UAH with the джерело «Відсотки»
- **THEN** August's позичено is −400.00 UAH, its дохід includes 10.00 UAH, and nothing of the
  repayment is дохід

#### Scenario: A cross-currency переказ counts in one currency and shows both legs

- **WHEN** August holds a переказ картка UAH → банка USD that left 410000 minor units UAH and
  arrived as 10000 minor units USD, and individual транзакції are included
- **THEN** August's відкладено is 4100.00 UAH and the USD report's відкладено is 0.00 USD, and
  the транзакція line carries both legs, `4100.00 UAH` left and `100.00 USD` arrived, with no
  rate

#### Scenario: A foreign purchase from a UAH card is spent in UAH and opens no foreign report

- **WHEN** August holds a витрата of 412534 minor units UAH on a UAH картка carrying an original
  сума of 10000 minor units USD, and no other транзакція touches USD
- **THEN** August's UAH витрачено includes `4125.34 UAH`, no USD report exists, and the text
  `100.00 USD` appears nowhere in the пакет, even with individual транзакції included

#### Scenario: A positive коригування is дохід

- **WHEN** August holds a коригування of +2000 minor units UAH
- **THEN** August's дохід includes 20.00 UAH, its витрачено does not, and, when individual
  транзакції are included, the line is a коригування with no категорія and no джерело

#### Scenario: Money back from an інвестиційний рахунок makes інвестовано negative

- **WHEN** August holds a переказ інвестиційний рахунок → картка of 30000 minor units UAH and
  no other інвестиція, and August's дохід is 100000 minor units UAH
- **THEN** August's інвестовано is −300.00 UAH and its investment rate is −3000 basis points

### Requirement: The monthly-picture пакет carries category analytics

For every currency of the period the monthly-picture пакет SHALL carry, per категорія that occurs, its
витрачено of every month of the period and of the whole period, its share of the period's
витрачено in basis points, its change against the previous month — the anchor month against the
calendar month before it, read from the history even when that month lies before the period,
both months named, absent when the earlier month holds none of the категорія — and its change
against the average of the months before the period in basis points, and,
when the категорія has a ліміт in that currency,
the ліміт and by how much and in which months it was exceeded. The anchor month of every
month-to-month comparison in the пакет SHALL be the latest month of the period that is not
partial; only when the period holds no other month SHALL the partial month be the anchor, and
then the comparison SHALL be marked partial. Категорії SHALL be named by their назва from the
owner's list, an archived one marked as archived, and never by identifier.

#### Scenario: A category's share and change

- **WHEN** the period is August alone, August's UAH витрачено is 400000 minor units, of which
  «Кафе» is 100000, and July's «Кафе» was 50000
- **THEN** the пакет's «Кафе» row carries a share of 2500 basis points of the period's витрачено
  and a change against July of +10000 basis points, naming July and August as the two months
  compared

#### Scenario: A period ending in the partial month is anchored to the month before it

- **WHEN** the period is July through September, built for 2026-09-01, and «Кафе» holds 50000
  in July, 100000 in August and 1000 minor units UAH on 1 September
- **THEN** «Кафе»'s change against the previous month compares July with August, +10000 basis
  points, and September appears in its months with 10.00 UAH marked partial

#### Scenario: A period of the partial month alone is anchored to it and says so

- **WHEN** the period is «Цей місяць», built for 2026-09-01, and September holds a витрата
- **THEN** every month-to-month comparison compares August with September and is marked partial

#### Scenario: An uncategorised витрата is reported under «Без категорії»

- **WHEN** August holds an imported витрата of 30000 minor units UAH that no правило recognised
- **THEN** the пакет's August витрачено includes it and the категорія «Без категорії» carries it,
  named as such

#### Scenario: A ліміт and its overrun

- **WHEN** «Кафе» has a ліміт of 80000 minor units UAH and August's «Кафе» is 100000 minor units
  UAH
- **THEN** the пакет names the ліміт `800.00 UAH` and August as exceeded by `200.00 UAH`

#### Scenario: A ліміт in another currency does not judge the category

- **WHEN** «Кафе» has a ліміт in UAH and August holds only USD «Кафе» витрати
- **THEN** the USD report shows «Кафе» with no ліміт and no overrun

### Requirement: The monthly-picture пакет carries deterministic trends

For every currency of the period the monthly-picture пакет SHALL carry: the month-over-month change of
each of the six numbers in basis points; the average of each over the months before the period
that hold transactions, with how many months that average stands on; the savings rate
(відкладено to дохід) and the investment rate (інвестовано to дохід) per month and over the
period; the largest категорії of the period; the категорії whose change against the previous
month is largest, upward and downward — anchored as the category analytics are, and only among
категорії present in both months compared, a категорія absent from the earlier month having no
change to rank; the notable витрати — the largest single витрати of the period, each with its
сума, its категорія and its month, capped in number, carrying no опис unless описи are included and
no exact дата unless individual транзакції are; and the recurring витрати candidates — категорії where a similar сума recurs in most
months of the period. Notable and recurring candidates SHALL be витрати only — «Комісія» and
«Без категорії» among them — never a повернення and never a коригування, which is unexplained
money and not a purchase. None of these SHALL be left for a reader to compute.

#### Scenario: Month-over-month change

- **WHEN** July's UAH витрачено is 300000 and August's is 360000 minor units
- **THEN** August's витрачено change is +2000 basis points

#### Scenario: A notable витрата carries no опис by default

- **WHEN** August holds a витрата of 2500000 minor units UAH in «Авто» with the опис «СТО Іванов»
  and описи are not included
- **THEN** the пакет's notable витрати name `25000.00 UAH`, «Авто» and 2026-08, and carry no
  опис

#### Scenario: A recurring витрата candidate

- **WHEN** «Житло» holds one витрата of about 1500000 minor units UAH in each of six months
- **THEN** the пакет lists «Житло» as a recurring витрата candidate with that typical сума and
  6 of 6 months

### Requirement: The пакет carries every ціль with what remains

The пакет SHALL carry every ціль with its назва, target сума with currency, дата, progress as the
goals capability defines it, the remaining сума, whether it is reached or overdue, and the months
left to its дата with the сума per month that would reach it. The months left SHALL be the number
of calendar months from the month the пакет is built in through the month of the дата, both
included — the current month counts whatever day it is — and 0 when the дата lies before the day
the пакет is built for; the сума per month SHALL be absent when the ціль is reached or no month
is left. It SHALL NOT name the рахунок behind the ціль.

#### Scenario: A ціль's pace

- **WHEN** the ціль «Авто» targets 20000000 minor units UAH by 2026-12-31, its progress is
  5000000 minor units UAH, and the пакет is built for 2026-09-01
- **THEN** the пакет carries «Авто» with remaining `150000.00 UAH`, 4 months left and
  `37500.00 UAH` per month, not reached and not overdue, and names no рахунок

#### Scenario: A month started still counts

- **WHEN** the same ціль is in the пакет built for 2026-09-15
- **THEN** it still has 4 months left and `37500.00 UAH` per month

#### Scenario: An overdue ціль has no pace

- **WHEN** the ціль «Авто» is not reached and the пакет is built for 2027-01-10
- **THEN** it is overdue, has 0 months left and no сума per month

### Requirement: What a пакет для аналізу never carries

A пакет для аналізу SHALL NOT carry: any identifier of a рахунок, транзакція, категорія, джерело,
правило, ліміт or ціль; the назва of any рахунок; the monobank token or any key, cursor or
identifier of the monobank connection; any баланс банку; the stored payload of any captured bank
notification, any pending чернетка with its text, or any fingerprint; any відстежуваний
застосунок; the бекап or its envelope; any device or installation identifier. An опис that a
confirmed чернетка left on its транзакція is an опис like any other — the bank's text, as an
imported monobank опис is — and leaves only under the «Продавці» choice, never by default.
Whether описи and individual транзакції are carried SHALL be decided by the owner's explicit
choice for that run, off by default and never remembered between runs.

#### Scenario: Nothing secret and nothing overheard reaches the пакет

- **WHEN** a пакет is built on a device holding a monobank token, a linked рахунок with a баланс
  банку, two pending чернетки with their notification text and a відстежуваний застосунок
- **THEN** the пакет, serialised, contains none of the token, the баланс банку, the pending
  чернетки or their text, or the застосунок, and none of the stored identifiers

#### Scenario: A confirmed чернетка's опис is an опис

- **WHEN** a чернетка with the text «Оплата ATB 350.00 UAH» was confirmed into a витрата carrying
  that text as its опис, and a пакет is built with «Продавці» off and then with «Продавці» on
- **THEN** the first пакет contains no part of that text, and the second carries it only as the
  опис of that витрата and in the merchants list

#### Scenario: Account names stay on the phone

- **WHEN** the stored рахунки are «mono black», «Готівка» and «Військові облігації»
- **THEN** the serialised пакет contains none of those назви, and counts three рахунки by вид

#### Scenario: Описи are absent unless chosen

- **WHEN** the owner has not chosen to include описи
- **THEN** no опис of any транзакція appears in the пакет, and no merchant list appears

### Requirement: Описи and individual транзакції are separate opt-ins

When the owner chooses to include описи, the пакет SHALL carry, per currency, the largest
merchants of the period — a merchant being the folded опис of a витрата, built from витрати
only: a повернення, a дохід, a коригування or a переказ forms no merchant and reduces none —
with their сума, count and категорії, and the recurring merchant candidates that recur in most
months. When the owner
chooses to include individual транзакції, the пакет SHALL carry every транзакція of the period
with its дата, type, категорія or джерело, and сума, a переказ with both legs and the вид of each
end, and its опис only when описи are also included. A транзакція SHALL carry no identifier and
no рахунок назва in either case.

#### Scenario: Merchants when chosen

- **WHEN** описи are included and August holds three витрати with the опис «СІЛЬПО» totalling
  240000 minor units UAH in «Продукти»
- **THEN** the пакет's UAH merchants list «сільпо» with `2400.00 UAH`, 3 транзакції and «Продукти»

#### Scenario: Transactions without описи

- **WHEN** individual транзакції are included and описи are not
- **THEN** every транзакція of the period appears with its дата, type, категорія or джерело and
  сума, and none carries an опис or an identifier

#### Scenario: A переказ names its ends by вид, not by назва

- **WHEN** individual транзакції are included and August holds a переказ from a картка to a
  банка of 50000 minor units UAH
- **THEN** it appears as a переказ from a `spending` рахунок to a `savings` рахунок with both
  legs `500.00 UAH` and no рахунок назва

### Requirement: A period with nothing in it makes no пакет

When no stored транзакція falls in the chosen period, the system SHALL refuse to build a пакет
and SHALL say so, rather than building one of zeros. When the period holds fewer than two
months with транзакції, the пакет SHALL say that its history is short, so a reader does not
draw a trend from one month.

#### Scenario: An empty period is refused

- **WHEN** the chosen period holds no транзакція
- **THEN** no пакет is built and the reason is that there is nothing to analyse

#### Scenario: A short history is flagged

- **WHEN** the chosen period is six months and only the last one holds транзакції
- **THEN** the пакет is built and marks its history as short, with 1 month of data
