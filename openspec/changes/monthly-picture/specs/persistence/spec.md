# persistence Delta

## ADDED Requirements

### Requirement: The last obtained monobank rate survives a restart

The system SHALL store, per currency, the most recently obtained monobank rate together with the
moment it was obtained, and after a restart SHALL read back the same rate and the same moment.
Obtaining a newer rate for a currency SHALL replace that currency's stored rate. The stored rate
is a cache for the display-only approximation: losing it SHALL lose nothing but the approximate
figure until a rate is obtained again.

#### Scenario: A stored rate is still there after a restart

- **WHEN** a monobank rate for USD is stored and the app restarts
- **THEN** reading the rate for USD returns the same rate and the moment it was obtained

#### Scenario: A newer rate replaces the older one

- **WHEN** a rate for USD is stored and a newer rate for USD is obtained
- **THEN** reading the rate for USD returns only the newer rate and its moment

## MODIFIED Requirements

### Requirement: Every transaction type round-trips through storage unchanged

The system SHALL store and load every transaction type — `expense`, `income`, `transfer`,
`refund`, `correction` — returning exactly the values stored: the type, the date, the account or
accounts touched, integer minor-unit amounts with their currency codes, the category of an
expense or refund, the source of an income, both legs of a transfer, and the informational
original-currency amount of an expense when present. Loading an id that was never stored SHALL
return nothing, not an error.

No transaction SHALL carry an exchange rate, and no rate SHALL be derived or stored for one. The
monobank rate this change caches is not one: it belongs to no transaction, is written by nothing
the owner does, and is read only for the display-only approximation.

#### Scenario: Expense with an original-currency amount round-trips

- **WHEN** an expense of 420000 minor units UAH with an original-currency amount of 10000 minor
  units USD is stored and loaded
- **THEN** the loaded expense holds 420000 minor units UAH, category unchanged, and the
  original-currency amount of 10000 minor units USD

#### Scenario: Cross-currency transfer round-trips with two legs and no rate

- **WHEN** a transfer that left a UAH card as 410000 minor units UAH and arrived at a USD account
  as 10000 minor units USD is stored and loaded
- **THEN** the loaded transfer holds both accounts and both amounts in their own currencies, and
  no exchange rate is stored for it or derived from it

#### Scenario: A cached monobank rate reaches no transaction

- **WHEN** a monobank rate for USD is stored and a cross-currency transfer is loaded
- **THEN** the loaded transfer still holds only its two legs, and nothing on it changes because a
  rate exists

#### Scenario: Income, refund and correction round-trip

- **WHEN** an income of 5000000 minor units UAH with source "salary", a refund of 80000 minor
  units UAH in category "clothes", and a correction of −3000 minor units UAH are stored and loaded
- **THEN** each comes back with its type, amount, currency and category or source unchanged,
  including the correction's negative sign

#### Scenario: Loading an unknown id returns nothing

- **WHEN** a transaction id that was never stored is loaded
- **THEN** no transaction is returned and no error is raised
