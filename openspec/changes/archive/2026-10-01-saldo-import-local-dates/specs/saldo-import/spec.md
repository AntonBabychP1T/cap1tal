## MODIFIED Requirements

### Requirement: The export parses into double-entry transactions

The system SHALL parse a Saldo export CSV — RFC-4180 quoted fields, which may contain commas,
line breaks and doubled quotes, a header carrying at least Transaction ID, Transaction Date,
Description, Parent account, Account, Account Type, Journal Type, Amount, Currency and Accrual
Month — into transactions: the rows sharing one Transaction ID form one transaction of debit and
credit legs. Each leg's amount SHALL become an
integer amount in minor units with its currency code, converted exactly from the decimal text;
Saldo writes Transaction Date as a UTC instant without a zone marker, so each leg's date SHALL be
the calendar date, in the phone's time zone, of the UTC instant its Transaction Date names — the
day the owner recorded it in Saldo, not the UTC day. A file whose header lacks
any of these columns, or a row whose amount is not a plain two-decimal number, SHALL be rejected
with a reason naming what is wrong; nothing SHALL be silently skipped.

#### Scenario: Two legs sharing an id form one transaction

- **WHEN** a file holds two rows with Transaction ID 41596243 — a DEBIT of "123.00" UAH on
  account "mono black" and a CREDIT of "123.00" UAH on account "Initial balance" — and a third
  row with a different id
- **THEN** parsing yields a transaction with exactly those two legs of 12300 minor units UAH
  each, and the third row lands in a different transaction

#### Scenario: A quoted description with commas parses whole

- **WHEN** a row's Description field is quoted and contains commas
- **THEN** the row parses into one leg whose description is the full quoted text

#### Scenario: A quoted description containing a newline and a doubled quote parses whole

- **WHEN** a row's quoted Description field holds a line break and a doubled `""` quote, and
  another row follows it
- **THEN** the row parses into one leg whose description holds that line break and a single `"`
  character, and the following row keeps its own columns

#### Scenario: The datetime becomes a calendar date

- **WHEN** a leg carries Transaction Date "2026-03-06T10:15:31.129" and the phone is in Kyiv
- **THEN** its date is the calendar date 2026-03-06

#### Scenario: A late-evening UTC time is the next day in Kyiv

- **WHEN** a leg carries Transaction Date "2026-03-06T23:15:31.129" and the phone is in Kyiv
  (UTC+2 in March)
- **THEN** its date is the calendar date 2026-03-07

#### Scenario: A date-only Saldo entry keeps the day the owner chose, summer and winter

- **WHEN** the phone is in Kyiv and one leg carries Transaction Date "2025-08-25T21:00" (Kyiv
  midnight of 26 August, UTC+3) and another "2026-01-25T22:00" (Kyiv midnight of 26 January,
  UTC+2)
- **THEN** their dates are 2025-08-26 and 2026-01-26

#### Scenario: A malformed amount rejects the file with a reason

- **WHEN** a row carries the amount "1,234.5"
- **THEN** parsing is rejected with a reason naming the row and the amount

#### Scenario: An alien header rejects the file

- **WHEN** the first line lacks the Journal Type column
- **THEN** parsing is rejected with a reason naming the missing column

### Requirement: The verification report proves the plan against Saldo's balances

The system SHALL produce a verification report stating, per mapped рахунок: the balance Saldo
implies at export time — initial balance plus debits minus credits over every merged real leg,
per currency — and the розрахунковий баланс the plan yields (its початковий залишок plus its
транзакції, plus the existing рахунок's stored транзакції when mapped onto one). Every
difference SHALL be listed with what explains it — export rows, or the existing рахунок's
stored транзакції, which SHALL be named as their own explanation kind so the overlap with
hand-kept records is visible, never an inexplicable mismatch. The report SHALL also state the
resulting розрахунковий баланс of every рахунок-борг in the plan, so an over-repaid (negative)
one is visible before anything is committed. The report SHALL also list every
dropped or unexplained row — unpaired in-transit legs, zero-only map entries, dropped
original-currency amounts on повернення, and the rows whose Accrual Month differs from the
month of their Transaction Date as the export writes it — Saldo fills Accrual Month from that
same UTC text, so a row whose phone-local date crossed into the next month is not a divergence —
which the import deliberately ignores (перенесення транзакцій між місяцями stays outside v1). A
fully interpreted рахунок SHALL show equal balances.

#### Scenario: A fully interpreted рахунок reconciles exactly

- **WHEN** every leg of "гаманець" is interpreted into the plan and none is dropped
- **THEN** the report shows the Saldo-implied balance and the plan's розрахунковий баланс equal
  for the гаманець рахунок

#### Scenario: A dropped row shows up as the difference

- **WHEN** one unpairable MONEY_ON_THE_WAY departure of 12198 minor units UAH from
  "Monobank UAH, White" is excluded from the plan
- **THEN** the report shows the White рахунок differing by 12198 minor units UAH and names that
  row as the explanation

#### Scenario: A difference explained by existing stored транзакції is named as such

- **WHEN** "mono black" is mapped onto an existing рахунок that already holds a stored витрата
  of 5000 minor units UAH
- **THEN** the report lists the 5000 minor units UAH difference explained as the existing
  рахунок's stored транзакції, not as an export row

#### Scenario: An over-repaid рахунок-борг is visible before commit

- **WHEN** the plan's перекази lend 100000 minor units UAH onto one рахунок-борг and repay
  110000 minor units UAH back from it
- **THEN** the report states that рахунок-борг's resulting розрахунковий баланс of −10000
  minor units UAH

#### Scenario: An accrual-month divergence is noted, not obeyed

- **WHEN** the phone is in Kyiv and a row's Accrual Month is 2025-07 while its Transaction Date
  is 2025-08-02
- **THEN** the plan dates the транзакція 2025-08-02 and the report notes the divergence, quoting
  the Transaction Date as the export writes it

#### Scenario: A month-end evening entry is not a divergence

- **WHEN** the phone is in Kyiv and a row carries Transaction Date "2025-10-31T22:00" with
  Accrual Month "2025-10-31"
- **THEN** the plan dates the транзакція 2025-11-01 and the report notes no accrual-month
  divergence for it


### Requirement: The plan is deterministic and keeps the export's order

Given the same export text, the same owner decisions and the same phone time zone, the system
SHALL produce the same plan;
the plan's транзакції SHALL be ordered by the export's own datetimes, ties broken by the
export's own row order, so that same-date транзакції keep Saldo's order when later stored.

#### Scenario: The same inputs replay into the same plan

- **WHEN** the plan is built twice from one export text, one set of decisions and one phone time
  zone
- **THEN** both plans hold the same транзакції in the same order with the same amounts and dates

#### Scenario: Same-date transactions keep their intra-day order

- **WHEN** two транзакції of one calendar date differ only by time of day
- **THEN** the earlier time comes first in the plan
