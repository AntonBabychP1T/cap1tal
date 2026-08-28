# monobank-sync Specification

## Purpose

The engine that turns the monobank personal API's payloads into the app's truth: parsing the
owner's monobank рахунки and банки with their bank balances, the model linking them to the
app's рахунки, statement fetching planned within the API's limits, and the deterministic
mapping of statement items to транзакції — categorised by the owner's правила, deduplicated by
the bank's own item ids. Everything here is decided by inputs alone: the same payloads, правила
and decisions always produce the same транзакції.
## Requirements
### Requirement: Client-info parsing yields the owner's monobank accounts

The system SHALL parse a client-info payload into the owner's monobank accounts — cards and
банки (jars) — each holding the monobank account id, its currency code, a human-readable name,
and the баланс банку as integer minor units of that currency. A card's name SHALL be derived
from its type and masked card number; a банка's name SHALL be its title. A card's баланс банку
SHALL be the payload's balance minus its credit limit — the credit money is the bank's, not the
owner's — and MAY therefore be negative; a банка has no credit limit and SHALL report its
balance as is. Accounts in currencies the app does not offer (anything but UAH, EUR, USD,
recognised by ISO-4217 numeric code) SHALL be left out. Parsing SHALL be total: a payload that
is not the expected shape SHALL yield the unavailable outcome, never a throw and never a
half-read list.

#### Scenario: A card's баланс банку subtracts the credit limit

- **WHEN** a client-info payload holds a UAH card with balance 500000 minor units and credit
  limit 200000 minor units
- **THEN** parsing yields that card with a баланс банку of 300000 minor units UAH

#### Scenario: A card deep in its credit limit is negative

- **WHEN** a client-info payload holds a UAH card with balance 150000 minor units and credit
  limit 200000 minor units
- **THEN** parsing yields that card with a баланс банку of −50000 minor units UAH

#### Scenario: A банка arrives with its title and balance

- **WHEN** a client-info payload holds a jar titled "На відпустку" with balance 1200000 minor
  units UAH and no credit limit field
- **THEN** parsing yields an account named "На відпустку" with a баланс банку of 1200000 minor
  units UAH

#### Scenario: A card is named by its type and masked number

- **WHEN** a client-info payload holds a card of type "black" with masked number
  "537541******1234"
- **THEN** the parsed account's name contains "black" and "1234"

#### Scenario: A currency the app does not offer is left out

- **WHEN** a client-info payload holds a UAH card and a PLN (numeric 985) card
- **THEN** parsing yields only the UAH card

#### Scenario: A hostile payload is unavailable, not a crash

- **WHEN** a client-info payload is an arbitrary JSON value that is not client-info
- **THEN** the outcome is unavailable and no accounts are yielded

### Requirement: Fetch outcomes are typed and never leak the token

Fetching client-info or a statement SHALL send the owner's token with the request and SHALL
yield exactly one typed outcome: the parsed answer, invalid-token (the API rejected the token),
rate-limited (the API asked to wait), or unavailable (offline, any other error, or an
unparseable body). No fetch SHALL throw, and no outcome SHALL contain the token.

#### Scenario: A 429 answer is rate-limited

- **WHEN** the API answers a statement request with status 429
- **THEN** the outcome is rate-limited and no items are yielded

#### Scenario: A rejected token is invalid-token

- **WHEN** the API answers client-info with status 403
- **THEN** the outcome is invalid-token

#### Scenario: A network failure is unavailable

- **WHEN** the request itself fails before any answer arrives
- **THEN** the outcome is unavailable, and nothing was thrown

#### Scenario: No outcome carries the token

- **WHEN** any fetch completes with any outcome
- **THEN** the token string appears nowhere in the outcome's data

### Requirement: Statement parsing yields items whole or fails whole

The system SHALL parse a statement payload into items, each holding the bank's item id, the
moment of the operation, the calendar date of that moment in the device's timezone, the
description, the MCC, the signed amount as integer minor units of the account's currency, and the
hold flag. A payload holding any row the parser cannot read SHALL yield the unavailable outcome
and no items — a window is imported whole or not at all, so no transaction is ever silently
dropped. Every row states the currency of the account it belongs to; a row stating any currency
but the рахунок's SHALL be unreadable, because reading on would relabel every сума in it.

An item SHALL carry no original-currency amount. A statement names the amount of a foreign
purchase in the operation's own currency but names that currency nowhere, and an amount without a
currency is not money this app holds; what the bank charged the рахунок is exact, and that is the
сума that counts.

#### Scenario: A statement item parses whole

- **WHEN** a statement payload holds an item with id "a1", time in the device's August 26th,
  description "СІЛЬПО", MCC 5411, amount −12550 and hold false
- **THEN** parsing yields one item with id "a1", date 2026-08-26, description "СІЛЬПО",
  MCC 5411, amount −12550 minor units and hold false

#### Scenario: A foreign purchase is the сума the bank charged, and nothing more

- **WHEN** a UAH account's statement item holds amount −420000 with an operation amount of −10000
  in a currency the payload does not name
- **THEN** the parsed item holds amount −420000 minor units UAH and no original-currency amount

#### Scenario: A row of another currency is not this рахунок's statement

- **WHEN** a row of a statement being parsed for a UAH рахунок states the currency USD
- **THEN** the outcome is unavailable and no items are yielded

#### Scenario: One unreadable row fails the whole answer

- **WHEN** a statement payload holds two well-formed items and one item without an id
- **THEN** the outcome is unavailable and no items are yielded

### Requirement: Statement windows cover the span within the API's limits

Given a moment to sync from and the current moment, the system SHALL plan statement requests
whose windows each span at most the API's maximum (31 days plus one hour), together cover the
whole span, and neither overlap nor leave a gap. WHEN an answer is full (the API's maximum of
500 items), the system SHALL continue that window with requests ending at the oldest received
item's moment until an answer is short, so no item is lost to paging.

#### Scenario: A long span becomes consecutive windows

- **WHEN** requests are planned from a moment 90 days ago to now
- **THEN** every planned window spans at most 31 days plus one hour, the windows together
  cover the whole 90 days, and no two windows overlap

#### Scenario: A short span is one window

- **WHEN** requests are planned from a moment 3 days ago to now
- **THEN** exactly one window is planned, spanning those 3 days

#### Scenario: A full answer continues the window

- **WHEN** a window's answer holds exactly 500 items, the oldest at moment T
- **THEN** the window is continued with a request ending at T, and a later short answer ends
  the continuation

### Requirement: A link joins one monobank account to one рахунок of the same currency

A link SHALL join exactly one monobank account to exactly one рахунок whose currency equals the
monobank account's; a link whose currencies differ SHALL be rejected, and a link SHALL be
rejected while either side is already linked. A card SHALL suggest вид `spending` and a банка
SHALL suggest вид `savings` for a рахунок created to be linked; the suggestion SHALL NOT
overrule the owner's choice. An unlinked monobank account SHALL take no part in sync.

#### Scenario: A currency mismatch is rejected

- **WHEN** a UAH monobank card is linked to a USD рахунок
- **THEN** the link is rejected

#### Scenario: A second link on either side is rejected

- **WHEN** a monobank card already linked to a рахунок is linked to another рахунок, or a
  second monobank account is linked to an already-linked рахунок
- **THEN** the link is rejected and the existing link stands

#### Scenario: A банка suggests a savings рахунок

- **WHEN** a рахунок is proposed for an unlinked банка
- **THEN** the suggested вид is `savings`, and the owner may still pick another вид

### Requirement: Statement items map deterministically to транзакції

The system SHALL map each statement item of a linked рахунок to exactly one транзакція on it,
dated the item's date, carrying the item's description as its опис:

- An item with a negative amount SHALL become a витрата of the absolute amount in the
  рахунок's currency; its category SHALL be the owner's правила applied to the item's
  description and MCC, and «Без категорії» when no правило matches.
- An item with a positive amount SHALL become a дохід of that amount with the reserved джерело
  «Без джерела». A дохід «Без джерела» is a starting state, never a verdict:
  an arriving повернення or cashback is retyped by the owner through витрата into повернення
  (the main-screen retype rules), because the glossary forbids a повернення to end up as
  income.
- An item on hold SHALL map exactly as a settled one — a hold is just a transaction.
- An item with a zero amount SHALL map to no транзакція.

#### Scenario: A recognised merchant lands in its category

- **WHEN** the правило "сільпо → Groceries" exists and an item of amount −12550 with
  description "СІЛЬПО Київ" is mapped
- **THEN** the result is a витрата of 12550 minor units in category Groceries with опис
  "СІЛЬПО Київ"

#### Scenario: An unrecognised merchant is «Без категорії»

- **WHEN** no правило matches an item of amount −8000 with description "НОВИЙ ЗАКЛАД"
- **THEN** the result is a витрата of 8000 minor units in «Без категорії», carrying the
  description as its опис

#### Scenario: Arriving money is a дохід «Без джерела»

- **WHEN** an item of amount +5000000 with description "Зарахування зарплати" is mapped
- **THEN** the result is a дохід of 5000000 minor units with the reserved джерело
  «Без джерела» and that опис

#### Scenario: A foreign purchase is a витрата of what the bank charged

- **WHEN** a UAH card's item of amount −420000 for a purchase made abroad is mapped
- **THEN** the result is a витрата of 420000 minor units UAH, carrying no original-currency
  amount — the statement named no currency for the operation's own сума

#### Scenario: A hold maps like anything else

- **WHEN** an item of amount −30000 marked hold is mapped
- **THEN** the result is a витрата of 30000 minor units — nothing about it says hold

#### Scenario: A zero amount maps to nothing

- **WHEN** an item of amount 0 is mapped
- **THEN** no транзакція results

### Requirement: A statement item imports at most once, forever

The system SHALL keep the set of statement item ids already imported per monobank account, and
SHALL map only items whose id is not in the set; mapping an item SHALL add its id. An id once
in the set SHALL keep the item out even after the транзакція it created was edited, retyped or
deleted — deleting a транзакція never resurrects it on the next sync.

#### Scenario: The same item does not import twice

- **WHEN** the same statement item arrives in two answers
- **THEN** exactly one транзакція results and the second arrival is skipped

#### Scenario: A deleted транзакція stays deleted

- **WHEN** an item's id is in the imported set and the транзакція it created no longer exists
- **THEN** the item is still skipped on the next sync

#### Scenario: A zero item's id is still remembered

- **WHEN** an item of amount 0 is mapped to no транзакція
- **THEN** its id joins the imported set all the same, and the item is not examined again

### Requirement: Each linked account resumes from a committed sync cursor

The system SHALL import a linked monobank account from its confirmed first-sync boundary and,
after each completely stored statement answer, resume later work from the committed cursor without
importing any remembered item twice. The cursor SHALL advance only with the транзакції and imported
item ids produced by that answer; a failed or unreadable answer SHALL leave all three unchanged and
retryable.

#### Scenario: A later sync resumes after committed work

- **WHEN** a linked account completes a statement answer through moment T and a later sync starts
- **THEN** the later sync resumes from T, and any boundary item seen again is skipped by its
  monobank item id

#### Scenario: A failed commit advances nothing

- **WHEN** storing one транзакція from a statement answer fails
- **THEN** none of that answer's транзакції or imported ids are stored, its cursor does not
  advance, and the same answer can be retried

#### Scenario: An API failure leaves the cursor retryable

- **WHEN** a linked account is rate-limited or unavailable while fetching its next statement
  answer
- **THEN** its cursor and imported ids remain unchanged and that account can resume from the same
  place later

### Requirement: Sync preserves the transaction distinctions until the owner retypes them

Sync SHALL apply the existing item mapping without inferring relationships between separate
statement rows: money leaving starts as a витрата, money arriving starts as a дохід «Без джерела»,
and sync SHALL NOT invent a переказ, інвестиція, повернення, коригування, комісія or дохід
«Відсотки» from a рахунок-борг without the owner's explicit action defined by those capabilities.

#### Scenario: Two own-account legs are not paired automatically

- **WHEN** a card-to-банка movement arrives as a negative card item and a positive банка item
- **THEN** sync stores a витрата and a дохід «Без джерела», and neither is called a переказ or
  інвестиція until the owner retypes it

#### Scenario: Cashback is not silently finalised as income

- **WHEN** a positive cashback item arrives
- **THEN** it is imported as a дохід «Без джерела» that the owner can retype to a повернення, and
  sync does not choose a final джерело for it

#### Scenario: Lending and interest are not inferred

- **WHEN** incoming money could be repayment of a debt account with interest
- **THEN** sync imports the one item as a дохід «Без джерела» and does not invent a переказ of
  principal or a separate дохід «Відсотки»

### Requirement: The latest bank balance is committed in the account's currency

For every client-info answer used by sync, the system SHALL keep the latest баланс банку of each
linked account in integer minor units of that account's currency, without changing its
розрахунковий баланс and without converting either amount.

#### Scenario: Refreshing the bank balance changes no transaction

- **WHEN** a linked USD card's new client-info answer reports a баланс банку of 12345 minor units
  USD
- **THEN** 12345 minor units USD becomes its latest баланс банку and no транзакція or
  розрахунковий баланс changes until the owner chooses «Звірити»

