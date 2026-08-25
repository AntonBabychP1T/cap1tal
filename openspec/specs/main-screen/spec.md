# main-screen Specification

## Purpose
The Головний screen — what the owner sees on opening the app: recording a transaction by hand
with the minimum of fields, and the latest transactions with editing one tap away. It is the
first answer to "where did the money go": nothing can be answered until spending can be recorded.
## Requirements
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
- **THEN** Pets is not among the offered categories

#### Scenario: «Коригування» is not offered

- **WHEN** the owner opens the category picker while recording a витрата
- **THEN** «Коригування» is not among the offered categories, while «Комісія» and «Без
  категорії» are

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
opening editing; the mark SHALL disappear with the pick.

#### Scenario: An uncategorised expense is marked in the feed

- **WHEN** the feed holds a витрата in "Без категорії" and a витрата in Groceries
- **THEN** the "Без категорії" one is visibly marked and the Groceries one is not

#### Scenario: One tap categorises from the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Groceries
- **THEN** the same transaction now carries Groceries, without the editing screen having opened,
  and the mark is gone

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
