## MODIFIED Requirements

### Requirement: A переказ can be recorded between two accounts

The owner SHALL be able to record a переказ by choosing the account the money left, the account
it arrived at, and the сума that left; choosing the same account as both source and destination
SHALL be rejected. Between accounts of the same currency an optional «скільки прийшло» SHALL
also be offered, defaulting to the сума that left, so an untouched field records the same amount
on both legs; between accounts of different currencies both amounts SHALL be asked — what left
and what arrived — and no комісія SHALL ever be proposed for them, whatever the two numbers are.

WHEN a переказ between accounts of the same currency whose source is not a рахунок-борг is
recorded or edited with «скільки прийшло» smaller than the сума that left, the difference SHALL be
proposed as a витрата "Комісія" — the Ukrainian display label of the reserved "Fees" category, one category, not a
second one — on the account the money left, dated the same day as the переказ, which the owner
accepts or declines. Accepting SHALL store the переказ with the сума that arrived on both legs
together with that витрата, so the account the money left loses exactly the сума that left it
and no розрахунковий баланс counts the комісія twice; declining SHALL store only the переказ,
keeping the сума that left and the сума that arrived on their own legs. A stored переказ whose
legs are equal SHALL propose nothing when it is opened again. No комісія SHALL ever be proposed for
a переказ whose source is a рахунок-борг: a рахунок-борг is a person, not a bank, so a repayment
that arrives short is no fee — what such a переказ may propose instead is the дохід «Відсотки»
below, and only when its two legs are equal, so the two proposals can never both fire.

#### Scenario: Same-currency transfer needs one amount

- **WHEN** the owner records a переказ of 100000 minor units UAH from a card to a jar and leaves
  «скільки прийшло» untouched
- **THEN** a переказ is stored with both accounts and 100000 minor units UAH on each leg, and no
  комісія is proposed

#### Scenario: A short arrival proposes the комісія

- **WHEN** the owner records a UAH переказ of 100000 minor units from a card to a jar and enters
  99500 minor units as «скільки прийшло»
- **THEN** a витрата "Комісія" of 500 minor units UAH on the card is proposed, to accept or
  decline

#### Scenario: Cross-currency transfer asks both legs

- **WHEN** the owner records a переказ from a UAH card, entering 410000 minor units UAH left and
  10000 minor units USD arrived at a USD account
- **THEN** the stored переказ carries both amounts in their own currencies

#### Scenario: A cross-currency переказ proposes no комісія

- **WHEN** a переказ leaves a UAH card as 410000 minor units UAH and arrives at a USD account as
  10000 minor units USD
- **THEN** no комісія is proposed and only the переказ is stored

#### Scenario: Accepted fee proposal records the expense

- **WHEN** the owner records a UAH переказ of 100000 minor units from a card to a jar, enters
  99500 minor units as «скільки прийшло» and accepts the proposed комісія
- **THEN** the stored переказ carries 99500 minor units UAH on both legs, and a витрата of 500
  minor units UAH in category "Комісія" on the card, of the same date, is stored alongside it

#### Scenario: Accepting the комісія keeps the source balance exact

- **WHEN** a card that opened with 1000000 minor units UAH and has no other transactions records
  a UAH переказ of 100000 minor units to a jar arriving as 99500 minor units — whether the
  proposed комісія is accepted or declined
- **THEN** the card's розрахунковий баланс is 900000 minor units UAH and the jar's is 99500 minor
  units UAH

#### Scenario: Declined fee proposal records only the transfer

- **WHEN** the owner records a UAH переказ of 100000 minor units arriving as 99500 minor units
  and declines the proposed комісія
- **THEN** only the переказ is stored, carrying 100000 minor units UAH on the leg that left and
  99500 minor units UAH on the leg that arrived

#### Scenario: The same account on both legs is rejected

- **WHEN** the owner chooses the same account as both the source and the destination of a переказ
- **THEN** recording is rejected and nothing is stored

#### Scenario: A repayment arriving short proposes no комісія

- **WHEN** the owner records a UAH переказ of 110000 minor units from the рахунок-борг "Ярослав"
  to a card and enters 109500 minor units as «скільки прийшло»
- **THEN** no комісія is proposed and only the переказ is stored, carrying 110000 minor units UAH
  on the leg that left and 109500 on the leg that arrived

## ADDED Requirements

### Requirement: A repayment above the principal proposes дохід «Відсотки»

WHEN a переказ whose source is a рахунок-борг is recorded or edited with the сума that left equal
to the сума that arrived and greater than that рахунок-борг's розрахунковий баланс before this
переказ, and the destination рахунок is of the same currency and is not itself a рахунок-борг, the
excess SHALL be proposed as a дохід with the reserved джерело «Відсотки» on the destination
рахунок, dated the same day as the переказ, which the owner accepts or declines.

Accepting SHALL store the переказ carrying only the principal — the рахунок-борг's balance before
it — on both legs, together with that дохід, so the person's рахунок-борг returns to exactly
nothing owed and the excess counts as дохід for the month, never as a повернення and never as a
коригування. Declining SHALL store the переказ as the owner entered it, leaving that рахунок-борг
below zero.

Nothing SHALL be proposed when the рахунок-борг's balance before the переказ is not above zero,
when the сума that left is not greater than it, when the two legs differ, when the two рахунки are
of different currencies, or when the destination is a рахунок-борг too. A stored переказ SHALL
propose nothing when it is opened again unless it still exceeds the balance its рахунок-борг had
before it — that balance being the рахунок-борг's розрахунковий баланс with this переказ's own
effect excluded, so merely reopening an unchanged repayment proposes nothing twice. A дохід
«Відсотки» stored earlier alongside a переказ is a separate transaction and SHALL be left
untouched when that переказ is edited or deleted — the owner edits or deletes it in the feed like
any other дохід.

#### Scenario: Repaying more than owed proposes the interest

- **WHEN** the рахунок-борг "Ярослав" stands at 100000 minor units UAH owed and the owner records
  a переказ of 110000 minor units UAH from it to a UAH card
- **THEN** a дохід of 10000 minor units UAH with the джерело «Відсотки» on the card is proposed,
  to accept or decline

#### Scenario: Accepting leaves the debt at nothing and the excess as income

- **WHEN** the owner accepts that proposal
- **THEN** the stored переказ carries 100000 minor units UAH on both legs, a дохід of 10000 minor
  units UAH with джерело «Відсотки» on the card of the same date is stored alongside it, the
  рахунок-борг "Ярослав" stands at 0, and the month counts 10000 minor units UAH as дохід

#### Scenario: Declining stores the repayment as entered

- **WHEN** the owner declines that proposal
- **THEN** only the переказ is stored, carrying 110000 minor units UAH on both legs, and the
  рахунок-борг "Ярослав" stands at −10000 minor units UAH

#### Scenario: Repaying exactly the principal proposes nothing

- **WHEN** the рахунок-борг stands at 100000 minor units UAH owed and the owner records a переказ
  of 100000 minor units UAH from it to a UAH card
- **THEN** no дохід is proposed and only the переказ is stored

#### Scenario: A переказ into a рахунок-борг proposes nothing

- **WHEN** the owner records a переказ of 500000 minor units UAH from a card onto the рахунок-борг
  "Ярослав"
- **THEN** no дохід «Відсотки» is proposed — the money was lent, not repaid

#### Scenario: A repayment onto another рахунок-борг proposes nothing

- **WHEN** a переказ of 110000 minor units UAH leaves the рахунок-борг "Ярослав", standing at
  100000, and arrives at the рахунок-борг "Оля"
- **THEN** no дохід «Відсотки» is proposed and only the переказ is stored

#### Scenario: A cross-currency repayment proposes nothing

- **WHEN** a переказ leaves a UAH рахунок-борг standing at 100000 minor units UAH as 110000 minor
  units UAH and arrives at a USD рахунок
- **THEN** no дохід «Відсотки» is proposed and only the переказ is stored

#### Scenario: Editing a repayment up proposes the interest

- **WHEN** a stored переказ of 100000 minor units UAH from the рахунок-борг "Ярослав" — whose
  balance before it was 100000 — is edited to 110000 minor units UAH on both legs
- **THEN** a дохід of 10000 minor units UAH with the джерело «Відсотки» is proposed

#### Scenario: Reopening an unchanged repayment proposes nothing

- **WHEN** a stored переказ of 100000 minor units UAH from a рахунок-борг whose balance before it
  was 100000 is opened again and nothing is changed
- **THEN** no дохід «Відсотки» is proposed

#### Scenario: An accepted дохід «Відсотки» survives editing its переказ

- **WHEN** a переказ whose дохід «Відсотки» was accepted is edited to another amount
- **THEN** that дохід is still stored, unchanged, as its own transaction in the feed
