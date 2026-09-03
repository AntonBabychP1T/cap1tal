## ADDED Requirements

### Requirement: Earned досягнення survive a restart and are stored at most once each

The system SHALL store each earned досягнення — its stable key, the catalogue template it belongs
to, its дата досягнення, the moment it was recorded, whether and when the owner has seen it, and its
свідчення — and read it back unchanged after storage is closed and reopened. A key SHALL be unique:
storing a досягнення under a key already stored SHALL leave the stored row exactly as it was, so
running the evaluation any number of times cannot produce a duplicate.

No stored досягнення SHALL hold a балanс, a total or any number the app computes money from; the
свідчення is a value that is read back for display alone.

The досягнення storage SHALL arrive by a new migration — committed migrations stay untouched — and
every row stored under the previously committed migrations SHALL survive it unchanged.

#### Scenario: A stored досягнення round-trips

- **WHEN** a досягнення keyed `ledger.transactions:500`, dated 2025-04-18, recorded at a moment,
  unseen, with a свідчення of 500 транзакцій is stored and storage is closed and reopened
- **THEN** it reads back with the same key, template, дата, moment, unseen state and свідчення

#### Scenario: Storing the same key twice stores one row

- **WHEN** the same key is stored three times with different свідчення
- **THEN** exactly one row exists and it holds the first свідчення stored

#### Scenario: Seen is recorded once and for all unseen at once

- **WHEN** twelve unseen досягнення are stored and all unseen ones are marked seen in one call
- **THEN** all twelve read back as seen, with the moment they were seen

#### Scenario: A fresh database from migrations alone stores a досягнення

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a досягнення can be stored and read back

### Requirement: The owner's decisions about виклики survive a restart

The system SHALL store, per виклик key, that the owner accepted or dismissed it and when, and read
it back unchanged after a restart. A decision SHALL be replaceable under its key, and removable. No
progress, target, count of finished виклики or score SHALL be stored — nothing but the decision and
its moment.

#### Scenario: A decision round-trips

- **WHEN** the виклик keyed `close-month:2026-08` is stored as accepted at a moment and storage is
  closed and reopened
- **THEN** it reads back as accepted at that moment

#### Scenario: A decision is replaced under its key

- **WHEN** an accepted виклик is stored again as dismissed
- **THEN** exactly one row exists for that key and it reads as dismissed

#### Scenario: Nothing derived is stored beside it

- **WHEN** a decision is stored
- **THEN** the stored row holds the key, the decision and the moment, and no progress, target or
  count

### Requirement: A місячна норма витрат survives a restart, one per currency

The system SHALL store at most one місячна норма витрат per currency code — a positive integer
minor-units сума with the moment it was confirmed — and read it back unchanged after a restart.
Confirming again for the same currency SHALL replace it. A non-positive сума SHALL be rejected. A
currency with no stored норма SHALL read back as having none, and never as zero.

#### Scenario: A норма round-trips per currency

- **WHEN** a UAH норма of 3050000 minor units and a USD норма of 40000 minor units are stored and
  storage is closed and reopened
- **THEN** both read back with their own суми and currencies, and neither was converted

#### Scenario: Confirming again replaces

- **WHEN** a UAH норма of 3050000 minor units is stored and then a UAH норма of 3200000 minor units
- **THEN** exactly one UAH норма exists and it is 3200000 minor units

#### Scenario: A non-positive норма is rejected

- **WHEN** a норма of 0 minor units is stored
- **THEN** storage rejects it and no норма is stored for that currency

#### Scenario: An absent норма is absent, not zero

- **WHEN** no EUR норма has been stored and the EUR норма is read
- **THEN** the answer is that there is none, distinguishable from a норма of zero

### Requirement: The history can be read as a bounded зведення прогресу

The system SHALL produce a **зведення прогресу** whose rows are bounded by the number of (місяць,
currency) pairs, the number of (вид рахунку, currency) pairs and a fixed number of single values,
holding: per (місяць, currency) the витрачено, дохід, інвестовано and відкладено the monthly-picture
capability defines, the count of транзакції, the count carrying «Без категорії» and the count
carrying «Без джерела»; per (вид рахунку, currency) the sum of the розрахункові баланси; the total
count of транзакції with the дата of the earliest and the latest; and the count of чернетки still
waiting, by місяць.

Producing it SHALL NOT return one row per транзакція. The system SHALL also be able to read the дата
of the Nth транзакція in the history's order — дата first, then the order it was stored — returning
that one транзакція alone.

#### Scenario: The зведення is bounded, not per транзакція

- **WHEN** the зведення is produced on a database holding 5000 транзакції across 24 місяці, 3
  currencies and 12 рахунки of 4 видів
- **THEN** its per-місяць rows number at most 72, its per-вид rows at most 12, and no reading
  returned 5000 rows

#### Scenario: The зведення holds the same numbers as the місячна картина

- **WHEN** a місяць holds витрати, a повернення, a дохід, a переказ onto a банка and a переказ onto
  an інвестиційний рахунок
- **THEN** that місяць's row holds exactly the витрачено, дохід, відкладено and інвестовано the
  monthly-picture capability computes for it, per currency

#### Scenario: The Nth транзакція is read alone

- **WHEN** the дата of the 500th транзакція is asked for on a database holding 2459
- **THEN** one транзакція is returned, the 500th by дата then stored order

#### Scenario: A вид рахунку's total keeps its currencies apart

- **WHEN** two рахунки of вид `savings` hold 4000000 minor units UAH and 50000 minor units USD
- **THEN** the зведення holds a UAH row and a USD row for `savings`, and no summed figure
