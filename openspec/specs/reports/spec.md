# reports Specification

## Purpose

The history series behind the «Звіти» screen: витрачено, дохід and інвестовано for every
calendar month of the stored history, and one category's spent by month — each month's numbers
exactly as monthly-picture defines them, per currency, with empty months at zero so the time
axis never lies.

## Requirements

### Requirement: The series spans every month of the stored history

The history series SHALL cover every calendar month from the month of the earliest stored
транзакція through the current month, or through the month of the latest stored транзакція when
that lies beyond the current month — consecutively, with no month skipped. A month in the span
holding no транзакції SHALL be present with every number at zero. WHEN no транзакція is stored,
the series SHALL be empty.

#### Scenario: A gap month is present at zero

- **WHEN** the stored history holds транзакції in June and August and none in July
- **THEN** the series holds July with витрачено, дохід and інвестовано of zero, between June and
  August

#### Scenario: The span reaches the current month

- **WHEN** the latest stored транзакція is dated two months ago
- **THEN** the series still ends with the current month, its numbers at zero

#### Scenario: A future-dated транзакція extends the span

- **WHEN** a витрата is dated in the month after the current one
- **THEN** the series ends with that month and includes the витрата

#### Scenario: An empty history yields an empty series

- **WHEN** no транзакція is stored
- **THEN** the series holds no months

### Requirement: Each month holds витрачено, дохід and інвестовано as monthly-picture defines them

For every month of the span the series SHALL hold витрачено, дохід and інвестовано equal to the
monthly-picture numbers of that month: витрачено net of повернення with «Без категорії», комісії
and negative коригування included; дохід with positive коригування included; інвестовано as the
net of переказів onto інвестиційні рахунки, negative months included. Every number SHALL be per
currency, and amounts of different currencies SHALL NOT be summed into one number.

#### Scenario: A month's series numbers equal its monthly picture

- **WHEN** August holds витрати, доходи, повернення and перекази onto an інвестиційний рахунок
- **THEN** the series' August витрачено, дохід and інвестовано equal what monthly-picture
  computes for August from the same транзакції

#### Scenario: Currencies stay apart across the whole span

- **WHEN** the history holds витрати in UAH and витрати in USD
- **THEN** every month of the series holds a UAH витрачено and a separate USD витрачено, and no
  month combines them

#### Scenario: A month of returns shows negative інвестовано

- **WHEN** a month's only транзакція is a переказ of 150000 minor units UAH back from an
  інвестиційний рахунок onto a card
- **THEN** that month's інвестовано in the series is −150000 minor units UAH

### Requirement: One category's spent can be read by month

For one chosen category the series SHALL hold, for every month of the span, that category's
spent as the monthly-picture breakdown defines it — витрати minus повернення of that category,
negative коригування for the correction category — per currency, with months where the category
does not occur at zero, and negative months included.

#### Scenario: A category's month equals its breakdown amount

- **WHEN** August holds витрати of 300000 and a повернення of 50000 minor units UAH in Groceries
- **THEN** the Groceries series holds August at 250000 minor units UAH

#### Scenario: A month without the category is zero

- **WHEN** July holds no транзакція in Groceries and the span covers July
- **THEN** the Groceries series holds July at zero

#### Scenario: Refunds can push a category's month negative

- **WHEN** a month's only транзакції in Groceries are a витрата of 40000 and a повернення of
  100000 minor units UAH
- **THEN** the Groceries series holds that month at −60000 minor units UAH
