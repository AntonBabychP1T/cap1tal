## ADDED Requirements

### Requirement: A linked рахунок shows the bank balance and can be reconciled

The Рахунки screen SHALL show the latest known баланс банку beside the розрахунковий баланс of a
linked рахунок, both in that рахунок's currency, and SHALL offer «Звірити». Confirming «Звірити»
SHALL create the accounts capability's коригування for the difference and SHALL never overwrite
either balance without a транзакція.

#### Scenario: The two balances remain distinct

- **WHEN** a linked UAH рахунок has a розрахунковий баланс of 47000 minor units and its latest
  баланс банку is 50000 minor units UAH
- **THEN** Рахунки shows both amounts as UAH and offers «Звірити»

#### Scenario: Reconcile explains a surplus

- **WHEN** the owner confirms «Звірити» for those balances
- **THEN** a positive коригування of 3000 minor units UAH is created and the resulting
  розрахунковий баланс is 50000 minor units UAH

#### Scenario: Equal balances create no correction

- **WHEN** a linked рахунок's розрахунковий баланс equals its latest баланс банку and the owner
  chooses «Звірити»
- **THEN** no коригування is created and both balances remain unchanged

