## MODIFIED Requirements

### Requirement: An account can be created from the screen

The owner SHALL create an account by giving a назва, a вид (`spending`, `savings`, `investment`,
`cash`, `debt`) and a валюта offered from UAH, EUR and USD; the початковий залишок SHALL be
optional and default to zero. The created account SHALL appear on the screen and be offered when
a transaction is recorded.

«Рахунки» SHALL offer creating exactly one way at a time, under one name. While the screen is
inviting the first рахунок in words, the wordless «+» in its header SHALL NOT also be drawn; once
рахунки are on screen, that «+» SHALL be the offer. No two controls of this screen SHALL carry the
same accessible name.

#### Scenario: A created account is usable immediately

- **WHEN** the owner creates a `cash` account "гаманець" in UAH without an opening balance
- **THEN** it appears under its вид with a balance of 0 minor units UAH and is offered as an
  account choice when recording a transaction

#### Scenario: The screen invites the first рахунок

- **WHEN** the owner opens Рахунки while no account exists
- **THEN** no вид groups and no archived group are shown, and the screen offers creating the
  first рахунок

#### Scenario: The empty screen offers creating once

- **WHEN** the owner opens Рахунки while no account exists
- **THEN** «Створити рахунок» is offered once, in the empty state's own words, and the header
  carries no «+» beside it

#### Scenario: A screen with рахунки offers the header «+»

- **WHEN** the owner opens Рахунки while at least one рахунок exists
- **THEN** the header offers creating, named «Створити рахунок» for a screen reader, and it is the
  only control that offers it
