# main-screen Specification

## Purpose
The Головний screen — what the owner sees on opening the app: the month's залишилось as its
figure, what the рахунки hold beneath it, what is waiting on the owner, and the latest транзакції
with editing one tap away. Recording is behind the «+» over its corner, on a screen of its own,
with the minimum of fields. It carries both product questions at their shortest: where the money
went, and how much of the month is left — and nothing can be answered until spending can be
recorded, which is what the «+» is for.
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

### Requirement: Opening Головний again shows it from its top

WHEN the owner opens the Головний tab after having been on another tab, the screen SHALL be shown
from its top — the money and the entry form — rather than at the position it was scrolled to when
it was left. Scrolling within Головний without leaving it SHALL NOT be affected, and the feed SHALL
keep showing what is stored: only where the screen starts changes, never what it holds.

#### Scenario: Coming back lands at the start of the entry form

- **WHEN** the owner scrolls Головний down into its feed, opens Місяць, and opens Головний again
- **THEN** Головний is shown from its top, not from the middle of the entry form

#### Scenario: Scrolling within the screen is untouched

- **WHEN** the owner scrolls Головний down and stays on it
- **THEN** the screen stays where it was scrolled to

### Requirement: Головний opens with how much money there is

Above the entry form Головний SHALL show the money held the accounts capability defines — the
total of every unarchived рахунок, per currency — with the approximate UAH equivalent beside it,
visibly marked as approximate, only when a non-UAH currency participates and every participating
currency has a known monobank rate. The figure SHALL be named so it cannot be read as a monthly
number: it is what the рахунки hold, not the month's залишилось, and the two SHALL NOT share a
name. WHEN no unarchived рахунок exists, no total SHALL be shown and the screen SHALL keep
inviting the owner to create the first рахунок.

#### Scenario: Money is the first thing on the screen

- **WHEN** the owner opens the app with unarchived рахунки holding 705000 minor units UAH and
  600000 minor units UAH
- **THEN** Головний shows 1305000 minor units UAH as the money held, above the entry form

#### Scenario: The month's number is not this number

- **WHEN** the month's залишилось is −265000 minor units UAH while the рахунки hold 1305000 minor
  units UAH
- **THEN** Головний shows the 1305000 minor units UAH under its own name, and shows no monthly
  залишилось under that name

#### Scenario: An empty device shows no total

- **WHEN** the app is opened while no рахунок exists
- **THEN** no total is shown and the screen states that a рахунок must be created first

### Requirement: A транзакція recorded by hand can carry an опис

The entry form SHALL offer an optional опис for every type it records — витрата, переказ, дохід
and повернення. What the owner types SHALL be stored as the транзакція's опис, with the meaning
the transactions capability gives it: information only, changing no total, balance or
classification. Leaving it empty SHALL store no опис, and SHALL be the normal case — the опис
SHALL never be required and its absence SHALL never block recording.

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

WHEN a транзакція is stored from the entry form, Головний SHALL confirm it where the owner is
already looking, without scrolling, naming the сума with its currency and what it was recorded as
— the категорія of a витрата or повернення, the джерело of a дохід, both рахунки of a переказ.
WHEN a комісія or a дохід «Відсотки» was stored alongside a переказ, the confirmation SHALL say
so. A refused recording SHALL show its own refusal and no confirmation.

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

### Requirement: Everything stored is reachable from Головний

The latest-transactions section SHALL make it plain that it shows only the latest транзакції and
SHALL offer a way to all of them, where they can be searched and narrowed as the
transaction-search capability defines. The offer SHALL be present whether or not more транзакції
are stored than the section shows.

#### Scenario: The whole history is one tap from the feed

- **WHEN** more транзакції are stored than the latest-transactions section shows
- **THEN** the section says it shows the latest only and offers going to all транзакції

#### Scenario: The way there does not depend on having a long history

- **WHEN** three транзакції are stored
- **THEN** the offer to go to all транзакції is still shown

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
