# installments Specification

## Purpose
Розстрочки — interest-free purchases paid in equal monthly платежі, such as monobank «Покупка
частинами» — kept as a plan the owner enters by hand, so the app knows which витрати are платежі,
what is still owed, how much of this month is already promised, and when to warn the day before.

## Requirements

### Requirement: A розстрочка is a plan and never a транзакція

A розстрочка SHALL be a plan the owner records, never a транзакція and never a рахунок. Its повна
сума SHALL NOT be counted in витрачено, залишилось, any balance, статок, any report or any other
number of the app: the bank never debits it, it debits the платежі, and each платіж reaches the app
as an ordinary витрата on its own day by the usual paths — monobank, a bank notification or a hand
entry. The app SHALL NOT create, remove or change the сума, дата, type or рахунок of any транзакція
because of a розстрочка. The one change a розстрочка makes to a транзакція SHALL be the категорія
of a linked витрата that was «Без категорії» (see linking).

#### Scenario: Recording a розстрочка moves no number

- **WHEN** the owner records a розстрочка of 1000000 minor units UAH in 10 платежі on 2026-10-01,
  and no транзакція changes
- **THEN** витрачено, залишилось, every розрахунковий баланс and статок of October 2026 are exactly
  what they were before

#### Scenario: Each платіж is the витрата of its own month

- **WHEN** a розстрочка of 1000000 minor units UAH in 10 платежі has its first платіж on
  2026-10-05, and monobank brings a витрата of 100000 minor units UAH on 2026-10-05 and another on
  2026-11-05
- **THEN** витрачено of October 2026 and of November 2026 each include 100000 minor units UAH from
  those витрати, and no month includes 1000000

#### Scenario: Deleting a розстрочка leaves its транзакції

- **WHEN** the owner deletes a розстрочка two of whose платежі are linked to витрати
- **THEN** both витрати remain with the same сума, дата, рахунок and категорія they had

### Requirement: A розстрочка holds what the owner bought and how it is paid

A розстрочка SHALL hold: a назва, the повна сума, the кількість платежів, the щомісячний платіж,
the дата першого платежу, the рахунок списання, how many платежі were сплачено раніше, and
optionally a категорія. Every сума SHALL be integer minor units of UAH, and the рахунок списання
SHALL be a UAH рахунок. The app SHALL refuse to store a розстрочка whose назва is empty after
trimming, whose повна сума is not above zero, whose кількість платежів is not a whole number from 2
to 60, whose щомісячний платіж is not above zero, whose last платіж (see the split) would not be
above zero, whose рахунок списання is not a UAH рахунок or is archived when the розстрочка is
created, whose категорія is archived when chosen, or whose сплачено раніше is not a whole number
from 0 to one less than the кількість платежів. Every refusal SHALL be stated in Ukrainian and name
the value it concerns.

#### Scenario: A complete розстрочка is stored

- **WHEN** the owner stores «iPhone» of 4999900 minor units UAH in 10 платежі of 499990, first on
  2026-10-05, on the UAH card «mono black», with 0 сплачено раніше and the категорія «Техніка»
- **THEN** the розстрочка is stored with exactly those values

#### Scenario: A розстрочка on a foreign-currency рахунок is refused

- **WHEN** the owner tries to store a розстрочка whose рахунок списання is a USD рахунок
- **THEN** nothing is stored and the refusal says the рахунок списання must be in гривнях

#### Scenario: A розстрочка without a назва is refused

- **WHEN** the owner tries to store a розстрочка whose назва is "   "
- **THEN** nothing is stored and the refusal says what was bought must be named

#### Scenario: An archived рахунок or категорія is refused

- **WHEN** the owner tries to create a розстрочка on an archived UAH рахунок, or with an archived
  категорія
- **THEN** nothing is stored and the refusal names the archived one

#### Scenario: One платіж is not a розстрочка

- **WHEN** the owner tries to store a розстрочка of 1 платіж
- **THEN** nothing is stored and the refusal says the кількість платежів is from 2 to 60

#### Scenario: All платежі already paid is refused at creation

- **WHEN** the owner tries to store a розстрочка of 10 платежі with 10 сплачено раніше
- **THEN** nothing is stored and the refusal says at most 9 платежі can be сплачено раніше

### Requirement: The щомісячний платіж is offered as an even split with the remainder last

Until the owner sets the щомісячний платіж themselves, it SHALL be offered as the повна сума
divided by the кількість платежів, rounded down to whole minor units. Every платіж but the last
SHALL be the щомісячний платіж, and the last SHALL be the повна сума minus all the others, so the
платежі always add up to the повна сума exactly. A щомісячний платіж the owner sets SHALL be kept
as set; a last платіж that would not be above zero SHALL be refused.

#### Scenario: An even split

- **WHEN** a розстрочка of 1000000 minor units UAH has 10 платежі
- **THEN** the offered щомісячний платіж is 100000 and every one of the 10 платежі is 100000

#### Scenario: The remainder falls on the last платіж

- **WHEN** a розстрочка of 100000 minor units UAH has 3 платежі
- **THEN** the offered щомісячний платіж is 33333, the first two платежі are 33333 and the last is
  33334

#### Scenario: A hand-set платіж moves the difference to the last

- **WHEN** the owner sets the щомісячний платіж of a розстрочка of 1000000 minor units UAH in 10
  платежі to 105000
- **THEN** the first nine платежі are 105000 and the last is 55000

#### Scenario: Платежі that exceed the повна сума are refused

- **WHEN** the owner sets the щомісячний платіж of a розстрочка of 1000000 minor units UAH in 10
  платежі to 112000
- **THEN** nothing is stored and the refusal says the платежі add up to more than the повна сума

### Requirement: The графік places one платіж a month on the day of the first

Платіж number k SHALL fall k − 1 calendar months after the дата першого платежу, on the same day of
the month; in a month that has no such day it SHALL fall on that month's last day, and the next
month SHALL return to the original day.

#### Scenario: Monthly on the same day

- **WHEN** a розстрочка of 3 платежі has its first платіж on 2026-10-05
- **THEN** its платежі fall on 2026-10-05, 2026-11-05 and 2026-12-05

#### Scenario: The 31st in a shorter month

- **WHEN** a розстрочка of 3 платежі has its first платіж on 2027-01-31
- **THEN** its платежі fall on 2027-01-31, 2027-02-28 and 2027-03-31

### Requirement: Every платіж is in exactly one state

Every платіж of a розстрочка SHALL be in exactly one of these states, decided against today's
дата:

- **сплачено** — it is linked to its списання, or it is among the first платежі counted as
  сплачено раніше, or the owner marked it сплачено;
- **закрито** — the розстрочка was closed early and the платіж is not сплачено;
- **очікується** — none of the above, and today is no later than three days after its дата;
- **списання не знайдено** — none of the above, and today is more than three days after its дата.

A розстрочка all of whose платежі are сплачено SHALL be сплачена. Its **залишок розстрочки** (the залишок, for short) SHALL be the
повна сума minus the scheduled сума of every сплачено платіж, and 0 once it is closed early — closing
early is the owner's word that it is paid off. Its progress SHALL be the count of сплачено платежі
out of the кількість платежів.

#### Scenario: Платежі counted as paid before

- **WHEN** on 2026-10-01 the owner records a розстрочка of 1000000 minor units UAH in 10 платежі
  of 100000, first on 2026-06-05, with 4 сплачено раніше
- **THEN** платежі 1–4 are сплачено, платіж 5 of 2026-10-05 is очікується, the progress is 4 of 10
  and the залишок is 600000 minor units UAH

#### Scenario: A late debit is noticed

- **WHEN** платіж 5 of 2026-10-05 is not сплачено and today is 2026-10-09
- **THEN** платіж 5 is списання не знайдено

#### Scenario: The last платіж closes the розстрочка

- **WHEN** the tenth of ten платежі becomes сплачено
- **THEN** the розстрочка is сплачена and its залишок is 0

### Requirement: A платіж is linked to its списання by the app

Before the app shows a розстрочка's платежі, counts «Вільно після розстрочок» or arranges an
нагадування про платіж, it SHALL link every платіж that is neither сплачено nor закрито to its
списання, when one exists. A транзакція SHALL be a candidate for a платіж only when it is a
витрата — never a переказ, an інвестиція, a повернення, a дохід or a коригування — on the
розстрочка's рахунок списання, in UAH, of exactly the платіж's scheduled сума, dated no more than
three days before or after the платіж's дата, not linked to any платіж, and not refused for that
платіж by the owner. Платежі SHALL be served in order of their дата, then of the moment their
розстрочка was recorded, then of their number; each SHALL take the candidate nearest its дата, and
of equally near candidates the one recorded first. At the moment it is linked, a витрата that is
«Без категорії» SHALL take the розстрочка's категорія when the розстрочка has one; a витрата with
any other категорія SHALL keep it. Nothing SHALL re-categorise a витрата after that moment: an owner
who sets a linked витрата back to «Без категорії», or changes the розстрочка's категорія, is not
overruled.

#### Scenario: A monobank debit becomes the платіж

- **WHEN** платіж 5 of «iPhone» is 100000 minor units UAH on 2026-10-05 on «mono black», and
  monobank brings a витрата «Без категорії» of 100000 minor units UAH on 2026-10-05 on «mono black»
- **THEN** the витрата is linked to платіж 5, платіж 5 is сплачено, and the витрата's категорія is
  «Техніка»

#### Scenario: A categorised витрата keeps its категорія

- **WHEN** the витрата linked to a платіж of «iPhone» already carried the категорія «Подарунки»
- **THEN** it is linked and its категорія stays «Подарунки»

#### Scenario: The owner's категорія after linking stands

- **WHEN** a витрата took «Техніка» when it was linked, and the owner later sets it to «Без
  категорії»
- **THEN** it stays «Без категорії» and stays linked

#### Scenario: A different сума is not a списання

- **WHEN** the only витрата on «mono black» within three days of a платіж of 100000 minor units UAH
  is 100001 minor units UAH
- **THEN** the платіж stays unlinked

#### Scenario: A переказ of the same сума is not a списання

- **WHEN** the only транзакція on «mono black» of 100000 minor units UAH within three days of a
  платіж of that сума is a переказ to a банка
- **THEN** the платіж stays unlinked and the переказ is still a переказ

#### Scenario: Another рахунок is not the рахунок списання

- **WHEN** a витрата of exactly the платіж сума on the платіж дата sits on «mono white» while the
  рахунок списання is «mono black»
- **THEN** the платіж stays unlinked

#### Scenario: Two розстрочки of the same сума on the same day

- **WHEN** «Пилосос», recorded first, and «Чайник» each have a платіж of 50000 minor units UAH on
  2026-10-05 on «mono black», and two such витрати arrive that day
- **THEN** each платіж is linked to a different витрата: «Пилосос» to the one recorded first and
  «Чайник» to the other

### Requirement: The owner corrects what the app linked

The owner SHALL be able to unlink a платіж from its списання; the app SHALL then never link that
транзакція to that платіж again by itself, and the категорія the транзакція took SHALL stay. The
owner SHALL be able to link a платіж that is not сплачено to a витрата they pick among the UAH
витрати on the рахунок списання dated no more than ten days before or after its дата and not linked
to any платіж, whatever their сума; a picked витрата that is «Без категорії» SHALL take the
розстрочка's категорія when it has one, as at the app's own linking. The owner SHALL be able to mark a платіж сплачено without any
списання, and to take that mark back. When a linked транзакція is removed, or is changed so that
it is no longer a UAH витрата on the розстрочка's рахунок списання, its платіж SHALL be unlinked and
return to the state its дата gives it.

#### Scenario: An unlinked debit is not taken back

- **WHEN** the owner unlinks платіж 5 from the витрата the app linked
- **THEN** платіж 5 is not сплачено, and the next linking leaves that витрата unlinked from
  платіж 5 even though it still matches

#### Scenario: A debit of another сума picked by hand

- **WHEN** платіж 5 of 100000 minor units UAH is списання не знайдено because the bank debited
  100050, and the owner picks that витрата for it
- **THEN** платіж 5 is сплачено and linked to that витрата, and the залишок falls by 100000

#### Scenario: A hand-picked витрата without a категорія takes the розстрочка's

- **WHEN** the owner picks a витрата «Без категорії» for платіж 5 of «iPhone», whose категорія is
  «Техніка»
- **THEN** платіж 5 is linked to it and the витрата's категорія is «Техніка»

#### Scenario: Marked as paid without a debit

- **WHEN** the owner marks платіж 5 сплачено because they paid it from a рахунок the app does not
  track
- **THEN** платіж 5 is сплачено with no списання, and taking the mark back makes it what its дата
  says

#### Scenario: A debit retyped as a переказ releases its платіж

- **WHEN** the owner changes the витрата linked to платіж 5 into a переказ to a банка
- **THEN** платіж 5 is no longer linked to it

#### Scenario: A deleted debit releases its платіж

- **WHEN** the owner deletes the витрата linked to платіж 5, and платіж 5's дата was 2026-10-05,
  and today is 2026-10-20
- **THEN** платіж 5 is списання не знайдено

### Requirement: A розстрочка can be edited, closed early, reopened and deleted

Editing a розстрочка SHALL recompute its графік from the new values. A платіж's state SHALL be kept
by its number; платежі whose number exceeds the new кількість платежів SHALL be dropped with their
links; a link to a витрата on a рахунок other than the new рахунок списання, or dated more than
ten days from its платіж's new дата, SHALL be dropped. Closing a розстрочка early SHALL make every платіж that is not сплачено закрито: none of them
is expected, counted or reminded of any more. Reopening SHALL return those платежі to the state
their дати give them. Deleting SHALL remove the розстрочка with every link, mark and refusal, and nothing
else.

#### Scenario: Paid off early

- **WHEN** the owner closes «iPhone» early after 6 of its 10 платежі are сплачено
- **THEN** платежі 7–10 are закрито, the розстрочка is listed among the closed ones, and no
  нагадування про платіж is arranged for it

#### Scenario: Reopening a розстрочка closed by mistake

- **WHEN** the owner reopens «iPhone» — 1000000 minor units UAH in 10 платежі of 100000, closed
  early with платежі 1–6 сплачено and 7–10 закрито — on 2026-10-01, and платіж 7 falls on
  2026-12-05
- **THEN** платежі 7–10 are очікується again and the залишок is 400000 minor units UAH

#### Scenario: Moving the рахунок списання drops links on the old one

- **WHEN** «iPhone», with платіж 5 linked to a витрата on «mono black», is edited to have «mono
  white» as its рахунок списання
- **THEN** платіж 5 is no longer linked to that витрата

#### Scenario: Moving the дата першого платежу drops a far link

- **WHEN** платіж 5 of «iPhone», on 2026-10-05, is linked to a витрата of 2026-10-05, and the дата
  першого платежу is edited so that платіж 5 falls on 2026-10-20
- **THEN** платіж 5 is no longer linked to that витрата, which is more than ten days from its new
  дата

#### Scenario: Shortening a розстрочка drops the extra платежі

- **WHEN** a розстрочка of 12 платежі whose платіж 11 is marked сплачено is edited to 10 платежі
- **THEN** it has 10 платежі, and the mark of платіж 11 is gone

### Requirement: Вільно після розстрочок is залишилось less what this month still owes

For the current calendar month the app SHALL derive «Вільно після розстрочок» in UAH: the UAH
залишилось of the month, as the monthly-picture capability computes it, minus the scheduled сума of
every платіж dated in the current month that is очікується or списання не знайдено. A платіж that is
сплачено is already inside залишилось as its витрата and SHALL NOT be subtracted again; a закрито
платіж SHALL NOT be subtracted. It SHALL NOT exist for any other month, for any other currency, or
when no платіж of the current month is очікується or списання не знайдено. It SHALL NOT change
залишилось or any other number of the monthly picture.

#### Scenario: Two платежі, one already debited

- **WHEN** in October 2026 the UAH залишилось is 2000000 minor units, «iPhone» has a платіж of
  100000 on 2026-10-05 that is сплачено and «Пилосос» has a платіж of 50000 on 2026-10-20 that is
  очікується
- **THEN** «Вільно після розстрочок» is 1950000 minor units UAH and залишилось is still 2000000

#### Scenario: Nothing owed means no reading

- **WHEN** every платіж dated in the current month is сплачено
- **THEN** there is no «Вільно після розстрочок»

#### Scenario: A past month has none

- **WHEN** September 2026 is shown in October 2026 and a платіж of September is списання не
  знайдено
- **THEN** September carries no «Вільно після розстрочок»

### Requirement: The app warns the day before an expected платіж

While the нагадування про платіж are on and the phone allows the app to post notifications, the
app SHALL have the phone hold one local notification at 10:00 phone time on the day before each
дата on which some active розстрочка has a платіж that is очікується, for every such дата whose
10:00 the day before is still ahead — one per дата however many платежі fall on it. The
notification's title and body SHALL be fixed texts that name no сума, no назва and no рахунок, and
tapping it SHALL open the «Розстрочки» screen. The app SHALL re-assert what the phone holds on every
launch, at the end of every background monobank run, after every restore, whenever Місяць or the
«Розстрочки» screens are opened and linking changed something, and after every change the owner
makes to a розстрочка or a платіж there, so a платіж that became сплачено or закрито is no longer warned
about and a phone carried into another time zone warns at its own 10:00. The нагадування про платіж
SHALL be on until the owner turns them off. With them off, or
the permission not granted, the phone SHALL hold none of them.

#### Scenario: One warning for the day before

- **WHEN** «iPhone» has a платіж of 2026-10-05 that is очікується and today is 2026-10-01
- **THEN** the phone holds a notification for 2026-10-04 at 10:00 that names neither «iPhone» nor
  100000, and tapping it opens «Розстрочки»

#### Scenario: Two платежі on one day give one warning

- **WHEN** «iPhone» and «Пилосос» each have a платіж on 2026-10-05 that is очікується
- **THEN** the phone holds exactly one notification for 2026-10-04 at 10:00

#### Scenario: An early debit withdraws the warning

- **WHEN** the платіж of 2026-10-05 is linked to a витрата that arrived on 2026-10-03, and it was
  the only платіж of that дата
- **THEN** the phone no longer holds the notification for 2026-10-04

#### Scenario: A debit synced in the background withdraws the warning

- **WHEN** with the app closed a background monobank run brings the витрата of the only платіж of
  2026-10-05 on 2026-10-03
- **THEN** at the end of that run the phone no longer holds the notification for 2026-10-04

#### Scenario: Turned off means none

- **WHEN** the owner turns the нагадування про платіж off
- **THEN** the phone holds no notification for any платіж
