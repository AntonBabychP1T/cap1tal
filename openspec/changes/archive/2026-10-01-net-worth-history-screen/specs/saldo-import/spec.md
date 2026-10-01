## MODIFIED Requirements

### Requirement: Initial balance legs become the початковий залишок

A transaction pairing a real leg with an EQUITY leg SHALL become no transaction: its real leg's
amount SHALL contribute to the mapped рахунок's початковий залишок, in the рахунок's currency, and
the earliest local date among the entries mapped onto that рахунок — or the рахунок's first planned
or stored транзакція, when that is earlier — SHALL become its дата початкового залишку. Entries merged onto one рахунок SHALL sum their contributions; for an
existing рахунок the plan SHALL propose replacing its stored початковий залишок and its дата with
the Saldo ones, and the verification report SHALL show both replacements.

#### Scenario: An initial balance becomes the opening balance

- **WHEN** the only EQUITY-paired leg of "mono black" is a DEBIT of 12300 minor units UAH dated
  2024-10-27
- **THEN** the plan creates no transaction for it and the mapped рахунок's початковий залишок
  is 12300 minor units UAH with дата початкового залишку 2024-10-27

#### Scenario: Merged accounts sum their initial balances

- **WHEN** "mono black" with an initial 12300 dated 2024-10-27 and "Monobank UAH, Black" with an
  initial 5000 minor units UAH dated 2026-01-13 are mapped onto one рахунок
- **THEN** that рахунок's початковий залишок is 17300 minor units UAH with дата 2024-10-27

#### Scenario: Mapping onto an existing рахунок proposes replacing its opening balance

- **WHEN** "mono black" with an initial 12300 minor units UAH dated 2024-10-27 is mapped onto an
  existing рахунок whose початковий залишок is 5000 minor units UAH with no дата
- **THEN** the plan proposes початковий залишок 12300 minor units UAH dated 2024-10-27 and the
  verification report shows both replaced values

#### Scenario: An entry dated after the first транзакція is moved back to it

- **WHEN** an initial balance of 5500000 minor units UAH is dated 2024-11-27 and the рахунок's
  first транзакція in the export is dated 2024-11-19
- **THEN** the рахунок's дата початкового залишку is 2024-11-19
