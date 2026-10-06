## MODIFIED Requirements

### Requirement: An account can be created from the screen

The owner SHALL create an account by giving a назва, a вид (`spending`, `savings`, `investment`,
`cash`, `debt`) and a валюта offered from UAH, EUR, PLN and USD; the початковий залишок SHALL be
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

### Requirement: Звірити is offered for every рахунок against a typed фактичний залишок

From a рахунок's рухи the owner SHALL be able to звірити any unarchived рахунок by entering the
фактичний залишок — the actual balance, in the рахунок's own currency, whether or not any bank
feeds it. Before anything is written the screen SHALL name the signed difference the коригування
would carry; on confirmation exactly the accounts capability's коригування SHALL be created, and
neither balance SHALL be overwritten without a транзакція. WHEN the entered фактичний залишок
equals the розрахунковий баланс, nothing SHALL be created and the screen SHALL say so. An entry
that is not an amount in that currency SHALL be rejected and SHALL create nothing.

WHEN the рахунок is linked and a баланс банку is known, the field SHALL offer that balance as a
one-tap value, named as the bank's; it SHALL be entered only when tapped, and the field SHALL
otherwise open empty.

#### Scenario: Cash is brought into line with a recount

- **WHEN** a `cash` рахунок's розрахунковий баланс is 47000 minor units UAH, the owner enters a
  фактичний залишок of "450,00" and confirms
- **THEN** a коригування of −2000 minor units UAH dated today is created on that рахунок and its
  розрахунковий баланс becomes 45000 minor units UAH

#### Scenario: The difference is named before it is written

- **WHEN** the owner enters a фактичний залишок of "500,00" against a розрахунковий баланс of
  47000 minor units UAH
- **THEN** the screen names a коригування of +3000 minor units UAH and creates nothing until the
  owner confirms

#### Scenario: An equal фактичний залишок creates nothing

- **WHEN** the owner enters a фактичний залишок equal to the розрахунковий баланс and confirms
- **THEN** no коригування is created and the screen says the two already agree

#### Scenario: The bank's balance is one tap away

- **WHEN** the owner opens «Звірити» on «platinum ··6628», whose last баланс банку is 2144505 minor
  units UAH
- **THEN** the field is empty and offers «Як у банку: 21 445,05 UAH», which fills it when tapped

#### Scenario: A rejected entry writes nothing

- **WHEN** the owner enters "" or "abc" as the фактичний залишок and confirms
- **THEN** the entry is rejected, the reason is stated, and no коригування is created
