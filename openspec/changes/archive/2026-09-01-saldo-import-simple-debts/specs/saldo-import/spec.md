## REMOVED Requirements

### Requirement: «Борг» legs become перекази on рахунки-борги by the owner's person assignment

**Reason**: the person is gone. The import no longer asks who a historic debt was with, so the
assignment, its per-description and per-transaction forms, and the incomplete plan they could
leave behind have nothing left to describe. Replaced by "«Борг» legs become перекази on the
рахунок-борг «Борги»", which keeps every other rule of the old requirement — the direction of
lending and repayment, and the untouched over-repayment.

## ADDED Requirements

### Requirement: «Борг» legs become перекази on the рахунок-борг «Борги»

A transaction pairing a real leg with a «Борг» EXPENSES leg SHALL become a переказ between that
real рахунок and a рахунок-борг named «Борги» in the currency of the real leg: lending — the
«Борг» leg debited — SHALL move the money from the real рахунок onto «Борги», and a repayment —
the «Борг» leg credited — SHALL move it back. The plan SHALL hold exactly one «Борги» per
currency its «Борг» rows use, SHALL create it only when at least one «Борг» переказ lands on it,
and SHALL ask the owner nothing about it — no person, no name, and the transaction's description
SHALL NOT be read for either. No «Борг» transaction SHALL hold the plan back from being
committed. A repayment SHALL move back exactly what its leg says, even when more has come back
than went out: splitting an over-repayment into principal and «Відсотки» belongs to FR-T9 and is
outside this change — the report shows the resulting negative «Борги» instead.

#### Scenario: Lending lands on «Борги»

- **WHEN** a transaction credits "Monobank UAH, Black" 100000 minor units UAH and debits «Борг»
  with description "борг яріку"
- **THEN** the plan holds a переказ of 100000 minor units UAH from the Black рахунок onto a
  рахунок-борг named «Борги» in UAH, whose розрахунковий баланс thereby shows 100000 minor units
  UAH

#### Scenario: A repayment is the переказ back

- **WHEN** a later transaction debits "Monobank UAH, Black" 100000 minor units UAH and credits
  «Борг» with description "ярік борг повернення"
- **THEN** the plan holds a переказ of 100000 minor units UAH from «Борги» back to the Black
  рахунок, and the розрахунковий баланс of «Борги» returns to 0

#### Scenario: Every «Борг» row lands, whatever its description

- **WHEN** the export holds four «Борг» transactions, two sharing one description and two
  carrying none
- **THEN** all four become перекази on the same UAH «Борги», the plan creates that one
  рахунок-борг, and nothing is listed as awaiting a decision

#### Scenario: Two currencies get two рахунки-борги

- **WHEN** the export holds one «Борг» transaction in UAH and another in USD
- **THEN** the plan holds a UAH «Борги» and a USD «Борги» and neither переказ crosses currencies

#### Scenario: An export with no «Борг» row creates no рахунок-борг

- **WHEN** the export holds no «Борг» leg at all
- **THEN** the plan holds no рахунок-борг «Борги»
