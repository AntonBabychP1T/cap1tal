## Purpose

The ціль of the glossary: "set aside N by a date", with progress shown. A ціль names a target
сума and a дата on one рахунок, and its progress is that рахунок's розрахунковий баланс — never
a second, hand-maintained number that could drift from the stored truth.

## ADDED Requirements

### Requirement: A ціль holds назва, target and дата on one рахунок

The owner SHALL be able to create a ціль with a назва, a target сума, a дата and one linked
рахунок. The target сума SHALL be a positive integer minor-units amount in the linked рахунок's
currency. A назва that is empty after trimming SHALL be rejected; a target that is not positive
SHALL be rejected. Any number of цілі may exist, several on the same рахунок included.

#### Scenario: A created ціль exists with its fields

- **WHEN** the owner creates the ціль «Авто» for 20000000 minor units UAH by 2026-12-31 on a UAH
  рахунок
- **THEN** the ціль «Авто» exists with that target, that дата and that рахунок

#### Scenario: An empty назва is rejected

- **WHEN** the owner submits a ціль whose назва is only spaces
- **THEN** creation is rejected and nothing is stored

#### Scenario: A non-positive target is rejected

- **WHEN** the owner submits a ціль with a target of 0 minor units
- **THEN** creation is rejected and nothing is stored

#### Scenario: Two цілі may share one рахунок

- **WHEN** the owner creates two цілі linked to the same рахунок
- **THEN** both цілі exist, each with its own назва, target and дата

### Requirement: A ціль can be edited and deleted

The owner SHALL be able to change a ціль's назва, target, дата and linked рахунок, and to delete
a ціль. WHEN the linked рахунок is changed to a рахунок of a different currency, the target SHALL
be entered anew in the new рахунок's currency — nothing is converted. Deleting a ціль SHALL
remove only the ціль: no рахунок and no транзакція is touched by it.

#### Scenario: An edited target persists

- **WHEN** the owner changes a ціль's target from 20000000 to 25000000 minor units UAH
- **THEN** the same ціль now holds the target of 25000000 minor units UAH

#### Scenario: Re-linking to another currency asks the target anew

- **WHEN** the owner moves a ціль with a target of 20000000 minor units UAH onto a USD рахунок
  and enters "5000.00" as the new target
- **THEN** the same ціль holds a target of 500000 minor units USD on the USD рахунок, and no UAH
  amount remains on it

#### Scenario: Deleting a ціль touches no money

- **WHEN** the owner deletes a ціль linked to a рахунок holding транзакції
- **THEN** the ціль is gone and the рахунок, its транзакції and its розрахунковий баланс are
  unchanged

### Requirement: Progress is the linked рахунок's розрахунковий баланс

A ціль's progress SHALL be the linked рахунок's розрахунковий баланс, read at the moment the
ціль is shown. No progress SHALL ever be entered by hand and no money SHALL ever be assigned to
a ціль directly: money reaches a ціль only the way money reaches its рахунок. An archived
рахунок SHALL keep feeding its ціль's progress.

#### Scenario: A transfer into the рахунок moves the progress

- **WHEN** a ціль is linked to a jar whose розрахунковий баланс is 5000000 minor units UAH and a
  переказ of 1000000 minor units UAH arrives at the jar
- **THEN** the ціль's progress is 6000000 minor units UAH

#### Scenario: An archived рахунок still feeds its ціль

- **WHEN** the рахунок a ціль is linked to is archived
- **THEN** the ціль's progress is still that рахунок's розрахунковий баланс

### Requirement: A ціль is reached at its target and overdue past its дата

A ціль SHALL be reached when its progress is greater than or equal to its target. A ціль SHALL
be overdue when its дата has passed and it is not reached. A reached ціль SHALL remain until the
owner deletes it.

#### Scenario: Progress equal to the target reaches the ціль

- **WHEN** a ціль's target is 20000000 minor units UAH and its рахунок's розрахунковий баланс is
  exactly 20000000 minor units UAH
- **THEN** the ціль is reached

#### Scenario: Progress below the target is not reached

- **WHEN** a ціль's target is 20000000 minor units UAH and its рахунок's розрахунковий баланс is
  19999999 minor units UAH
- **THEN** the ціль is not reached

#### Scenario: A past дата without the target is overdue

- **WHEN** a ціль's дата was last year and its progress is below its target
- **THEN** the ціль is overdue

#### Scenario: A reached ціль is never overdue

- **WHEN** a ціль's дата was last year and its progress is at its target
- **THEN** the ціль is reached and not overdue
