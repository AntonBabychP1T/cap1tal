# main-screen Specification

## Purpose
The Головний screen — what the owner sees on opening the app: the month's витрачено as its
figure, the latest транзакції with editing and one-tap categorisation, a compact summary of what
is waiting on the owner, that month's top categories and статок — a derived reading across every
recorded account, active, archived and debt alike. Recording is behind the «+» over its corner, on
a screen of its own, with the minimum of fields. It leads with the shorter of the app's two daily
questions — where the money went — and answers it before anything else; how much of the month is
left stays one tap away, on Місяць, which is where all six monthly numbers are read in full.

## Requirements

### Requirement: Головний presents the daily dashboard

Головний SHALL present a compact cap1tal header, then the fixed service rail with any currently actionable item, then the known dashboard widgets in the owner's saved visible order. The fixed service rail SHALL appear directly below the header and before every widget regardless of widget order or which widget, if any, is first. With no saved preference the widgets SHALL present, in order, the current month's витрачено, the latest five stored транзакції, the current month's спостереження, top categories and Статок, with recording available through «+» without scrolling and with no entry form, separate money-held card, large attention section or visible Progress widget.

#### Scenario: The first screen is entry plus the feed
- **GIVEN** recorded expenses, accounts, twelve unseen досягнення, pending чернетки and no saved dashboard preference
- **WHEN** the owner opens Головний
- **THEN** the month leads, the latest records immediately follow, the спостереження follow them, categories and Статок follow those, the fixed service rail sits directly below the header before every widget, and Progress does not precede the financial widgets
- **AND** «+» opens the existing separate recording form with its existing validation and confirmation

#### Scenario: A saved layout controls only known widgets
- **GIVEN** the owner saved Статок before the month widget and hid top categories
- **WHEN** Головний opens
- **THEN** Статок appears before the month widget, top categories do not appear, and each visible known widget appears once

#### Scenario: With no рахунок nothing can be recorded yet
- **GIVEN** no account exists or every account is archived
- **WHEN** Головний is opened
- **THEN** a compact invitation leads to Рахунки, recording still requires an unarchived account, and any visible feed still shows stored records
- **AND** archived money is handled by net-worth rather than silently erased

#### Scenario: A recorded transaction appears at the top of the feed
- **GIVEN** no later-dated transaction exists and «Останні 5 транзакцій» is visible
- **WHEN** the owner records an expense dated today and returns from the recording form
- **THEN** it appears at the top of the feed, with every visible financial widget refreshed

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

The latest-transactions section SHALL show at most five records across all history in descending date then recording-recency order, each with a category/type icon plus text, the назва of the продавець its опис is recognised as — or the stored опис itself when it is recognised as none — when an опис is present, date, account (both for a переказ) and exact amount/currency with explicit money direction (expense −, income/повернення +, коригування its sign, переказ a directional arrow with both leg amounts when different), and offer «Усі» and existing editing and one-tap categorisation.

#### Scenario: Five of a long history
- **GIVEN** eight records including equal-date records and a backdated newly entered record
- **WHEN** the feed is read
- **THEN** it shows the first five in date/recording-recency order, not insertion order alone, and «Усі» opens the existing complete searchable history

#### Scenario: Short or empty history
- **GIVEN** three records, or none
- **WHEN** the feed is read
- **THEN** it shows those three, or «Поки нічого не записано», and «Усі» is available in both cases

#### Scenario: Description and type stay distinguishable
- **GIVEN** a «Без категорії» expense with опис «СІЛЬПО Київ» that no написання recognises, an income «Без джерела» and a cross-currency transfer
- **WHEN** their rows are read
- **THEN** description never replaces category/source/type, the transfer exposes both accounts/amounts, and no meaning depends only on color
- **AND** row taps open existing transaction editing, with existing correction restrictions

#### Scenario: A recognised опис reads as its продавець
- **GIVEN** «АТБ» holds the написання "atb" and a витрата carries the опис «ATB MARKET 23»
- **WHEN** its row is read
- **THEN** it shows «АТБ» where it would show the опис, and never in place of its category

#### Scenario: Categorisation stays in place
- **GIVEN** an uncategorised expense with a stored опис in the feed
- **WHEN** its categorisation action is used
- **THEN** the existing short picker and rule offer work without opening the editor and refreshed categories/banner reflect the stored choice

### Requirement: Uncategorised records are a compact feed banner

A nonzero count of stored витрати and повернення carrying «Без категорії» SHALL appear as one compact actionable service banner, counted over all history and opening the matching uncategorised filter, with no banner or reserved space at zero. The banner SHALL remain visible outside the configurable widget list when «Останні 5 транзакцій» is hidden and SHALL NOT be hideable or reorderable as a dashboard widget.

#### Scenario: Count and destination agree
- **GIVEN** seven matching records across several months, only one in the latest five, plus an income «Без джерела»
- **WHEN** the banner is shown and tapped
- **THEN** it reads «7 транзакцій без категорії · Переглянути» and opens exactly those seven through the existing filter

#### Scenario: Hiding the feed does not hide the required action
- **GIVEN** seven matching records and «Останні 5 транзакцій» is hidden
- **WHEN** Головний opens
- **THEN** the compact uncategorised banner is still visible and opens those seven records

#### Scenario: Answering the last record removes the banner
- **GIVEN** one matching record
- **WHEN** it is categorised, deleted or retyped out of the filter
- **THEN** the banner disappears without an empty attention heading

### Requirement: Sync occupies a compact header

Configured linked monobank accounts SHALL expose existing coverage/freshness and manual sync in the compact header, preserving pull-to-refresh, existing manual-sync rules and in-flight joining without creating a separate sync card. Linked accounts without a configured token are not quiet: the service rail says so, as «A linked bank without a token is stated under the header» requires, while pulling down only reloads local data.

#### Scenario: Partial coverage is not fresh coverage
- **GIVEN** three of nine linked accounts have completed a sync
- **WHEN** the header is read
- **THEN** it reports 3 of 9, never an age implying all nine are current; once all nine complete the oldest completion defines age

#### Scenario: Button and gesture share a run
- **GIVEN** a sync is running
- **WHEN** the owner pulls to refresh or taps manual sync
- **THEN** the existing run is joined, no duplicate starts, cached values stay readable and refreshing ends on success or failure

#### Scenario: No bank remains quiet
- **GIVEN** no linked accounts
- **WHEN** Головний is read or pulled to refresh
- **THEN** no bank status/control or bank failure appears and the gesture only reloads local data

#### Scenario: A linked bank without a token is not synced by the gesture
- **GIVEN** linked accounts and no configured token
- **WHEN** Головний is pulled to refresh
- **THEN** no sync starts, no request leaves the phone, local data reloads, and the no-token row stays

### Requirement: Operational alerts remain compact and actionable

Pending чернетки and an existing actionable sync failure SHALL occupy at most one collapsed service row each in the fixed service rail directly below the header and before every widget, with draft expansion retaining existing in-place confirm/dismiss behavior and failure leading to existing details/retry. These rows SHALL remain outside the configurable widget list, SHALL NOT be hideable or reorderable, and SHALL take no space when absent.

#### Scenario: Many drafts do not bury the dashboard
- **GIVEN** fifty pending чернетки, a rejected token and every configurable widget hidden
- **WHEN** Головний opens
- **THEN** two compact service rows remain visible directly below the header, no draft bodies render before expansion, and the failure action opens monobank details

#### Scenario: Draft confirmation updates the same record
- **GIVEN** an expanded pending чернетка
- **WHEN** the owner confirms its proposed amount or supplies the required amount
- **THEN** existing rules create the transaction, every visible financial widget refreshes, and the draft no longer waits
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

### Requirement: Recording opens from a «+» on Головний

Головний SHALL offer recording a транзакція from a control reachable without scrolling — a «+»
standing over the screen's bottom-right corner — and SHALL NOT hold the entry form in its own
content. Tapping the «+» SHALL open the entry form on its own screen, pushed over Головний, which
records exactly what this capability's recording requirements define: витрата, переказ, дохід and
повернення, the same fields, the same refusals, the same комісія and дохід «Відсотки» proposals,
the same remembered рахунок and the same recently used категорії and джерела. There SHALL be one
entry form in the app, not two.

Leaving that screen SHALL return to Головний, where a транзакція just recorded stands in the
latest-transactions section in the place its date gives it — at the top when it is dated today.
WHEN no unarchived рахунок exists, the entry screen SHALL state that a рахунок must be created
first and SHALL offer going to Рахунки, and nothing SHALL be recorded until one exists.

#### Scenario: The «+» opens the form

- **WHEN** the owner taps the «+» on Головний
- **THEN** the entry form opens as its own screen, offering витрата, переказ, дохід and повернення

#### Scenario: Головний holds no form of its own

- **WHEN** the owner opens Головний
- **THEN** no сума field, no категорія picker and no «Записати» stand in the screen's content

#### Scenario: What was recorded is on Головний when the owner returns

- **WHEN** the owner records a витрата of "1200" dated today from the entry screen and goes back
- **THEN** Головний shows that витрата at the top of the latest-transactions section and the
  month's витрачено counts it

#### Scenario: A back-dated транзакція takes its own place

- **WHEN** the owner records a витрата dated a week ago and goes back
- **THEN** it stands in the latest-transactions section in the place its date gives it, not
  necessarily first

#### Scenario: With no рахунок nothing can be recorded yet

- **WHEN** the owner opens the entry screen while no unarchived рахунок exists
- **THEN** it offers no рахунок, states that a рахунок must be created first, offers going to
  Рахунки, and nothing can be recorded

### Requirement: A manual expense needs only amount and account

Recording SHALL default to витрата and SHALL require only the сума and the рахунок; the date
SHALL default to today and be changeable. The amount SHALL be entered in the account's currency
as major units with an optional fractional part and SHALL be stored exactly as integer minor
units; an amount that is not positive, has more fractional digits than the currency's minor
unit, or is not a number SHALL be rejected. The expense SHALL default to the category "Без
категорії" — the reserved uncategorised row — and the owner SHALL be able to pick any unarchived
category of the editable list instead; archived categories SHALL NOT be offered, and neither
SHALL «Коригування» — a коригування is a transaction type, not a pickable label.

#### Scenario: Typed amount becomes exact minor units

- **WHEN** the owner records an expense of "125.50" from a UAH account
- **THEN** an expense of 12550 minor units UAH dated today is stored, in category "Без категорії"

#### Scenario: A whole amount needs no fractional part

- **WHEN** the owner records an expense of "200" from a UAH account
- **THEN** an expense of 20000 minor units UAH is stored

#### Scenario: Too many fractional digits are rejected

- **WHEN** the owner enters "12.345" as the amount for a UAH account
- **THEN** recording is rejected and nothing is stored

#### Scenario: A non-positive amount is rejected

- **WHEN** the owner enters "0" or "-5" as the amount
- **THEN** recording is rejected and nothing is stored

#### Scenario: A date other than today can be chosen when recording

- **WHEN** the owner records an expense of "125.50" from a UAH account with the date set to
  2026-07-31 instead of today
- **THEN** an expense of 12550 minor units UAH dated 2026-07-31 is stored and belongs to July

#### Scenario: A picked category is stored

- **WHEN** the owner records an expense of "80" from a UAH account and picks the category
  Groceries
- **THEN** an expense of 8000 minor units UAH in category Groceries is stored

#### Scenario: Archived categories are not offered

- **WHEN** the category Pets is archived and the owner opens the category picker while recording
- **THEN** Pets is not among the offered categories, neither among those shown directly nor behind
  the offer to see all of them

#### Scenario: «Коригування» is not offered

- **WHEN** the owner opens the category picker while recording a витрата and then opens all
  categories
- **THEN** «Коригування» is among the offered categories in neither place, while «Комісія» and
  «Без категорії» are offered

### Requirement: A переказ can be recorded between two accounts

The owner SHALL be able to record a переказ by choosing the account the money left, the account
it arrived at, and the сума that left; choosing the same account as both source and destination
SHALL be rejected. Between accounts of the same currency an optional «скільки прийшло» SHALL
also be offered, defaulting to the сума that left, so an untouched field records the same amount
on both legs; between accounts of different currencies both amounts SHALL be asked — what left
and what arrived — and no комісія SHALL ever be proposed for them, whatever the two numbers are.

WHEN a переказ between accounts of the same currency whose source is not a рахунок-борг is
recorded or edited with «скільки прийшло» smaller than the сума that left, the difference SHALL be
proposed as a витрата "Комісія" — the Ukrainian display label of the reserved "Fees" category, one category, not a
second one — on the account the money left, dated the same day as the переказ, which the owner
accepts or declines. Accepting SHALL store the переказ with the сума that arrived on both legs
together with that витрата, so the account the money left loses exactly the сума that left it
and no розрахунковий баланс counts the комісія twice; declining SHALL store only the переказ,
keeping the сума that left and the сума that arrived on their own legs. A stored переказ whose
legs are equal SHALL propose nothing when it is opened again. No комісія SHALL ever be proposed for
a переказ whose source is a рахунок-борг: a рахунок-борг is a person, not a bank, so a repayment
that arrives short is no fee — what such a переказ may propose instead is the дохід «Відсотки»
below, and only when its two legs are equal, so the two proposals can never both fire.

#### Scenario: Same-currency transfer needs one amount

- **WHEN** the owner records a переказ of 100000 minor units UAH from a card to a jar and leaves
  «скільки прийшло» untouched
- **THEN** a переказ is stored with both accounts and 100000 minor units UAH on each leg, and no
  комісія is proposed

#### Scenario: A short arrival proposes the комісія

- **WHEN** the owner records a UAH переказ of 100000 minor units from a card to a jar and enters
  99500 minor units as «скільки прийшло»
- **THEN** a витрата "Комісія" of 500 minor units UAH on the card is proposed, to accept or
  decline

#### Scenario: Cross-currency transfer asks both legs

- **WHEN** the owner records a переказ from a UAH card, entering 410000 minor units UAH left and
  10000 minor units USD arrived at a USD account
- **THEN** the stored переказ carries both amounts in their own currencies

#### Scenario: A cross-currency переказ proposes no комісія

- **WHEN** a переказ leaves a UAH card as 410000 minor units UAH and arrives at a USD account as
  10000 minor units USD
- **THEN** no комісія is proposed and only the переказ is stored

#### Scenario: Accepted fee proposal records the expense

- **WHEN** the owner records a UAH переказ of 100000 minor units from a card to a jar, enters
  99500 minor units as «скільки прийшло» and accepts the proposed комісія
- **THEN** the stored переказ carries 99500 minor units UAH on both legs, and a витрата of 500
  minor units UAH in category "Комісія" on the card, of the same date, is stored alongside it

#### Scenario: Accepting the комісія keeps the source balance exact

- **WHEN** a card that opened with 1000000 minor units UAH and has no other transactions records
  a UAH переказ of 100000 minor units to a jar arriving as 99500 minor units — whether the
  proposed комісія is accepted or declined
- **THEN** the card's розрахунковий баланс is 900000 minor units UAH and the jar's is 99500 minor
  units UAH

#### Scenario: Declined fee proposal records only the transfer

- **WHEN** the owner records a UAH переказ of 100000 minor units arriving as 99500 minor units
  and declines the proposed комісія
- **THEN** only the переказ is stored, carrying 100000 minor units UAH on the leg that left and
  99500 minor units UAH on the leg that arrived

#### Scenario: The same account on both legs is rejected

- **WHEN** the owner chooses the same account as both the source and the destination of a переказ
- **THEN** recording is rejected and nothing is stored

#### Scenario: A repayment arriving short proposes no комісія

- **WHEN** the owner records a UAH переказ of 110000 minor units from the рахунок-борг "Ярослав"
  to a card and enters 109500 minor units as «скільки прийшло»
- **THEN** no комісія is proposed and only the переказ is stored, carrying 110000 minor units UAH
  on the leg that left and 109500 on the leg that arrived

### Requirement: A transaction can be edited and deleted from the feed

Tapping a transaction in the feed SHALL open it for editing: its amount, date and account or
accounts SHALL be changeable, and the transaction SHALL be deletable after confirmation. The
category of a витрата or повернення and the джерело of a дохід SHALL be changeable from editing
too, offered the same choices as when recording. Edits SHALL persist under the same transaction,
and a transaction whose date is changed SHALL belong to the month of its new date. WHEN an
account choice is changed to an account of a different currency, the amount touching that
account SHALL be entered anew in the new account's currency — nothing is converted
automatically, so no amount can land on an account in a foreign currency. An edit that leaves a
same-currency переказ arriving short SHALL propose the комісія on the same terms as recording
it.

#### Scenario: An edited amount persists

- **WHEN** the owner opens a stored expense of 12550 minor units UAH and changes the amount to
  "130"
- **THEN** the same transaction now holds 13000 minor units UAH

#### Scenario: A corrected date moves the transaction to its real month

- **WHEN** the owner opens a stored expense dated 2026-08-01 and changes its date to 2026-07-31
- **THEN** the same transaction is dated 2026-07-31, belongs to July and no longer to August, and
  takes the place its new date gives it in the feed

#### Scenario: A deletion is confirmed first

- **WHEN** the owner deletes a transaction from editing and confirms
- **THEN** the transaction is gone from the feed and from its account's history

#### Scenario: Moving an expense to another currency asks the amount anew

- **WHEN** the owner moves a stored expense of 12550 minor units UAH onto a USD account and
  enters "5.00" as the new amount
- **THEN** the same transaction is an expense of 500 minor units USD on the USD account, and no
  UAH amount remains on it

#### Scenario: Changing a transfer leg to another currency asks that leg anew

- **WHEN** the owner changes the destination of a UAH-to-UAH переказ to a USD account and enters
  "10.00" as what arrived
- **THEN** the same переказ keeps its UAH left leg and now carries an arrived leg of 1000 minor
  units USD

#### Scenario: An edited переказ that arrives short proposes the комісія

- **WHEN** the owner opens a stored UAH переказ of 100000 minor units on both legs, changes
  «скільки прийшло» to 99500 minor units and accepts the proposed комісію
- **THEN** the same переказ now carries 99500 minor units UAH on both legs and a витрата of 500
  minor units UAH in category "Комісія" on the account the money left is stored alongside it

#### Scenario: A wrongly picked category is fixed from editing

- **WHEN** the owner opens a stored витрата in category Groceries and picks Eating out
- **THEN** the same transaction now carries Eating out

#### Scenario: A wrongly picked source is fixed from editing

- **WHEN** the owner opens a stored дохід with джерело Salary and picks Freelance
- **THEN** the same transaction now carries джерело Freelance

### Requirement: A transaction's type can be changed from editing

From editing, the owner SHALL be able to retype a витрата into a переказ — choosing the account
the money arrived at, the second leg when currencies differ — and a переказ into a витрату,
keeping the same transaction identity. Retyping into a переказ onto an інвестиційний рахунок is
how an інвестиція is recorded — no separate action SHALL exist for it. WHEN a переказ is retyped
into a витрату, the витрата SHALL be recorded on the account the money left, for the сума that
left it, in that account's currency, carrying "Без категорії"; the arrived leg and the
destination account SHALL be dropped and nothing SHALL be converted. A витрата "Комісія" stored
earlier alongside that переказ is a separate transaction and SHALL be left untouched — the owner
deletes it from the feed if it no longer applies.

The owner SHALL also be able to retype a витрата into a повернення and a повернення into a
витрату — keeping the amount, the рахунок and the category — and a витрата into a дохід and a
дохід into a витрату. A витрата carrying "Без категорії" is the one exception: that is the
default it arrived with rather than a category the owner chose, and a повернення takes no default,
so retyping such a витрата into a повернення SHALL ask for the category and SHALL store nothing
until one is picked. A повернення SHALL NOT be retyped into a дохід, nor a дохід into a повернення:
a повернення is a negative витрата in the category it came out of and is never income, so the one
gesture would raise дохід and stop the month's spent shrinking at once. Retyping through витрата
is how the owner makes that change, and it makes them say what the money actually was. Retyping into a дохід SHALL ask the owner to pick the джерело and SHALL
drop the category; retyping a дохід into a витрату SHALL drop the джерело and SHALL carry "Без
категорії" unless the owner picks a category. Every retype SHALL keep the transaction's identity,
amount and date.

#### Scenario: An expense becomes a transfer under the same identity

- **WHEN** the owner retypes a stored витрата of 100000 minor units UAH into a переказ onto
  another account of the same currency
- **THEN** the same transaction is now a переказ of 100000 minor units UAH on both legs and no
  витрата remains

#### Scenario: Retyping onto an investment account is the інвестиція

- **WHEN** the owner retypes a витрата into a переказ onto an account of kind `investment`
- **THEN** the stored переказ's destination is the інвестиційний рахунок, so the amount counts
  as інвестовано, not витрачено

#### Scenario: A transfer becomes an expense on the account the money left

- **WHEN** the owner retypes a stored переказ of 100000 minor units UAH from a card to a jar into
  a витрату
- **THEN** the same transaction is a витрата of 100000 minor units UAH on the card in "Без
  категорії", nothing remains on the jar, and the jar's розрахунковий баланс no longer holds the
  100000 minor units UAH

#### Scenario: A cross-currency transfer becomes an expense of what left

- **WHEN** the owner retypes a переказ that left a UAH card as 410000 minor units UAH and arrived
  at a USD account as 10000 minor units USD into a витрату
- **THEN** the витрата is 410000 minor units UAH on the UAH card, the USD leg is gone and nothing
  is converted

#### Scenario: An accepted комісія survives the retype as its own transaction

- **WHEN** a переказ whose комісія was accepted is retyped into a витрату
- **THEN** the витрата "Комісія" is still stored on the same account as its own transaction,
  deletable from the feed

#### Scenario: An expense becomes a refund in the same category

- **WHEN** the owner retypes a stored витрата of 80000 minor units UAH in category Clothing into
  a повернення
- **THEN** the same transaction is a повернення of 80000 minor units UAH in category Clothing on
  the same рахунок, so the month's spent in Clothing shrinks by 80000 minor units UAH

#### Scenario: An expense becomes an income with a picked source

- **WHEN** the owner retypes a stored витрата of 500000 minor units UAH into a дохід and picks
  the джерело Salary
- **THEN** the same transaction is a дохід of 500000 minor units UAH with джерело Salary and no
  category remains on it

#### Scenario: A повернення is not retyped into a дохід

- **WHEN** the owner opens a stored повернення
- **THEN** дохід is not among the types it can become, and the same holds for повернення when a
  дохід is opened

#### Scenario: An uncategorised expense becoming a refund asks for the category

- **WHEN** the owner retypes a stored витрата in "Без категорії" into a повернення
- **THEN** the category is asked for and nothing is stored until one is picked

#### Scenario: An income becomes an uncategorised expense

- **WHEN** the owner retypes a stored дохід into a витрату without picking a category
- **THEN** the same transaction is a витрата in "Без категорії" and no джерело remains on it

### Requirement: A дохід is recorded with its джерело

Recording SHALL offer дохід: the сума, the рахунок and the джерело, picked explicitly from the
unarchived sources — no default джерело SHALL be applied and nothing SHALL be stored without one.
The amount rules of the витрата apply unchanged; the date defaults to today and is changeable.

#### Scenario: An income is stored with its source

- **WHEN** the owner records a дохід of "50000" onto a UAH account with джерело Salary
- **THEN** a дохід of 5000000 minor units UAH with джерело Salary dated today is stored and
  appears at the top of the feed

#### Scenario: An income without a source is not stored

- **WHEN** the owner submits a дохід without picking a джерело
- **THEN** recording is rejected and nothing is stored

### Requirement: A повернення is recorded in the category it returns to

Recording SHALL offer повернення: the сума, the рахунок and the category the money returns to,
picked explicitly from the same choices a витрата's picker offers — no default category SHALL be
applied and nothing SHALL be stored without one. The amount SHALL be entered positive like a
витрата's; the amount rules of the витрата apply unchanged; the date SHALL default to today and
be changeable — a повернення belongs to the month the money arrives, whatever month the original
витрата was in.

#### Scenario: A refund is stored in its category

- **WHEN** the owner records a повернення of "800" onto a UAH account in category Clothing
- **THEN** a повернення of 80000 minor units UAH in category Clothing is stored, so the month's
  spent in Clothing shrinks by 80000 minor units UAH and дохід is unchanged

#### Scenario: A refund without a category is not stored

- **WHEN** the owner submits a повернення without picking a category
- **THEN** recording is rejected and nothing is stored

#### Scenario: A back-dated refund belongs to the month of its date

- **WHEN** the owner records a повернення of "800" in category Clothing with the date set to
  2026-07-31
- **THEN** the stored повернення is dated 2026-07-31 and shrinks July's spent in Clothing, not
  August's

### Requirement: «Без категорії» is highlighted and categorised in one tap

The feed SHALL visibly mark every transaction carrying "Без категорії". From that mark the owner
SHALL be able to pick an unarchived category and have it stored on that transaction without
opening editing; the mark SHALL disappear with the pick. The categories offered there SHALL follow
the same rule as the recording form's: at most five shown, the rest behind one offer naming how
many категорії it offers in all, the five being those the owner reached for most recently and topped up from the
head of the full list. "Без категорії" itself SHALL NOT be among them — it is what the transaction
is being moved away from.

Beside the категорії, the mark on a витрата SHALL offer «Це переказ»: a переказ is a type, not a категорія, and
the owner looking at a «Без категорії» витрата that is really money moved between their own рахунки
reaches for this mark first. Choosing it SHALL open editing of that витрата with the type already
set to переказ and the destination рахунок still to be chosen; nothing SHALL be stored until the
owner saves there, and leaving editing without saving SHALL leave the витрата exactly as it was.

#### Scenario: An uncategorised expense is marked in the feed

- **WHEN** the feed holds a витрата in "Без категорії" and a витрата in Groceries
- **THEN** the "Без категорії" one is visibly marked and the Groceries one is not

#### Scenario: One tap categorises from the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Groceries
- **THEN** the same transaction now carries Groceries, without the editing screen having opened,
  and the mark is gone

#### Scenario: The feed's picker is short too

- **WHEN** the owner uses the mark on a "Без категорії" витрата while twenty-six категорії are
  offered
- **THEN** at most five категорії are shown, "Без категорії" is not one of them, and one offer
  names all twenty-six

#### Scenario: A категорія behind the offer still categorises in the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Pets through the offer
  to see all категорії
- **THEN** the same transaction now carries Pets, the editing screen never opened, and the mark is
  gone

#### Scenario: «Це переказ» opens editing as a переказ

- **WHEN** the owner uses the mark on a "Без категорії" витрата carrying the опис "Округлення
  балансу «Резерв»" and chooses «Це переказ»
- **THEN** editing of that same витрата opens with the type переказ selected, the рахунок the money
  left already filled, and no destination chosen

#### Scenario: A повернення's mark offers no «Це переказ»

- **WHEN** the owner uses the mark on a повернення carrying "Без категорії"
- **THEN** категорії are offered and «Це переказ» is not

#### Scenario: Leaving without saving changes nothing

- **WHEN** the owner chooses «Це переказ» from the mark and leaves editing without saving
- **THEN** the витрата is still a витрата in "Без категорії" and still marked

### Requirement: A repayment above the principal proposes дохід «Відсотки»

WHEN a переказ whose source is a рахунок-борг is recorded or edited with the сума that left equal
to the сума that arrived and greater than that рахунок-борг's розрахунковий баланс before this
переказ, and the destination рахунок is of the same currency and is not itself a рахунок-борг, the
excess SHALL be proposed as a дохід with the reserved джерело «Відсотки» on the destination
рахунок, dated the same day as the переказ, which the owner accepts or declines.

Accepting SHALL store the переказ carrying only the principal — the рахунок-борг's balance before
it — on both legs, together with that дохід, so the person's рахунок-борг returns to exactly
nothing owed and the excess counts as дохід for the month, never as a повернення and never as a
коригування. Declining SHALL store the переказ as the owner entered it, leaving that рахунок-борг
below zero.

Nothing SHALL be proposed when the рахунок-борг's balance before the переказ is not above zero,
when the сума that left is not greater than it, when the two legs differ, when the two рахунки are
of different currencies, or when the destination is a рахунок-борг too. A stored переказ SHALL
propose nothing when it is opened again unless it still exceeds the balance its рахунок-борг had
before it — that balance being the рахунок-борг's розрахунковий баланс with this переказ's own
effect excluded, so merely reopening an unchanged repayment proposes nothing twice. A дохід
«Відсотки» stored earlier alongside a переказ is a separate transaction and SHALL be left
untouched when that переказ is edited or deleted — the owner edits or deletes it in the feed like
any other дохід.

#### Scenario: Repaying more than owed proposes the interest

- **WHEN** the рахунок-борг "Ярослав" stands at 100000 minor units UAH owed and the owner records
  a переказ of 110000 minor units UAH from it to a UAH card
- **THEN** a дохід of 10000 minor units UAH with the джерело «Відсотки» on the card is proposed,
  to accept or decline

#### Scenario: Accepting leaves the debt at nothing and the excess as income

- **WHEN** the owner accepts that proposal
- **THEN** the stored переказ carries 100000 minor units UAH on both legs, a дохід of 10000 minor
  units UAH with джерело «Відсотки» on the card of the same date is stored alongside it, the
  рахунок-борг "Ярослав" stands at 0, and the month counts 10000 minor units UAH as дохід

#### Scenario: Declining stores the repayment as entered

- **WHEN** the owner declines that proposal
- **THEN** only the переказ is stored, carrying 110000 minor units UAH on both legs, and the
  рахунок-борг "Ярослав" stands at −10000 minor units UAH

#### Scenario: Repaying exactly the principal proposes nothing

- **WHEN** the рахунок-борг stands at 100000 minor units UAH owed and the owner records a переказ
  of 100000 minor units UAH from it to a UAH card
- **THEN** no дохід is proposed and only the переказ is stored

#### Scenario: A переказ into a рахунок-борг proposes nothing

- **WHEN** the owner records a переказ of 500000 minor units UAH from a card onto the рахунок-борг
  "Ярослав"
- **THEN** no дохід «Відсотки» is proposed — the money was lent, not repaid

#### Scenario: A repayment onto another рахунок-борг proposes nothing

- **WHEN** a переказ of 110000 minor units UAH leaves the рахунок-борг "Ярослав", standing at
  100000, and arrives at the рахунок-борг "Оля"
- **THEN** no дохід «Відсотки» is proposed and only the переказ is stored

#### Scenario: A cross-currency repayment proposes nothing

- **WHEN** a переказ leaves a UAH рахунок-борг standing at 100000 minor units UAH as 110000 minor
  units UAH and arrives at a USD рахунок
- **THEN** no дохід «Відсотки» is proposed and only the переказ is stored

#### Scenario: Editing a repayment up proposes the interest

- **WHEN** a stored переказ of 100000 minor units UAH from the рахунок-борг "Ярослав" — whose
  balance before it was 100000 — is edited to 110000 minor units UAH on both legs
- **THEN** a дохід of 10000 minor units UAH with the джерело «Відсотки» is proposed

#### Scenario: Reopening an unchanged repayment proposes nothing

- **WHEN** a stored переказ of 100000 minor units UAH from a рахунок-борг whose balance before it
  was 100000 is opened again and nothing is changed
- **THEN** no дохід «Відсотки» is proposed

#### Scenario: An accepted дохід «Відсотки» survives editing its переказ

- **WHEN** a переказ whose дохід «Відсотки» was accepted is edited to another amount
- **THEN** that дохід is still stored, unchanged, as its own transaction in the feed

### Requirement: The feed marks a category over its ліміт

WHEN a feed line shows a category that is over its ліміт for the calendar month of that
транзакція's date, in the ліміт's currency, per the limits capability, the category SHALL be
visibly marked over limit (red) on that line — on витрати and повернення alike, since it is the
category that is over, not the line. The mark follows each транзакція's own month: the same
category unmarked on a line dated in a month where it is not over. The over-limit mark SHALL NOT
replace the «Без категорії» highlight — a line may carry both. Lines showing no category — a
переказ, a дохід — are never marked. The same marking SHALL apply wherever a category's
month-scoped транзакції are listed with the feed's line, the Місяць breakdown drill-down
included.

#### Scenario: A витрата in an over-limit category is marked

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH, August's spent in Groceries is
  260000 minor units UAH in UAH, and the feed holds a Groceries витрата dated in August
- **THEN** that line shows Groceries visibly marked over limit

#### Scenario: A line in an under-limit month is not marked

- **WHEN** Groceries is over its ліміт for August and under it for July, and the feed holds a
  Groceries витрата dated in July
- **THEN** the July line shows Groceries unmarked

#### Scenario: A транзакція in another currency is judged by the ліміт's currency

- **WHEN** Groceries carries a UAH ліміт, August's UAH spent in Groceries is under it, and the
  feed holds an August Groceries витрата in USD
- **THEN** that line shows Groceries unmarked, whatever the USD amounts are

#### Scenario: The «Без категорії» highlight and the over-limit mark coexist

- **WHEN** «Без категорії» carries a ліміт, is over it for August, and the feed holds an August
  витрата in «Без категорії»
- **THEN** the line still carries the one-tap categorisation mark and shows the category over
  limit

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

### Requirement: A транзакція recorded by hand can carry an опис

The entry form SHALL offer an optional опис for every type it records — витрата, переказ, дохід
and повернення. What the owner types SHALL be stored as the транзакції's опис, with the meaning
the transactions capability gives it: it changes no total and no balance, and it decides no
транзакції's type. For a витрата it is also what the owner's правила read to propose a категорія,
as "The entry form shows the категорія a правило gives the typed опис" requires — a proposal the
owner sees and can change, never a classification made behind them. Leaving it empty SHALL store no
опис, and SHALL be the normal case — the опис SHALL never be required, its absence SHALL never
block recording, and a витрата recorded without one SHALL be categorised exactly as it is today.

#### Scenario: A typed опис is stored

- **WHEN** the owner records a витрата of "1200" from a UAH рахунок with the опис "шини на зиму"
- **THEN** a витрата of 120000 minor units UAH carrying the опис "шини на зиму" is stored, and
  the month's spent counts exactly 120000 minor units UAH

#### Scenario: An empty опис stores none

- **WHEN** the owner records a витрата without typing an опис
- **THEN** the витрата is stored with no опис and behaves exactly as before

#### Scenario: A переказ can be explained too

- **WHEN** the owner records a переказ between two of their own рахунки with the опис "на ремонт"
- **THEN** the переказ carries that опис, both legs are unchanged, and the month's витрачено is
  unaffected

### Requirement: The entry form shows the категорія a правило gives the typed опис

While a витрата is being recorded, the entry form SHALL show as chosen the категорія the owner's
правила give the опис currently typed — or, when no правило matches it, the категорія the шаблон
категоризації gives it — for as long as the owner has picked no категорія themselves. The chosen
категорія SHALL follow the опис as it is typed and cleared: clearing the опис, or changing it to
text neither a правило nor a базова категорія matches, SHALL return the form to «Без категорії». The
moment the owner picks a категорія, the form SHALL keep that pick and SHALL stop following the
опис for the rest of that recording.

The категорія a правило or the шаблон gives SHALL be shown in the short list like any other, so it is visible
before «Записати» is pressed and can be changed with one tap. Recording SHALL store exactly the
категорія shown.

#### Scenario: Typing a known merchant chooses its категорія

- **WHEN** the правило "атб → Groceries" exists and the owner types "АТБ 421" as the опис of a
  витрата without having picked a категорія
- **THEN** the form shows Groceries as the chosen категорія, and «Записати» stores the витрата in
  Groceries

#### Scenario: Clearing the опис gives the категорія back

- **WHEN** the правило "атб → Groceries" exists, the owner types "АТБ 421" and then clears the
  опис, having picked no категорія
- **THEN** the form shows «Без категорії»

#### Scenario: A picked категорія stops following the опис

- **WHEN** the owner picks Eating out and then types "АТБ 421" while the правило "атб →
  Groceries" exists
- **THEN** the form still shows Eating out, and «Записати» stores the витрата in Eating out

#### Scenario: The proposed категорія is one tap from being changed

- **WHEN** the form shows Groceries because a правило matched the typed опис
- **THEN** Groceries is shown among the short list of категорії and picking another one replaces it

### Requirement: Categorising a транзакція offers to remember it as a правило

After a категорія is set on a stored витрата or повернення that carries an опис — through the
«Без категорії» mark in the feed or through the editing screen alike — the owner SHALL be offered
a правило that would make the same decision next time, with the merchant criterion already
proposed from that опис — the продавець it is recognised as, or a pattern — and changeable before
it is stored: a pattern is editable, and a продавець can be switched to the pattern proposed from
the опис. After a stored витрата that carries an опис is
retyped into a переказ from editing, the owner SHALL likewise be offered a правило-переказ onto the
destination рахунок just chosen. Accepting SHALL store the правило; declining
SHALL store none and SHALL leave the категорія just set — or the переказ just stored — exactly as it
is. Whether the правило is stored or not, the категорія or переказ SHALL already be stored before
the offer is made, so dismissing the offer — or leaving the screen — can never lose the owner's
decision.

The offer SHALL name what it would remember in words the owner can check before accepting: the
pattern, or «продавець» and the продавець's назва, and the категорія it would target, or the same
criterion and «переказ на» the destination рахунок's назва. The cases in which no offer is made at
all belong to the categorisation-rules capability.

#### Scenario: One tap in the feed, then the offer

- **WHEN** the owner uses the «Без категорії» mark on a витрата carrying the опис "СІЛЬПО 123
  Київ", which no написання recognises, and picks Groceries
- **THEN** the витрата carries Groceries and an offer appears naming the pattern "сільпо" and
  Groceries

#### Scenario: A recognised опис offers its продавець

- **WHEN** «АТБ» holds "atb", no правило names it, and the owner uses the «Без категорії» mark on a
  витрата carrying the опис "ATB MARKET 23" and picks Groceries
- **THEN** an offer appears naming «продавець АТБ» and Groceries, with a way to switch to the
  pattern "atb market"

#### Scenario: Accepting the offer stores the правило

- **WHEN** the offer naming the pattern "сільпо" and Groceries is accepted unchanged
- **THEN** the правило "сільпо → Groceries" exists

#### Scenario: Declining keeps the категорія

- **WHEN** that offer is declined
- **THEN** the витрата still carries Groceries and no правило was stored

#### Scenario: The editing screen offers it too

- **WHEN** the owner opens a витрата carrying the опис "УКЛОН" in editing, changes its категорія
  to Transport and saves
- **THEN** the витрата carries Transport and an offer appears naming the pattern "уклон" and
  Transport

#### Scenario: Retyping into a переказ offers the правило-переказ

- **WHEN** the owner retypes a витрата on platinum carrying the опис "Округлення балансу «Резерв»"
  into a переказ onto РЕЗЕРВ and saves
- **THEN** the переказ is stored and an offer appears naming the pattern "округлення балансу" and
  «переказ на РЕЗЕРВ»

#### Scenario: Accepting the правило-переказ pairs the history too

- **WHEN** that offer is accepted while two more «Без категорії» витрати carrying "Округлення
  балансу «Резерв»" are stored on platinum
- **THEN** the правило-переказ exists, both витрати are перекази onto РЕЗЕРВ, and the owner is told
  two витрати became перекази

### Requirement: The entry form opens on the рахунок last recorded on by hand

The entry form SHALL open with the рахунок of the owner's most recent hand-recorded транзакція
already chosen, and that memory SHALL survive closing and reopening the app. For a переказ it is
the рахунок the money left. Only recording by hand SHALL set it: importing, syncing and
confirming a чернетка SHALL leave it untouched. WHEN the remembered рахунок no longer exists or
has been archived, no рахунок SHALL be pre-chosen and recording SHALL still refuse until one is
picked. The pre-chosen рахунок SHALL be an offer, freely changeable before recording.

#### Scenario: The next витрата opens on the same рахунок

- **WHEN** the owner records a витрата from «гаманець» and later reopens the app
- **THEN** the entry form opens with «гаманець» chosen

#### Scenario: An import does not move the memory

- **WHEN** the owner last recorded by hand from «гаманець» and a monobank sync then stores
  транзакції on a linked рахунок
- **THEN** the entry form still opens with «гаманець» chosen

#### Scenario: An archived рахунок is not offered as the default

- **WHEN** the remembered рахунок is archived
- **THEN** no рахунок is pre-chosen, and recording without picking one is refused as before

### Requirement: A picker shows at most a few choices and names what is behind the rest

Every picker on the recording path — the рахунок of a витрата, дохід or повернення, each of the
two рахунки of a переказ, the категорія of a витрата or повернення, and the джерело of a дохід —
SHALL show at most five offered choices at once, whether the транзакція is being recorded or
edited, plus whatever is currently chosen when that is not among the five. That enumeration is
every picker there is: a коригування is shown rather than edited, so it offers none. WHEN more
choices than that are offered, the picker SHALL also show one offer to see all of them, and that
offer SHALL name how many choices there are in total. WHEN five or fewer are offered, the picker
SHALL show all of them and SHALL show no such offer.

Throughout this capability, a choice being **offered** SHALL mean that the owner can pick it —
whether the picker shows it directly or it stands behind the offer to see all of them. A rule
about what is or is not offered therefore says nothing about which of the two places it is in.

The rule SHALL apply to what may be picked, not to what may be stored or asked: a choice reached
through the offer SHALL be stored exactly as one shown directly, and SHALL raise exactly the same
questions — including the сума asked anew when the chosen рахунок is of another currency.

#### Scenario: A long list of рахунки is five chips and an offer

- **WHEN** the owner has twenty-seven unarchived рахунки, none of them pre-chosen, and opens the
  recording form
- **THEN** the рахунок picker shows five of them and one offer naming all twenty-seven

#### Scenario: A pre-chosen рахунок outside the five is the sixth chip

- **WHEN** the owner has twenty-seven unarchived рахунки and the form opens on a remembered
  рахунок that is not among the five the picker would show
- **THEN** the picker shows those five and the remembered рахунок, six chips in all, with the
  remembered one marked as chosen, and one offer naming all twenty-seven

#### Scenario: A short list of рахунки is drawn whole

- **WHEN** the owner has three unarchived рахунки and opens the recording form
- **THEN** the рахунок picker shows all three and offers no way to see more

#### Scenario: Both legs of a переказ are shortened

- **WHEN** the owner has twenty-seven unarchived рахунки and records a переказ
- **THEN** «Звідки» shows at most five choices and its own offer, and «Куди» shows at most five
  choices and its own offer

#### Scenario: Editing a stored транзакція offers the same short pickers

- **WHEN** the owner opens a stored витрата for editing while twenty-seven категорії are offered
  and the категорія it carries is among the five most recently used
- **THEN** the категорія picker shows five of them and one offer naming all twenty-seven

#### Scenario: A choice made through the offer is stored like any other

- **WHEN** the owner records a витрата of "80" from a UAH рахунок and picks Groceries through the
  offer rather than from the five shown
- **THEN** a витрата of 8000 minor units UAH in категорії Groceries is stored, exactly as if
  Groceries had been shown directly

#### Scenario: A рахунок of another currency picked through the offer asks the сума anew

- **WHEN** the owner opens a stored витрата of 12550 minor units UAH and picks a USD рахунок
  through the offer rather than from the five shown
- **THEN** the сума is asked anew in USD exactly as it would be for a USD рахунок shown directly,
  and no UAH amount lands on the USD рахунок

### Requirement: The short list is what was reached for last, and always holds what is chosen

The short list of a категорія or джерело picker SHALL hold the категорії or джерела of the owner's
most recently stored транзакції carrying one, most recently used first and each at most once; the
short list of a рахунок picker SHALL hold the рахунки of the owner's most recently stored
транзакції the same way — every транзакція naming the рахунок it sits on, whatever its type, a
переказ naming both (the one the money left before the one it arrived at) and a коригування naming
the рахунок it was reconciled against. WHEN fewer than five have been reached for, the short list
SHALL be filled up to five from the head of the full list, so a picker is never shorter than the
choices allow. Whatever is currently chosen SHALL be in the short list — including a рахунок or категорія
that is archived and is there only because the stored транзакція already carries it — and a choice
the owner makes SHALL stay in the short list while the screen is open, so a row found through the
offer never has to be found through it twice.

Archived рахунки, archived категорії, archived джерела, «Коригування» and «Без джерела» SHALL be
offered neither in the short list nor behind the offer, exactly as today. Picking a choice SHALL
NOT reorder the short list, so nothing moves under the owner's finger.

#### Scenario: The last used категорія is one tap away

- **WHEN** the owner's latest витрати carry Groceries, then Eating out, then Groceries again, and
  the owner opens the категорія picker
- **THEN** Groceries and Eating out are among the five shown, Groceries before Eating out and each
  named once

#### Scenario: The рахунки with recent movement are the ones shown

- **WHEN** the owner's latest транзакції touch «гаманець», then a переказ from «mono біла» to
  «Банка на відпустку», while twenty-seven рахунки exist
- **THEN** «гаманець», «mono біла» and «Банка на відпустку» are among the five рахунки shown

#### Scenario: A fresh device still shows five choices

- **WHEN** no транзакція has been recorded yet and twenty-seven категорії are offered
- **THEN** the категорія picker shows five of them and one offer naming all twenty-seven

#### Scenario: An archived категорія is not resurrected by having been used

- **WHEN** a recently used категорія is archived
- **THEN** it is neither among the five shown nor behind the offer

#### Scenario: The рахунок the form opens on is visible

- **WHEN** the remembered рахунок carries no recent транзакція and twenty-seven рахунки exist
- **THEN** it is pre-chosen and it is among the choices shown, without the owner opening the offer

#### Scenario: An archived рахунок a stored транзакція sits on stays visible

- **WHEN** the owner opens a stored витрата whose рахунок has since been archived
- **THEN** that рахунок is shown as the chosen one, and it is offered for nothing else

#### Scenario: Picking does not move the chips

- **WHEN** the owner picks the third of the five категорії shown and looks at the picker again
- **THEN** the same five категорії stand in the same order, with the picked one marked as chosen

#### Scenario: A рахунок found through the offer does not have to be found twice

- **WHEN** the form opens on the remembered рахунок, the owner picks another through the offer,
  and then wants the remembered one back
- **THEN** both stand in the picker, the newly picked one marked as chosen, and going back to the
  remembered рахунок is one tap and not another trip through the offer

### Requirement: The offer opens the full list with a search

WHEN the owner takes the offer to see all choices, the picker SHALL show every choice it offers
together with a field that narrows them by name — matching anywhere in the name, ignoring letter
case in Ukrainian and in Latin. A search matching nothing SHALL say so rather than show an empty
picker. Picking a choice SHALL close the full list and leave that choice chosen and standing among
the few the picker shows. The owner SHALL also be able to close the full list without picking,
leaving the previous choice untouched, and on every screen that can have one open the phone's own
«назад» SHALL close the full list before it leaves the screen.

The full list SHALL keep the order it already has: рахунки and джерела by name in Ukrainian order,
категорії the same but with «Без категорії» leading them wherever it is offered at all — it is
what a витрата arrives carrying, so the default belongs under the thumb. That order is also what the short list is topped up from,
so what a picker shows before the owner has recorded anything is the head of it and not an
arbitrary few.

#### Scenario: A fresh device is topped up from the head of the list

- **WHEN** no транзакція has been recorded yet and the owner opens the категорія picker
- **THEN** «Без категорії» is shown first and the four categories after it are the first four of
  the Ukrainian order, and the same four are shown again on the next opening

#### Scenario: The full list is searched by name

- **WHEN** the owner opens all категорії and types «прод»
- **THEN** only the категорії whose names contain «прод», in any letter case, are shown

#### Scenario: A search that matches nothing says so

- **WHEN** the owner opens all рахунки and types text no рахунок's name contains
- **THEN** the picker says that nothing was found, and no рахунок is shown

#### Scenario: Picking from the full list collapses it

- **WHEN** the owner opens all рахунки, picks one that was not among the few shown, and looks at
  the picker again
- **THEN** the full list is closed, that рахунок is chosen, and it is among the few the picker now
  shows

#### Scenario: Closing the full list changes nothing

- **WHEN** the owner opens all категорії and closes them without picking
- **THEN** the категорія chosen before is still chosen and nothing was stored

#### Scenario: «Назад» closes the full list before the screen

- **WHEN** the owner has the full list of рахунки open on the recording form and uses the phone's
  «назад»
- **THEN** the full list closes and the form is still open, with everything typed into it kept

### Requirement: Recording is visibly confirmed

WHEN a транзакція is stored from the entry form, the entry screen SHALL confirm it where the owner
is already looking, without scrolling, naming the сума with its currency and what it was recorded
as — the категорія of a витрата or повернення, the джерело of a дохід, both рахунки of a переказ.
WHEN a комісія or a дохід «Відсотки» was stored alongside a переказ, the confirmation SHALL say
so. A refused recording SHALL show its own refusal and no confirmation.

The screen SHALL stay open after a store, ready for the next транзакція: the сума, the сума that
arrived and the опис SHALL be cleared, the picked категорія and джерело SHALL be dropped and the
дата SHALL return to today, while the type and the рахунок SHALL stay as they were — the рахунок
being the one this recording has just remembered. Any change to any field afterwards SHALL end the
confirmation, so it never describes a form that has moved on.

#### Scenario: The owner sees what was recorded

- **WHEN** the owner records a витрата of "1200" in Groceries from a UAH рахунок
- **THEN** the screen confirms that 120000 minor units UAH in Groceries was recorded, without the
  owner scrolling anywhere

#### Scenario: An accepted комісія is part of the confirmation

- **WHEN** the owner records a same-currency переказ that arrives short and accepts the proposed
  комісія
- **THEN** the confirmation names the переказ and the комісія that was stored with it

#### Scenario: A refusal is not a confirmation

- **WHEN** the owner taps «Записати» with no сума entered
- **THEN** the refusal is shown, nothing is stored, and no confirmation appears

#### Scenario: The form is ready for the next транзакція

- **WHEN** a витрата in Groceries from «гаманець» is stored from the entry screen
- **THEN** the screen stays open with the confirmation, the сума and опис empty, no категорія
  picked and the дата back to today, while витрата and «гаманець» are still chosen

### Requirement: The опис is visible everywhere and correctable

The latest-transactions feed SHALL show, for a транзакція carrying an опис, the назва of the
продавець that опис is recognised as, and the stored опис itself when it is recognised as none; it
SHALL omit both when no опис exists. Transaction editing SHALL show the stored опис, as stored,
whether or not it is recognised. From editing, the owner SHALL be able to write, change or clear
the опис of any транзакція, whatever put it there — an import, a чернетка or the owner's own hand
— and the опис SHALL be named neutrally rather than as the bank's alone. Changing any other field
SHALL preserve the опис, and neither the опис nor the назва shown for it SHALL replace or be
treated as the категорія, джерело, account name, amount, currency, date or type.

#### Scenario: An uncategorised merchant can be identified in the feed

- **WHEN** monobank imports a витрата in «Без категорії» with опис "СІЛЬПО Київ" that no написання
  recognises
- **THEN** the latest feed shows "СІЛЬПО Київ" with that витрата while its category remains «Без
  категорії»

#### Scenario: A recognised опис shows its продавець in the feed and itself in editing

- **WHEN** «АТБ» holds "атб" and monobank imports a витрата with опис "Оплата послуг АТБ-Маркет 1234
  Київ"
- **THEN** the feed shows «АТБ» with that витрата, and editing shows the опис "Оплата послуг
  АТБ-Маркет 1234 Київ" as stored

#### Scenario: An arriving item keeps its source distinct from its description

- **WHEN** monobank imports a дохід «Без джерела» with опис "Повернення за замовлення"
- **THEN** the feed shows both «Без джерела» and "Повернення за замовлення", without treating the
  description as a джерело

#### Scenario: A manual transaction stays compact

- **WHEN** a manually recorded транзакція has no опис
- **THEN** the feed and editor show no empty description row or placeholder for it

#### Scenario: A wrong опис is corrected from editing

- **WHEN** the owner opens a stored витрата carrying the опис "шини на зиму" and changes it to
  "шини на літо"
- **THEN** the same транзакція now carries "шини на літо" and its сума, категорія, рахунок, дата
  and type are unchanged

#### Scenario: An опис can be cleared

- **WHEN** the owner clears the опис of a stored транзакція
- **THEN** the same транзакція is stored with no опис and the feed shows no description row for it

#### Scenario: Editing another field leaves the опис alone

- **WHEN** the owner changes only the сума of a витрата carrying an imported опис
- **THEN** the опис is still exactly what the import stored

### Requirement: The header opens dashboard editing

The compact Головний header SHALL offer an action named «Налаштувати Головний» with at least a 48 × 48 dp target, and invoking it SHALL open dashboard editing without starting sync or changing any widget preference by itself.

#### Scenario: Header action opens the editor
- **GIVEN** Головний is open
- **WHEN** the owner invokes «Налаштувати Головний»
- **THEN** dashboard editing opens with the current order and visibility of every known widget
- **AND** no sync or network request starts

### Requirement: The ring's total stays inside the ring

The сума in the centre of «Топ категорій витрат» SHALL be drawn wholly inside the ring's hole,
never across the ring or past it: the number SHALL shrink as far as it must to fit, with its
currency on a line of its own under it. While the ring draws proportional sectors, each legend row
SHALL carry a swatch in the tone of its sector, so a row and its sector can be matched without
counting; the swatch SHALL NOT be the only thing that names the category — the row's name and exact
сума stay beside it. While the ring is the neutral ring of a signed or empty breakdown, which draws
no sectors, the legend SHALL carry no swatch, so no row claims a share.

#### Scenario: A six-digit month fits

- **WHEN** the month's UAH витрачено across categories is 68 682,49 UAH
- **THEN** «68 682,49» is drawn inside the hole of the ring with «UAH» under it, and no digit
  overlaps the ring

#### Scenario: Legend rows match their sectors

- **WHEN** the ring shows five categories and «Ще 14»
- **THEN** every legend row, «Ще 14» included, carries a swatch in its own sector's tone

#### Scenario: A negative category draws no swatch

- **WHEN** a category's повернення exceed its витрати this month and the ring is neutral
- **THEN** its legend rows show names and signed сумі and no swatch

### Requirement: A transaction line keeps its сума beside its title

On every line of транзакції — the feed, «Транзакції», a рахунок's рухи and a категорія's month —
the сума SHALL stand beside the line's first row (its title) only; the line's second row and its
опис SHALL use the whole width under the title. The title of a переказ SHALL be allowed a second
row rather than cut both рахунки's names to a few letters.

#### Scenario: Large text keeps the second row on one line

- **WHEN** the system font is at 130% and a витрата on «гаманець» reads «Кава» with its дата
- **THEN** «гаманець · сьогодні» reads on one row under the title and is not wrapped by the сума's
  column

#### Scenario: A переказ names both рахунки

- **WHEN** a переказ goes from «platinum ··6628» to «інжур»
- **THEN** its line shows «platinum ··6628 → інжур» whole, over up to two rows

### Requirement: The recording confirmation stands above «Записати»

WHEN a транзакція is stored from the entry form, its confirmation SHALL be drawn directly above
«Записати», the control the owner just pressed, so it is on screen without scrolling wherever the
form was scrolled to.

#### Scenario: The confirmation is seen where the button is

- **WHEN** the owner scrolls the entry form to «Записати» and records a витрата of "100" in Кава
- **THEN** «Записано: витрата 100,00 UAH — Кава.» is visible directly above «Записати» without
  any further scrolling

### Requirement: The дата of a транзакція is set without typing a date code

The entry form and transaction editing SHALL offer, beside the дата, «Сьогодні» and «Вчора», each
setting the дата in one tap. While the typed дата is a real date, they SHALL also offer a step of
one day back and — only while that дата is before today — one day forward, so no tap sets a
future дата; while it is not a date, only «Сьогодні» and «Вчора» SHALL be offered. The дата SHALL
be named as a day beside its label, and typing it SHALL offer the device's digit keyboard. Choices
SHALL only change the дата field; nothing is stored until «Записати» or «Зберегти».

#### Scenario: Yesterday in one tap

- **WHEN** today is 2026-09-23 and the owner taps «Вчора» on the entry form
- **THEN** the дата becomes 2026-09-22 and the form names it «вчора»

#### Scenario: A day back from the дата shown

- **WHEN** the дата is 2026-09-01 and the owner taps the one-day-back step
- **THEN** the дата becomes 2026-08-31

#### Scenario: Stepping stops at today

- **WHEN** the дата is today
- **THEN** no one-day-forward step is offered

#### Scenario: A half-typed дата offers only the two quick choices

- **WHEN** the owner has typed "2026-09" into the дата
- **THEN** only «Сьогодні» and «Вчора» are offered and no day is named beside the label

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

### Requirement: «Потребує уваги» leads to the транзакції without a категорія

The row of «Потребує уваги» that names how many транзакції are without a категорія SHALL open
«Транзакції» with the «Без категорії» narrowing already in force, as the transaction-search
capability defines — not on the whole history. The number the row names SHALL count exactly the
транзакції that narrowing shows: the витрати and повернення carrying «Без категорії». The offer of
the latest-transactions section to go to all транзакції SHALL keep opening the whole history.

#### Scenario: «Переглянути» opens only what is waiting

- **WHEN** «Потребує уваги» names three транзакції without a категорія among 188 stored and the
  owner follows that row
- **THEN** «Транзакції» opens narrowed to «Без категорії», showing those three and no other

#### Scenario: A повернення in «Без категорії» is counted

- **WHEN** the only транзакція carrying «Без категорії» is a повернення
- **THEN** «Потребує уваги» names one транзакція without a категорія

#### Scenario: The feed's way to all транзакції is not narrowed

- **WHEN** the owner follows the latest-transactions section's offer to see all транзакції
- **THEN** «Транзакції» opens on the whole history with no narrowing in force

#### Scenario: The owner can still see everything from there

- **WHEN** the owner has followed that row to «Транзакції»
- **THEN** the «Без категорії» narrowing reads as in force and taking it off shows the whole
  history

### Requirement: Головний says how fresh the bank data is

WHEN monobank is configured and at least one рахунок is linked, Головний SHALL state how fresh the
bank data is, as a reading of the moments the monobank capability already keeps and never as a
number of its own.

WHEN a sync has completed for every linked рахунок, the line SHALL state the age of the **oldest**
of those completed syncs — the age of the whole picture, not of its freshest corner — as an age
rather than a timestamp: «щойно» under a minute, whole minutes under an hour, whole hours under a
day, and the calendar moment beyond that. It is the same moment the monobank screen states, in
shorter words.

WHEN a sync has completed for some linked рахунки but not all, the line SHALL state how many of how
many are synced instead of any age: an age read off the рахунки that did sync would tell the owner
their picture is fresh while most of their money is missing from it.

The line SHALL move only when a sync completes, so a failed run leaves it exactly where it was.

The moment «Потребує уваги» decides its monobank row from SHALL be the same one this line reads:
the oldest completed sync when every linked рахунок has synced, and **no moment at all** while any
linked рахунок has never synced. A bank the app has never wholly heard from is not fresh data,
whatever its freshest рахунок says, so a failing run over it is a failure over stale data and the
row appears; deciding that row from the newest moment would hide exactly the situation the count
above exists to state.

WHEN a sync is going on, the line SHALL say that instead of stating an age or a count, and SHALL go
back to its reading when the run ends — whoever started that run, and whether it started before or
after Головний was opened.

WHEN no linked рахунок has ever completed a sync, Головний SHALL say that plainly instead of
showing an empty age. WHEN no рахунок is linked, Головний SHALL show no freshness line at all — an owner who never
connected a bank is told nothing about one. WHEN рахунки are linked but monobank is not configured
— the token was removed or never re-entered — Головний SHALL show no freshness line either, and
the service rail SHALL instead say that the bank is not being heard, as «A linked bank without a
token is stated under the header» requires.

#### Scenario: Minutes are stated as minutes

- **WHEN** every linked рахунок has synced and the oldest of those syncs was three minutes ago
- **THEN** Головний says the data was updated 3 хв ago

#### Scenario: A sync just now is «щойно»

- **WHEN** every linked рахунок has synced and the oldest of those syncs was 20 seconds ago
- **THEN** Головний says the data was updated «щойно»

#### Scenario: Hours are stated as hours

- **WHEN** every linked рахунок has synced and the oldest of those syncs was five hours ago
- **THEN** Головний says the data was updated 5 год ago

#### Scenario: Beyond a day it is a calendar moment

- **WHEN** every linked рахунок has synced and the oldest of those syncs was yesterday at 21:14
- **THEN** Головний states that moment as a date and time rather than as an age

#### Scenario: The age is the oldest account's, not the newest

- **WHEN** one linked рахунок synced a minute ago and another three days ago
- **THEN** Головний states the age of the three-day-old sync

#### Scenario: A partly synced bank is stated as a count

- **WHEN** three of nine linked рахунки have completed a sync and six never have
- **THEN** Головний says «Синхронізовано 3 з 9 рахунків», and states no age

#### Scenario: The count reads as Ukrainian for every number of рахунки

- **WHEN** one of three linked рахунки has completed a sync
- **THEN** Головний says «Синхронізовано 1 з 3 рахунків» — the noun after «з» is the genitive
  plural whatever the number is

#### Scenario: A failing run over a partly synced bank needs the owner

- **WHEN** six of nine linked рахунки have never completed a sync and the last run ended
  unavailable
- **THEN** «Потребує уваги» carries the monobank row, because a bank the app has never wholly
  heard from is not fresh data

#### Scenario: A pull that must wait out the request gap says a sync is going on

- **WHEN** the owner pulls Головний down within a minute of the last request any run sent, so the
  run they started sits out the rest of the gap before its first request
- **THEN** the line says a sync is going on for the whole of that wait, and states its reading when
  the run ends

#### Scenario: A linked bank that has never synced says so

- **WHEN** monobank is configured, one рахунок is linked and no sync has ever completed
- **THEN** Головний says that no sync has happened yet rather than showing an empty age

#### Scenario: Without monobank there is no line

- **WHEN** monobank is not configured, or is configured with no linked рахунок
- **THEN** Головний shows no freshness line

#### Scenario: A run in flight is what the line says

- **WHEN** a run started on opening is going on
- **THEN** the line says a sync is going on rather than stating an age, and states the new reading
  once the run ends

#### Scenario: A run that begins while Головний is open reaches the line

- **WHEN** Головний is already open and a run starts
- **THEN** the line says a sync is going on without Головний being left and reopened

#### Scenario: A failed run does not move the line

- **WHEN** the line states an age of two hours and a run ends without reaching monobank
- **THEN** the line still states the same completed sync, now two hours and a little older

### Requirement: Pulling down on Головний refreshes it and syncs monobank now

Головний SHALL respond to a pull-down by re-reading everything it shows from storage and, when
monobank is configured with at least one linked рахунок, by starting a sync at once — the quiet
interval governs only the runs the owner did not ask for, and this is one they asked for. While
that run is going on the pull SHALL show that work is in progress, and it SHALL stop showing it
when the run ends. Транзакції the run imported SHALL appear on Головний without the owner leaving
it, and the freshness line SHALL state the new moment.

A pull while monobank is not configured, or while no рахунок is linked, SHALL re-read storage,
send no request and refuse nothing — no dialog, no error. A pull while a run is already going on
SHALL NOT start a second one; it SHALL show the run that is already going on until it ends.

#### Scenario: A pull imports and shows the result in place

- **WHEN** the owner pulls down on Головний and the run that starts imports two транзакції
- **THEN** both stand among the latest транзакції and the freshness line states the new moment,
  without Головний being left

#### Scenario: A pull inside the quiet interval still syncs

- **WHEN** an attempt was recorded one minute ago and the owner pulls down
- **THEN** a run starts

#### Scenario: A pull without monobank changes nothing but the reading

- **WHEN** monobank is not configured and the owner pulls down
- **THEN** Головний re-reads what it shows, no request is sent, and nothing is refused

#### Scenario: A pull during a run starts no second one

- **WHEN** a run started on opening is still going on and the owner pulls down
- **THEN** no second run starts and the pull shows the run already going on until it ends

### Requirement: A sync the owner did not ask for is silent unless it needs them

A sync started without the owner asking SHALL announce nothing while it needs nothing from them:
no dialog, no toast, no сповіщення про збій, and nothing to dismiss. What it imported appearing
among the latest транзакції and the freshness line moving are the whole of what it says. A run that
failed while monobank does not need the owner SHALL be equally silent, and SHALL raise no
сповіщення про збій in any case — it runs precisely while the app is in front of the owner, where
«Потребує уваги» says it in more words than a notification may carry.

WHEN such a run completes, any сповіщення про збій standing for monobank sync SHALL be cleared, as
it is for a run the owner started: the action has succeeded, whoever asked for it.

What Головний shows when monobank does need the owner is the «Потребує уваги» section's, which
this change modifies to hold that row.

#### Scenario: A successful automatic run says nothing

- **WHEN** a run started on opening completes and imports three транзакції
- **THEN** the three транзакції stand among the latest ones, the freshness line states the new
  moment, and no dialog, toast or notification appears

#### Scenario: An automatic run that imported nothing says nothing either

- **WHEN** a run started on opening completes with no new транзакція
- **THEN** Головний shows nothing about it beyond the freshness line's new moment

#### Scenario: A failing automatic run posts no notification

- **WHEN** a run started on opening ends unavailable
- **THEN** no сповіщення про збій is posted and none is left standing for a later screen to clear

#### Scenario: A run that works clears what an earlier failure left standing

- **WHEN** a сповіщення про збій for monobank sync is outstanding and a run started on opening
  completes
- **THEN** that сповіщення is cleared

### Requirement: Головний's bank freshness leaves out a рахунок the token no longer shows

Головний's freshness line — its age and its «Синхронізовано N з M рахунків» count — and the moment
«Потребує уваги» decides its monobank row from SHALL be read over the linked рахунки the newest
stored client-info answer names, as the monobank-sync capability's «A рахунок the token no longer
shows is set aside, not failed» requires; that requirement takes precedence over the wording «every
linked рахунок» in «Головний says how fresh the bank data is». WHEN the phone holds no answer, or the
newest one names none of the linked рахунки, every linked рахунок counts, exactly as before.

#### Scenario: A closed card does not age the whole bank

- **WHEN** eight linked рахунки synced three minutes ago and a ninth, which the newest stored answer
  does not name, last synced two days ago
- **THEN** Головний says the data was updated 3 хв ago, and «Потребує уваги» carries no monobank row

#### Scenario: A token that shows nothing linked still reads stale

- **WHEN** the newest stored answer names none of the two linked рахунки, last synced two days ago,
  and the last прогін ended unavailable
- **THEN** Головний states the two-day-old moment and «Потребує уваги» carries the monobank row

### Requirement: Editing names the транзакція's продавець

Transaction editing SHALL show a «Продавець» row for a транзакція that carries an опис. When the
опис is recognised as a продавець, the row SHALL show that продавець's назва, and tapping it SHALL
open that продавець's screen. When the опис is recognised as none, the row SHALL offer «Назвати
продавця», which opens the naming form for that опис. A транзакція carrying no опис SHALL show no
such row. The row SHALL read the опис as it stands when the screen is shown. An опис changed in
the same editing SHALL be read once it is saved, since the продавець is what the stored опис is
recognised as.

#### Scenario: A recognised транзакція names its продавець

- **WHEN** «АТБ» holds "atb" and the owner opens a витрата carrying the опис "ATB MARKET 23"
- **THEN** editing shows the опис "ATB MARKET 23" and a «Продавець» row reading «АТБ», which opens
  «АТБ»'s screen

#### Scenario: An unrecognised транзакція offers naming

- **WHEN** the owner opens a витрата carrying the опис "ЗЕРНО 12" that no написання recognises
- **THEN** the «Продавець» row offers «Назвати продавця», which opens the naming form proposing
  «Зерно» and "зерно"

#### Scenario: No опис, no row

- **WHEN** the owner opens a витрата recorded by hand with no опис
- **THEN** editing shows no «Продавець» row

### Requirement: The «Спостереження» widget points at what is notable this month

When visible, the «Спостереження» widget SHALL show up to three спостереження of the current
month. It SHALL take the first three in the order the observations capability defines, each in
its one sentence, each leading where that capability says. A можливий дубль SHALL carry its «Не
дубль» answer, which takes effect in place without leaving Головний.

WHEN the current month has more than three спостереження, the widget SHALL offer «Усі (N)»,
naming how many there are and leading to Місяць on the current month.

WHEN the current month has none, the widget SHALL say so in one sentence, drawn inside the same card
its lines are drawn in, and keep its place.

On the first seven days of a month, WHEN the previous month is a завершений активний місяць, the
widget SHALL open with one more row, «Підсумок <місяця>», leading to that month's підсумок. From
the eighth day that row SHALL no longer be shown. It is not remembered as seen.

Showing the widget SHALL write nothing, post nothing and request nothing.

#### Scenario: Three of five

- **WHEN** October 2026 has five спостереження and the widget is visible
- **THEN** the widget shows the first three in order and «Усі (5)», which opens Місяць on October

#### Scenario: Nothing notable yet

- **WHEN** today is 2026-10-10 and the current month has no спостереження
- **THEN** the widget says there is nothing unusual this month so far, inside the widget's card,
  and nothing else

#### Scenario: September's підсумок in the first week of October

- **WHEN** today is 2026-10-02 and September 2026 holds транзакції
- **THEN** the widget opens with «Підсумок вересня», which opens the підсумок of September

#### Scenario: The підсумок row leaves after the seventh day

- **WHEN** today is 2026-10-08
- **THEN** the widget shows no «Підсумок вересня» row, and the підсумок is still reachable from
  Місяць

#### Scenario: «Не дубль» on Головний

- **WHEN** the widget shows a можливий дубль and the owner answers «Не дубль»
- **THEN** the pair disappears from the widget, the next спостереження takes its place if there is
  one, and Головний is not left

#### Scenario: A hidden widget shows nothing

- **WHEN** the owner has hidden «Спостереження» in dashboard editing
- **THEN** Головний shows no спостереження and no «Підсумок» row, and the service rail is unchanged

### Requirement: A linked bank without a token is stated under the header

WHEN at least one unarchived рахунок is linked to monobank and no monobank token is configured,
the service rail directly below Головний's header SHALL carry one compact row saying that monobank
is not being read for lack of a token, how many linked рахунки are affected, and since when: the
oldest last completed sync among the linked рахунки that ever synced, as a дата in words — a
linked рахунок that never synced does not hide the others' дата — or, when none of them ever
synced, no дата and that they never synced. Its tap SHALL
open the monobank screen. The row SHALL follow the rail's rules: outside the configurable widgets,
never hidden or reordered, taking no space when absent, and making no network request of its own.
It SHALL be gone as soon as a token is configured or no рахунок is linked any more.

#### Scenario: Twelve days without a token are said

- **WHEN** nine рахунки are linked to monobank, no token is configured, the oldest last sync of
  them completed on 2026-09-21 and today is 2026-10-05
- **THEN** the rail says monobank is not read without a token for 9 рахунків since 21 вересня, and
  its tap opens the monobank screen

#### Scenario: Some linked рахунки never synced

- **WHEN** nine рахунки are linked to monobank, no token is configured, seven of them last synced
  between 2026-09-21 and 2026-09-28, two never synced, and today is 2026-10-05
- **THEN** the rail says monobank is not read without a token for 9 рахунків since 21 вересня

#### Scenario: No linked рахунок ever synced

- **WHEN** two рахунки are linked to monobank, no token is configured and neither ever synced
- **THEN** the rail says monobank is not read without a token for 2 рахунків and that they never
  synced, and names no дата

#### Scenario: A device that never connected a bank stays quiet

- **WHEN** no рахунок is linked and no token is configured
- **THEN** no monobank row and no freshness line appear

#### Scenario: Entering the token clears the row

- **WHEN** the owner enters a token on the monobank screen and returns to Головний
- **THEN** the no-token row is gone and the freshness line states the bank's freshness as usual

### Requirement: A дохід «Без джерела» is given its джерело in one tap

The feed and «Транзакції» SHALL visibly mark every дохід carrying «Без джерела», and from that
mark the owner SHALL be able to pick an unarchived джерело and have it stored on that дохід without
opening editing; the mark SHALL disappear with the pick. The джерела offered SHALL follow the same
short-list rule as the категорії of «Без категорії»: at most five, the rest behind one offer naming
how many there are in all, «Без джерела» itself not among them. The mark SHALL offer only джерела.
A дохід «Без джерела» that is really a повернення or one leg of a переказ is not answered from the
mark: tapping the line itself, outside the mark, SHALL open its editing as it does today, where the
дохід is retyped as that editing already allows.

#### Scenario: One tap gives a дохід its джерело

- **WHEN** the feed holds a дохід of 96000 minor units UAH «Від: Міхаіл Кас'ян» in «Без джерела»
  and the owner picks «Подарунки» from its mark
- **THEN** that дохід carries «Подарунки», editing never opened, and the mark is gone

#### Scenario: The same mark in «Транзакції»

- **WHEN** «Транзакції» lists a дохід of 96000 minor units UAH «Від: Міхаіл Кас'ян» in «Без
  джерела» and the owner picks «Подарунки» from its mark
- **THEN** that дохід carries «Подарунки», editing never opened, and the mark is gone

#### Scenario: A дохід that is really a повернення is retyped from its editing

- **WHEN** the feed holds a дохід «Без джерела» of 45000 minor units UAH «Скасування покупки
  Rozetka» and the owner taps the line outside its mark
- **THEN** the editing of that дохід opens, where it can be retyped as a повернення as it can
  today, and the mark itself offers nothing but джерела

#### Scenario: Nothing else is offered a джерело

- **WHEN** the feed holds a витрата, a переказ and a коригування
- **THEN** none of them carries the «Без джерела» mark

### Requirement: The quick категорія picker leads with what a правило would give

WHEN the «Без категорії» mark is used on a витрата whose опис a правило or the шаблон categorises,
that категорія SHALL be offered first among the five, marked as the suggestion; it SHALL be stored
only when the owner picks it. Opening the full list of категорії from the mark SHALL show the list
and its search field without raising the keyboard; the keyboard SHALL open only when the owner taps
the search field, and the list SHALL stay in sight above it while they type.

#### Scenario: The шаблон's категорія is one tap away

- **WHEN** a витрата «Oplata poslug MEGOGO KYIV» in «Без категорії» is marked and the шаблон gives
  that опис «Підписки»
- **THEN** «Підписки» is the first of the five offered, marked as the suggestion, and nothing is
  stored until it is picked

#### Scenario: The full list is read before it is searched

- **WHEN** the owner opens «Всі категорії (27)» from the mark
- **THEN** the list is shown and no keyboard covers it

### Requirement: A сума the owner left empty or not positive is refused by what is wrong

The entry and editing forms SHALL refuse an empty сума with «Напишіть суму» and a сума that is
zero or negative with «Сума має бути більшою за нуль», and keep the refusal that quotes the typed
text for anything that is not a number.

#### Scenario: An empty сума asks for one

- **WHEN** the owner chooses a рахунок, leaves «Сума» empty and taps «Записати»
- **THEN** nothing is recorded and the refusal reads «Напишіть суму»

#### Scenario: A negative сума is named as such

- **WHEN** the owner types «-50» into «Сума» and taps «Записати»
- **THEN** nothing is recorded and the refusal reads «Сума має бути більшою за нуль»
