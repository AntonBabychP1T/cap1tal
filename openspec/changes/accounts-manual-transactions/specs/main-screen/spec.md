# main-screen Delta

## Purpose

The Головний screen — what the owner sees on opening the app: recording a transaction by hand
with the minimum of fields, and the latest transactions with editing one tap away. It is the
first answer to "where did the money go": nothing can be answered until spending can be recorded.

## ADDED Requirements

### Requirement: Opening the app shows quick entry and the latest transactions

On opening the app the owner SHALL be able to record a transaction and see the latest
transactions on the same screen, ordered newest first — by date, then by recording recency —
each showing its amount with currency, its account (both accounts for a переказ) and its date.
WHEN no рахунок is available to choose — none exists yet, or every one of them is archived —
the screen SHALL state that a рахунок must be created first and SHALL offer going to Рахунки;
nothing SHALL be recorded until one exists.

#### Scenario: The first screen is entry plus the feed

- **WHEN** the app is opened
- **THEN** the screen offers recording a transaction and shows the latest transactions, newest
  first

#### Scenario: A recorded transaction appears at the top of the feed

- **WHEN** the owner records an expense dated today
- **THEN** it appears at the top of the latest transactions

#### Scenario: With no рахунок nothing can be recorded yet

- **WHEN** the app is opened while no account exists, or while every account is archived
- **THEN** the entry form offers no рахунок, states that a рахунок must be created first and
  offers going to Рахунки, nothing can be recorded, and the feed still shows what is stored

### Requirement: A manual expense needs only amount and account

Recording SHALL default to витрата and SHALL require only the сума and the рахунок; the date
SHALL default to today and be changeable. The amount SHALL be entered in the account's currency
as major units with an optional fractional part and SHALL be stored exactly as integer minor
units; an amount that is not positive, has more fractional digits than the currency's minor
unit, or is not a number SHALL be rejected. The expense SHALL carry the category "Без категорії"
— the Ukrainian display label of the reserved uncategorised category, and the only category
offered until the categories capability arrives.

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

### Requirement: A переказ can be recorded between two accounts

The owner SHALL be able to record a переказ by choosing the account the money left, the account
it arrived at, and the сума that left; choosing the same account as both source and destination
SHALL be rejected. Between accounts of the same currency an optional «скільки прийшло» SHALL
also be offered, defaulting to the сума that left, so an untouched field records the same amount
on both legs; between accounts of different currencies both amounts SHALL be asked — what left
and what arrived — and no комісія SHALL ever be proposed for them, whatever the two numbers are.

WHEN a переказ between accounts of the same currency is recorded or edited with «скільки
прийшло» smaller than the сума that left, the difference SHALL be proposed as a витрата
"Комісія" — the Ukrainian display label of the reserved "Fees" category, one category, not a
second one — on the account the money left, dated the same day as the переказ, which the owner
accepts or declines. Accepting SHALL store the переказ with the сума that arrived on both legs
together with that витрата, so the account the money left loses exactly the сума that left it
and no розрахунковий баланс counts the комісія twice; declining SHALL store only the переказ,
keeping the сума that left and the сума that arrived on their own legs. A stored переказ whose
legs are equal SHALL propose nothing when it is opened again.

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

### Requirement: A transaction can be edited and deleted from the feed

Tapping a transaction in the feed SHALL open it for editing: its amount, date and account or
accounts SHALL be changeable, and the transaction SHALL be deletable after confirmation. Edits
SHALL persist under the same transaction, and a transaction whose date is changed SHALL belong
to the month of its new date. WHEN an account choice is changed to an account of a different
currency, the amount touching that account SHALL be entered anew in the new account's currency —
nothing is converted automatically, so no amount can land on an account in a foreign currency.
An edit that leaves a same-currency переказ arriving short SHALL propose the комісія on the same
terms as recording it.

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
  «скільки прийшло» to 99500 minor units and accepts the proposed комісія
- **THEN** the same переказ now carries 99500 minor units UAH on both legs and a витрата of 500
  minor units UAH in category "Комісія" on the account the money left is stored alongside it

### Requirement: A transaction's type can be changed from editing

From editing, the owner SHALL be able to retype a витрата into a переказ — choosing the account
the money arrived at, the second leg when currencies differ — and a переказ into a витрата,
keeping the same transaction identity. Retyping into a переказ onto an інвестиційний рахунок is
how an інвестиція is recorded — no separate action SHALL exist for it. WHEN a переказ is retyped
into a витрата, the витрата SHALL be recorded on the account the money left, for the сума that
left it, in that account's currency, carrying "Без категорії"; the arrived leg and the
destination account SHALL be dropped and nothing SHALL be converted. A витрата "Комісія" stored
earlier alongside that переказ is a separate transaction and SHALL be left untouched — the owner
deletes it from the feed if it no longer applies.

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
  a витрата
- **THEN** the same transaction is a витрата of 100000 minor units UAH on the card in "Без
  категорії", nothing remains on the jar, and the jar's розрахунковий баланс no longer holds the
  100000 minor units UAH

#### Scenario: A cross-currency transfer becomes an expense of what left

- **WHEN** the owner retypes a переказ that left a UAH card as 410000 minor units UAH and arrived
  at a USD account as 10000 minor units USD into a витрата
- **THEN** the витрата is 410000 minor units UAH on the UAH card, the USD leg is gone and nothing
  is converted

#### Scenario: An accepted комісія survives the retype as its own transaction

- **WHEN** a переказ whose комісія was accepted is retyped into a витрата
- **THEN** the витрата "Комісія" is still stored on the same account as its own transaction,
  deletable from the feed
