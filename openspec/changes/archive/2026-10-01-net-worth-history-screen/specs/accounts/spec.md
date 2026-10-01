## ADDED Requirements

### Requirement: A рахунок records the дата of its початковий залишок

A рахунок SHALL carry an optional дата початкового залишку — the day from which its початковий залишок holds. A рахунок created in the app, by hand or by linking a monobank account, SHALL record the day it was created. The owner SHALL be able to change it, and a дата after today SHALL be rejected; a дата later than the рахунок's first транзакція SHALL be accepted, because Статок's history counts the рахунок from whichever is earlier. Merging рахунки SHALL keep the earlier of their recorded дати, or none when neither has one. The дата SHALL change no balance: the розрахунковий баланс stays the початковий залишок plus every транзакція, whatever their dates.

#### Scenario: A new рахунок records its creation day
- **WHEN** the owner creates a UAH рахунок with початковий залишок 50000 on 2026-10-01
- **THEN** its дата початкового залишку is 2026-10-01

#### Scenario: A рахунок stored before this change has no дата
- **WHEN** a рахунок existing before this change is read
- **THEN** it has no дата початкового залишку and its розрахунковий баланс is unchanged

#### Scenario: A дата after today is rejected
- **WHEN** on 2026-10-01 the owner sets a рахунок's дата початкового залишку to 2026-10-05
- **THEN** the change is rejected with a reason, and the stored дата is unchanged

#### Scenario: A linked рахунок keeps its creation day while older транзакції arrive
- **WHEN** a рахунок created by linking a monobank account on 2026-10-01 then receives synced транзакції from 2026-09-01
- **THEN** its дата початкового залишку stays 2026-10-01, nothing is rejected, and Статок's history counts it from 2026-09-01

#### Scenario: Merged рахунки keep the earlier дата
- **WHEN** a рахунок with дата 2026-06-08 is merged into one with дата 2026-08-30, or into one with no дата
- **THEN** the remaining рахунок's дата початкового залишку is 2026-06-08; merging two рахунки with no дата leaves none

#### Scenario: The дата moves no balance
- **WHEN** the дата початкового залишку of a рахунок with початковий залишок 100000 and an expense of 30000 UAH is changed
- **THEN** its розрахунковий баланс stays 70000 UAH
