## MODIFIED Requirements

### Requirement: Pending чернетки are visible on Головний

Головний SHALL make every pending чернетка reachable, newest first, collapsed by default to one
compact count row among the operational alerts the main-screen capability defines, expandable in
place to show each чернетка with its рахунок, its date, the notification text, and what it
proposes: a витрата of its сума with currency, a дохід «Без джерела» of its сума with currency, or
a raw чернетка with no сума — showing its original-currency reference as information when it
carries one. Expanding or collapsing the row changes no stored data. While no чернетка is pending,
Головний SHALL show no draft row and no empty placeholder.

#### Scenario: A drafted витрата shows its proposal
- **WHEN** the owner expands a pending чернетка proposing a витрата of 25000 minor units UAH dated
  2026-08-26 with text "Оплата 250.00UAH. Сільпо" on the рахунок «Приват»
- **THEN** it shows «Приват», the date, the text and 25000 minor units UAH as a proposed витрата

#### Scenario: A raw чернетка shows its text and the missing сума
- **WHEN** the owner expands a raw чернетка carrying only notification text
- **THEN** Головний shows the text and that no сума was read, and a raw чернетка holding 1000
  minor units USD as its original-currency reference shows that amount as information

#### Scenario: The newest чернетка stands first
- **WHEN** a чернетка was drafted yesterday and another is drafted today, and both are expanded
- **THEN** today's чернетка stands above yesterday's

#### Scenario: Many drafts collapse to one count
- **WHEN** fifty чернетки are pending
- **THEN** Головний shows one compact row naming the count, with no draft body rendered before
  expansion

#### Scenario: No pending чернетки, no surface
- **WHEN** every чернетка has been confirmed or dismissed
- **THEN** Головний shows no draft row and no empty placeholder, and the month's status, the
  latest транзакції and Статок stand as before
