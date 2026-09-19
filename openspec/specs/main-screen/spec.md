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
правила give the опис currently typed, for as long as the owner has picked no категорія
themselves. The chosen категорія SHALL follow the опис as it is typed and cleared: clearing the
опис, or changing it to text no правило matches, SHALL return the form to «Без категорії». The
moment the owner picks a категорія, the form SHALL keep that pick and SHALL stop following the
опис for the rest of that recording.

The категорія a правило gives SHALL be shown in the short list like any other, so it is visible
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
a правило that would make the same decision next time, with the merchant pattern already proposed
from that опис and editable before it is stored. Accepting SHALL store the правило; declining
SHALL store none and SHALL leave the категорія just set exactly as it is. Whether the правило is
stored or not, the категорія SHALL already be stored on the транзакції before the offer is made,
so dismissing the offer — or leaving the screen — can never lose the owner's categorisation.

The offer SHALL name what it would remember in words the owner can check before accepting: the
pattern and the категорія it would target. The cases in which no offer is made at all belong to
the categorisation-rules capability.

#### Scenario: One tap in the feed, then the offer

- **WHEN** the owner uses the «Без категорії» mark on a витрата carrying the опис "СІЛЬПО 123
  Київ" and picks Groceries
- **THEN** the витрата carries Groceries and an offer appears naming the pattern "сільпо" and
  Groceries

#### Scenario: Accepting the offer stores the правило

- **WHEN** that offer is accepted unchanged
- **THEN** the правило "сільпо → Groceries" exists

#### Scenario: Declining keeps the категорія

- **WHEN** that offer is declined
- **THEN** the витрата still carries Groceries and no правило was stored

#### Scenario: The editing screen offers it too

- **WHEN** the owner opens a витрата carrying the опис "УКЛОН" in editing, changes its категорія
  to Transport and saves
- **THEN** the витрата carries Transport and an offer appears naming the pattern "уклон" and
  Transport

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

The latest-transactions feed and transaction editing SHALL show a stored опис when one exists and
SHALL omit it when none exists. From editing, the owner SHALL be able to write, change or clear
the опис of any транзакція, whatever put it there — an import, a чернетка or the owner's own hand
— and the опис SHALL be named neutrally rather than as the bank's alone. Changing any other field
SHALL preserve the опис, and the опис SHALL NOT replace or be treated as the категорія, джерело,
account name, amount, currency, date or type.

#### Scenario: An uncategorised merchant can be identified in the feed

- **WHEN** monobank imports a витрата in «Без категорії» with опис "СІЛЬПО Київ"
- **THEN** the latest feed shows "СІЛЬПО Київ" with that витрата while its category remains «Без
  категорії»

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
