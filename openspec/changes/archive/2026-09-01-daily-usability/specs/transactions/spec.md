## MODIFIED Requirements

### Requirement: A transaction can carry an informational опис

A транзакція of any type SHALL be able to carry an опис — the text the bank sent with an
imported транзакція, such as the merchant description, or a note the owner wrote when recording
or editing it by hand. The опис SHALL NOT affect any total, balance or classification. It SHALL
be preserved when the транзакція is retyped and when any other field of it is edited, and SHALL
change only when the опис itself is changed or cleared. Recording a транзакція by hand SHALL NOT
require an опис — it stays optional, and a транзакція carrying none SHALL behave exactly as one
that never could.

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
  зиму"
- **THEN** the витрата carries that опис, the month's spent counts exactly 120000 minor units
  UAH, and the опис takes no part in choosing its категорія

#### Scenario: Changing another field leaves the опис alone

- **WHEN** the сума of a витрата carrying the опис "СІЛЬПО Київ" is changed to 13000 minor units
  UAH
- **THEN** the same транзакція carries 13000 minor units UAH and still exactly that опис

#### Scenario: A cleared опис changes no number

- **WHEN** the опис of a stored витрата is cleared
- **THEN** the транзакція carries no опис, and its сума, категорія, рахунок, дата and type are
  unchanged
