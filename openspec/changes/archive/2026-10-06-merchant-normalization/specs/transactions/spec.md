## ADDED Requirements

### Requirement: An imported транзакція keeps the MCC its import named

A транзакція SHALL be able to carry an MCC: the whole-number merchant category code a bank named
for it when it was imported. Like the опис, the MCC SHALL be informational. It SHALL NOT affect any
total or balance, and SHALL NOT decide a транзакція's type. The one thing it takes part in is the
категорія a витрата is given by the правила and the шаблон, where it is matched exactly as at
import. It SHALL be preserved when the транзакція is retyped and when any other field of it, its
опис included, is edited. A транзакція recorded by hand, imported from Saldo or confirmed from a
чернетка SHALL carry none, because none of those sources names one. The owner never types an MCC.

#### Scenario: An imported витрата keeps its MCC

- **WHEN** an imported витрата of 12550 minor units UAH carries MCC 5411
- **THEN** the stored витрата holds MCC 5411, and the month's spent counts exactly 12550 minor units
  UAH

#### Scenario: A retype keeps the MCC

- **WHEN** a витрата carrying MCC 4829 is retyped into a переказ
- **THEN** the same транзакція, now a переказ, still carries MCC 4829

#### Scenario: Correcting the опис leaves the MCC alone

- **WHEN** the опис of a витрата carrying MCC 5812 is changed
- **THEN** the same транзакція still carries MCC 5812

#### Scenario: A транзакція recorded by hand carries no MCC

- **WHEN** the owner records a витрата by hand
- **THEN** it carries no MCC

## MODIFIED Requirements

### Requirement: A transaction can carry an informational опис

A транзакція of any type SHALL be able to carry an опис — the text the bank sent with an
imported транзакція, such as the merchant description, or a note the owner wrote when recording
or editing it by hand. The опис SHALL NOT affect any total or balance, and SHALL NOT decide a
транзакція's type. It SHALL be preserved when the транзакція is retyped and when any other field
of it is edited, and SHALL change only when the опис itself is changed or cleared. Recording a
транзакція by hand SHALL NOT require an опис — it stays optional, and a транзакція carrying none
SHALL behave exactly as one that never could.

An опис decides two things. The first is the продавець of the транзакція: what the опис is
recognised as, read from it whenever it is read and never stored apart from it. The second is the
категорія a витрата is offered, through the owner's own правила, wherever a витрата comes from —
imported or recorded by hand. It proposes; it never
overrules: a категорія the owner picked stands, and an опис SHALL never move a транзакція out of a
категорія the owner chose or a правило gave it. «Без категорії» is the one exception, and it is not
a категорія anyone chose — it is the gap left where nothing matched the транзакція, and a
правило that matches it later may fill it. Nothing else reads the опис — no total, no баланс, no
ліміт, no month — and the продавець it gives changes none of them either.

#### Scenario: An imported витрата keeps the bank's text

- **WHEN** an imported витрата of 12550 minor units UAH carries the опис "СІЛЬПО Київ"
- **THEN** the stored витрата holds that опис, and the month's spent counts exactly 12550
  minor units UAH — the опис changes no number

#### Scenario: A retype keeps the опис

- **WHEN** a витрата carrying the опис "Переказ на банку" is retyped into a переказ
- **THEN** the same транзакція, now a переказ, still carries the опис "Переказ на банку"

#### Scenario: A manual транзакція needs no опис

- **WHEN** the owner records a витрата by hand without any опис
- **THEN** the витрата is stored with no опис and behaves exactly as before

#### Scenario: The owner's own опис is an опис like any other

- **WHEN** the owner records a витрата of 120000 minor units UAH by hand with the опис "шини на
  зиму" and no правило matches it
- **THEN** the витрата carries that опис, the month's spent counts exactly 120000 minor units
  UAH, and the витрата is stored in «Без категорії»

#### Scenario: An опис never moves a транзакція out of the категорія it carries

- **WHEN** the опис of a stored витрата in Clothing is changed to "АТБ 421" while the правило
  "атб → Groceries" exists
- **THEN** the витрата still carries Clothing

#### Scenario: Changing another field leaves the опис alone

- **WHEN** the сума of a витрата carrying the опис "СІЛЬПО Київ" is changed to 13000 minor units
  UAH
- **THEN** the same транзакція carries 13000 minor units UAH and still exactly that опис

#### Scenario: The опис gives the продавець and nothing more

- **WHEN** «АТБ» holds "атб" and a витрата of 12550 minor units UAH carries the опис "АТБ 12"
- **THEN** its продавець is «АТБ», and the month's spent counts exactly 12550 minor units UAH

#### Scenario: A cleared опис changes no number

- **WHEN** the опис of a stored витрата is cleared
- **THEN** the транзакція carries no опис, and its сума, категорія, рахунок, дата and type are
  unchanged
