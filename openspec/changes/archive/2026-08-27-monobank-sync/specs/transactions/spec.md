## ADDED Requirements

### Requirement: A transaction can carry an informational опис

A транзакція of any type SHALL be able to carry an опис — the text the bank sent with an
imported транзакція, such as the merchant description. The опис SHALL NOT affect any total,
balance or classification, and SHALL be preserved unchanged when the транзакція is edited or
retyped. Recording a транзакція by hand SHALL NOT require an опис — manual entry stays at its
minimum of fields.

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

## MODIFIED Requirements

### Requirement: A foreign-currency purchase from a UAH card is spent in UAH

WHEN a purchase in a foreign currency is paid from a UAH account, the `expense` SHALL be the UAH
amount the bank charged. The original-currency amount SHALL be kept as information only and SHALL
NOT enter any total — whenever the source names the currency that amount is in. A source that
names the merchant's сума but no currency for it SHALL keep no original-currency amount at all: an
amount without a currency is not money this app holds. A monobank statement is such a source; a
Saldo export and hand entry are not. Either way the UAH сума is unaffected — it is what the bank
charged, and it is what every total uses.

#### Scenario: USD purchase from a UAH card

- **WHEN** a 10000-minor-unit USD purchase is paid from a UAH card and the bank charges 420000
  minor units UAH
- **THEN** the expense is 420000 minor units UAH and the 10000 minor units USD is kept as the
  original-currency amount without affecting any total

#### Scenario: A purchase whose original currency the source does not name

- **WHEN** a foreign purchase arrives from a source that names the сума the merchant charged but
  not the currency it is in, and the bank charged 420000 minor units UAH
- **THEN** the expense is 420000 minor units UAH and no original-currency amount is kept
