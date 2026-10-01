## ADDED Requirements

### Requirement: The last sync attempt and how it ended survive a restart

The moment of the last sync attempt and the outcome it was remembered as SHALL survive closing and
reopening the app: reading them SHALL yield exactly what was last written. Exactly one attempt
SHALL be kept — the latest — so writing a new one replaces the one before it rather than adding to
a history. A device on which nothing has ever been attempted SHALL answer with the absence of an
attempt, never with a moment of zero or an outcome standing in for one. An attempt whose run has
not reported SHALL be readable as a moment with no outcome — a third answer, distinct both from
an attempt that ended and from no attempt at all.

Nothing of the token and nothing read from a statement SHALL be stored with the attempt: it is a
moment and one of the outcomes the monobank capability names, and no more.

#### Scenario: An attempt is read back as it was written

- **WHEN** an attempt is remembered as rate-limited at a given moment and storage is reopened
- **THEN** reading yields that same moment and rate-limited

#### Scenario: A later attempt replaces the earlier one

- **WHEN** an attempt remembered as unavailable is followed by one remembered as complete
- **THEN** reading yields the later moment and complete, and the earlier attempt is not readable

#### Scenario: An attempt without an outcome round-trips as one

- **WHEN** an attempt is stored with a moment and no outcome and storage is reopened
- **THEN** reading yields that moment and no outcome, and it is not read as an absent attempt

#### Scenario: A device that never attempted says so

- **WHEN** nothing has ever been attempted and storage is read
- **THEN** the answer is that no attempt exists, and it is not a moment of zero

### Requirement: The remembered attempt arrives through an append-only migration that keeps stored rows

The storage for the remembered attempt SHALL arrive as a new migration applied on top of every
committed one, leaving those unchanged. Applying it to a database already holding рахунки,
транзакції, monobank links, imported item ids and per-account last-sync moments SHALL leave every
one of those rows exactly as it was.

#### Scenario: The migration adds storage and touches nothing

- **WHEN** the new migration is applied to a database holding рахунки, транзакції, monobank links,
  imported item ids and last-sync moments
- **THEN** the attempt can be stored and read, and every previously stored row is unchanged

#### Scenario: An empty database reaches the current shape

- **WHEN** every committed migration is applied in order to an empty database
- **THEN** the remembered attempt can be written and read back

### Requirement: The remembered attempt stays on the phone that made it

The remembered attempt SHALL NOT travel in a бекап, and restoring a бекап SHALL leave whatever
attempt this device holds exactly as it was. It is what *this* phone last tried and how that went
— operational state about one device, like the сповіщення про збій standing on it and the рахунок
its entry form opens on — and a moment carried from another phone would make this one skip a sync
it has never made, or claim a failure it never had.

#### Scenario: A бекап carries no attempt

- **WHEN** a бекап is made on a device whose last sync attempt is remembered
- **THEN** the file contains no attempt, while every рахунок, транзакція and monobank link of that
  device is in it

#### Scenario: A restore leaves this phone's attempt alone

- **WHEN** a бекап made on another device is restored onto a phone whose last attempt was
  remembered ten minutes ago as complete
- **THEN** that attempt is still remembered, with the same moment and the same outcome
