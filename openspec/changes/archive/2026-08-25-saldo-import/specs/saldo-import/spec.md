## Purpose

The one-time move of the owner's history out of Saldo: parse the double-entry export CSV,
interpret its legs into cap1tal транзакції under an owner-confirmed account map and «Борг»
person assignment, and prove with a verification report that the resulting розрахункові баланси
match what Saldo held at export time — before anything is committed.

## ADDED Requirements

### Requirement: The export parses into double-entry transactions

The system SHALL parse a Saldo export CSV — RFC-4180 quoted fields, which may contain commas,
line breaks and doubled quotes, a header carrying at least Transaction ID, Transaction Date,
Description, Parent account, Account, Account Type, Journal Type, Amount, Currency and Accrual
Month — into transactions: the rows sharing one Transaction ID form one transaction of debit and
credit legs. Each leg's amount SHALL become an
integer amount in minor units with its currency code, converted exactly from the decimal text;
each leg's date SHALL be the calendar date of its Transaction Date. A file whose header lacks
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

- **WHEN** a leg carries Transaction Date "2026-03-06T23:15:31.129"
- **THEN** its date is the calendar date 2026-03-06

#### Scenario: A malformed amount rejects the file with a reason

- **WHEN** a row carries the amount "1,234.5"
- **THEN** parsing is rejected with a reason naming the row and the amount

#### Scenario: An alien header rejects the file

- **WHEN** the first line lacks the Journal Type column
- **THEN** parsing is rejected with a reason naming the missing column

### Requirement: Every real Saldo account maps to exactly one рахунок through the account map

The system SHALL build an account map with one entry per (real Saldo account, currency) pair the
export carries — real meaning of type BANK_ACCOUNTS, CASH or OTHER_ASSETS — and SHALL propose for
each entry a new рахунок named after the Saldo account, in that currency, with
вид `spending` for BANK_ACCOUNTS, `cash` for CASH and `investment` for OTHER_ASSETS. The owner's
decisions SHALL be able to redirect any entry to another entry's рахунок or to an existing
рахунок (merging duplicates of one card), and to change a proposed вид; a redirect onto a
рахунок of a different currency SHALL be rejected. A pair whose only legs are zero-amount
initial balances SHALL create no entry and SHALL be noted in the verification report.

#### Scenario: Duplicates of one card merge into one рахунок

- **WHEN** the owner redirects the entry "mono black" (UAH) onto the entry
  "Monobank UAH, Black" (UAH)
- **THEN** the plan carries one рахунок receiving the legs of both Saldo accounts

#### Scenario: An investment account proposes вид investment

- **WHEN** the map is proposed for OTHER_ASSETS account "інжур" with UAH legs
- **THEN** its entry proposes a new рахунок of вид `investment` in UAH

#### Scenario: The owner sets вид savings on a jar account

- **WHEN** the owner overrides the вид of the entry "РЕЗЕРВ" (UAH), proposed as `spending`
  because Saldo calls it a bank account, with `savings`
- **THEN** its рахунок is of вид `savings`, so transfers into it count as відкладено

#### Scenario: A cross-currency redirect is rejected

- **WHEN** the owner redirects the UAH entry "OTP" onto a USD рахунок
- **THEN** the redirect is rejected and the map is unchanged

#### Scenario: A zero-only pair creates no entry

- **WHEN** account "валюта моно" carries nine USD legs and one zero-amount UAH initial-balance
  leg
- **THEN** the map holds a USD entry for "валюта моно", no UAH entry, and the verification
  report notes the dropped zero leg

### Requirement: Saldo categories and sources map by name, with special rows never created

The system SHALL map each Saldo EXPENSES account to a category and each INCOME account to a
джерело by exact name — an INCOME account with a parent SHALL match as "parent — name" (the
starter set's flattening) — proposing creation of any name with no existing row, and the owner's
decisions SHALL be able to redirect any proposed creation onto an existing row instead. Four
EXPENSES names SHALL never become categories: "Fees" SHALL map to the reserved «Комісія» row,
"Uncategorised expense" to the reserved «Без категорії» row, "Balance correction" legs SHALL
become коригування, and «Борг» legs SHALL become перекази on рахунки-борги. The INCOME name
"Balance correction" SHALL likewise never become a джерело — its legs become коригування too.
The INCOME name "Uncategorised income" SHALL be proposed as an ordinary джерело like any other:
the domain reserves three categories and no джерело at all, so there is no «Без джерела» row to
map it onto, and inventing one would add a reserved row this change has no requirement for.

#### Scenario: A flattened income child matches the starter source

- **WHEN** an INCOME leg carries account "Андрій" with parent "батьки"
- **THEN** it maps to the джерело named "батьки — Андрій"

#### Scenario: An unknown category is proposed for creation and can be redirected

- **WHEN** the export holds EXPENSES account "булка" and no category of that name exists
- **THEN** the plan proposes creating category "булка", and the owner's decision can redirect it
  onto an existing category instead

#### Scenario: Fees map to the reserved row

- **WHEN** an EXPENSES leg carries account "Fees"
- **THEN** the resulting витрата carries the reserved «Комісія» category and no category named
  "Fees" is proposed

#### Scenario: No category «Борг» and no category "Balance correction" are ever proposed

- **WHEN** the export holds EXPENSES accounts «Борг» and "Balance correction"
- **THEN** the plan proposes creating neither as a category

#### Scenario: "Uncategorised income" is proposed as an ordinary джерело

- **WHEN** the export holds the INCOME account "Uncategorised income"
- **THEN** the plan proposes creating a джерело of that name, which the owner may redirect onto
  an existing one like any other proposal

#### Scenario: No джерело "Balance correction" is ever proposed

- **WHEN** the export holds the INCOME account "Balance correction" with credited legs
- **THEN** the plan proposes no джерело of that name and those legs become коригування

### Requirement: Initial balance legs become the початковий залишок

A transaction pairing a real leg with an EQUITY leg SHALL become no transaction: its real leg's
amount SHALL contribute to the mapped рахунок's початковий залишок, in the рахунок's currency.
Entries merged onto one рахунок SHALL sum their contributions; for an existing рахунок the plan
SHALL propose replacing its stored початковий залишок with the Saldo contribution, and the
verification report SHALL show the replacement.

#### Scenario: An initial balance becomes the opening balance

- **WHEN** the only EQUITY-paired leg of "mono black" is a DEBIT of 12300 minor units UAH
- **THEN** the plan creates no transaction for it and the mapped рахунок's початковий залишок
  is 12300 minor units UAH

#### Scenario: Merged accounts sum their initial balances

- **WHEN** "mono black" with an initial 12300 and "Monobank UAH, Black" with an initial 5000
  minor units UAH are mapped onto one рахунок
- **THEN** that рахунок's початковий залишок is 17300 minor units UAH

#### Scenario: Mapping onto an existing рахунок proposes replacing its opening balance

- **WHEN** "mono black" with an initial 12300 minor units UAH is mapped onto an existing рахунок
  whose початковий залишок is 5000 minor units UAH
- **THEN** the plan proposes початковий залишок 12300 minor units UAH and the verification
  report shows the replaced value

### Requirement: Two real legs become a переказ

A transaction whose two legs are both real SHALL become a переказ: the money left the credited
рахунок and arrived at the debited one. With both legs in one currency it SHALL carry that one
amount on both sides; with legs in different currencies it SHALL carry what left in the source
рахунок's currency and what arrived in the destination рахунок's currency, and no exchange rate.
The переказ's monthly meaning (інвестиція, відкладено, позичено or none) follows from the
accounts capability's kinds and is not restated here. When the owner's redirects have merged both
ends onto one рахунок the move SHALL become no переказ — a транзакція connects two distinct
рахунки — and SHALL be listed as a dropped row; being a credit and a debit of the same amount on
one рахунок, it changes no balance and so shows up as no difference.

#### Scenario: A same-currency move is one переказ

- **WHEN** a transaction credits "Monobank UAH, White" 500000 minor units UAH and debits
  "Monobank UAH, Black" 500000 minor units UAH
- **THEN** the plan holds a переказ from the White рахунок to the Black рахунок of 500000 minor
  units UAH on both legs

#### Scenario: A move whose two ends were merged into one рахунок is dropped

- **WHEN** a transaction credits "mono black" 50000 minor units UAH and debits
  "Monobank UAH, Black" 50000 minor units UAH, and the owner has merged the two onto one рахунок
- **THEN** the plan holds no переказ for it, the report lists the dropped row, and that рахунок
  still reconciles exactly

#### Scenario: A cross-currency move carries two amounts and no rate

- **WHEN** a transaction credits a UAH рахунок 400000 minor units UAH and debits the
  `investment` рахунок "binance usdt" 10000 minor units USD
- **THEN** the plan holds a переказ leaving 400000 minor units UAH and arriving 10000 minor
  units USD, with no exchange rate stored

### Requirement: An EXPENSES debit becomes a витрата on the credited рахунок

A transaction pairing a real CREDIT leg with an EXPENSES DEBIT leg SHALL become a витрата on the
credited рахунок of the real leg's amount in the рахунок's currency, in the mapped category.
When the EXPENSES leg carries a different currency, that amount SHALL be kept as the
original-currency amount, entering no total.

#### Scenario: A plain expense keeps its category and amount

- **WHEN** a transaction credits "Monobank UAH, Black" 85084 minor units UAH and debits EXPENSES
  "Groceries" 85084 minor units UAH
- **THEN** the plan holds a витрата of 85084 minor units UAH in the category mapped for
  "Groceries" on the Black рахунок

#### Scenario: A foreign purchase keeps the original-currency amount

- **WHEN** a transaction credits "Monobank UAH, Black" 85084 minor units UAH and debits EXPENSES
  "Eating out" 637000 minor units HUF
- **THEN** the plan holds a витрата of 85084 minor units UAH carrying 637000 minor units HUF as
  the original-currency amount

### Requirement: An EXPENSES credit becomes a повернення, never a дохід

A transaction pairing a real DEBIT leg with an EXPENSES CREDIT leg SHALL become a повернення on
the debited рахунок of the real leg's amount in the рахунок's currency, in the same mapped
category, dated the day it arrived; it SHALL NOT become a дохід. A cross-currency повернення
SHALL keep only the рахунок-currency amount — a повернення carries no original-currency amount —
and the dropped amount SHALL be counted by the verification report.

#### Scenario: A cancellation is a повернення in its category

- **WHEN** a transaction debits "Monobank UAH, Black" 221482 minor units UAH and credits
  EXPENSES "Travel" 18636 minor units PLN
- **THEN** the plan holds a повернення of 221482 minor units UAH in the category mapped for
  "Travel", no дохід, and the report counts the dropped 18636 minor units PLN

### Requirement: INCOME legs become доходи with their джерела

A transaction pairing a real DEBIT leg with an INCOME CREDIT leg SHALL become a дохід on the
debited рахунок with the mapped джерело. A transaction pairing a real CREDIT leg with an INCOME
DEBIT leg SHALL become a дохід with a negative amount in that джерело — money handed back out of
an income, reducing the month's дохід, never a витрата in a category.

#### Scenario: A salary arrival is a дохід with its source

- **WHEN** a transaction debits "Monobank UAH, Black" 5000000 minor units UAH and credits INCOME
  "Salary" 5000000 minor units UAH
- **THEN** the plan holds a дохід of 5000000 minor units UAH with the джерело mapped for
  "Salary"

#### Scenario: An income debit is a negative дохід

- **WHEN** a transaction credits "mono black" 27100 minor units UAH and debits INCOME
  "Other income" 27100 minor units UAH
- **THEN** the plan holds a дохід of −27100 minor units UAH with the джерело mapped for
  "Other income" and no витрата

### Requirement: Balance correction legs become коригування

A transaction pairing a real leg with a "Balance correction" EXPENSES or INCOME leg SHALL become
a коригування on the real рахунок: negative — counting as витрачено — when the money left the
рахунок, positive — counting as дохід — when it arrived. It SHALL carry no picked category and
no джерело beyond what the коригування type itself defines.

#### Scenario: A correction expense is a negative коригування

- **WHEN** a transaction credits "гаманець" 4200 minor units UAH and debits EXPENSES
  "Balance correction" 4200 minor units UAH
- **THEN** the plan holds a коригування of −4200 minor units UAH on the гаманець рахунок

#### Scenario: A correction income is a positive коригування

- **WHEN** a transaction debits "гаманець" 4200 minor units UAH and credits INCOME
  "Balance correction" 4200 minor units UAH
- **THEN** the plan holds a коригування of +4200 minor units UAH on the гаманець рахунок

### Requirement: «Борг» legs become перекази on рахунки-борги by the owner's person assignment

A transaction pairing a real leg with a «Борг» EXPENSES leg SHALL become a переказ with a
рахунок-борг: lending — the «Борг» leg debited — SHALL move the money from the real рахунок onto
the assigned person's рахунок-борг, and a repayment — the «Борг» leg credited — SHALL move it
back. The person SHALL come only from the owner's assignment; the system SHALL NOT guess. The
assignment SHALL be per «Борг» transaction: assigning a description to a person's рахунок-борг
(new or existing) SHALL assign every transaction carrying that description, and an assignment of
one transaction SHALL override the assignment of its description — so two transactions sharing a
description, or the transactions whose description is empty, can still go to different people.
Every «Борг» transaction with no assigned person SHALL be listed as unresolved, and the plan
SHALL be incomplete while any remains. A repayment SHALL move back exactly what its leg says,
even when the person has now repaid more than was lent: splitting an over-repayment into
principal and «Відсотки» belongs to FR-T9 and is outside this change — the report shows the
resulting negative рахунок-борг instead.

#### Scenario: Lending lands on the person's рахунок-борг

- **WHEN** a transaction credits "Monobank UAH, Black" 100000 minor units UAH and debits «Борг»
  with description "борг яріку", which the owner assigned to the person "Ярослав"
- **THEN** the plan holds a переказ of 100000 minor units UAH from the Black рахунок onto the
  рахунок-борг "Ярослав", whose розрахунковий баланс thereby shows 100000 minor units UAH owed

#### Scenario: A repayment is the переказ back

- **WHEN** a later transaction debits "Monobank UAH, Black" 100000 minor units UAH and credits
  «Борг» with description "ярік борг повернення", assigned to "Ярослав"
- **THEN** the plan holds a переказ of 100000 minor units UAH from the рахунок-борг "Ярослав"
  back to the Black рахунок, and that рахунок-борг's розрахунковий баланс returns to 0

#### Scenario: An unassigned description leaves the plan incomplete

- **WHEN** a «Борг» transaction's description is assigned to no person
- **THEN** the plan lists it as unresolved and reports itself incomplete

#### Scenario: Two «Борг» transactions with no description go to different people

- **WHEN** two «Борг» transactions both carry an empty description, and the owner assigns one to
  "Ярослав" and the other to "Оля"
- **THEN** the plan holds one переказ onto the рахунок-борг "Ярослав" and one onto "Оля", and
  reports itself complete

#### Scenario: A transaction assignment overrides its description's

- **WHEN** the description "борг" is assigned to "Ярослав" and one of the two transactions
  carrying it is assigned to "Оля"
- **THEN** that transaction's переказ lands on "Оля" and the other on "Ярослав"

### Requirement: MONEY_ON_THE_WAY transactions pair into one переказ

Two transactions SHALL pair into one переказ when one credits a real рахунок with a
MONEY_ON_THE_WAY debit leg naming the destination, the other debits the destination рахунок with
a MONEY_ON_THE_WAY credit leg naming the source, and the two MONEY_ON_THE_WAY legs carry the
same amount and currency — nearest date first when several match. The переказ SHALL leave the
source as the in-transit amount, arrive at the destination as the arrival's real-leg amount, and
be dated the departure's date. A departure additionally carrying a "Fees" DEBIT leg SHALL yield,
alongside the переказ, a витрата of the fee amount in the reserved «Комісія» category on the
source рахунок of the same date — so the source рахунок loses exactly what its real leg says. A
MONEY_ON_THE_WAY leg with no counterpart SHALL be listed in the verification report and SHALL
NOT become any транзакція.

#### Scenario: A same-currency pair collapses into one переказ

- **WHEN** one transaction credits "Monobank UAH, White" 500000 minor units UAH with a
  MONEY_ON_THE_WAY debit "Monobank UAH, Black" of 500000, and another debits
  "Monobank UAH, Black" 500000 with a MONEY_ON_THE_WAY credit "Monobank UAH, White" of 500000
- **THEN** the plan holds exactly one переказ of 500000 minor units UAH from the White to the
  Black рахунок

#### Scenario: A cross-currency pair carries both amounts

- **WHEN** the departure credits "Monobank UAH, Black" 3462454 minor units UAH with a
  MONEY_ON_THE_WAY debit of 3462454 UAH naming "Monobank USD, Black", and the arrival debits
  "Monobank USD, Black" 80000 minor units USD with a MONEY_ON_THE_WAY credit of 3462454 UAH
  naming "Monobank UAH, Black"
- **THEN** the plan holds one переказ leaving 3462454 minor units UAH and arriving 80000 minor
  units USD

#### Scenario: The three-legged fee departure yields переказ plus комісія

- **WHEN** the departure credits "Monobank UAH, Black" 12500 minor units UAH, debits
  MONEY_ON_THE_WAY "Monobank UAH, MadeInUkraine" 12198, and debits "Fees" 302, and the arrival
  debits "Monobank UAH, MadeInUkraine" 12198 with the matching MONEY_ON_THE_WAY credit
- **THEN** the plan holds one переказ of 12198 minor units UAH on both legs and a витрата of 302
  minor units UAH in «Комісія» on the Black рахунок, same date — the Black рахунок down exactly
  12500 minor units UAH

#### Scenario: An unpaired in-transit leg is reported, not imported

- **WHEN** a departure's MONEY_ON_THE_WAY leg matches no arrival
- **THEN** no транзакція is created for it and the verification report lists it

### Requirement: The plan is deterministic and keeps the export's order

Given the same export text and the same owner decisions, the system SHALL produce the same plan;
the plan's транзакції SHALL be ordered by the export's own datetimes, ties broken by the
export's own row order, so that same-date транзакції keep Saldo's order when later stored.

#### Scenario: The same inputs replay into the same plan

- **WHEN** the plan is built twice from one export text and one set of decisions
- **THEN** both plans hold the same транзакції in the same order with the same amounts

#### Scenario: Same-date transactions keep their intra-day order

- **WHEN** two транзакції of one calendar date differ only by time of day
- **THEN** the earlier time comes first in the plan

### Requirement: A transaction the import does not recognise is reported, never dropped silently

Interpretation SHALL NOT fail on a transaction whose shape it has no rule for. Such a transaction
SHALL become no транзакція and SHALL be listed among the report's unexplained rows, naming each
of its real legs and the рахунок each one fails to move — so an unknown shape surfaces as exactly
one visible difference per рахунок it touched, and never as a silently absent row.

#### Scenario: An unknown shape becomes a visible difference

- **WHEN** a transaction credits "гаманець" 4200 minor units UAH against a leg of an account type
  the import has no rule for
- **THEN** the plan holds no транзакція for it, the report lists the row as unexplained, and the
  гаманець рахунок differs by 4200 minor units UAH with that row named as the explanation

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
original-currency amounts on повернення, and the rows whose Accrual Month differs from their
date, which the import deliberately ignores (перенесення транзакцій між місяцями stays outside
v1). A fully interpreted рахунок SHALL show equal balances.

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

- **WHEN** a row's Accrual Month is 2025-07 while its Transaction Date is 2025-08-02
- **THEN** the plan dates the транзакція 2025-08-02 and the report notes the divergence
