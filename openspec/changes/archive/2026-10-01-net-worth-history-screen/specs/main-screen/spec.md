## MODIFIED Requirements

### Requirement: The dashboard uses local data without new network work

Dashboard widgets SHALL use existing local data and existing refresh policies without additional requests, remaining responsive on large history and reflecting committed changes and local date changes without stale financial combinations.

#### Scenario: Offline graphs need no request
- **GIVEN** cached data/rates and no network
- **WHEN** the owner opens and scrolls Головний, opens Статок, switches its reading and period, and selects a month
- **THEN** local content works, no widget or screen requests data, and only the pre-existing shared refresh/sync policies can attempt network activity

#### Scenario: A large history scrolls smoothly
- **GIVEN** 50000 records, 30 accounts and 120 months on the documented compact Android test device
- **WHEN** Головний loads and the owner scrolls for ten seconds after load
- **THEN** top content becomes readable within one second and scrolling has no sustained frame rate below 55 fps, with at most five default transaction rows

#### Scenario: Data changes invalidate derived readings
- **GIVEN** an already loaded dashboard
- **WHEN** an edit, deletion, retype, valuation change, opening-balance or its дата edit, import, restore or committed sync changes its inputs
- **THEN** the next displayed result uses one coherent updated reading and obsolete in-flight results cannot overwrite it

## ADDED Requirements

### Requirement: The Статок widget is a compact summary that opens «Статок»

The Статок widget SHALL be a compact summary of the selected history reading that opens the «Статок» screen when tapped, showing:
- its current value prominently: the приблизний статок «≈ … грн» for «Усе ≈ грн», the exact amount for a currency;
- beneath it, always, every exact per-currency current value on one line;
- the change since the preceding month-end, as net-worth's change, with sign, an up or down mark, its percentage where it has one, its «від» date and any «нові рахунки» beside it;
- the line on поточна вартість beyond вкладено, when one exists;
- a chart of the current month and the eleven months before it, at each month-end and today, with each month named under it and the current month marked.

It SHALL carry no point list, account explanation or selector of its own; those, and the action to Рахунки, belong to the «Статок» screen, whose selection it reflects. When that selection is «Усе ≈ грн» and net-worth withholds it for a missing rate, the widget SHALL name each currency missing its rate in place of the chart and change, and still show every exact currency amount.

#### Scenario: Headline and history use different investment bases
- **GIVEN** an investment with вкладено 100000 and dated current value 150000 minor units UAH
- **WHEN** Статок is read
- **THEN** its current contribution uses 150000, the chart uses вкладено, the 50000 difference is read on its own line, and no market-performance change is invented

#### Scenario: The widget answers "is it growing" at a glance
- **GIVEN** accounts in UAH, USD and EUR with cached rates, «Усе ≈ грн» as the default, no поточна вартість entered, the September 30 point ≈37500000 and today's point ≈40140800 minor units UAH on October 1
- **WHEN** the owner reads Статок on Головний
- **THEN** it shows «≈401 408 грн», the three exact currency amounts on one line, «+≈26 408 грн · +7,0% ▲ · від 30 вересня», and a chart whose months from листопад to жовтень are named under it

#### Scenario: Tapping opens the screen
- **WHEN** the owner taps the Статок widget
- **THEN** the «Статок» screen opens on the same selection, and returning shows Головний where it was

#### Scenario: A missing rate falls back to UAH by default
- **GIVEN** accounts in UAH and EUR with no cached EUR rate and no choice made
- **WHEN** Статок is read on Головний
- **THEN** UAH is the selection, and the widget draws UAH's history with no «≈» line

#### Scenario: A withheld combined history says why
- **GIVEN** «Усе ≈ грн» chosen on the «Статок» screen, and later no cached EUR rate for a held EUR рахунок
- **WHEN** Статок is read on Головний
- **THEN** the widget names EUR as missing its rate in place of the chart and change, and the exact UAH and EUR amounts are still shown

#### Scenario: The widget is announced to TalkBack
- **GIVEN** «Усе ≈ грн» selected
- **WHEN** TalkBack reads the Статок widget
- **THEN** it says the whole статок approximated in гривнях, its current value, its change with direction in words and its date, and that a tap opens Статок

## REMOVED Requirements

### Requirement: Статок's explanation and history say only what holds
**Reason**: The account explanation and the history's chronological reading move from the compact widget to the «Статок» screen.
**Migration**: Restated with the same wording rules in net-worth-screen, "The account explanation and the month table say only what holds".

### Requirement: Статок exposes its basis beside its chart
**Reason**: The widget no longer carries the selector, the point list or the account explanation (owner's request 2026-10-01), so its scenarios on the point list and the selector's TalkBack label no longer hold.
**Migration**: Replaced by "The Статок widget is a compact summary that opens «Статок»". The selector, its TalkBack labels and the chronological reading move to net-worth-screen ("«Статок» opens on the selected reading and month", "The month table reads every month", "«Статок» stays usable on compact Android and with TalkBack").
