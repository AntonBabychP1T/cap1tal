## ADDED Requirements

### Requirement: Pending чернетки are named on Головний and shown in the queue

Головний SHALL make every pending чернетка reachable: the rail row «Що потребує відповіді» names
how many чернетки are pending, and its tap opens the queue, whose «Чернетки» group shows every
pending чернетка, newest first, each with its рахунок, its date, the notification text, and what it
proposes: a витрата of its сума with currency, a дохід «Без джерела» of its сума with currency, or
a raw чернетка with no сума — showing its original-currency reference as information when it
carries one. Showing the queue changes no stored data. While no чернетка is pending, Головний SHALL
name none and the queue SHALL show no «Чернетки» group and no empty placeholder.

#### Scenario: A drafted витрата shows its proposal
- **WHEN** the owner opens the queue while a чернетка proposing a витрата of 25000 minor units UAH
  dated 2026-08-26 with text "Оплата 250.00UAH. Сільпо" on the рахунок «Приват» is pending
- **THEN** «Чернетки» shows «Приват», the date, the text and 25000 minor units UAH as a proposed
  витрата

#### Scenario: A raw чернетка shows its text and the missing сума
- **WHEN** the owner opens the queue while a raw чернетка carrying only notification text is pending
- **THEN** the queue shows the text and that no сума was read, and a raw чернетка holding 1000
  minor units USD as its original-currency reference shows that amount as information

#### Scenario: The newest чернетка stands first
- **WHEN** a чернетка was drafted yesterday and another is drafted today
- **THEN** in «Чернетки» today's чернетка stands above yesterday's

#### Scenario: Many drafts are one number on Головний
- **WHEN** fifty чернетки are pending
- **THEN** Головний names fifty чернеток in the rail row «Що потребує відповіді» and renders no
  draft body

#### Scenario: No pending чернетки, no surface
- **WHEN** every чернетка has been confirmed or dismissed
- **THEN** Головний names no чернетка, the queue shows no «Чернетки» group, and the month's status,
  the latest транзакції and Статок stand as before

## MODIFIED Requirements

### Requirement: Confirming a чернетка creates its транзакція in the feed

Confirming a pending чернетка SHALL create exactly the транзакція it proposes — the категорія
decided by the owner's правила — or, when none matches, by the шаблон категоризації — at the moment
of confirmation with «Без категорії» when neither matches, a дохід taking the джерело the best
правило-джерело gives its text at that moment and keeping «Без джерела» when none matches, the
чернетка's text carried as the опис, dated the чернетка's date — and the транзакція SHALL be stored
as an ordinary транзакція, editable and retypeable like any other, taking the place its date gives
it among the latest transactions and reachable in «Транзакції» whatever that place is. The
confirmed чернетка SHALL leave the queue and SHALL never return.

#### Scenario: An unmatched витрата confirms into «Без категорії»

- **WHEN** the owner confirms a чернетка proposing a витрата of 25000 minor units UAH whose
  text no правило and no базова категорія matches
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

- **WHEN** the owner confirms a чернетка proposing a дохід of 50000 minor units UAH whose text no
  правило-джерело matches
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» is stored, retypeable
  by the owner as ever

#### Scenario: A confirmed дохід takes the джерело of its правило-джерело

- **WHEN** the правило-джерело "зарплата → Зарплата" exists and the owner confirms a чернетка
  proposing a дохід of 3000000 minor units UAH with text "Зарахування: Зарплата ТОВ Ромашка"
- **THEN** a дохід of 3000000 minor units UAH with the джерело «Зарплата» is stored

## REMOVED Requirements

### Requirement: Pending чернетки are visible on Головний

**Reason**: Чернетки are no longer expanded on Головний; they are named in the rail row «Що
потребує відповіді» and confirmed or dismissed in the queue.
**Migration**: See "Pending чернетки are named on Головний and shown in the queue" and the
answer-queue capability.
