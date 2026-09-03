## RENAMED Requirements

- FROM: `### Requirement: The пакет carries every ціль with what remains`
- TO: `### Requirement: The пакет carries every ціль-накопичення with what remains`

## MODIFIED Requirements

### Requirement: The пакет carries every ціль-накопичення with what remains

The пакет SHALL carry every **ціль-накопичення** with its назва, target сума with currency, its
дата where it has one, and — where its progress is exact — that progress as the goals capability
defines it, the remaining сума, whether it is reached or overdue, and the months left to its дата
with the сума per month that would reach it. The months left SHALL be the number
of calendar months from the month the пакет is built in through the month of the дата, both
included — the current month counts whatever day it is — and 0 when the дата lies before the day
the пакет is built for; the сума per month SHALL be absent when the ціль is reached or no month
is left. It SHALL NOT name the рахунки behind the ціль, their назви, their виды or their number.

A ціль-накопичення **without a дата** SHALL be carried with its назва, target, progress, remaining
and whether it is reached, and with no дата, no months left and no сума per month: there is no
pace toward a deadline that does not exist, and it SHALL NOT be overdue.

A ціль-накопичення whose progress is **not exact** — its склад holding a рахунок in a currency
other than the ціль's, so that the progress would rest on a conversion — SHALL be carried with its назва, target and дата, and with **no progress, no
remaining, no reached or overdue verdict and no pace**, stated as a ціль whose progress is not in
the пакет. The пакет SHALL NOT convert anything, SHALL NOT mix currencies in one сума, and SHALL
NOT carry an approximate сума: every сума the пакет holds is exact and in one currency, and a
progress that cannot be both is left out rather than softened.

A **ціль витрат** SHALL NOT be carried among the цілі: it is the ліміт of its категорія, which the
пакет already carries, and a second row for the same ceiling would let the assistant read one
ліміт as two.

The цілі SHALL be carried in one order, whatever order the stored rows were read in: the цілі that
have a дата first, by that дата and then by назва, and the цілі with no дата after them, by назва.
A дата-less ціль cannot be placed among dated ones by a comparison against a дата it does not have —
every such comparison is false, which makes the order depend on the read order and breaks the
пакет's own determinism.

#### Scenario: A ціль's pace

- **WHEN** the ціль «Авто» targets 20000000 minor units UAH by 2026-12-31 over one UAH рахунок, its
  progress is 5000000 minor units UAH, and the пакет is built for 2026-09-01
- **THEN** the пакет carries «Авто» with remaining `150000.00 UAH`, 4 months left and
  `37500.00 UAH` per month, not reached and not overdue, and names no рахунок

#### Scenario: A month started still counts

- **WHEN** the same ціль is in the пакет built for 2026-09-15
- **THEN** it still has 4 months left and `37500.00 UAH` per month

#### Scenario: An overdue ціль has no pace

- **WHEN** the ціль «Авто» is not reached and the пакет is built for 2027-01-10
- **THEN** it is overdue, has 0 months left and no сума per month

#### Scenario: A ціль over several UAH рахунки carries their sum

- **WHEN** the ціль «Резерв» targets 30000000 minor units UAH over three UAH рахунки holding
  5000000, 4000000 and 1000000 minor units UAH
- **THEN** the пакет carries «Резерв» with a progress of `100000.00 UAH` and remaining
  `200000.00 UAH`, and names none of the three рахунки

#### Scenario: A ціль without a дата has no pace and is not overdue

- **WHEN** the ціль «Резерв» has no дата and its progress is below its target
- **THEN** the пакет carries it with its target, progress and remaining, with no дата, no months
  left and no сума per month, and it is not overdue

#### Scenario: A ціль whose progress would need a rate carries no progress

- **WHEN** the ціль «Машина» targets 70000000 minor units UAH over a UAH рахунок and a USD рахунок
- **THEN** the пакет carries «Машина» with its target and its дата, states that its progress is not
  in the пакет, and carries no progress, no remaining, no verdict and no pace

#### Scenario: No сума of the пакет is approximate

- **WHEN** a пакет is built on a device holding the ціль «Машина» above
- **THEN** no сума in the пакет is marked approximate and no сума in it mixes two currencies

#### Scenario: The цілі of the пакет are in one order whatever order they were read in

- **WHEN** a пакет is built twice from the same цілі — one with a дата in 2026-12, one with a дата
  in 2027-06 and two with no дата at all — the stored rows handed over in a different order the
  second time
- **THEN** the two пакети carry the цілі in the same order: the two dated ones first by their дата,
  then the two дата-less ones by назва

#### Scenario: A ціль витрат is in the пакет only as its ліміт

- **WHEN** a пакет is built on a device where Ресторани carries a ліміт of 200000 minor units UAH,
  which is the ціль витрат «Ресторани»
- **THEN** the пакет carries that ceiling once, among the ліміти, and the цілі of the пакет hold no
  row for Ресторани
