## ADDED Requirements

### Requirement: Watched apps survive a restart

The system SHALL store every watch — the app package with the рахунок it maps to — and SHALL
load the same set after storage is reopened; a removed watch SHALL stay removed.

#### Scenario: A watch round-trips

- **WHEN** a watch mapping "ua.privatbank.ap24" to a stored рахунок is stored and storage is
  reopened
- **THEN** the watch loads with the same package and the same рахунок

#### Scenario: A removed watch stays removed

- **WHEN** a stored watch is removed and storage is reopened
- **THEN** no watch for that package loads, while every other watch is unchanged

### Requirement: Чернетки survive a restart until settled

The system SHALL store every pending чернетка whole — its рахунок, date, text, and its
proposal: a витрата of a сума, a дохід of a сума, or raw with no сума and an optional
original-currency reference — and SHALL load it unchanged after storage is reopened. A settled
чернетка (confirmed or dismissed) SHALL NOT load as pending again.

#### Scenario: A pending чернетка round-trips whole

- **WHEN** a raw чернетка with text "FOREIGN 10.00 USD" and 1000 minor units USD as its
  original-currency reference is stored and storage is reopened
- **THEN** it loads pending on the same рахунок with the same date, text and reference

#### Scenario: A settled чернетка does not return

- **WHEN** a чернетка is settled by confirmation or dismissal and storage is reopened
- **THEN** it is not among the pending чернетки

### Requirement: Seen fingerprints are remembered independently of чернетки and транзакції

The system SHALL store every seen fingerprint and SHALL keep it after the чернетка it came
with was confirmed or dismissed and after the транзакція it led to was edited or deleted, so
the same captured notification can never draft twice.

#### Scenario: A deleted транзакція keeps its fingerprint

- **WHEN** a чернетка was confirmed, its транзакція deleted, and storage is reopened
- **THEN** the fingerprint is still remembered and the same captured notification yields
  nothing

### Requirement: A capture outcome commits atomically

The system SHALL store a capture outcome as one unit — the fingerprint together with the
чернетка it drafted, or together with the auto-confirmed транзакція — and if any part cannot
be stored, none SHALL change.

#### Scenario: A failed draft stores no fingerprint

- **WHEN** storing a drafted чернетка is rejected
- **THEN** its fingerprint is not remembered either, so the redelivered capture can draft again

#### Scenario: A committed outcome survives restart whole

- **WHEN** an auto-confirmed витрата commits with its fingerprint and storage is reopened
- **THEN** the витрата and the remembered fingerprint are both present

### Requirement: Notification storage arrives through append-only migrations

The watch, fingerprint and чернетка storage SHALL be introduced only by new migrations that
preserve every existing рахунок, транзакція, категорія, джерело, правило, ліміт, ціль,
monobank and Saldo state and rate cache. No raw capture queue SHALL be stored — the waiting
queue lives with the capture layer, not in the owner's database.

#### Scenario: Existing data survives the migration

- **WHEN** a database holding every stored shape is brought to the current storage shape
- **THEN** every existing value loads unchanged, and watches, fingerprints and чернетки can be
  stored

#### Scenario: A fresh database starts empty of notification state

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** no watch, fingerprint or чернетка exists and each can be stored
