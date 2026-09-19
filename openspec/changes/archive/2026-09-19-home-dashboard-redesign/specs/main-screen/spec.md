## MODIFIED Requirements

### Requirement: Opening Головний again shows it from the month's status

Returning to Головний from another tab SHALL show its header and current-month card from the top while scrolling within it and data refreshes leave the owner's scroll position alone.

#### Scenario: Coming back lands on the month's status
- **GIVEN** Головний was scrolled to Статок
- **WHEN** the owner visits Місяць and returns
- **THEN** Головний starts at its header and month card

#### Scenario: Scrolling within Головний is untouched
- **WHEN** the owner scrolls Головний down and stays on it
- **THEN** the screen stays where it was scrolled to

#### Scenario: A sync refresh does not reset scrolling
- **GIVEN** the owner is reading categories
- **WHEN** a sync updates stored data without leaving Головний
- **THEN** refreshed values appear without resetting the scroll position

## REMOVED Requirements

### Requirement: Головний leads to «Прогрес» when there is something to see
**Reason**: Default daily reading excludes the Progress widget even with unseen досягнення or accepted виклики.
**Migration**: Keep Progress and all stored data reachable through Звіти as progress-screen defines.

### Requirement: Головний leads with the month's залишилось
**Reason**: The primary metric becomes витрачено for the current month, not залишилось — replaced by «The primary month amount is витрачено». The daily question this answers is where the money went, not what remains.
**Migration**: залишилось keeps its monthly-picture meaning and formula unchanged; it is read on Місяць, one tap away via the month card.

### Requirement: The money held is a secondary line that leads to Рахунки
**Reason**: Replaced by «Статок» — a derived reading across all recorded accounts, including archived and debt accounts, rather than only active unarchived totals.
**Migration**: Existing active-account totals on Рахунки are unchanged; «Статок» is defined by the net-worth capability and states its difference from that total.

### Requirement: «Потребує уваги» appears only when something is waiting
**Reason**: Replaced by a compact uncategorised banner and up to two collapsed operational rows in the default feed — no separate attention section.
**Migration**: Uncategorised count and pending чернетки remain reachable and behave as before; see «Uncategorised records are a compact feed banner» and «Operational alerts remain compact and actionable».

### Requirement: Everything stored is reachable from Головний
**Reason**: Replaced by «The feed shows the latest five legible records», which keeps the five-record cap, the newest-first ordering and the «Усі» offer for the same latest-transactions section and adds explicit money direction, description, account/type distinction and one-tap categorisation to it.
**Migration**: None — the five-record cap, the date-then-recording-recency ordering and the offer to see everything carry forward unchanged; see «The feed shows the latest five legible records».

## ADDED Requirements

### Requirement: Головний presents the daily dashboard

Головний SHALL present, in order, a compact cap1tal header, the current month's витрачено, the latest five stored транзакції, top categories and Статок, with recording available through «+» without scrolling and with no entry form, separate money-held card, large attention section or Progress widget in its default content.

#### Scenario: The first screen is entry plus the feed
- **GIVEN** recorded expenses, accounts, twelve unseen досягнення and pending чернетки
- **WHEN** the owner opens Головний
- **THEN** the month leads, the latest records immediately follow, categories and Статок follow them, and service/progress cards do not precede the feed
- **AND** «+» opens the existing separate recording form with its existing validation and confirmation

#### Scenario: With no рахунок nothing can be recorded yet
- **GIVEN** no account exists or every account is archived
- **WHEN** Головний is opened
- **THEN** a compact invitation leads to Рахунки, recording still requires an unarchived account, and the feed still shows stored records
- **AND** archived money is handled by net-worth rather than silently erased

#### Scenario: A recorded transaction appears at the top of the feed
- **GIVEN** no later-dated transaction exists
- **WHEN** the owner records an expense dated today and returns from the recording form
- **THEN** it appears at the top of the feed, with the current monthly spent refreshed

### Requirement: The primary month amount is витрачено

The month card SHALL lead with «Витрачено у <current month>» and that calendar month's signed витрачено separately in every currency of its місячна картина, with exact minor-unit precision and no combined-currency amount, preserving all six monthly definitions in the detailed місячна картина.

#### Scenario: Income does not switch the primary metric
- **GIVEN** September UAH income 5000000, spent 200000, invested 800000, saved 1000000 and lent 300000, all minor units
- **WHEN** Головний opens in September
- **THEN** its main amount is витрачено 200000 UAH, while Місяць retains залишилось 2700000 UAH and all six figures

#### Scenario: Default expenses and money movements retain their meaning
- **GIVEN** expenses 10000 including uncategorised, refund 2000, negative correction −300, fee expense 200, positive correction 400, interest income 500 and transfers into savings/investment/debt, all in minor units UAH
- **WHEN** the month is read
- **THEN** витрачено is 8500 UAH; positive correction and interest remain income and the transfers remain saved/invested/lent, not expenses

#### Scenario: Currency precision and original currency
- **GIVEN** month spent 12550 UAH, 205 USD and 310 EUR, and the UAH purchase carries informational 3 USD
- **WHEN** the card is read
- **THEN** it shows 125,50 UAH, 2,05 USD and 3,10 EUR separately, without adding informational original currency or a cross-currency total

#### Scenario: Refund-only month remains negative
- **GIVEN** a month containing only a 5000 minor units UAH повернення
- **WHEN** its card is read
- **THEN** «Витрачено» is −50,00 UAH, not zero or income

#### Scenario: Empty and transfer-only months are distinct
- **GIVEN** the current month has no transactions
- **WHEN** the card is read
- **THEN** it says «Цього місяця ще немає транзакцій», retains the current month and does not borrow last month's amount
- **AND** a month with only ordinary unclassified transfers instead says «Цього місяця лише перекази»; income-only or classified-transfer-only currencies show their місячна картина spent of zero

### Requirement: The month card always opens the current month

Tapping the month card SHALL open the detailed місячна картина for the device's current calendar month, including after a retained past-month selection or local month rollover.

#### Scenario: A retained old selection does not win
- **GIVEN** Місяць was last showing July and today is in September
- **WHEN** the owner taps the September card
- **THEN** Місяць shows September and its unchanged six figures

#### Scenario: Rollover updates the month
- **GIVEN** Головний was opened on September 30
- **WHEN** local October 1 arrives while it remains open, or the app resumes then
- **THEN** the card and category widget use October and tapping the card opens October

### Requirement: The feed shows the latest five legible records

The latest-transactions section SHALL show at most five records across all history in descending date then recording-recency order, each with a category/type icon plus text, stored опис when present, date, account (both for a переказ) and exact amount/currency with explicit money direction (expense −, income/повернення +, коригування its sign, переказ a directional arrow with both leg amounts when different), and offer «Усі» and existing editing and one-tap categorisation.

#### Scenario: Five of a long history
- **GIVEN** eight records including equal-date records and a backdated newly entered record
- **WHEN** the feed is read
- **THEN** it shows the first five in date/recording-recency order, not insertion order alone, and «Усі» opens the existing complete searchable history

#### Scenario: Short or empty history
- **GIVEN** three records, or none
- **WHEN** the feed is read
- **THEN** it shows those three, or «Поки нічого не записано», and «Усі» is available in both cases

#### Scenario: Description and type stay distinguishable
- **GIVEN** a «Без категорії» expense with опис «СІЛЬПО Київ», an income «Без джерела» and a cross-currency transfer
- **WHEN** their rows are read
- **THEN** description never replaces category/source/type, the transfer exposes both accounts/amounts, and no meaning depends only on color
- **AND** row taps open existing transaction editing, with existing correction restrictions

#### Scenario: Categorisation stays in place
- **GIVEN** an uncategorised expense with a stored опис in the feed
- **WHEN** its categorisation action is used
- **THEN** the existing short picker and rule offer work without opening the editor and refreshed categories/banner reflect the stored choice

### Requirement: Uncategorised records are a compact feed banner

A nonzero count of stored витрати and повернення carrying «Без категорії» SHALL appear as one compact actionable banner at the top of the latest-transactions section, counted over all history and opening the matching uncategorised filter, with no banner or reserved space at zero.

#### Scenario: Count and destination agree
- **GIVEN** seven matching records across several months, only one in the latest five, plus an income «Без джерела»
- **WHEN** the banner is shown and tapped
- **THEN** it reads «7 транзакцій без категорії · Переглянути» and opens exactly those seven through the existing filter

#### Scenario: Answering the last record removes the banner
- **GIVEN** one matching record
- **WHEN** it is categorised, deleted or retyped out of the filter
- **THEN** the banner disappears without an empty attention heading

### Requirement: Sync occupies a compact header

Configured linked monobank accounts SHALL expose existing coverage/freshness and manual sync in the compact header, preserving pull-to-refresh, existing manual-sync rules and in-flight joining without creating a separate sync card.

#### Scenario: Partial coverage is not fresh coverage
- **GIVEN** three of nine linked accounts have completed a sync
- **WHEN** the header is read
- **THEN** it reports 3 of 9, never an age implying all nine are current; once all nine complete the oldest completion defines age

#### Scenario: Button and gesture share a run
- **GIVEN** a sync is running
- **WHEN** the owner pulls to refresh or taps manual sync
- **THEN** the existing run is joined, no duplicate starts, cached values stay readable and refreshing ends on success or failure

#### Scenario: No bank remains quiet
- **GIVEN** no configured token or no linked accounts
- **WHEN** Головний is read or pulled to refresh
- **THEN** no bank status/control or bank failure appears and the gesture only reloads local data

### Requirement: Operational alerts remain compact and actionable

Pending чернетки and an existing actionable sync failure SHALL occupy at most one collapsed row each after the latest records and before categories, with draft expansion retaining existing in-place confirm/dismiss behavior and failure leading to existing details/retry.

#### Scenario: Many drafts do not bury the dashboard
- **GIVEN** fifty pending чернетки and a rejected token
- **WHEN** Головний opens
- **THEN** two compact rows follow the feed and no draft bodies render before expansion; the failure action opens monobank details

#### Scenario: Draft confirmation updates the same record
- **GIVEN** an expanded pending чернетка
- **WHEN** the owner confirms its proposed amount or supplies the required amount
- **THEN** existing rules create the transaction, feed and financial widgets refresh, and the draft no longer waits
- **AND** dismissal uses existing confirmation and creates no transaction

#### Scenario: Routine postponement is not an error
- **GIVEN** a healthy sync ended «перенесено» with no existing needs-owner condition
- **WHEN** Головний opens
- **THEN** no failure row is displayed

#### Scenario: Confirming the last чернетка into «Без категорії» hands off between both alerts
- **GIVEN** the only pending чернетка, whose text no правило matches, is the only thing needing attention
- **WHEN** the owner expands and confirms it
- **THEN** the draft row disappears and the uncategorised banner appears naming one транзакція, so the owner is never left facing neither alert nor the transaction it produced

### Requirement: Top categories read the same signed monthly breakdown

«Топ категорій витрат, <місяць>» SHALL show the current місячна картина category amounts for one selected currency, with its signed витрачено in the donut center, up to five largest signed category amounts descending (ties by Ukrainian name then identity), and one «Ще N» row with the signed sum of all remaining categories.

#### Scenario: Five plus the remainder reconcile
- **GIVEN** seven category amounts 700, 600, 500, 400, 300, 200 and 100 minor units UAH
- **WHEN** the widget is read
- **THEN** the center is 2800 UAH, the five largest have named amounts, and «Ще 2» carries 300 UAH
- **AND** a positive donut has one sector per shown category and one remainder sector whose proportions sum to the center

#### Scenario: Reserved and archived categories participate
- **GIVEN** spent in «Без категорії», «Комісія», negative «Коригування» and an archived category
- **WHEN** the widget is read
- **THEN** all participate under their current labels exactly as in the monthly breakdown, without losing corrections or fees

### Requirement: Category currencies never mix

The category widget SHALL offer a compact currency selector only when multiple breakdown currencies exist, defaulting to UAH when present otherwise the first in the existing currency order, preserving an available selection within the month and resetting it on month change or selected-currency disappearance.

#### Scenario: Two currencies select independently
- **GIVEN** UAH and USD category breakdowns
- **WHEN** the widget first opens and then USD is selected
- **THEN** UAH is initially selected and then center, sectors, legend and remainder all show USD alone, with no FX conversion

#### Scenario: No UAH or a removed selection
- **GIVEN** only EUR and USD appear, with EUR first in the existing order
- **WHEN** the widget opens, USD is chosen and then USD's final record is removed
- **THEN** EUR is selected again; if EUR is now the only currency, no selector is shown

### Requirement: Signed or empty breakdowns never claim false shares

A category widget whose breakdown is empty, all zero or contains any negative amount SHALL preserve signed category totals and use an explanatory empty/neutral ring without proportional sectors or percentages.

#### Scenario: Negative category with positive total
- **GIVEN** category amounts 10000 and −2000 minor units UAH
- **WHEN** the widget is read
- **THEN** center is 8000 UAH, the legend retains both signs and the neutral ring says returns exceeded expenses in some categories

#### Scenario: Refund-only and net-zero categories
- **GIVEN** only −5000 UAH, or categories netting individually to zero
- **WHEN** the widget is read
- **THEN** the negative or zero center remains exact, zero categories remain present, and no negative sector or division by zero occurs

#### Scenario: No spent categories
- **GIVEN** an empty or income/transfer-only month with no breakdown
- **WHEN** the widget is read
- **THEN** it says «Ще немає витрат» without fabricated categories or percentages

### Requirement: Categories open their existing monthly details

A category action SHALL open its existing month-scoped transactions for the current month across all currencies, including both signs of corrections for «Коригування», while «Ще N» opens the full current-month breakdown.

#### Scenario: Currency selection does not narrow the existing detail contract
- **GIVEN** UAH is selected and a category holds UAH and USD records
- **WHEN** its row is tapped
- **THEN** the existing detail shows that month's category transactions in both currencies with their own amounts and existing editing

#### Scenario: Remainder and corrections are reachable
- **GIVEN** seven categories and both positive and negative corrections in the current month
- **WHEN** «Ще 2» is tapped, then «Коригування» is opened
- **THEN** the full current-month breakdown is reachable and the correction detail includes both signs though only negative corrections count as spent

### Requirement: Статок exposes its basis beside its chart

The Статок widget SHALL display net-worth's exact per-currency current values prominently, its eligible secondary approximate UAH value, its labelled reconstructible history and eligible comparison, with accessible account/basis/date details and an action to Рахунки.

#### Scenario: Headline and history use different investment bases
- **GIVEN** an investment with вкладено 100000 and dated current value 150000 minor units UAH
- **WHEN** Статок is read
- **THEN** its current contribution uses 150000, history uses вкладено, the difference is explained and no market-performance change is invented
- **AND** the explanation lists the account and observation date, and «Рахунки» opens existing accounts

### Requirement: The dashboard remains accessible on compact Android

The default dashboard SHALL preserve readable exact money, at least 48 × 48 dp touch targets, descriptive accessibility labels and non-color meaning on 360 × 640 dp Android, with disjoint FAB/report-handle/tab targets and scroll clearance for the last content.

#### Scenario: The first viewport answers the daily question
- **GIVEN** default font, three currencies, seven uncategorised records and fifty drafts
- **WHEN** the 360 × 640 dp viewport opens
- **THEN** header, monthly spent, feed heading and at least the first transaction are visible, with less than half the viewport occupied by service messages
- **AND** the owner can identify the month/spent and newest record in a 3–5 second walkthrough

#### Scenario: Large text and overlays remain usable
- **GIVEN** 200% text scaling, the report handle enabled and Android gesture or three-button navigation
- **WHEN** the owner scrolls, uses «+», report handle and currency controls with TalkBack
- **THEN** targets do not overlap or cover tab targets, money is readable without digit truncation, the final row can clear overlays and announced labels expose amount/currency/type and selected currency

### Requirement: The dashboard uses local data without new network work

Dashboard widgets SHALL use existing local data and existing refresh policies without additional requests, remaining responsive on large history and reflecting committed changes and local date changes without stale financial combinations.

#### Scenario: Offline graphs need no request
- **GIVEN** cached data/rates and no network
- **WHEN** the owner opens, scrolls, switches chart currency and inspects a point
- **THEN** local content works, no widget requests data, and only the pre-existing shared refresh/sync policies can attempt network activity

#### Scenario: A large history scrolls smoothly
- **GIVEN** 50000 records, 30 accounts and 120 months on the documented compact Android test device
- **WHEN** Головний loads and the owner scrolls for ten seconds after load
- **THEN** top content becomes readable within one second and scrolling has no sustained frame rate below 55 fps, with at most five default transaction rows

#### Scenario: Data changes invalidate derived readings
- **GIVEN** an already loaded dashboard
- **WHEN** an edit, deletion, retype, valuation change, opening-balance edit, import, restore or committed sync changes its inputs
- **THEN** the next displayed result uses one coherent updated reading and obsolete in-flight results cannot overwrite it
