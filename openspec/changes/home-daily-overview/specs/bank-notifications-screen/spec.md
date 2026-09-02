## MODIFIED Requirements

### Requirement: Pending чернетки are visible on Головний

Головний SHALL show every pending чернетка, newest first, each with its рахунок, its date, the
notification text, and what it proposes: a витрата of its сума with currency, a дохід
«Без джерела» of its сума with currency, or a raw чернетка with no сума — showing its
original-currency reference as information when it carries one. They SHALL stand in the
«Потребує уваги» section the main-screen capability defines, which exists only while something is
waiting. While no чернетка is pending, Головний SHALL show no чернетки surface and no empty
placeholder.

#### Scenario: A drafted витрата shows its proposal

- **WHEN** a чернетка proposing a витрата of 25000 minor units UAH dated 2026-08-26 with text
  "Оплата 250.00UAH. Сільпо" is pending on the рахунок «Приват»
- **THEN** Головний shows it with «Приват», the date, the text and 25000 minor units UAH as a
  proposed витрата

#### Scenario: A raw чернетка shows its text and the missing сума

- **WHEN** a raw чернетка carrying only notification text is pending
- **THEN** Головний shows the text and that no сума was read, and a raw чернетка holding 1000
  minor units USD as its original-currency reference shows that amount as information

#### Scenario: The newest чернетка stands first

- **WHEN** a чернетка was drafted yesterday and another is drafted today
- **THEN** Головний shows today's чернетка above yesterday's

#### Scenario: No pending чернетки, no surface

- **WHEN** every чернетка has been confirmed or dismissed
- **THEN** Головний shows no чернетки surface, and the month's status, the money held and the
  latest транзакції stand as before

### Requirement: Confirming a чернетка creates its транзакція in the feed

Confirming a pending чернетка SHALL create exactly the транзакція it proposes — the категорія
decided by the owner's правила at the moment of confirmation with «Без категорії» when none
matches, a дохід keeping «Без джерела», the чернетка's text carried as the опис, dated the
чернетка's date — and the транзакція SHALL be stored as an ordinary транзакція, editable and
retypeable like any other, taking the place its date gives it among the latest transactions and
reachable in «Транзакції» whatever that place is. The confirmed чернетка SHALL leave the pending
surface and SHALL never return.

#### Scenario: An unmatched витрата confirms into «Без категорії»

- **WHEN** the owner confirms a чернетка proposing a витрата of 25000 minor units UAH whose
  text no правило matches
- **THEN** a витрата of 25000 minor units UAH in «Без категорії» with the text as its опис is
  stored, taking the place its date gives it among the latest transactions, and the чернетка is
  gone — also after the app restarts

#### Scenario: A чернетка on an archived рахунок still confirms

- **WHEN** the рахунок a pending чернетка sits on is archived and the owner confirms the
  чернетка
- **THEN** the транзакція is created on that рахунок all the same — the money moved on the
  real account, and archiving hides a рахунок from pickers, never from its own history

#### Scenario: A правило created after drafting is honoured

- **WHEN** a чернетка with text containing "СІЛЬПО" was drafted, the owner then creates the
  правило "сільпо → Groceries" and confirms the чернетка
- **THEN** the created витрата carries Groceries

#### Scenario: A confirmed дохід keeps «Без джерела»

- **WHEN** the owner confirms a чернетка proposing a дохід of 50000 minor units UAH
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» is stored, retypeable
  by the owner as ever

### Requirement: A raw чернетка confirms only with the owner's сума

Confirming a raw чернетка SHALL ask the owner for the сума, entered in major units in its
рахунок's currency under the same rules as recording a manual витрата; without a valid сума
nothing SHALL be stored and the чернетка SHALL still await. With one supplied it SHALL confirm
as a витрата of that сума, and an original-currency reference it holds SHALL ride the витрата
as its informational original-currency amount.

#### Scenario: A raw чернетка without a сума stays pending

- **WHEN** the owner tries to confirm a raw чернетка leaving the сума empty or not positive
- **THEN** nothing is stored and the чернетка still awaits

#### Scenario: The supplied сума becomes the витрата

- **WHEN** the owner confirms a raw чернетка on a UAH рахунок supplying "300"
- **THEN** a витрата of 30000 minor units UAH with the чернетка's text as its опис is stored,
  taking the place its date gives it among the latest transactions

#### Scenario: A foreign reference rides the confirmed витрата

- **WHEN** the owner confirms a raw чернетка holding 1000 minor units USD as its
  original-currency reference, supplying "420" on a UAH рахунок
- **THEN** the витрата of 42000 minor units UAH carries 1000 minor units USD as its
  informational original-currency amount
