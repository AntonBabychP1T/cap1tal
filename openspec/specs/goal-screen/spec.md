# goal-screen Specification

## Purpose

The screen behind one ціль-накопичення: its progress with the mark it earned, and the внесок of
every рахунок of its склад, so «why does cap1tal think there is already 487 300 for the car» is
answered on one screen instead of in the owner's head. It reads what the goals capability computes
and records nothing.

## Requirements

### Requirement: A ціль-накопичення opens a screen that explains its progress

Choosing a ціль-накопичення wherever it is listed SHALL open a screen for that one ціль, pushed
over the tab it was chosen from. The screen SHALL show the ціль's назва, its target with its
currency, its progress in the ціль's own words — progress against target, the percentage, and what
is left to accumulate or that it is reached — and its дата where it has one, marked overdue where
it is overdue. The screen SHALL record nothing: it creates, changes and deletes no транзакція, no
рахунок and no ціль.

WHEN the ціль's progress is approximate, the screen SHALL mark it approximate. WHEN the ціль no
longer exists — deleted while the screen was open — the screen SHALL say so plainly instead of
showing an empty ціль.

#### Scenario: The ціль's own numbers are shown

- **WHEN** the owner opens the ціль «Машина», whose target is 70000000 minor units UAH and whose
  progress is 48730000 minor units UAH
- **THEN** the screen shows «Машина», 48730000 of 70000000 minor units UAH, 69 %, and 21270000
  minor units UAH left to accumulate

#### Scenario: An approximate progress is marked on the screen

- **WHEN** the progress of the opened ціль holds a converted внесок
- **THEN** the screen marks the progress and its percentage as approximate

#### Scenario: A deleted ціль says so

- **WHEN** the screen is opened for a ціль id that no longer exists
- **THEN** it states that the ціль is gone instead of showing zeros

### Requirement: Every рахунок of the склад is shown with its внесок

The screen SHALL list every рахунок of the ціль's склад under its назва, each with its внесок, and
nothing else SHALL appear in that list — a рахунок outside the склад is not part of the answer. The
внески listed SHALL be exactly the ones the progress was computed from, so the list read together
accounts for the progress shown above it. A рахунок whose внесок is negative SHALL be shown with
its negative сума rather than hidden.

WHEN the склад holds a рахунок of вид `investment` whose внесок is its поточна вартість, the screen
SHALL show that вартість as the внесок **with the дата that вартість describes**; the розрахунковий
баланс of that рахунок SHALL NOT be shown in its place. The дата is what keeps an exact-looking
progress honest: a hand-entered вартість is as old as the day the owner typed it, and a ціль resting
on one should say when that was.

#### Scenario: The listed внески account for the progress

- **WHEN** a UAH ціль's склад holds «Резерв» at 15000000 and «Готівка» at 4000000 minor units UAH
- **THEN** the screen lists «Резерв» with 15000000 and «Готівка» with 4000000 minor units UAH, and
  the progress above them is 19000000 minor units UAH

#### Scenario: An інвестиційний рахунок shows the вартість it contributed

- **WHEN** the склад holds an інвестиційний рахунок whose розрахунковий баланс is 15000000 and whose
  поточна вартість is 17270000 minor units UAH
- **THEN** the screen shows 17270000 minor units UAH as that рахунок's внесок, with the дата that
  вартість was entered for

#### Scenario: A negative внесок is shown as it is

- **WHEN** a рахунок of the склад has a розрахунковий баланс of −200000 minor units UAH
- **THEN** the screen lists it with −200000 minor units UAH

### Requirement: A foreign внесок shows its own сума beside its converted one

WHEN a рахунок of the склад is in a currency other than the ціль's, the screen SHALL show that
рахунок's внесок **in its own currency** and, beside it, the approximate сума it contributed to the
progress in the ціль's currency, marked as approximate. The рахунок's own сума SHALL never be
replaced by the converted one: the native amount is the truth and the conversion is the secondary
line.

#### Scenario: A USD рахунок reads in both currencies

- **WHEN** a UAH ціль's склад holds a USD рахунок at 300000 minor units USD and the USD rate is
  41.25 UAH per USD
- **THEN** the screen shows that рахунок as 300000 minor units USD with an approximate 12375000
  minor units UAH toward the ціль

#### Scenario: A рахунок in the ціль's own currency gets no second line

- **WHEN** a UAH ціль's склад holds a UAH рахунок
- **THEN** that рахунок is shown with one сума in UAH and no approximate line

### Requirement: A внесок that cannot be converted is named, and no total is invented

WHEN the ціль's progress cannot be counted because a rate is missing, the screen SHALL still list
every рахунок of the склад with what is known of it: the ones in the ціль's currency with their
exact сума, the convertible foreign ones with both lines, and the one whose rate is missing with
its own сума and a plain statement that its rate is unknown. The screen SHALL show **no progress
total and no percentage** in that case, and SHALL say that the progress cannot be counted now,
naming the currency. It SHALL NOT show the sum of the readable внески as though it were the
progress.

#### Scenario: The missing currency is named and the total withheld

- **WHEN** a UAH ціль's склад holds a UAH рахунок at 15000000 minor units and a EUR рахунок at
  200000 minor units EUR, and the app has no EUR rate
- **THEN** the screen lists both рахунки, says the EUR rate is unknown, states that the progress
  cannot be counted now, and shows no total and no percentage

#### Scenario: The readable part is not passed off as the whole

- **WHEN** the screen above is open
- **THEN** it does not show 15000000 minor units UAH as the ціль's progress

### Requirement: An archived рахунок of the склад is marked and still counted

WHEN a рахунок of the склад is archived, the screen SHALL list it with its внесок exactly as it
lists an active one and SHALL mark it as archived. Its внесок SHALL still be part of the progress —
archiving a рахунок changes where new транзакції may be recorded, not what a ціль has ever counted.

#### Scenario: An archived рахунок is listed, marked and counted

- **WHEN** «Резерв», holding 15000000 minor units UAH, is archived while standing in a ціль's склад
- **THEN** the screen lists «Резерв» with 15000000 minor units UAH, marks it archived, and the
  progress still includes it

### Requirement: A ціль витрат opens the категорія's month instead of a screen of its own

A ціль витрат SHALL NOT have a breakdown screen of its own. Choosing one SHALL open the existing
screen of its категорія for the month in question, where that month's транзакції of the категорія
are already listed. The app SHALL NOT build a second listing of the same транзакції under the
ціль's name.

#### Scenario: A ціль витрат leads to the категорія's month

- **WHEN** the owner chooses the ціль витрат «Ресторани» for the current month
- **THEN** the категорія screen for Ресторани in that month opens, listing that month's транзакції
  of Ресторани

#### Scenario: No second transaction list exists for a ціль

- **WHEN** the owner looks for a ціль витрат's own screen
- **THEN** there is none — the категорія's month is where its транзакції are read
