## MODIFIED Requirements

### Requirement: A foreign-currency purchase from a UAH card is spent in UAH

WHEN a purchase in a foreign currency is paid from a UAH account, the `expense` SHALL be the UAH
amount the bank charged. The original-currency amount SHALL be kept as information only and SHALL
NOT enter any total — whenever the source names the currency that amount is in. A source that
names the merchant's сума but no currency for it SHALL keep no original-currency amount at all: an
amount without a currency is not money this app holds. A Saldo export, a bank notification and hand
entry name one, and a monobank statement names one too. A витрата imported from a **monobank
statement** SHALL nonetheless carry no original-currency amount until the sync is changed to read
it; no other source is affected. Either way the UAH сума is unaffected — it is what the bank
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

#### Scenario: A purchase imported from a monobank statement keeps none yet

- **WHEN** a foreign purchase is imported from a monobank statement, which names both the сума the
  merchant charged and the currency it is in, and the bank charged 420000 minor units UAH
- **THEN** the expense is 420000 minor units UAH and no original-currency amount is kept
