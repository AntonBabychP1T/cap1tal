## ADDED Requirements

### Requirement: Припущення, «Ні» and the switch survive a restart

The switch of the local model and the counts of accepted and refused припущення per kind SHALL
survive a restart, reading as off with no counts when never set. Every shown припущення, every «Ні»,
every dropped-answer mark and every failed-question count SHALL survive likewise, each tied to the
thing it is about as it then stood, and a dropped-answer mark or a failed-question count also to the
model and the way it was asked. They SHALL live only on the device.

#### Scenario: A shown припущення comes back

- **WHEN** a витрата shows «Схоже на: COFFEE ☕», another витрата carries a «Ні», and storage is
  closed and reopened
- **THEN** the first still shows «Схоже на: COFFEE ☕» and the second still carries its «Ні»

#### Scenario: The switch defaults to off

- **WHEN** storage that never stored the switch is read
- **THEN** the local model is off and every count is zero

### Requirement: A припущення goes with the thing it is about

Removing a транзакція or a чернетка SHALL remove every припущення, «Ні» and mark about it, and
nothing SHALL refuse the removal. A stored припущення SHALL name a thing storage holds: a транзакція,
a чернетка, or a «Без продавця» group by its key. A rejected write SHALL leave storage as it was.

#### Scenario: A deleted витрата takes its припущення

- **WHEN** a витрата showing «Схоже на: COFFEE ☕» is deleted
- **THEN** no припущення about it remains and the deletion was not refused

### Requirement: Припущення arrive by a new append-only migration

Applying every committed migration in order to an empty database SHALL produce storage that holds
припущення and the switch alongside everything the earlier migrations already hold. Rows stored
under the earlier migrations SHALL survive the new one unchanged, no припущення SHALL exist, and the
switch SHALL read off. Committed migrations SHALL NOT be edited.

#### Scenario: Existing data survives the migration

- **WHEN** рахунки, транзакції, продавці, правила and чернетки stored under the earlier migrations
  are read after the new migration is applied
- **THEN** every row is exactly what it was, there is no припущення, and the local model is off

### Requirement: The snapshot leaves припущення out

The whole stored state read as one snapshot SHALL NOT include any припущення, «Ні», mark, count or
the switch: they are this phone's dealings with its own model. Replacing the stored state by a
snapshot SHALL forget every припущення, «Ні» and mark, because the things they were about are
replaced too. It SHALL leave the switch as it was.

#### Scenario: A replace forgets the припущення and keeps the switch

- **WHEN** storage with the switch on and five припущення is replaced by a snapshot
- **THEN** no припущення remains and the switch is still on
