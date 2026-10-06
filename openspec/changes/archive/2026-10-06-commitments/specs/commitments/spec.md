## Purpose

Зобов'язання are payments the owner already knows will recur — оренда, інтернет, мобільний,
підписки, страхування — kept as a plan the owner enters by hand, so the app knows which витрата is
which платіж, which платіж has not arrived yet, and how much of the current month is already
promised: «Вільно після зобов'язань».

## ADDED Requirements

### Requirement: A зобов'язання is a plan and never a транзакція

A зобов'язання SHALL be a plan the owner records, never a транзакція and never a рахунок. Nothing
about it SHALL be counted in витрачено, залишилось, any balance, статок, any report, ліміт, ціль or
досягнення: each платіж reaches the app only as an ordinary витрата on the day the bank debits it,
by the usual paths — monobank, a bank notification or a hand entry — and a платіж that was never
debited SHALL count nowhere. The app SHALL NOT create, remove or change the сума, дата, type or
рахунок of any транзакція because of a зобов'язання. The one change a зобов'язання makes to a
транзакція SHALL be the категорія of a linked витрата that was «Без категорії» (see linking).

#### Scenario: Recording a зобов'язання moves no number

- **WHEN** on 2026-10-02 the owner records «Оренда» of 1500000 minor units UAH a month, first on
  2026-10-10, and no транзакція changes
- **THEN** витрачено, залишилось, every розрахунковий баланс and статок of October 2026 are exactly
  what they were before

#### Scenario: Each платіж is the витрата of its own month

- **WHEN** «Оренда» is 1500000 minor units UAH a month from 2026-10-10, and витрати of 1500000
  minor units UAH arrive on 2026-10-10 and on 2026-11-10
- **THEN** витрачено of October 2026 and of November 2026 each include 1500000 minor units UAH from
  those витрати, and nothing more because of «Оренда»

#### Scenario: A платіж never debited is never spent

- **WHEN** November 2026 has ended and the платіж of «Оренда» of 2026-11-10 is списання не знайдено
- **THEN** витрачено of November 2026 does not include it

#### Scenario: Deleting a зобов'язання leaves its транзакції

- **WHEN** the owner deletes a зобов'язання two of whose платежі are linked to витрати
- **THEN** both витрати remain with the same сума, дата, рахунок and категорія they had

### Requirement: A зобов'язання holds what is paid, how often and from where

A зобов'язання SHALL hold: a назва, the сума of one платіж, a періодичність, the дата першого
платежу, the рахунок списання, optionally a категорія, optionally an ознака, the moment it was
recorded and, once stopped, its дата припинення. The сума SHALL be integer minor units of the
currency of the рахунок списання, whatever that currency is. The періодичність SHALL be one of
«щомісяця», «щокварталу», «щопівроку» and «щороку». The ознака SHALL be kept trimmed, and an ознака
that is empty after trimming SHALL mean none. The app SHALL refuse to store a зобов'язання whose
назва is empty after trimming, whose сума is not above zero, whose періодичність is not one of the
four, whose рахунок списання does not exist or is archived when chosen, whose категорія is archived
when chosen, or whose ознака is shorter than three characters after trimming. Every refusal SHALL
be stated in Ukrainian and name the value it concerns.

#### Scenario: A complete зобов'язання is stored

- **WHEN** the owner stores «Netflix» of 29900 minor units UAH «щомісяця», first on 2026-10-15, on
  the UAH card «mono black», with the категорія «Підписки» and the ознака «  netflix »
- **THEN** the зобов'язання is stored with exactly those values and the ознака «netflix»

#### Scenario: A зобов'язання on a USD card is in dollars

- **WHEN** the owner stores «ChatGPT» of 2000 minor units on the USD рахунок «mono USD»
- **THEN** its сума is 2000 minor units USD and nothing is converted

#### Scenario: A зобов'язання without a назва is refused

- **WHEN** the owner tries to store a зобов'язання whose назва is "   "
- **THEN** nothing is stored and the refusal says what is paid must be named

#### Scenario: A сума of zero is refused

- **WHEN** the owner tries to store a зобов'язання whose сума is 0
- **THEN** nothing is stored and the refusal says the сума must be above zero

#### Scenario: An archived рахунок or категорія is refused

- **WHEN** the owner tries to create a зобов'язання on an archived рахунок, or with an archived
  категорія
- **THEN** nothing is stored and the refusal names the archived one

#### Scenario: A two-letter ознака is refused

- **WHEN** the owner tries to store a зобов'язання whose ознака is «tv»
- **THEN** nothing is stored and the refusal says the текст в описі needs at least three characters

### Requirement: The графік places a платіж every period on the day of the first

Платіж number k of a зобов'язання SHALL fall (k − 1) × n calendar months after the дата першого
платежу, where n is 1 for «щомісяця», 3 for «щокварталу», 6 for «щопівроку» and 12 for «щороку»,
on the same day of the month; in a month that has no such day it SHALL fall on that month's last
day, and the next платіж SHALL return to the original day. A зобов'язання SHALL have no платіж
before its дата першого платежу and, once stopped, none after its дата припинення; otherwise its
графік SHALL have no end.

#### Scenario: Monthly on the same day

- **WHEN** «Інтернет» is «щомісяця» with its first платіж on 2026-10-05
- **THEN** its платежі fall on 2026-10-05, 2026-11-05, 2026-12-05 and on the 5th of every month
  after

#### Scenario: Quarterly

- **WHEN** «Охорона» is «щокварталу» with its first платіж on 2026-10-20
- **THEN** its платежі fall on 2026-10-20, 2027-01-20, 2027-04-20 and so on every three months

#### Scenario: Yearly on the 29th of February

- **WHEN** «Страхування авто» is «щороку» with its first платіж on 2028-02-29
- **THEN** its платежі fall on 2028-02-29, 2029-02-28, 2030-02-28, 2031-02-28 and 2032-02-29

#### Scenario: The 31st in a shorter month

- **WHEN** «Оренда» is «щомісяця» with its first платіж on 2027-01-31
- **THEN** its платежі fall on 2027-01-31, 2027-02-28 and 2027-03-31

### Requirement: Every платіж of a зобов'язання is in exactly one state

Every платіж of a зобов'язання SHALL be in exactly one of these states, decided against today's
дата:

- **сплачено** — it is linked to its списання, or the owner marked it сплачено;
- **пропущено** — the owner marked it пропущено: it did not and will not happen;
- **очікується** — none of the above, and today is no later than three days after its дата;
- **списання не знайдено** — none of the above, and today is more than three days after its дата.

A платіж that is пропущено SHALL be neither expected nor owed, and SHALL never be linked by the app.

#### Scenario: A late debit is noticed

- **WHEN** the платіж of «Інтернет» of 2026-10-05 is neither linked nor marked and today is
  2026-10-09
- **THEN** that платіж is списання не знайдено

#### Scenario: Within three days it is still expected

- **WHEN** the платіж of «Інтернет» of 2026-10-05 is neither linked nor marked and today is
  2026-10-08
- **THEN** that платіж is очікується

#### Scenario: A skipped платіж is not owed

- **WHEN** the owner marks the платіж of «Netflix» of 2026-10-15 пропущено
- **THEN** that платіж is пропущено, and a витрата of exactly its сума on «mono black» on
  2026-10-15 is not linked to it

### Requirement: A платіж of a зобов'язання is linked to its списання by the app

Before the app shows a зобов'язання's платежі or the платежі of a month, or counts «Вільно після
зобов'язань», it SHALL link every платіж of every зобов'язання that is очікується or списання не
знайдено to its списання, when one exists — after the платежі of every розстрочка have been served
by the installments capability in the same pass, so that, of the витрати not linked yet, one that
would qualify for both is linked to the розстрочка's платіж; a витрата already linked to a
зобов'язання's платіж stays with it. A транзакція SHALL be a candidate for a платіж only when all
of these hold:

- it is a витрата — never a переказ, an інвестиція, a повернення, a дохід or a коригування;
- it is on the зобов'язання's рахунок списання, in its currency;
- it is dated no more than three days before or after the платіж's дата;
- it is not linked to any платіж of a розстрочка or of a зобов'язання;
- the owner has not refused it for that платіж;
- when the зобов'язання has an ознака, the транзакція's опис contains the ознака, letters compared
  without regard to case, whatever its сума; when it has none, its сума is exactly the
  зобов'язання's сума.

Платежі SHALL be served in order of their дата, then of the moment their зобов'язання was recorded,
then of their number; each SHALL take the candidate nearest its дата, and of equally near
candidates the one recorded first. At the moment it is linked, a витрата that is «Без категорії»
SHALL take the зобов'язання's категорія when the зобов'язання has one; a витрата with any other
категорія SHALL keep it. Nothing SHALL re-categorise a витрата after that moment: an owner who sets
a linked витрата back to «Без категорії», or changes the зобов'язання's категорія, is not
overruled.

#### Scenario: A debit of the exact сума becomes the платіж

- **WHEN** «Інтернет» is 30000 minor units UAH a month from 2026-10-05 on «mono black» with the
  категорія «Зв'язок», and monobank brings a витрата «Без категорії» of 30000 minor units UAH on
  2026-10-06 on «mono black»
- **THEN** the витрата is linked to the платіж of 2026-10-05, that платіж is сплачено, and the
  витрата's категорія is «Зв'язок»

#### Scenario: Without an ознака a different сума is not a списання

- **WHEN** «Інтернет» has no ознака and the only витрата on «mono black» within three days of its
  платіж of 30000 minor units UAH is 32000 minor units UAH
- **THEN** the платіж stays unlinked

#### Scenario: With an ознака the сума may differ

- **WHEN** «Netflix» is 29900 minor units UAH with the ознака «netflix», and a витрата «NETFLIX.COM»
  of 34900 minor units UAH arrives on «mono black» on the дата of its платіж
- **THEN** the витрата is linked to that платіж

#### Scenario: With an ознака the сума alone is not enough

- **WHEN** «Netflix» is 29900 minor units UAH with the ознака «netflix», and the only витрата of
  29900 minor units UAH on «mono black» on the дата of its платіж has the опис «Сільпо»
- **THEN** the платіж stays unlinked

#### Scenario: A повернення whose опис contains the ознака is not a списання

- **WHEN** the only транзакція on «mono black» within three days of a платіж of «Netflix» whose
  опис contains «netflix» is a повернення
- **THEN** the платіж stays unlinked and the повернення is still a повернення

#### Scenario: A переказ of the same сума is not a списання

- **WHEN** the only транзакція on «mono black» of exactly the сума of a платіж of «Оренда», within
  three days of it, is a переказ to a банка
- **THEN** the платіж stays unlinked and the переказ is still a переказ

#### Scenario: A коригування of the same сума is not a списання

- **WHEN** the only транзакція on «mono black» of exactly the сума of a платіж of «Інтернет», within
  three days of it, is a коригування
- **THEN** the платіж stays unlinked and the коригування is still a коригування

#### Scenario: Another рахунок is not the рахунок списання

- **WHEN** a витрата of exactly the сума of a платіж of «Інтернет», on its дата, sits on «mono
  white» while the рахунок списання is «mono black»
- **THEN** the платіж stays unlinked

#### Scenario: A розстрочка is served first

- **WHEN** «iPhone» has a платіж of 100000 minor units UAH on 2026-10-05 and «Спортзал» a платіж of
  100000 minor units UAH on 2026-10-05, both on «mono black», and one витрата of 100000 minor units
  UAH arrives that day
- **THEN** the витрата is linked to the платіж of «iPhone», and the платіж of «Спортзал» stays
  unlinked

#### Scenario: A розстрочка recorded later does not take a linked витрата

- **WHEN** a витрата of 100000 minor units UAH on «mono black» of 2026-10-05 is linked to the
  платіж of «Спортзал» of that дата, and the owner then records «iPhone» whose платіж of 100000 on
  «mono black» also falls on 2026-10-05
- **THEN** the витрата stays linked to «Спортзал» and the платіж of «iPhone» stays unlinked

#### Scenario: A categorised витрата keeps its категорія

- **WHEN** the витрата linked to a платіж of «Інтернет» already carried the категорія «Робота»
- **THEN** it is linked and its категорія stays «Робота»

#### Scenario: The owner's категорія after linking stands

- **WHEN** a витрата took «Зв'язок» when it was linked, and the owner later sets it to «Без
  категорії»
- **THEN** it stays «Без категорії» and stays linked

### Requirement: The owner corrects what the app linked to a зобов'язання

The owner SHALL be able to unlink a платіж of a зобов'язання from its списання; the app SHALL then
never link that транзакція to that платіж again by itself, and the категорія the транзакція took
SHALL stay. The owner SHALL be able to link a платіж that is очікується or списання не знайдено to a
витрата they pick among the витрати on the рахунок списання, in its currency, dated no more than
ten days before or after its дата and not linked to any платіж of a розстрочка or of a
зобов'язання, whatever their сума or опис; a picked витрата that is «Без категорії» SHALL take the
зобов'язання's категорія when it has one, as at the app's own linking. The owner SHALL be able to
mark a платіж that is очікується or списання не знайдено сплачено without any списання, or
пропущено, and to take either mark back. When a linked транзакція is removed, or is changed so that
it is no longer a витрата on the рахунок списання in its currency, its платіж SHALL be unlinked and
return to the state its дата gives it.

#### Scenario: An unlinked debit is not taken back

- **WHEN** the owner unlinks the платіж of «Інтернет» of 2026-10-05 from the витрата the app linked
- **THEN** the платіж is not сплачено, and the next linking leaves that витрата unlinked from it
  even though it still matches

#### Scenario: A debit of another сума picked by hand

- **WHEN** the платіж of «Інтернет» of 2026-10-05, 30000 minor units UAH, is списання не знайдено
  because the provider debited 32000 on 2026-10-12, and the owner picks that витрата for it
- **THEN** the платіж is сплачено and linked to that витрата

#### Scenario: Marked as paid without a debit

- **WHEN** the owner marks the платіж of «Оренда» of 2026-10-10 сплачено because they paid it in
  cash they never recorded
- **THEN** the платіж is сплачено with no списання, and taking the mark back makes it what its дата
  says

#### Scenario: A skipped платіж taken back

- **WHEN** the owner takes back the mark пропущено of the платіж of «Netflix» of 2026-10-15, and
  today is 2026-10-16
- **THEN** that платіж is очікується again

#### Scenario: A deleted debit releases its платіж

- **WHEN** the owner deletes the витрата linked to the платіж of «Інтернет» of 2026-10-05, and today
  is 2026-10-20
- **THEN** that платіж is списання не знайдено

#### Scenario: A debit retyped as a переказ releases its платіж

- **WHEN** the owner changes the витрата linked to a платіж of «Оренда» into a переказ to a банка
- **THEN** that платіж is no longer linked to it

### Requirement: A зобов'язання can be edited, stopped, resumed and deleted

Editing a зобов'язання SHALL recompute its графік from the new values. A платіж's link, mark and
refusals SHALL be kept by its number, except that a link to a транзакція that is not a витрата on
the new рахунок списання in its currency, or that is dated more than ten days from its платіж's new
дата, SHALL be dropped, a mark or refusal of a платіж whose дата the edit moves by more than ten
days SHALL be dropped, and every link, mark and refusal of a платіж the edit places after the дата
припинення SHALL be dropped. The scheduled сума of every платіж SHALL be the зобов'язання's current сума, so a
new сума applies to every платіж not yet сплачено, while what was debited for a сплачено платіж
stays what its списання says. Stopping a зобов'язання SHALL set its дата припинення to today:
every платіж dated after it SHALL cease to exist together with its link, mark and refusals, and
every платіж dated on or before it SHALL keep its state. Resuming SHALL remove the дата
припинення, and the платежі after it SHALL exist again, each in the state its дата gives it.
Deleting SHALL remove the зобов'язання with every link, mark and refusal of its платежі, and
nothing else.

#### Scenario: A dearer підписка

- **WHEN** on 2026-10-20 the owner edits «Netflix» from 29900 to 34900 minor units UAH, its платіж
  of 2026-10-15 being linked to a витрата of 29900
- **THEN** the платіж of 2026-11-15 is 34900 and expected, and the платіж of 2026-10-15 is still
  linked to the витрата of 29900

#### Scenario: Moving the рахунок списання drops links on the old one

- **WHEN** «Інтернет», with its платіж of 2026-10-05 linked to a витрата on «mono black», is edited
  to have «mono white» as its рахунок списання
- **THEN** that платіж is no longer linked to that витрата

#### Scenario: Moving the дата першого платежу drops a far link

- **WHEN** the платіж of «Інтернет» of 2026-10-05 is linked to a витрата of 2026-10-05, and the дата
  першого платежу is edited to 2026-10-20
- **THEN** that платіж is no longer linked to that витрата, which is more than ten days from its new
  дата

#### Scenario: Changing how often drops what was said about moved платежі

- **WHEN** «Охорона», «щомісяця» from 2026-10-20, has its платіж 2 of 2026-11-20 marked пропущено,
  and is edited to «щокварталу»
- **THEN** its платіж 2 falls on 2027-01-20 and carries no mark

#### Scenario: Editing a stopped зобов'язання drops what falls after the stop

- **WHEN** «Netflix», «щомісяця» from 2026-08-15 and stopped on 2026-10-20, has its платіж 3 of
  2026-10-15 marked сплачено, and the дата першого платежу is edited to 2026-08-22
- **THEN** «Netflix» has no платіж 3, its last платіж falls on 2026-09-22, and no mark is kept for
  платіж 3

#### Scenario: Stopping before the next платіж

- **WHEN** on 2026-10-02 the owner stops «Netflix», monthly on the 15th, whose платіж of 2026-09-15
  is сплачено
- **THEN** «Netflix» has no платіж on 2026-10-15 or after, and the платіж of 2026-09-15 is still
  сплачено

#### Scenario: Resuming a зобов'язання stopped by mistake

- **WHEN** «Netflix» was stopped on 2026-10-02 and the owner resumes it on 2026-10-03
- **THEN** its платіж of 2026-10-15 exists again and is очікується

#### Scenario: Stopping removes what was said about later платежі

- **WHEN** «Netflix», monthly on the 15th, has its платіж of 2026-11-15 marked пропущено, and the
  owner stops it on 2026-10-20 and resumes it on 2026-10-21
- **THEN** its платіж of 2026-11-15 exists again, is очікується and carries no mark

#### Scenario: Resuming after months brings back the gap

- **WHEN** «Netflix», monthly on the 15th, was stopped on 2026-10-02, no витрата of it arrived since,
  and the owner resumes it on 2027-01-03
- **THEN** its платежі of 2026-10-15, 2026-11-15 and 2026-12-15 are списання не знайдено, each the
  owner's to mark пропущено

#### Scenario: Deleting removes only the plan

- **WHEN** the owner deletes «Інтернет», whose платіж of 2026-10-05 is linked to a витрата of
  «Зв'язок»
- **THEN** «Інтернет» and its link are gone, and the витрата stays with its сума, дата, рахунок and
  категорія «Зв'язок»

### Requirement: Вільно після зобов'язань is залишилось less what this month still owes

For the current calendar month, the app SHALL derive «Вільно після зобов'язань» separately in every
currency in which the month has a залишилось, as the monthly-picture capability computes it: that
залишилось minus the scheduled сума of every платіж in that currency dated in the current month
that is очікується or списання не знайдено — of every зобов'язання and of every розстрочка alike. A
платіж that is сплачено is already inside залишилось as its витрата and SHALL NOT be subtracted
again; a платіж that is пропущено, or закрито, SHALL NOT be subtracted. No currency SHALL be
converted or added to another. It SHALL NOT exist for any other month, for a currency in which no
платіж of the current month is очікується or списання не знайдено, or for a currency in which the
month has no залишилось. It SHALL NOT change залишилось or any other number of the monthly picture.

#### Scenario: Оренда, інтернет and a розстрочка

- **WHEN** in October 2026 the UAH залишилось is 2000000 minor units, «Оренда» has a платіж of
  1500000 on 2026-10-10 that is очікується, «Інтернет» a платіж of 30000 on 2026-10-05 that is
  сплачено, and «iPhone» a платіж of 100000 on 2026-10-20 that is очікується
- **THEN** «Вільно після зобов'язань» in UAH is 400000 minor units and залишилось is still 2000000

#### Scenario: Every currency on its own

- **WHEN** in October 2026 the USD залишилось is 50000 minor units, «ChatGPT» has an очікується
  платіж of 2000 minor units USD and nothing UAH is owed
- **THEN** «Вільно після зобов'язань» in USD is 48000 minor units, and there is none in UAH

#### Scenario: A skipped платіж is not subtracted

- **WHEN** the only платіж of the current month, of «Netflix», is пропущено
- **THEN** there is no «Вільно після зобов'язань»

#### Scenario: A missing debit is still owed

- **WHEN** today is 2026-10-15, the UAH залишилось is 2000000 minor units and the платіж of
  «Оренда» of 2026-10-10, 1500000, is списання не знайдено
- **THEN** «Вільно після зобов'язань» in UAH is 500000 minor units

#### Scenario: A past month has none

- **WHEN** September 2026 is shown in October 2026 and a платіж of «Оренда» of September is
  списання не знайдено
- **THEN** September carries no «Вільно після зобов'язань»
