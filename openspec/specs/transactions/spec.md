# transactions Specification

## Purpose

Defines the five transaction types and their semantics — the rules that decide what counts as
spent versus merely moved, and how refunds, corrections, fees and foreign-currency purchases are
recorded.

## Requirements

### Requirement: Expense is the default transaction type

A transaction SHALL have exactly one type — `expense`, `income`, `transfer`, `refund`, or
`correction` — and a transaction not explicitly typed otherwise SHALL be an `expense`.

#### Scenario: An untyped transaction is an expense

- **WHEN** a transaction is recorded without an explicit type
- **THEN** its type is `expense`

#### Scenario: An unrecognised import is an expense

- **WHEN** an imported transaction is not recognised by any rule
- **THEN** its type is `expense` in the "Uncategorised" category and it counts as spent

### Requirement: An expense carries a category; an income carries a source

An `expense` SHALL carry exactly one category. An `income` SHALL carry exactly one source.

A дохід's amount MAY be negative — money handed back out of an income rather than a fresh
arrival, which the Saldo history holds and the import brings over. Such a дохід SHALL reduce the
month's дохід and the рахунок's розрахунковий баланс by that amount, and SHALL NOT become a
витрата: it belongs to the джерело it came from, and no category would honestly name it.
Recording one by hand is not offered — the amount entered when recording is positive, as the
main-screen capability states — so a negative дохід can only arrive from an import.

#### Scenario: Income with a source

- **WHEN** an income of 5000000 minor units UAH with source "salary" is recorded
- **THEN** the transaction holds type `income`, amount 5000000 UAH and source "salary"

#### Scenario: An income handed back is a negative дохід

- **WHEN** a дохід of −27100 minor units UAH with source "Other income" is stored on a рахунок
- **THEN** the рахунок's розрахунковий баланс is 27100 minor units UAH lower, the month's дохід
  is 27100 minor units UAH lower, and no category holds any part of it

### Requirement: A transfer connects two of the owner's own accounts

A `transfer` SHALL reference exactly two distinct accounts of the owner — the account the money
left and the account it arrived at — SHALL carry a positive amount on each leg, and SHALL NOT
count as spent.

#### Scenario: Card to jar

- **WHEN** a transfer of 100000 minor units UAH is recorded from a card to a jar
- **THEN** the transaction references both accounts and contributes nothing to spent

#### Scenario: Transfer amounts are positive

- **WHEN** a transfer is recorded with a zero or negative amount on either leg
- **THEN** it is rejected with an error

### Requirement: A cross-currency transfer carries two amounts and no rate

A `transfer` between accounts of different currencies SHALL carry two amounts — what left, in the
source account's currency, and what arrived, in the destination account's currency. The system
SHALL NOT store or derive an exchange rate for it.

#### Scenario: UAH card to USD account

- **WHEN** a transfer leaves a UAH card as 410000 minor units UAH and arrives at a USD account as
  10000 minor units USD
- **THEN** the transaction holds both amounts in their own currencies and no exchange rate

### Requirement: A same-currency transfer that arrives short proposes a fee

WHEN a `transfer` between accounts of the same currency arrives smaller than it left, the system
SHALL propose the difference as an `expense` in the "Fees" category; when nothing is lost, no fee
SHALL be proposed.

#### Scenario: Transfer with a shortfall

- **WHEN** a UAH transfer leaves as 100000 minor units and arrives as 99500 minor units
- **THEN** an expense of 500 minor units UAH in the "Fees" category is proposed

#### Scenario: Transfer without a shortfall

- **WHEN** a UAH transfer leaves as 100000 minor units and arrives as 100000 minor units
- **THEN** no fee is proposed

### Requirement: A refund is a negative expense in the same category

A `refund` SHALL reduce spent in the same category as the original expense, in the month the money
arrives. A refund SHALL NOT be income.

#### Scenario: Returned purchase

- **WHEN** an expense of 80000 minor units UAH in category "clothes" is refunded in a later month
- **THEN** the refund reduces spent in category "clothes" in the month it arrives and income is
  unchanged

### Requirement: A correction has its own category and counts by sign

A `correction` SHALL carry the dedicated correction category. A negative correction SHALL count as
spent; a positive correction SHALL count as income.

#### Scenario: Negative correction counts as spent

- **WHEN** a correction of −3000 minor units UAH is recorded
- **THEN** it counts 3000 minor units UAH as spent in the correction category

#### Scenario: Positive correction counts as income

- **WHEN** a correction of +3000 minor units UAH is recorded
- **THEN** it counts 3000 minor units UAH as income

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

### Requirement: A transaction can carry an informational опис

A транзакція of any type SHALL be able to carry an опис — the text the bank sent with an
imported транзакція, such as the merchant description, or a note the owner wrote when recording
or editing it by hand. The опис SHALL NOT affect any total or balance, and SHALL NOT decide a
транзакція's type. It SHALL be preserved when the транзакція is retyped and when any other field
of it is edited, and SHALL change only when the опис itself is changed or cleared. Recording a
транзакція by hand SHALL NOT require an опис — it stays optional, and a транзакція carrying none
SHALL behave exactly as one that never could.

The one thing an опис decides is the категорія a витрата is offered, through the owner's own
правила, wherever a витрата comes from — imported or recorded by hand. It proposes; it never
overrules: a категорія the owner picked stands, and an опис SHALL never move a транзакція out of a
категорія the owner chose or a правило gave it. «Без категорії» is the one exception, and it is not
a категорія anyone chose — it is the gap left where nothing recognised the транзакція, and a
правило that recognises it later may fill it. Nothing else reads the опис — no total, no баланс, no
ліміт, no month.

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

#### Scenario: A cleared опис changes no number

- **WHEN** the опис of a stored витрата is cleared
- **THEN** the транзакція carries no опис, and its сума, категорія, рахунок, дата and type are
  unchanged
