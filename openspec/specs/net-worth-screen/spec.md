# net-worth-screen Specification

## Purpose
The «Статок» screen: the whole history of the owner's статок month by month. It shows how each month
moved and why, a summary of any period, and an opt-in marked forecast, all read from net-worth
without changing or requesting anything.

## Requirements

### Requirement: «Статок» opens on the selected reading and month

The «Статок» screen SHALL open from the Статок widget on the shared history selection and offer:
- net-worth's choices: «Усе ≈ грн» and each currency held;
- a period: «6 міс», «1 рік», «2 роки» and «Усе», where «1 рік» is the default and a period counts
  the current month and the months before it;
- a view: «Стовпці» (default) and «Лінія» for the month-end level, and «Зміна» for each month's
  зміна.

The selection SHALL be shared with the widget, and the selection, the period and the view SHALL
survive leaving and reopening the screen while the app runs. The screen SHALL open with the current
month selected and show, above the chart:
- the selected month's статок: its month-end point, or for the current month the current Статок
  named «на <date>», exactly as the widget's headline;
- for the current month, the line on поточна вартість beyond вкладено when one exists, so the
  current Статок and the chart's today point are reconciled;
- its зміна and percentage, as net-worth's change rules read them for that month.

#### Scenario: The screen opens where the widget is
- **GIVEN** «Усе ≈ грн» selected, today October 1 and a current приблизний статок of ≈40140800 minor units UAH
- **WHEN** the owner taps the Статок widget
- **THEN** the screen reads «Статок на 1 жовтня ≈401 408 грн», its зміна with sign, mark and percentage, and «Стовпці» over one year with жовтень selected

#### Scenario: Choices survive the round trip
- **GIVEN** the owner chose USD, «2 роки» and «Лінія» on the screen
- **WHEN** the owner returns to Головний and opens Статок again
- **THEN** USD, «2 роки» and «Лінія» are still chosen, and the widget on Головний reads USD

### Requirement: Every month is named and its direction readable without colour

The chart SHALL name the months under it (every month when twelve or fewer are shown, else at a regular interval that always includes the first and the current month) and mark the selected month. «Стовпці» SHALL draw each month-end level as a bar and «Лінія» as a line with a dot per month, both on a scale named in the selected reading's currency, with negative levels below a visible zero line. «Зміна» SHALL draw each month's зміна as a bar up from or down to a zero line, distinguished by direction and by colour, never by colour alone. A month in which a рахунок entered SHALL carry a mark that reads «нові рахунки».

#### Scenario: Up and down months read at a glance
- **GIVEN** monthly зміни +1500000, −5600000, +2000000, +3400000 and +2600000 minor units UAH for June to October
- **WHEN** «Зміна» is shown
- **THEN** four bars rise and the July bar falls below the zero line, each month named under its bar

#### Scenario: Two years still name the months
- **GIVEN** history from October 2024 and «2 роки» chosen
- **WHEN** «Стовпці» is shown
- **THEN** 24 bars are drawn, листопад 2024 to жовтень 2026, month names appear at a regular interval including the first and the current month, and every bar can still be selected

#### Scenario: An entry month is marked
- **GIVEN** a рахунок entering in January 2026 with початковий залишок 4360237 minor units UAH
- **WHEN** «Стовпці» or «Зміна» is shown over that month
- **THEN** січень carries the «нові рахунки» mark, and its «Зміна» bar shows the зміна without those 43 602,37 грн

### Requirement: Selecting a month explains its change

Selecting a month by touch or by the month table SHALL show that month's статок, зміна, percentage and its розбивка as net-worth defines it — дохід, витрати, коригування, перекази й обмін, нові рахунки — each with its sign, omitting a zero line except дохід and витрати, and every amount marked «≈» in «Усе ≈ грн».

#### Scenario: The owner sees why July fell
- **GIVEN** July with дохід 6000000, витрати 11000000 and коригування −600000 minor units UAH and nothing else
- **WHEN** the owner taps July
- **THEN** above the chart reads July's month-end статок, зміна «−56 000 грн» with its percentage, and the розбивка «дохід +60 000 · витрати −110 000 · коригування −6 000»

### Requirement: The period is summarised beneath the chart

Beneath the chart the screen SHALL read net-worth's summary of the chosen period: its зміна and percentage, the average per complete month, and the best and worst complete month by name and зміна, saying when the period was cut to the history's start.

#### Scenario: The year at a glance
- **GIVEN** «1 рік» chosen on October 1, 2026
- **WHEN** the summary is read
- **THEN** it names the period «листопад 2025 — 1 жовтня», its зміна and percentage, the average per month over its eleven complete months, and its best and worst month

### Requirement: The month table reads every month

The screen SHALL list every month of the chosen period, newest first, with its статок at month-end (today's history point for the current month, as the chart's bar or dot), its зміна and its percentage where it has one, and a «нові рахунки» note where one entered. An unknown month SHALL read its reason instead of a value. The table SHALL be the screen's accessible chronological reading, and selecting a row SHALL select that month in the chart.

#### Scenario: An unrepresentable month says why
- **GIVEN** one month whose sum exceeds exact representability
- **WHEN** the table is read
- **THEN** that row names the month and says the сума перевищує безпечне представлення, and the rows around it keep their values

#### Scenario: The current month's row is the history point
- **GIVEN** an інвестиційний рахунок with поточна вартість 500000 UAH beyond its вкладено and today's history point 40000000
- **WHEN** the current month is read
- **THEN** the card reads the current Статок 40500000 with the investment line, while the bar and the table row read 40000000

#### Scenario: Rows read like Saldo's months
- **GIVEN** «6 міс» chosen
- **WHEN** the table is read
- **THEN** it reads жовтень (на 1 жовтня), вересень, серпень, липень, червень, травень, each with статок, зміна and percentage, in that order

### Requirement: «Прогноз» is off until asked and visibly not history

The screen SHALL offer «Прогноз» as a switch, off whenever the screen opens, and only for «Стовпці» and «Лінія». Switched on, it SHALL draw net-worth's прогноз статку after today:
- the projected values as a dashed continuation, or outlined bars in «Стовпці»;
- the range as a band;
- months that are visibly distinct from recorded ones.

It SHALL caption the continuation «≈ якщо темп збережеться: <темп> на місяць, медіана останніх 6 місяців», and SHALL read the last projected month's value and range. When net-worth withholds the прогноз, the screen SHALL say why and draw nothing after today. «Прогноз» SHALL never appear on Головний.

#### Scenario: The owner asks where the trend leads
- **GIVEN** at least six complete months of history and «Лінія» chosen
- **WHEN** the owner switches «Прогноз» on
- **THEN** a dashed line with a band continues for six month-ends after today, captioned with its темп, and the recorded line, the summary and the table are unchanged

#### Scenario: «Зміна» offers no forecast
- **GIVEN** «Прогноз» switched on in «Лінія»
- **WHEN** the owner chooses «Зміна»
- **THEN** no «Прогноз» switch or continuation is shown, and returning to «Лінія» shows the continuation again

#### Scenario: The forecast does not persist
- **GIVEN** «Прогноз» switched on
- **WHEN** the owner leaves the screen and opens it again
- **THEN** «Прогноз» is off

### Requirement: The account explanation and the month table say only what holds

The screen SHALL keep, behind «Пояснення», Статок's account explanation:
- each рахунок with its сума;
- «вкладено» only beside an інвестиційний рахунок counted at its вкладено;
- «поточна вартість на <date>» beside one counted at its поточна вартість;
- no basis word for any other вид.

Under that explanation it SHALL read the difference from «Усього грошей» on Рахунки, an action that opens Рахунки, and the history basis caption, which for «Усе ≈ грн» adds «≈ за поточним курсом, не за курсом на дату» and the oldest rate's date. Every percentage SHALL use a decimal comma. A withheld «Усе ≈ грн» SHALL name each currency missing its rate and draw no chart, summary or table for it.

#### Scenario: A card is not «вкладено»
- **WHEN** the explanation lists «mono black» (витратний), «інжур» (інвестиційний, no поточна вартість) and «облігація $» (інвестиційний, поточна вартість on 2026-09-21)
- **THEN** «mono black» shows its сума alone, «інжур» shows its сума with «вкладено», and «облігація $» shows its сума with «поточна вартість на 21 вересня»

#### Scenario: The percent reads as Ukrainian
- **WHEN** Статок grew by 72 028,07 UAH, 62,4%, since 31 August
- **THEN** the зміна reads «+72 028,07 UAH · +62,4%»

#### Scenario: A missing rate is named
- **GIVEN** accounts in UAH and EUR with no cached EUR rate and «Усе ≈ грн» chosen
- **WHEN** the screen is read
- **THEN** it names EUR as missing its rate, and the UAH and EUR choices still show their own histories

### Requirement: «Статок» stays usable on compact Android and with TalkBack

On a 360 × 640 dp Android screen at default and 200 % text, every choice, bar and row SHALL be a target of at least 48 × 48 dp or reachable through the month table. Amounts SHALL not truncate digits. TalkBack SHALL read:
- each choice with its selected state;
- the chart with its reading, period and scale;
- each month with its статок, зміна and direction in words;
- the «Прогноз» continuation as «прогноз».

#### Scenario: A month is read aloud
- **GIVEN** TalkBack on and «Зміна» shown
- **WHEN** the owner moves to липень
- **THEN** it reads «липень, статок <amount>, зміна мінус 56 000 гривень, спад»
