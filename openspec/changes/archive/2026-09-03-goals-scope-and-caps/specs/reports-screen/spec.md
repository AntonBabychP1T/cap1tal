## ADDED Requirements

### Requirement: Choosing a ціль on Звіти opens what explains it

Every ціль listed on «Звіти» SHALL be choosable, and choosing one SHALL open what explains that
kind of ціль: a ціль-накопичення SHALL open its own breakdown screen, and a ціль витрат SHALL open
the existing категорія screen for its категорія and the month it is shown for. «Звіти» SHALL NOT
list the транзакції of a ціль itself.

#### Scenario: A ціль-накопичення opens its breakdown

- **WHEN** the owner chooses «Машина» in the цілі list
- **THEN** the breakdown screen of «Машина» opens, showing the внесок of every рахунок of its склад

#### Scenario: A ціль витрат opens its категорія's month

- **WHEN** the owner chooses the ціль витрат «Ресторани», shown for the current month
- **THEN** the категорія screen for Ресторани in that month opens

## MODIFIED Requirements

### Requirement: The цілі are shown with their progress

The «Звіти» tab SHALL list every ціль, and SHALL keep the two kinds visibly apart: the
цілі-накопичення in one group and the цілі витрат in another, each group named, so a ціль moving
toward a сума the owner wants is never read as a ціль moving toward a сума they do not.

A **ціль-накопичення** SHALL be listed with its назва, its progress and its target сума with
currency, the percentage of the target it stands at, its дата where it has one, and how many
рахунки its склад holds. A reached ціль SHALL be visibly marked reached; an overdue ціль SHALL be
visibly marked overdue; an approximate progress SHALL be visibly marked approximate; and a ціль
whose progress cannot be counted SHALL say so in place of its progress and percentage, and SHALL be
marked neither reached nor overdue.

A **ціль витрат** SHALL be listed with its категорія's назва, the current month's spent of that
категорія and the ceiling with their currency, the month it is about, and — while it is within its
ceiling — how much may still be spent, or — once exceeded — by how much it was exceeded. No
percentage SHALL be shown for an exceeded ціль витрат, and nothing about a ціль витрат SHALL read
as reached, done or complete.

A ціль витрат whose категорія is archived SHALL still be listed, visibly set apart the way the
«Ліміти» section sets such a ліміт apart, so a leftover ceiling can be found and cleared rather
than quietly kept — «every ліміт is a ціль витрат» holds for an archived категорія too.

WHEN no ціль of either kind exists the tab SHALL say so plainly. WHEN цілі of only one kind exist,
only that group SHALL be shown.

#### Scenario: A ціль shows its progress

- **WHEN** «Машина» targets 70000000 minor units UAH over four рахунки and its progress is 48730000
  minor units UAH
- **THEN** «Машина» is listed with 48730000 of 70000000 minor units UAH, 69 %, and that it counts
  four рахунки

#### Scenario: A ціль витрат shows what is left of its month

- **WHEN** the ціль витрат «Ресторани» has a ceiling of 200000 minor units UAH and the current
  month's spent in Ресторани is 132000 minor units UAH
- **THEN** «Ресторани» is listed with 132000 of 200000 minor units UAH, the current month, and
  68000 minor units UAH that may still be spent

#### Scenario: An exceeded ціль витрат shows the excess and no percentage

- **WHEN** the current month's spent in Ресторани is 248000 minor units UAH against a ceiling of
  200000
- **THEN** «Ресторани» is listed as exceeded by 48000 minor units UAH, and no percentage is shown
  for it

#### Scenario: The two kinds are not mixed together

- **WHEN** both цілі-накопичення and цілі витрат exist
- **THEN** they are listed in two named groups, and no row of one group is drawn among the other

#### Scenario: A reached ціль is marked

- **WHEN** a ціль-накопичення's progress is at or above its target
- **THEN** it is visibly marked reached

#### Scenario: An overdue ціль is marked

- **WHEN** a ціль-накопичення's дата has passed and its progress is below its target
- **THEN** it is visibly marked overdue

#### Scenario: An approximate progress is marked

- **WHEN** a ціль-накопичення's progress holds a converted внесок
- **THEN** its progress is visibly marked approximate

#### Scenario: A progress that cannot be counted says so

- **WHEN** a ціль-накопичення's склад holds a currency the app has no rate for
- **THEN** the row says the progress cannot be counted now instead of showing a progress and a
  percentage, and it is marked neither reached nor overdue

#### Scenario: A ціль витрат of an archived категорія is set apart, not hidden

- **WHEN** Pets is archived while carrying a ліміт of 100000 minor units UAH
- **THEN** the ціль витрат «Pets» is listed among the цілі витрат, visibly set apart as archived

#### Scenario: No цілі is said plainly

- **WHEN** no ціль of either kind exists and the owner opens «Звіти»
- **THEN** the tab states there are no цілі yet
