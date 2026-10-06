## MODIFIED Requirements

### Requirement: Unlinked monobank accounts are given link proposals

After a successful client-info answer, the system SHALL propose, for every unlinked monobank
account, either one named existing unlinked рахунок of the same currency whose name the bank's
name for the account matches, or a new рахунок prefilled from the bank's name, currency and
suggested вид. Where the evidence matches more than one рахунок equally well, the system SHALL
propose neither and SHALL say the choice is the owner's. No рахунок SHALL be proposed for more
than one monobank account, and no proposal SHALL be for a рахунок of another currency. A monobank
account known only from an earlier connection's cached answer SHALL be listed but SHALL NOT be
proposed: proposals SHALL be built only from a client-info answer that succeeded during the
current opening of the screen.

#### Scenario: A matching рахунок is proposed by name

- **WHEN** a token shows a UAH card the bank names `black ··4321` and the owner keeps an unlinked
  UAH рахунок named «Monobank Black»
- **THEN** that рахунок is proposed for that card

#### Scenario: Two equally matching рахунки propose nothing

- **WHEN** a token shows a UAH card and two unlinked UAH рахунки match its name equally well
- **THEN** no рахунок is proposed for that card, both are named as the candidates, and the choice
  is left to the owner

#### Scenario: An unrecognised account proposes a new рахунок

- **WHEN** a token shows a USD банка whose name matches no unlinked USD рахунок
- **THEN** a new рахунок is proposed with the банка's name, USD and the suggested вид `savings`

#### Scenario: One рахунок is never proposed twice

- **WHEN** two monobank cards both match one unlinked рахунок best
- **THEN** that рахунок is proposed for one of them only, and the other is given its own proposal

#### Scenario: No successful answer this opening proposes nothing

- **WHEN** the owner opens the monobank screen and no client-info answer has succeeded yet this
  time — none was attempted, or every one attempted failed — however many monobank accounts an
  earlier connection had already shown
- **THEN** no proposal is shown for any of them and there is nothing to accept
