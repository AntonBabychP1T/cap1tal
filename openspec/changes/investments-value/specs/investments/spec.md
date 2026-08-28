## Purpose

What an інвестиційний рахунок is worth, against what was put into it: вкладено read from the
рахунок's own транзакції, a поточна вартість the owner types in, and the прибуток / збиток between
them. The вартість is an observation of the outside world — it moves no money and no monthly
number.

## ADDED Requirements

### Requirement: Вкладено is the інвестиційний рахунок's розрахунковий баланс

For a рахунок of вид `investment`, вкладено SHALL be that рахунок's розрахунковий баланс — its
початковий залишок plus the effect of every транзакція touching it — in the рахунок's own
currency. The system SHALL NOT keep a second, separately maintained total of what was put in:
what went in minus what came back out is already what the транзакції say, and a number beside
them could disagree with them.

#### Scenario: Money back out reduces вкладено

- **WHEN** an `investment` рахунок in UAH with a початковий залишок of 0 receives a переказ of
  500000 minor units UAH and later sends 100000 minor units UAH back to a картка
- **THEN** its вкладено is 400000 minor units UAH

#### Scenario: Money that was there before the app is вкладено too

- **WHEN** an `investment` рахунок in UAH has a початковий залишок of 1000000 minor units and one
  переказ of 200000 minor units UAH into it
- **THEN** its вкладено is 1200000 minor units UAH

#### Scenario: Вкладено is the whole history, інвестовано is one month

- **WHEN** an `investment` рахунок receives 300000 minor units UAH in March and 200000 minor units
  UAH in April
- **THEN** its вкладено is 500000 minor units UAH, while March's інвестовано is 300000 and
  April's інвестовано is 200000 minor units UAH

#### Scenario: A рахунок of another вид has no вкладено

- **WHEN** вкладено is asked of a рахунок of вид `spending`
- **THEN** it is rejected — вкладено exists only for a рахунок of вид `investment`

### Requirement: The поточна вартість is one hand-entered сума per інвестиційний рахунок

The system SHALL accept a поточна вартість for a рахунок of вид `investment`: an integer
minor-unit сума in that рахунок's own currency, carrying the дата it was entered. At most one
SHALL be kept per рахунок — entering another SHALL replace both the сума and the дата — and it
SHALL be clearable, after which that рахунок has none again. A вартість SHALL be rejected when
its currency is not the рахунок's, when the рахунок is of any other вид, and when its сума is
negative; zero SHALL be accepted.

#### Scenario: A вартість is recorded with the дата it was entered

- **WHEN** the owner enters a поточна вартість of 560000 minor units UAH for a UAH `investment`
  рахунок on 2026-08-28
- **THEN** that рахунок holds a поточна вартість of 560000 minor units UAH dated 2026-08-28

#### Scenario: Entering another вартість replaces the сума and the дата

- **WHEN** the owner enters 575000 minor units UAH for that same рахунок on 2026-09-30
- **THEN** the рахунок holds one поточна вартість, 575000 minor units UAH dated 2026-09-30, and
  the earlier one is gone

#### Scenario: A вартість can be cleared

- **WHEN** the owner clears the поточна вартість of a рахунок that has one
- **THEN** that рахунок has no поточна вартість, and asking for one returns nothing rather than
  an error

#### Scenario: A вартість in another currency is rejected

- **WHEN** a поточна вартість of 10000 minor units USD is entered for a UAH `investment` рахунок
- **THEN** it is rejected and the рахунок's вартість is unchanged

#### Scenario: A вартість on a рахунок of another вид is rejected

- **WHEN** a поточна вартість is entered for a рахунок of вид `savings`
- **THEN** it is rejected — only an інвестиційний рахунок has a поточна вартість

#### Scenario: A negative вартість is rejected, zero is not

- **WHEN** a поточна вартість of −100 minor units UAH is entered, and then one of 0 minor units
  UAH
- **THEN** the negative one is rejected and the zero one is accepted — an інвестиція can be worth
  nothing, never less than nothing

### Requirement: A поточна вартість moves no money and no monthly number

Recording, replacing or clearing a поточна вартість SHALL create, change or delete no транзакція.
It SHALL NOT change the рахунок's розрахунковий баланс, and SHALL NOT change витрачено, дохід,
інвестовано, відкладено, позичено or залишилось of any month. The system SHALL NOT reconcile a
поточна вартість against a розрахунковий баланс: «Звірити» exists for the баланс банку, and
turning a прибуток into a коригування would make it дохід and destroy the difference this
capability exists to show. A real profit reaches the app only as the owner records it — a coupon
paid back is a дохід with its own джерело, entered like any other.

#### Scenario: A вартість above вкладено leaves the баланс where it was

- **WHEN** an `investment` рахунок with a розрахунковий баланс of 500000 minor units UAH gets a
  поточна вартість of 560000 minor units UAH
- **THEN** its розрахунковий баланс is still 500000 minor units UAH and no транзакція was created

#### Scenario: The month of the інвестиція counts only the переказ

- **WHEN** a month holds one переказ of 500000 minor units UAH onto an `investment` рахунок and a
  поточна вартість of 560000 minor units UAH is entered in that month
- **THEN** that month's інвестовано is 500000 minor units UAH, its дохід is unchanged, and its
  залишилось is unchanged

#### Scenario: Clearing a вартість changes nothing else

- **WHEN** the поточна вартість of a рахунок is cleared
- **THEN** the рахунок's розрахунковий баланс, its транзакції and every monthly number are
  exactly what they were

#### Scenario: A вартість is never reconciled

- **WHEN** an `investment` рахунок's поточна вартість differs from its розрахунковий баланс
- **THEN** no «Звірити» is offered for that difference and no коригування is created

### Requirement: Прибуток / збиток is поточна вартість minus вкладено

For a рахунок of вид `investment` that has a поточна вартість, the прибуток / збиток SHALL be
that вартість minus its вкладено, in the рахунок's own currency: positive is a прибуток, negative
a збиток, and equal amounts are zero. A рахунок with no поточна вартість SHALL have no
прибуток / збиток — вкладено alone is what is known about it. The figures of two рахунки SHALL
never be summed or converted; each stands in its own currency.

#### Scenario: A вартість above вкладено is a прибуток

- **WHEN** a рахунок's вкладено is 500000 and its поточна вартість is 560000 minor units UAH
- **THEN** its прибуток is 60000 minor units UAH

#### Scenario: A вартість below вкладено is a збиток

- **WHEN** a рахунок's вкладено is 500000 and its поточна вартість is 450000 minor units UAH
- **THEN** its збиток is −50000 minor units UAH

#### Scenario: Equal amounts are zero, not absent

- **WHEN** a рахунок's вкладено and поточна вартість are both 500000 minor units UAH
- **THEN** its прибуток / збиток is 0 minor units UAH

#### Scenario: Without a вартість there is no прибуток

- **WHEN** an `investment` рахунок has вкладено of 500000 minor units UAH and no поточна вартість
- **THEN** it has no прибуток / збиток, and its вкладено is still 500000 minor units UAH

#### Scenario: Two рахунки in different currencies keep separate figures

- **WHEN** one `investment` рахунок holds a прибуток of 60000 minor units UAH and another a збиток
  of −2000 minor units USD
- **THEN** each figure stands in its own currency and no total across the two exists

### Requirement: Archiving an інвестиційний рахунок keeps its вартість

An archived рахунок keeps its history and its розрахунковий баланс; the system SHALL likewise keep
its поточна вартість and its прибуток / збиток, and SHALL let neither be lost by archiving or
restored differently by unarchiving.

#### Scenario: The numbers survive archiving

- **WHEN** an `investment` рахунок with вкладено of 500000 and a поточна вартість of 560000 minor
  units UAH is archived
- **THEN** it still holds вкладено of 500000, a поточна вартість of 560000 and a прибуток of 60000
  minor units UAH
