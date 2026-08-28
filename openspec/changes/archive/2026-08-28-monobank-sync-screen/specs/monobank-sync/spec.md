## ADDED Requirements

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
