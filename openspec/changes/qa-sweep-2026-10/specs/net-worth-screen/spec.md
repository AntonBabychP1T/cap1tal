## MODIFIED Requirements

### Requirement: Selecting a month explains its change

Selecting a month by touch or by the month table SHALL show that month's статок, зміна, percentage and its розбивка as net-worth defines it — дохід, витрати, коригування, перекази й обмін, нові рахунки — each with its sign, omitting a zero line except дохід and витрати. In a reading of one currency every amount, the розбивка's included, SHALL be written as app-shell's «A сума reads with its currency code everywhere» writes a сума — its number followed by its currency code; in «Усе ≈ грн» every amount is marked «≈».

#### Scenario: The owner sees why July fell
- **GIVEN** July with дохід 6000000, витрати 11000000 and коригування −600000 minor units UAH and nothing else
- **WHEN** the owner taps July
- **THEN** above the chart reads July's month-end статок, зміна «−56 000,00 UAH» with its percentage, and the розбивка «дохід +60 000,00 UAH · витрати −110 000,00 UAH · коригування −6 000,00 UAH»

### Requirement: Every month is named and its direction readable without colour

The chart SHALL name the months under it (every month when twelve or fewer are shown, else at a regular interval that always includes the first and the current month) and mark the selected month. The months of «Прогноз», when it is on, count among the shown months for this rule, and no two month names SHALL overlap or touch, whatever the width of the screen: when the names do not fit, the interval widens until they do. «Стовпці» SHALL draw each month-end level as a bar and «Лінія» as a line with a dot per month, both on a scale named in the selected reading's currency, with negative levels below a visible zero line. «Зміна» SHALL draw each month's зміна as a bar up from or down to a zero line, distinguished by direction and by colour, never by colour alone. A month in which a рахунок entered SHALL carry a mark that reads «нові рахунки».

#### Scenario: Up and down months read at a glance
- **GIVEN** monthly зміни +1500000, −5600000, +2000000, +3400000 and +2600000 minor units UAH for June to October
- **WHEN** «Зміна» is shown
- **THEN** four bars rise and the July bar falls below the zero line, each month named under its bar

#### Scenario: Two years still name the months
- **GIVEN** history from October 2024 and «2 роки» chosen
- **WHEN** «Стовпці» is shown
- **THEN** 24 bars are drawn, листопад 2024 to жовтень 2026, month names appear at a regular interval including the first and the current month, and every bar can still be selected

#### Scenario: The forecast does not crowd the names
- **GIVEN** «1 рік» chosen and «Прогноз» on, so twelve recorded and six forecast months are drawn
- **WHEN** «Стовпці» is shown on a phone 360 dp wide
- **THEN** month names appear at a regular interval including the first and the current month, and no two of them overlap

#### Scenario: An entry month is marked
- **GIVEN** a рахунок entering in January 2026 with початковий залишок 4360237 minor units UAH
- **WHEN** «Стовпці» or «Зміна» is shown over that month
- **THEN** січень carries the «нові рахунки» mark, and its «Зміна» bar shows the зміна without those 43 602,37 UAH
