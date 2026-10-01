## MODIFIED Requirements

### Requirement: History is reconstructed from recorded balances only

Historical Статок context SHALL show per-currency розрахункові баланси reconstructed from openings and dated transaction effects, each рахунок counted from its дата початкового залишку, with investments at вкладено and an explicit «Історія розрахункових балансів · інвестиції за вкладеним» basis, never treating the latest поточна вартість, bank balance, achievement evidence or current exchange rate as historical market value. The only place a current exchange rate touches history is the separately marked «≈» combined UAH history, which converts these unchanged per-currency balances and never alters them.

#### Scenario: Today's valuation never changes past points
- **GIVEN** investment opening zero, August contribution 100000 UAH and September current value 150000
- **WHEN** the historical August point is read and current value is replaced with 170000
- **THEN** August remains 100000 UAH in both readings, the current headline changes, and no line joins the ledger endpoint to the current valuation

#### Scenario: Transactions retain their account effects
- **GIVEN** a zero-opening account with income 10000, expense 3000, refund 1000, correction −200 and correction +500 before a point, all minor units UAH
- **WHEN** that point is read
- **THEN** its reconstructed balance is 8300 UAH

#### Scenario: Transfers retain both legs and fees are counted once
- **GIVEN** a 100000 UAH card, a zero UAH jar and a transfer arriving as 99500
- **WHEN** a 500 fee was accepted as its separate expense with the transfer normalized to 99500 on each leg
- **THEN** their combined reconstructed balance is 99500 UAH, exactly as the existing account balances
- **AND** declining the fee and storing legs 100000/99500 yields the same combined balance

#### Scenario: FX transfer keeps its two real amounts
- **GIVEN** a transfer of 410000 minor units UAH to 10000 minor units USD
- **WHEN** history is reconstructed
- **THEN** the UAH source loses 410000 and USD destination gains 10000, and changing today's FX rate changes neither per-currency history

### Requirement: History spans the available record without forecasting

The history SHALL span from the earliest дата початкового залишку or транзакція dated on or before today through today, with dated end-of-day points at that first date, intervening month-ends and today, retaining empty months and showing no fabricated series without any recorded рахунок entry. The history itself SHALL never extend past today; «Прогноз статку» is a separate, separately marked reading that never becomes a history point.

#### Scenario: The first date does not absorb its whole month
- **GIVEN** zero opening and income of 10000 UAH on June 5 followed by an expense of 2000 UAH on June 20
- **WHEN** the first June 5 and June 30 points are read
- **THEN** they are 10000 and 8000 UAH respectively, rather than both using the month-end balance

#### Scenario: Empty months carry balances
- **GIVEN** zero openings with transactions in June and August and none in July, and today September 19
- **WHEN** history is read
- **THEN** it begins at the first June date, contains June/July/August month-ends and September 19, with July carrying June's ending balance

#### Scenario: An opening dated before any транзакція starts the history
- **GIVEN** a рахунок with початковий залишок 12300 UAH dated 2024-10-27 and its first транзакція on 2024-10-28
- **WHEN** history is read
- **THEN** it begins on 2024-10-27 at 12300 UAH

#### Scenario: Future dates do not extend the curve
- **GIVEN** today September 19 and a stored expense dated October 2
- **WHEN** history and current Статок are read
- **THEN** the curve ends today without that expense, and the all-recorded current reading discloses its future records

#### Scenario: No history or one date
- **GIVEN** no рахунок at all, or рахунки whose every entry falls on today — created today, or with no дата and no транзакція
- **WHEN** the chart is read
- **THEN** the first case draws no history, and the second shows one dated point without a line or period change

#### Scenario: Reconstructing is not an immutable audit log
- **GIVEN** an already displayed history
- **WHEN** an opening or its дата is corrected or a transaction is edited, deleted, backdated, imported or restored
- **THEN** points recompute from the current record and do not claim to preserve prior market valuations or prior versions of the record

### Requirement: Change requires a comparable previous month-end

A Статок change SHALL compare today's reconstructed point to the preceding calendar month-end's point in the same currency — both on the recorded-balance basis, so an entered поточна вартість never withholds it and a транзакція dated after today never enters it — leaving out the початкові залишки of рахунки that entered between the two dates, which SHALL be stated separately as «нові рахунки». It SHALL show the signed absolute change, and a percentage of the baseline only for a strictly positive baseline.

#### Scenario: Positive comparable baseline
- **GIVEN** August 31 reconstructed UAH 100000 and today's reconstructed UAH 120000 with no рахунок entering between them
- **WHEN** change is shown on September 19
- **THEN** it reads +20000 UAH, +20,0%, «від 31 серпня», without claiming investment return

#### Scenario: Zero or negative denominator
- **GIVEN** comparable baseline 0 or −10000 UAH and today's point 20000 UAH
- **WHEN** change is read
- **THEN** it is respectively +20000 or +30000 UAH with no percentage, infinity or misleading negative-base growth

#### Scenario: An entered поточна вартість does not withhold the change
- **GIVEN** an інвестиційний рахунок with вкладено 100000 and поточна вартість 150000 UAH, August 31 at 300000 and today's reconstructed point at 320000 UAH
- **WHEN** change is read
- **THEN** it reads +20000 UAH, +6,7% on the recorded-balance basis, and the поточна вартість neither enters nor withholds it

#### Scenario: A new рахунок is not growth
- **GIVEN** August 31 at 100000 UAH, a рахунок entering on September 5 with початковий залишок 50000 UAH, and today's point at 160000 UAH
- **WHEN** change is read
- **THEN** it reads +10000 UAH, +10,0%, and «нові рахунки +50000 UAH» is stated beside it

#### Scenario: A future-dated record does not enter the change
- **GIVEN** August 31 at 100000 UAH, today's point at 120000 UAH and a stored expense of 5000 UAH dated after today
- **WHEN** change is read
- **THEN** it reads +20000 UAH, and the current headline still discloses its future record

#### Scenario: No matching baseline means no change
- **GIVEN** the earliest entry of all рахунки falls in the current month, or the previous month-end is not representable
- **WHEN** change is requested
- **THEN** no change amount or percentage is shown and why is stated; no older period is silently substituted

## ADDED Requirements

### Requirement: A рахунок enters Статок history at its дата початкового залишку

Each рахунок SHALL contribute nothing to the history before its дата початкового залишку and its початковий залишок plus its dated транзакції from that date on, where the дата is the earlier of the рахунок's recorded дата початкового залишку and its first транзакція dated on or before today, the first such транзакція alone when no дата is recorded, and today when it has neither; a recorded дата after today counts as today. A per-currency point SHALL therefore always be known unless its sum is not exactly representable, and an entry SHALL be read as a step marked «нові рахунки», never as growth.

#### Scenario: A later рахунок does not hide earlier history
- **GIVEN** UAH рахунки recorded from 2024-10-28 and another UAH рахунок with початковий залишок 80316 and no recorded дата, first used on 2026-02-27
- **WHEN** UAH history is read
- **THEN** it is known from 2024-10-28, the later рахунок contributes nothing before 2026-02-27, and from that date on it contributes 80316 plus its транзакції

#### Scenario: An earlier first транзакція wins over the recorded дата
- **GIVEN** a EUR рахунок with початковий залишок 30000 dated 2026-06-08 and its first транзакція on 2026-06-07
- **WHEN** EUR history is read
- **THEN** the рахунок enters on 2026-06-07, the earlier of the two

#### Scenario: A рахунок with neither enters today
- **GIVEN** a EUR рахунок with початковий залишок 2022, no recorded дата and no транзакція
- **WHEN** EUR history is read
- **THEN** it contributes nothing to earlier points and 2022 to today's point, consistent with the current Статок

#### Scenario: A zero opening adds no step
- **GIVEN** a рахунок with початковий залишок zero first used in March
- **WHEN** the March change is read
- **THEN** «нові рахунки» for March is zero and its транзакції count as ordinary movement

### Requirement: Each month's change has a розбивка

For each month of the history, per currency, the change from the previous month-end (zero before the first entry) to that month's end, or to today for the current month, SHALL be read as a розбивка that adds up exactly to it: дохід, витрати net of повернення, коригування, перекази й обмін (the net of every переказ leg in that currency, non-zero only for cross-currency перекази or legs of unequal amounts), and нові рахунки (the початкові залишки entering that month). A переказ between two of the owner's рахунки of one currency SHALL contribute nothing, an інвестиція and a переказ to a рахунок-борг included. «Витрати» here are not Місяць's витрачено: коригування stay their own line. In «Усе ≈ грн» each component SHALL be the per-currency component converted at the current rate, with any difference from rounding carried by «перекази й обмін», so the components still add up exactly to the «≈» change. The month's «зміна» SHALL be the total less «нові рахунки», with a percentage of the preceding month-end only when that is strictly positive — the same rule as today's change, applied to every month. The month holding the history's first date has no preceding month-end and therefore no зміна or percentage, though its розбивка still reads against zero. A **complete month** is a calendar month that ended before today and has a зміна; the summary and «Прогноз статку» count complete months only.

#### Scenario: Flows and corrections explain the month
- **GIVEN** UAH in September: дохід 60000, витрати 30000, повернення 2000, коригування −500, a переказ of 10000 to an own UAH jar and a переказ of 5000 to a рахунок-борг
- **WHEN** September's розбивка is read
- **THEN** it reads дохід +60000, витрати −28000, коригування −500, перекази й обмін 0, нові рахунки 0, and a зміна of +31500 UAH

#### Scenario: An exchange moves money between currencies
- **GIVEN** a переказ from UAH 410000 to USD 10000 in September, no USD before September, and nothing else
- **WHEN** the UAH and USD розбивки are read
- **THEN** UAH reads перекази й обмін −410000 and USD reads +10000; in «Усе ≈ грн» at 41.25345 the line reads ≈+2535, which is the difference between the bank's rate and the current one

#### Scenario: A new рахунок is its own line
- **GIVEN** a рахунок entering in September with початковий залишок 50000 UAH
- **WHEN** September's розбивка is read
- **THEN** нові рахунки reads +50000 and the September зміна leaves it out

#### Scenario: A history starting mid-month has no first зміна
- **GIVEN** history beginning on 2024-10-28 with a рахунок of початковий залишок 12300 UAH and дохід 5000 UAH on 2024-10-29, and дохід 1000 UAH in November
- **WHEN** October and November 2024 are read
- **THEN** October has no зміна or percentage and its розбивка reads дохід +5000 and нові рахунки +12300; November reads зміна +1000 and +5,8% against October's 17300; October is not a complete month

### Requirement: A period of history is summarised

For a chosen period ending today, Статок SHALL read the period's зміна (the sum of its months' зміни, нові рахунки left out), its percentage of the level at the month-end before the period only when that level is strictly positive, the average зміна per complete month rounded half away from zero, and the complete months with the highest and lowest зміна. A period longer than the history SHALL be cut to the history and say so; its зміна then runs from the end of the history's first month, whose level is the percentage's base.

#### Scenario: A half-year summary
- **GIVEN** monthly зміни +10000, +20000, −5000, +15000, +30000 for April–August, +12000 so far in September, and a level of 200000 at March 31, all UAH
- **WHEN** the six-month period is read on September 19
- **THEN** it reads зміна +82000 UAH, +41,0%, середня +14000 per month over the five complete months, найкращий серпень +30000 and найгірший червень −5000

#### Scenario: The period is longer than the history
- **GIVEN** history beginning in June and the two-year period chosen
- **WHEN** the summary is read
- **THEN** it covers June through today and names June as its start

### Requirement: Прогноз статку is a marked, opt-in continuation

On request, Статок SHALL project the selected reading for the end of the current month and the five following month-ends: starting from today's point and advancing at the темп, the median зміна of the last six complete months (the mean of the middle two, rounded half away from zero), for the rest of the current month in proportion to its days left. It SHALL also give a range, advancing the same way at the lower and upper hinges — the medians of the lower and upper halves of the known зміни among the last twelve complete months, the middle value of an odd count belonging to neither half. Every projected value SHALL be marked «≈» and captioned «якщо темп збережеться» with the темп stated. It SHALL be withheld, saying why, with fewer than six complete months or with any of them unknown. It SHALL be computed when shown, stored nowhere, request nothing, and change no other reading, ціль, досягнення or record.

#### Scenario: A steady pace projects a straight continuation
- **GIVEN** the last six complete months' зміни +10000, +12000, +14000, +16000, +18000, +20000 UAH, today's point 300000 on September 15 of a 30-day month
- **WHEN** «Прогноз» is read
- **THEN** the темп is +15000 per month, September 30 reads ≈307500 and October 31 ≈322500, each marked «≈» and «якщо темп збережеться»

#### Scenario: The range comes from a year's spread
- **GIVEN** the same today and the last twelve complete months' зміни 0, +5000, +10000, +15000, +20000, +25000 followed by +10000, +12000, +14000, +16000, +18000, +20000 UAH
- **WHEN** «Прогноз» is read
- **THEN** the hinges are +10000 and +19000; September 30 ranges ≈305000–≈309500 and October 31 ≈315000–≈328500

#### Scenario: A raise moves the pace within half a year
- **GIVEN** the last twelve complete months' зміни +10000 six times, then +24000, +25000, +26000, +25000, +24000, +26000 UAH after a salary rise
- **WHEN** «Прогноз» is read
- **THEN** the темп is +25000, the median of the last six, not the twelve-month mean +17500

#### Scenario: An odd count leaves the middle out of both halves
- **GIVEN** exactly seven complete months with зміни +1000, +2000, +3000, +4000, +5000, +6000, +7000 UAH
- **WHEN** the range is read
- **THEN** the hinges are +2000 and +6000

#### Scenario: Too little history withholds the forecast
- **GIVEN** history beginning four complete months ago
- **WHEN** «Прогноз» is requested
- **THEN** no projected value appears and the reason «потрібно 6 повних місяців» is given

#### Scenario: A forecast never becomes a record
- **GIVEN** «Прогноз» shown and then hidden
- **WHEN** Статок, the history, goals and досягнення are read
- **THEN** none of them changed and nothing was stored or requested

### Requirement: The поточна вартість beyond вкладено is read on its own

When any інвестиційний рахунок counts at its поточна вартість in the current Статок, Статок SHALL state, per currency (and «≈» in UAH for «Усе ≈ грн»), how far the summed поточна вартість differs from its вкладено, naming the oldest observation date, so the headline's difference from today's history point is explained and never folded into зміна.

#### Scenario: The investment difference is its own line
- **GIVEN** an інвестиційний рахунок with вкладено 5500000 and поточна вартість 6000000 UAH observed on September 21, and today's reconstructed UAH point 40000000
- **WHEN** Статок is read
- **THEN** the headline is 40500000 UAH, the history point is 40000000, and a line reads «інвестиції: +500000 UAH понад вкладене, станом на 21 вересня»

### Requirement: History is readable without colour, with «Усе ≈ грн» as the default reading

Historical context SHALL name its selected reading, date range and scale, provide exact dated point values and an accessible chronological reading, and preserve unknown points even when its compact visual representation is reduced. When the owner holds more than one currency the selector SHALL offer «Усе ≈ грн» beside the currencies and SHALL select it by default whenever every non-UAH currency held has a cached rate; otherwise the default SHALL be UAH when held, else the first currency in the existing order. An available choice the owner made SHALL survive refresh independently of the category widget's selection, and a preserved «Усе ≈ грн» SHALL fall back to the default once the owner holds a single currency.

#### Scenario: History currency has a deterministic default
- **GIVEN** accounts in UAH, USD and EUR with cached USD and EUR rates, independently of the category widget selection
- **WHEN** historical context first opens
- **THEN** «Усе ≈ грн» is selected, and a subsequent choice of USD survives refresh

#### Scenario: A missing rate makes UAH the default
- **GIVEN** accounts in UAH and EUR with no cached EUR rate
- **WHEN** historical context first opens
- **THEN** UAH is selected; absent UAH the first existing currency order is selected

#### Scenario: Point values remain exact
- **GIVEN** 120 months of UAH and USD history including an unrepresentable point
- **WHEN** USD is selected and a date is inspected using touch or accessibility controls
- **THEN** its exact USD value or the reason it has none and its date are read, the scale names USD, and no line bridges an unknown point

#### Scenario: Negative and flat history
- **GIVEN** negative balances or every known point at the same value
- **WHEN** history is rendered
- **THEN** its stated scale includes all values with a nonzero visual range, no division by zero occurs and sign is available in text

#### Scenario: The combined choice is offered only when it adds something
- **GIVEN** accounts in UAH and USD, then accounts in UAH only
- **WHEN** the history selector is read in each case
- **THEN** it offers UAH, USD and «Усе ≈ грн» in the first case and no combined choice in the second

#### Scenario: The combined choice does not outlive its currencies
- **GIVEN** accounts in UAH and USD with «Усе ≈ грн» selected, and later the USD account is the last one removed
- **WHEN** history is read after that removal
- **THEN** UAH is selected rather than an unavailable combined choice

### Requirement: Приблизний статок в динаміці converts each dated point at the current rate

The «Усе ≈ грн» history (приблизний статок в динаміці) SHALL convert each currency's reconstructed розрахунковий баланс at each dated point using the most recently cached monobank rate as net-worth's приблизний статок does (buying rate, cross rate only where buying rate is unavailable), sum the results in integer minor units UAH rounded with halves away from zero, mark every value «≈», and state that it uses the current rate and not the rate on the date. Like приблизний статок it SHALL keep cached stale rates visible by disclosing the oldest participating rate's own moment, and it SHALL fetch, store and change nothing. It SHALL span the same dated points as the per-currency history.

#### Scenario: Each date converts at the one current rate
- **GIVEN** UAH 100000 and USD 10000 minor units at the August 31 point, UAH 100000 and USD 20000 today, and a cached rate 41.25345 UAH/USD
- **WHEN** «Усе ≈ грн» is read
- **THEN** August 31 reads ≈512535 and today ≈925069 minor units UAH, both marked «≈» and captioned as the current rate, with the exact per-currency histories unchanged

#### Scenario: Changing today's rate revalues every point together
- **GIVEN** the history above
- **WHEN** the cached USD rate changes to 40.00000
- **THEN** every point of «Усе ≈ грн» is recomputed at 40.00000 and no point keeps the earlier rate; the per-currency histories are unchanged

#### Scenario: Stale cached rates stay marked and nothing is requested
- **GIVEN** all needed cached rates exist but are old and the phone is offline
- **WHEN** «Усе ≈ грн» is read
- **THEN** it uses those rates, discloses the oldest participating rate's own moment, and makes no request, stores no rate and changes no record

#### Scenario: A currency first held later does not shorten the whole
- **GIVEN** UAH рахунки recorded from October 2024 and EUR рахунки whose дати початкового залишку are June 7 and August 30, 2026, with a cached EUR rate
- **WHEN** «Усе ≈ грн» is drawn
- **THEN** it starts in October 2024, EUR contributes nothing before June 7, and its entries are steps marked «нові рахунки»

### Requirement: A point of приблизний статок в динаміці is complete or absent

A point of the «Усе ≈ грн» history SHALL exist only when the reconstructed баланс of every currency held is representable on that date and the converted sum is exactly representable, where a currency is held when any recorded рахунок of it exists, archived and zero-balance рахунки included, as Статок's own scope. Every non-UAH currency held SHALL have a cached rate, including one whose баланс is zero; when any is missing the whole history SHALL be withheld — no point and no line — and the only reading SHALL be the message naming each currency without a rate, while the per-currency histories remain readable. Every other unknown point SHALL say that the сума перевищує безпечне представлення, and never be a partial sum.

#### Scenario: A missing rate withholds the whole history
- **GIVEN** UAH, USD and EUR balances and no cached EUR rate, including when the EUR balance is zero
- **WHEN** «Усе ≈ грн» is read
- **THEN** no point, line or point list appears, EUR is named as missing its rate, and the per-currency histories remain readable

#### Scenario: A currency held only in an archived рахунок still needs its rate
- **GIVEN** UAH accounts and an archived EUR рахунок with a zero баланс, and no cached EUR rate
- **WHEN** «Усе ≈ грн» is read
- **THEN** the history is withheld naming EUR, exactly as with an active EUR рахунок

#### Scenario: A рахунок entering later is a step, not a gap
- **GIVEN** complete UAH history and a USD рахунок with початковий залишок 10000 USD and дата початкового залишку March 10, and a cached USD rate
- **WHEN** January, February and March-end points are read
- **THEN** January and February are values with USD contributing nothing, and March-end includes the converted USD рахунок

#### Scenario: Overflow is a gap that says so
- **GIVEN** converted balances whose sum exceeds exact representability on one date
- **WHEN** that point is read
- **THEN** it is an unknown point saying the amount exceeds safe representation, not missing data

### Requirement: The change of приблизний статок compares recorded-balance points

The change of the «Усе ≈ грн» history SHALL compare today's «≈» point to the preceding calendar month-end's «≈» point at the same current rates, leaving out the converted початкові залишки of рахунки that entered between the two dates, which SHALL be stated separately as «нові рахунки», and SHALL show the signed absolute change marked «≈» and a percentage only for a strictly positive baseline; when either point is unknown it SHALL state the reason instead of a number.

#### Scenario: Positive comparable baseline
- **GIVEN** the August 31 point ≈100000 and today's point ≈120000 minor units UAH, with no рахунок entering between them
- **WHEN** the change is shown on September 19
- **THEN** it reads +≈20000 UAH, +20,0%, «від 31 серпня», without claiming investment return or a rate movement

#### Scenario: Zero or negative baseline has no percentage
- **GIVEN** a comparable baseline ≈0 or ≈−10000 and today's point ≈20000 minor units UAH
- **WHEN** the change is read
- **THEN** it is respectively +≈20000 or +≈30000 UAH with no percentage

#### Scenario: An entered поточна вартість does not withhold the change
- **GIVEN** an інвестиційний рахунок whose поточна вартість replaces вкладено in the headline
- **WHEN** the change is requested
- **THEN** it is computed on the recorded-balance points and shown

#### Scenario: A missing baseline withholds the change
- **GIVEN** the previous month-end point is not representable
- **WHEN** the change is requested
- **THEN** no amount or percentage is shown, and no older period is substituted

## REMOVED Requirements

### Requirement: Undated opening money produces honest coverage gaps
**Reason**: Owner's decision 2026-10-01: a рахунок enters Статок at its дата початкового залишку, as in Saldo, instead of making its whole currency unknown before its first транзакція. On the owner's data the old rule hid 16 months of UAH history behind one 803 UAH рахунок.
**Migration**: Replaced by "A рахунок enters Статок history at its дата початкового залишку". Existing рахунки without a recorded дата enter at their first транзакція. A Saldo re-import or an edit of the рахунок records the exact дата.

### Requirement: History is readable without interpreting color or pixels
**Reason**: Owner's decision 2026-10-01: «Усе ≈ грн» is the default whenever more than one currency is held and every rate is cached, so "never the default" no longer holds.
**Migration**: Replaced by "History is readable without colour, with «Усе ≈ грн» as the default reading"; the scenario on a choice outliving its currencies is kept as "The combined choice does not outlive its currencies".

### Requirement: Приблизний статок в динаміці converts history at the current rate
**Reason**: With every рахунок entering at its дата початкового залишку a per-currency history has no leading gaps, so "Leading gaps do not become empty chart" no longer describes anything.
**Migration**: Replaced by "Приблизний статок в динаміці converts each dated point at the current rate", with "A currency first held later does not shorten the whole".

### Requirement: Приблизний статок в динаміці is complete or absent
**Reason**: A рахунок entering later is now a step, not an unknown currency, so "An unknown currency makes the point a gap, not a partial sum" no longer holds; only overflow and a missing rate leave a point or the history without a value.
**Migration**: Replaced by "A point of приблизний статок в динаміці is complete or absent", with "A рахунок entering later is a step, not a gap".

### Requirement: The change of приблизний статок compares like with like
**Reason**: The change is now point-to-point on the recorded-balance basis, so an entered поточна вартість or a future-dated record no longer withholds it.
**Migration**: Replaced by "The change of приблизний статок compares recorded-balance points"; the two withholding scenarios become "An entered поточна вартість does not withhold the change" there and "A future-dated record does not enter the change" in "Change requires a comparable previous month-end".
