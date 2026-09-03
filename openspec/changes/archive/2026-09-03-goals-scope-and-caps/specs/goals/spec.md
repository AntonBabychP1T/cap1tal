## ADDED Requirements

### Requirement: A ціль is of one of two kinds

A ціль SHALL be of exactly one kind: a **ціль-накопичення** («накопичити N»), which is reached when
what the owner has is at or above a target, or a **ціль витрат** («витратити не більше N цього
місяця»), which is kept while what the owner spent stays at or below a ceiling. The kind SHALL be
chosen when the ціль is created and SHALL NOT change afterwards: the two kinds hold different
fields, mean opposite things, and a ціль retyped from one into the other would be a different ціль
under the same назва.

The two kinds SHALL NOT share a progress vocabulary. Nothing SHALL describe a ціль витрат as
досягнута, виконана or a percentage above its ceiling, and nothing SHALL describe a
ціль-накопичення as перевищена.

#### Scenario: The two kinds exist side by side

- **WHEN** the owner holds the ціль-накопичення «Машина» for 70000000 minor units UAH and the ціль
  витрат «Ресторани» of at most 200000 minor units UAH a month
- **THEN** both are цілі, «Машина» is a ціль-накопичення and «Ресторани» is a ціль витрат

#### Scenario: A kind is not retyped

- **WHEN** the owner edits an existing ціль-накопичення
- **THEN** its kind is not offered for change, and it is still a ціль-накопичення afterwards

### Requirement: A ціль-накопичення holds назва, target, currency, an optional дата and a склад

The owner SHALL be able to create a ціль-накопичення with a назва, a target сума, the currency that
target is in, **optionally** a дата, and a **склад**: one or more рахунки whose money counts toward
it. A назва that is empty after trimming SHALL be rejected; a target that is not positive SHALL be
rejected; a склад holding no рахунок SHALL be rejected. A ціль-накопичення without a дата SHALL be
valid and SHALL never be overdue. Any number of цілі-накопичення may exist, and one рахунок may
stand in the склад of several of them.

#### Scenario: A created ціль-накопичення exists with its fields

- **WHEN** the owner creates the ціль-накопичення «Машина» for 70000000 minor units UAH by
  2027-06-30 over the рахунки «Резерв», «Готівка» and «USD»
- **THEN** «Машина» exists with that target, that currency, that дата and those three рахунки in
  its склад

#### Scenario: A ціль-накопичення without a дата is valid

- **WHEN** the owner creates the ціль-накопичення «Резерв» for 30000000 minor units UAH over one
  рахунок and leaves the дата empty
- **THEN** «Резерв» exists with no дата

#### Scenario: An empty назва is rejected

- **WHEN** the owner submits a ціль-накопичення whose назва is only spaces
- **THEN** creation is rejected and nothing is stored

#### Scenario: A non-positive target is rejected

- **WHEN** the owner submits a ціль-накопичення with a target of 0 minor units
- **THEN** creation is rejected and nothing is stored

#### Scenario: An empty склад is rejected

- **WHEN** the owner submits a ціль-накопичення with no рахунок chosen
- **THEN** creation is rejected and nothing is stored — a ціль-накопичення nothing feeds has no
  progress to show

#### Scenario: One рахунок may feed two цілі

- **WHEN** the owner creates two цілі-накопичення whose склад both hold the банка «Резерв»
- **THEN** both exist, each with its own назва, target and склад

### Requirement: The склад is a fixed set of рахунки, chosen once and counted once

A ціль-накопичення's склад SHALL be the set of рахунок ids the owner chose, stored as those ids and
nothing else. It SHALL NOT be a live selection by вид рахунку: a рахунок created after the ціль was
last edited SHALL NOT join its склад, and a рахунок the owner removes from the склад SHALL leave it
whatever its вид is. Where the owner is offered a shortcut naming a вид рахунку, taking it SHALL
choose the рахунки of that вид **as they stand at that moment**, and what is stored is those
рахунки.

A рахунок SHALL stand in a склад at most once, and its внесок SHALL therefore be counted exactly
once in the ціль's progress, however it was chosen.

A рахунок of **any вид** may stand in a склад — spending, savings, investment, cash and debt alike.
What backs a ціль is the owner's own judgement, and the app SHALL NOT decide for them that money
lent out or sitting on a картка cannot be meant for a ціль. The shortcuts name three виды because
those are the three the owner reaches for, not because the others are forbidden; a рахунок-борг
ticked by hand counts like any other, and the ціль says so by listing it among its внески.

Archiving a рахунок SHALL NOT remove it from any склад and SHALL NOT change any ціль's progress:
what a ціль counted yesterday it counts today.

#### Scenario: A рахунок created later does not join a ціль

- **WHEN** a ціль-накопичення's склад was chosen with the shortcut «Усі інвестиційні» while two
  інвестиційні рахунки existed, and the owner afterwards creates a third інвестиційний рахунок
- **THEN** the ціль's склад still holds the two рахунки it was given, and its progress does not
  change

#### Scenario: Choosing a рахунок twice counts it once

- **WHEN** a рахунок is picked individually and then also covered by a shortcut naming its вид
- **THEN** the склад holds that рахунок once and its баланс is added to the progress once

#### Scenario: A рахунок-борг may stand in a склад

- **WHEN** the owner ticks a рахунок-борг holding 4000000 minor units UAH into a UAH ціль's склад
- **THEN** it stands in the склад, its 4000000 minor units UAH count toward the progress, and the
  ціль lists it among its внески

#### Scenario: Archiving a рахунок leaves the ціль as it was

- **WHEN** a рахунок standing in a ціль's склад is archived
- **THEN** the рахунок is still in that склад, the ціль's progress is exactly what it was, and
  nothing about the ціль fails

### Requirement: A ціль's currency is UAH or the one currency its склад shares

A ціль-накопичення's target SHALL be a сума in the ціль's own currency, which the owner chooses and
which is not derived from any рахунок. That currency SHALL be either UAH — the currency every
monobank rate is quoted in, and so the only currency the app can convert *into* — or the single
currency that every рахунок of the ціль's склад is in. A ціль whose склад holds рахунки of more
than one currency and whose currency is not UAH SHALL be rejected, and so SHALL a ціль in a
currency that is neither UAH nor its склад's one currency. Nothing SHALL be converted at the moment
a ціль is stored, and changing a ціль's currency SHALL ask the target anew rather than converting
it.

#### Scenario: A mixed склад in UAH is accepted

- **WHEN** the owner creates a ціль for 70000000 minor units UAH over a UAH рахунок, a USD рахунок
  and a EUR рахунок
- **THEN** the ціль is stored with the target in UAH

#### Scenario: A single-currency склад may keep its own currency

- **WHEN** the owner creates a ціль for 500000 minor units USD over two USD рахунки
- **THEN** the ціль is stored with the target in USD

#### Scenario: A mixed склад in another currency is rejected

- **WHEN** the owner submits a ціль for 500000 minor units USD over a USD рахунок and a UAH рахунок
- **THEN** it is rejected, and the refusal says the ціль must be in UAH because its склад mixes
  currencies

#### Scenario: A currency neither UAH nor the склад's is rejected

- **WHEN** the owner submits a ціль for 200000 minor units EUR over two USD рахунки
- **THEN** it is rejected and nothing is stored

#### Scenario: Changing the currency asks the target anew

- **WHEN** a ціль of 70000000 minor units UAH whose склад holds two USD рахунки has its currency
  changed to USD and the owner enters "2000.00" as the new target
- **THEN** the ціль holds a target of 200000 minor units USD, and no UAH amount remains on it

### Requirement: The внесок of a рахунок is its розрахунковий баланс, or its поточна вартість where it has one

For each рахунок of a ціль-накопичення's склад, its **внесок** SHALL be that рахунок's
розрахунковий баланс, in the рахунок's own currency — except for a рахунок of вид `investment`,
whose внесок SHALL be its **поточна вартість** where the app holds one for it, and its
розрахунковий баланс otherwise. A поточна вартість of zero is one the app holds: an інвестиція may
be worth nothing, and that SHALL be the внесок rather than a reason to fall back to the баланс. No внесок SHALL ever be entered by hand and no money SHALL ever be
assigned to a ціль directly: money reaches a ціль only the way money reaches its рахунки. The
system SHALL NOT keep any second «вартість для цілі»: an інвестиційний рахунок's worth is the one
number the owner already types in for it, wherever it is read.

A негативний внесок SHALL be subtracted like any other: a рахунок whose баланс is below zero
reduces the ціль's progress rather than being ignored.

An інвестиційний рахунок's поточна вартість is a сума in **that рахунок's own currency**, so where
such a рахунок stands in a ціль of another currency it is the вартість that is converted toward the
progress and shown beside its native сума — never its розрахунковий баланс. The вартість replaces
the баланс as the внесок everywhere the внесок is read, conversion included.

#### Scenario: A переказ into a рахунок of the склад moves the progress

- **WHEN** a ціль's склад holds a банка whose розрахунковий баланс is 5000000 minor units UAH and a
  переказ of 1000000 minor units UAH arrives at that банка
- **THEN** that рахунок's внесок is 6000000 minor units UAH and the ціль's progress moves by
  1000000 minor units UAH

#### Scenario: An інвестиційний рахунок contributes its поточна вартість

- **WHEN** a ціль's склад holds an інвестиційний рахунок whose розрахунковий баланс is 500000 and
  whose поточна вартість is 560000 minor units UAH
- **THEN** its внесок is 560000 minor units UAH

#### Scenario: An інвестиційний рахунок without a вартість contributes its баланс

- **WHEN** a ціль's склад holds an інвестиційний рахунок whose розрахунковий баланс is 500000 minor
  units UAH and for which the app holds no поточна вартість
- **THEN** its внесок is 500000 minor units UAH

#### Scenario: A foreign інвестиційний рахунок converts its вартість, not its баланс

- **WHEN** a UAH ціль's склад holds an інвестиційний рахунок in USD whose розрахунковий баланс is
  400000 minor units USD and whose поточна вартість is 500000 minor units USD, and the USD rate is
  41.25 UAH per USD
- **THEN** its внесок reads 500000 minor units USD and 20625000 minor units UAH toward the ціль —
  the вартість converted, never the баланс

#### Scenario: A negative баланс reduces the progress

- **WHEN** a ціль's склад holds one рахунок at 1000000 and another at −200000 minor units UAH
- **THEN** the ціль's progress is 800000 minor units UAH

#### Scenario: An інвестиційний рахунок worth nothing contributes nothing

- **WHEN** a ціль's склад holds an інвестиційний рахунок whose розрахунковий баланс is 500000 minor
  units UAH and whose поточна вартість is 0
- **THEN** its внесок is 0 minor units UAH — a вартість of zero is a вартість the owner entered, not
  the absence of one

### Requirement: Progress is the sum of the внески, converted only into the ціль's currency

A ціль-накопичення's progress SHALL be the sum of the внески of its склад, expressed in the ціль's
currency and read at the moment the ціль is shown. A внесок already in the ціль's currency SHALL be
added exactly. A внесок in another currency SHALL be converted at monobank's current rate — the
same rate and the same direction the approximate UAH equivalent of a month uses, rounded to the
nearest minor unit with halves away from zero — and the whole progress SHALL then be marked
**приблизний**. Each внесок SHALL be converted and rounded **on its own**, before the sum, so that
the внески the ціль lists add up to exactly the progress it shows. Because a month's approximation
rounds once per currency instead, a ціль and the Місяць tab MAY differ by a minor unit or two on
the same money; both are marked приблизний, and neither is the truth the per-currency amounts are. A progress no внесок of which was converted SHALL NOT be marked приблизний.

No converted сума SHALL be stored anywhere, carried by any транзакція, or allowed to change a
розрахунковий баланс, a monthly number, a ліміт or a рахунок's own currency. The conversion exists
for the progress of the ціль and for nothing else, and the per-currency amounts remain the truth.

#### Scenario: A single-currency progress is exact

- **WHEN** a UAH ціль's склад holds three UAH рахунки whose балансі are 15000000, 4000000 and
  1000000 minor units
- **THEN** the ціль's progress is exactly 20000000 minor units UAH and is not marked приблизний

#### Scenario: A foreign внесок makes the progress approximate

- **WHEN** a UAH ціль's склад holds a UAH рахунок at 15000000 minor units and a USD рахунок at
  300000 minor units USD, and the USD rate is 41.25 UAH per USD
- **THEN** the USD рахунок's внесок reads 300000 minor units USD and 12375000 minor units UAH toward
  the ціль, the progress is 27375000 minor units UAH, and it is marked приблизний

#### Scenario: Two рахунки of one foreign currency are each rounded

- **WHEN** a UAH ціль's склад holds two USD рахунки at 1 minor unit USD each and the USD rate is
  41.25345 UAH per USD
- **THEN** each внесок reads 41 minor units UAH and the progress is 82 minor units UAH — the sum of
  what the ціль lists, not a single conversion of 2 minor units USD

#### Scenario: Money moved between two рахунки of one склад does not move the progress

- **WHEN** a переказ of 1000000 minor units UAH goes from one рахунок of a ціль's склад to another
  рахунок of the same склад
- **THEN** the ціль's progress is exactly what it was — one внесок fell by that сума and the other
  rose by it, and a переказ is not money arriving from outside

#### Scenario: The USD рахунок's own баланс is untouched

- **WHEN** the ціль above is shown
- **THEN** the USD рахунок's розрахунковий баланс is still 300000 minor units USD, no транзакція was
  created, and no monthly number changed

### Requirement: A missing rate withholds the progress instead of counting a currency as zero

WHEN a ціль-накопичення's склад holds a рахунок in a currency other than the ціль's for which the
app has no monobank rate, the ціль SHALL have **no progress**: no total, no percentage, no
«залишилось накопичити», and neither the reached nor the overdue verdict. It SHALL say that the
progress cannot be counted now and name the currency it cannot convert. That currency's внесок
SHALL NOT be treated as zero, dropped, or approximated by any other rate. The внески the app can
read SHALL still be shown, each in its own words, so the owner sees what is known and what is not.

A progress the app cannot hold exactly — a sum leaving the range of сума it represents without
loss — SHALL likewise be absent, with no total, no percentage and no verdict. It SHALL say that the
progress cannot be counted, and SHALL NOT name a currency as the reason, because none is: the
внески are all readable and it is their sum that is not.

#### Scenario: An unknown rate leaves the ціль without a progress

- **WHEN** a UAH ціль's склад holds a UAH рахунок at 15000000 minor units and a EUR рахунок at
  200000 minor units EUR, and the app holds no EUR rate
- **THEN** the ціль shows no progress and no percentage, says it cannot count EUR now, and is
  marked neither reached nor overdue

#### Scenario: The known внески are still readable

- **WHEN** the ціль above is opened
- **THEN** the UAH рахунок's внесок of 15000000 minor units UAH is shown and the EUR рахунок's
  внесок is shown as 200000 minor units EUR with its conversion missing

#### Scenario: A progress too large to hold exactly is absent, and names no currency

- **WHEN** a ціль's внески sum beyond the range of сума the app holds without loss
- **THEN** the ціль shows no progress and no percentage, says the progress cannot be counted, and
  names no currency as the reason

#### Scenario: A missing rate never becomes a zero

- **WHEN** the ціль above is shown
- **THEN** no total of 15000000 minor units UAH is shown for it — that number would be the ціль's
  progress with EUR silently counted as nothing

### Requirement: A ціль-накопичення reads as накопичення and never as a ceiling

A ціль-накопичення SHALL be read out as progress against a target: the progress and the target with
their currency, the percentage of the target the progress stands at, and — while it is not reached
— how much is **left to accumulate**, which is the target minus the progress. The percentage SHALL
be the progress divided by the target as a whole number rounded down, SHALL be 0 where the progress
is negative, and SHALL NOT reach 100 before the ціль is reached. A reached ціль SHALL be said to be
reached rather than being given a «залишилось накопичити» of zero or less. An approximate progress
SHALL be marked as approximate wherever it, its percentage or the amount left is shown.

#### Scenario: A ціль under way reads its three numbers

- **WHEN** a ціль's target is 70000000 and its exact progress is 48730000 minor units UAH
- **THEN** it reads 48730000 of 70000000 minor units UAH, 69 %, and 21270000 minor units UAH left
  to accumulate

#### Scenario: An approximate progress is marked

- **WHEN** the progress above holds a converted внесок
- **THEN** the progress, the percentage and the amount left are all marked as approximate

#### Scenario: A percentage never rounds up to a ціль that is not reached

- **WHEN** a ціль's target is 70000000 and its progress is 69999999 minor units UAH
- **THEN** it reads 99 %, and it is not reached

#### Scenario: A reached ціль says so instead of a remainder

- **WHEN** a ціль's target is 70000000 and its progress is 71000000 minor units UAH
- **THEN** it is said to be reached, and no «залишилось накопичити» is shown for it

#### Scenario: A negative progress reads zero per cent

- **WHEN** a ціль's progress is −50000 minor units UAH against a target of 70000000
- **THEN** it reads 0 %

### Requirement: A ціль витрат is the ліміт of its категорія and holds no сума of its own

A ціль витрат SHALL be one категорія's ліміт seen as a ціль, and SHALL hold no target сума,
currency or period of its own. Every ліміт SHALL be a ціль витрат of its категорія, and every ціль
витрат SHALL be a ліміт: creating a ціль витрат SHALL set that категорія's ліміт, changing either
SHALL change the one stored сума, and deleting the ціль витрат SHALL clear that ліміт. It SHALL be
impossible for a категорія to carry a ліміт and a ціль витрат with different сума, currencies or
periods, because there is only one of each stored.

A ціль витрат's назва SHALL be its категорія's назва — no second назва is entered or stored — and
its period SHALL be the calendar month, the period the ліміт is already judged over.

#### Scenario: Creating a ціль витрат sets the ліміт

- **WHEN** the owner creates the ціль витрат «Ресторани» of at most 200000 minor units UAH
- **THEN** the категорія Ресторани carries a ліміт of 200000 minor units UAH

#### Scenario: Changing the ліміт changes the ціль

- **WHEN** the owner changes the ліміт of Ресторани to 250000 minor units UAH
- **THEN** the ціль витрат «Ресторани» is of at most 250000 minor units UAH, and no other сума
  exists for it anywhere

#### Scenario: Deleting the ціль clears the ліміт

- **WHEN** the owner deletes the ціль витрат «Ресторани»
- **THEN** Ресторани carries no ліміт and is over no ліміт in any month

#### Scenario: A ліміт set anywhere is a ціль витрат

- **WHEN** the owner sets a ліміт of 1000000 minor units UAH on Продукти from the «Ліміти» section
- **THEN** the ціль витрат «Продукти» of at most 1000000 minor units UAH exists among the цілі

### Requirement: A ціль витрат's spent is the month's spent of its категорія, in the ліміт's currency

A ціль витрат's spent for a month SHALL be that month's spent of its категорія in the ліміт's own
currency — the net-of-повернення amount the monthly-picture breakdown holds, negative коригування
in the correction категорія included. No second count of spending SHALL be made for a ціль:
a повернення reduces it by exactly as much as it reduces the breakdown and the ліміт, and spending
of the same категорія in any other currency neither counts toward the ціль nor is converted toward
it.

#### Scenario: Spending shows against the ceiling

- **WHEN** «Ресторани» is of at most 200000 minor units UAH and August's spent in Ресторани is
  132000 minor units UAH
- **THEN** the ціль reads 132000 of 200000 minor units UAH for August

#### Scenario: A повернення pulls the ціль back exactly as it pulls the ліміт

- **WHEN** August holds витрати of 230000 minor units UAH in Ресторани and then a повернення of
  50000 minor units UAH in Ресторани
- **THEN** the ціль's spent for August is 180000 minor units UAH, the same number the ліміт is
  judged by, and the ціль is within its ceiling again

#### Scenario: Another currency's spending never counts

- **WHEN** «Ресторани» is of at most 200000 minor units UAH and August holds 150000 minor units UAH
  and 5000 minor units USD of Ресторани
- **THEN** the ціль's spent for August is 150000 minor units UAH, whatever any rate says

### Requirement: A ціль витрат is within, exceeded, or finally decided when its month ends

For a calendar month that has begun, a ціль витрат SHALL be in exactly one state, decided by that
month's spent, the ceiling, and whether the month has ended:

- **exceeded** — its spent is strictly greater than the ceiling, whether the month has ended or not;
- **завершено в межах** — the month has ended and its spent is at or below the ceiling;
- **within** — otherwise: the month is still running and its spent is at or below the ceiling.

A calendar month that has **not begun** SHALL carry no state at all: nothing has been spent in it
yet, and «в межах» about a month nobody has lived is not a verdict but an absence dressed as one.

Spent equal to the ceiling SHALL be within, never exceeded — the ліміт's own rule. The reached and
overdue verdicts of a ціль-накопичення SHALL NOT be applied to a ціль витрат at all: it is never
reached and never overdue.

When a calendar month ends, that month's state SHALL be final in the sense that it is decided by
that month's транзакції alone and by no later month's; it changes only if a транзакція of that
month is later added, edited or removed. The next month SHALL start the ціль again from zero spent,
and one month's excess SHALL say nothing about any other month.

#### Scenario: Below the ceiling is within

- **WHEN** «Ресторани» is of at most 200000 minor units UAH and the current month's spent is 132000
- **THEN** the ціль is within its ceiling for this month

#### Scenario: Exactly at the ceiling is within

- **WHEN** the current month's spent in Ресторани is exactly 200000 minor units UAH
- **THEN** the ціль is within its ceiling, not exceeded

#### Scenario: Above the ceiling is exceeded

- **WHEN** the current month's spent in Ресторани is 230000 minor units UAH
- **THEN** the ціль is exceeded for this month

#### Scenario: A month that ended within the ceiling is settled

- **WHEN** August has ended with a spent in Ресторани of 180000 minor units UAH against a ceiling of
  200000
- **THEN** August is завершено в межах for that ціль

#### Scenario: A month that has not started carries no verdict

- **WHEN** the ціль витрат «Ресторани» is read for a calendar month later than the current one
- **THEN** it carries no state — not within, not exceeded and not завершено в межах

#### Scenario: A new month starts the ціль over

- **WHEN** August ended exceeded and September's spent in Ресторани is 0
- **THEN** the ціль is within its ceiling for September, and August is still exceeded

### Requirement: A ціль витрат reads as a ceiling and never as an achievement

A ціль витрат SHALL be read out as spending against a ceiling: the spent and the ceiling with their
currency, and — while it is within — the share of the ceiling **used** as a whole number rounded
down and how much may **still be spent**, which is the ceiling minus the spent. WHEN it is
exceeded, it SHALL show by how much it was exceeded — the spent minus the ceiling — and SHALL show
**no percentage at all**. Nothing SHALL describe a ціль витрат as reached, done or a share above
100 %: spending past a ceiling is not an accomplishment and SHALL never be presented as one.

A negative spent — повернення outrunning витрати — SHALL read as 0 % used, and what may still be
spent SHALL be the ceiling minus that negative amount.

#### Scenario: Within the ceiling reads used and remaining

- **WHEN** the spent is 132000 minor units UAH against a ceiling of 200000
- **THEN** it reads 132000 of 200000 minor units UAH, 66 % used, and 68000 minor units UAH that may
  still be spent

#### Scenario: Exceeded reads the excess and no percentage

- **WHEN** the spent is 248000 minor units UAH against a ceiling of 200000
- **THEN** it reads 248000 of 200000 minor units UAH and exceeded by 48000 minor units UAH, and no
  percentage is shown for it

#### Scenario: An exceeded ціль is never called reached

- **WHEN** the spent is 248000 minor units UAH against a ceiling of 200000
- **THEN** nothing calls the ціль reached, done or 124 % complete

#### Scenario: A negative spent reads zero per cent

- **WHEN** повернення of the month outran its витрати and the spent is −50000 minor units UAH
  against a ceiling of 200000
- **THEN** it reads 0 % used and 250000 minor units UAH that may still be spent

## MODIFIED Requirements

### Requirement: A ціль can be edited and deleted

The owner SHALL be able to change a ціль-накопичення's назва, target, currency, дата — including
removing the дата and adding one to a ціль that had none — and its склад, adding and removing
рахунки; and to change a ціль витрат's ceiling and that ceiling's currency. WHEN a
ціль-накопичення's currency is changed, the target SHALL be entered anew in the new currency —
nothing is converted. WHEN a рахунок is removed from a склад, the ціль's progress SHALL simply stop
counting it; no транзакція and no баланс is touched by the removal. An edit SHALL be refused when
it would leave the ціль in a currency its склад cannot carry — the rule «UAH, or the one currency
the склад shares» holds after an edit exactly as it holds at creation — so a рахунок of another
currency cannot be added to a ціль that is not in UAH without the ціль's currency being changed
too.

Deleting a ціль-накопичення SHALL remove only the ціль and its склад: no рахунок and no транзакція
is touched by it. Deleting a ціль витрат SHALL clear its категорія's ліміт and nothing else: the
категорія, its транзакції and every monthly number stay exactly as they were.

#### Scenario: An edited target persists

- **WHEN** the owner changes a ціль-накопичення's target from 70000000 to 75000000 minor units UAH
- **THEN** the same ціль now holds the target of 75000000 minor units UAH

#### Scenario: A рахунок added to the склад starts counting

- **WHEN** the owner adds a готівка рахунок holding 4000000 minor units UAH to a UAH ціль whose
  progress was 15000000 minor units UAH
- **THEN** the ціль's progress is 19000000 minor units UAH

#### Scenario: A рахунок removed from the склад stops counting and keeps its money

- **WHEN** the owner removes that готівка рахунок from the склад again
- **THEN** the ціль's progress is 15000000 minor units UAH and the рахунок still holds 4000000
  minor units UAH with every транзакція it had

#### Scenario: A дата can be removed and added

- **WHEN** the owner clears the дата of a ціль-накопичення that had one, and later sets a дата on a
  ціль that had none
- **THEN** the first ціль has no дата and is not overdue, and the second holds the дата it was given

#### Scenario: Adding a рахунок of another currency to a non-UAH ціль is refused

- **WHEN** the owner adds a UAH рахунок to the склад of a ціль whose target is in USD
- **THEN** the edit is refused, saying the ціль would have to be in UAH, and the ціль's склад is
  unchanged

#### Scenario: Re-linking to another currency asks the target anew

- **WHEN** the owner changes a ціль of 70000000 minor units UAH to USD and enters "2000.00"
- **THEN** the ціль holds a target of 200000 minor units USD, and no UAH amount remains on it

#### Scenario: Deleting a ціль touches no money

- **WHEN** the owner deletes a ціль-накопичення whose склад holds рахунки with транзакції
- **THEN** the ціль is gone and every рахунок, its транзакції and its розрахунковий баланс are
  unchanged

### Requirement: A ціль is reached at its target and overdue past its дата

A **ціль-накопичення** SHALL be reached when its progress is greater than or equal to its target,
and overdue when it has a дата, that дата has passed, and it is not reached. A ціль-накопичення
without a дата SHALL never be overdue. A reached ціль SHALL never be overdue and SHALL remain until
the owner deletes it. A ціль whose progress cannot be counted — a rate it needs being unknown —
SHALL be neither reached nor overdue: an unknown progress is not a verdict.

A **ціль витрат** SHALL be neither reached nor overdue in any circumstance; its states are the
within / exceeded / завершено states of its own kind.

#### Scenario: Progress equal to the target reaches the ціль

- **WHEN** a ціль's target is 70000000 minor units UAH and its progress is exactly 70000000 minor
  units UAH
- **THEN** the ціль is reached

#### Scenario: Progress below the target is not reached

- **WHEN** a ціль's target is 70000000 minor units UAH and its progress is 69999999 minor units UAH
- **THEN** the ціль is not reached

#### Scenario: A past дата without the target is overdue

- **WHEN** a ціль's дата was last year and its progress is below its target
- **THEN** the ціль is overdue

#### Scenario: A reached ціль is never overdue

- **WHEN** a ціль's дата was last year and its progress is at its target
- **THEN** the ціль is reached and not overdue

#### Scenario: A ціль without a дата is never overdue

- **WHEN** a ціль-накопичення has no дата and its progress is below its target
- **THEN** it is not overdue

#### Scenario: An uncountable progress is no verdict

- **WHEN** a ціль's дата was last year and a rate its склад needs is unknown
- **THEN** the ціль is marked neither reached nor overdue, and it says its progress cannot be
  counted now

## REMOVED Requirements

### Requirement: A ціль holds назва, target and дата on one рахунок

**Reason**: A ціль is no longer one рахунок's business. Money for one intention sits at once in a
банка, in готівка, in foreign currency and in an інвестиційний рахунок, so a ціль tied to exactly
one рахунок shows a number that is wrong by construction. The дата was also required, which forced
a deadline onto a ціль that has none.

**Migration**: Replaced by «A ціль-накопичення holds назва, target, currency, an optional дата and a
склад», «The склад is a fixed set of рахунки, chosen once and counted once» and «A ціль's currency
is UAH or the one currency its склад shares». Every existing ціль becomes a ціль-накопичення whose
склад holds exactly the рахунок it was linked to, keeping its назва, target, currency and дата, and
therefore showing exactly the progress it showed before.

### Requirement: Progress is the linked рахунок's розрахунковий баланс

**Reason**: With a склад of several рахунки — possibly in several currencies, possibly holding an
інвестиційний рахунок whose worth is not its баланс — one рахунок's розрахунковий баланс is no
longer what progress means.

**Migration**: Replaced by «The внесок of a рахунок is its розрахунковий баланс, or its поточна
вартість where it has one», «Progress is the sum of the внески, converted only into the ціль's
currency» and «A missing rate withholds the progress instead of counting a currency as zero». The
rule the old requirement existed for is kept in full: no progress is ever entered by hand, an
archived рахунок keeps feeding its ціль, and for a ціль whose склад is one non-investment рахунок
the progress is that рахунок's розрахунковий баланс exactly as before.
