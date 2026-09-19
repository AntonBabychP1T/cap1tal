## ADDED Requirements

### Requirement: Storage serves two openings of it at once

The same stored data can be open more than once at the same time: a chance the phone gives — for
the фоновий прогін or for the Drive бекап — is served by its own opening of storage, on its own
thread, and that opening can outlive the app being swiped away. A read SHALL NOT be refused because
another opening is reading or writing at that moment, and a write committed by one opening SHALL
NOT leave storage refusing reads to the others. References SHALL be enforced on every opening, not
only on the first.

#### Scenario: A commit that meets a reader leaves storage readable

- **WHEN** one opening of storage is partway through a read, a second opening stores an expense,
  and a third opening then reads the transactions
- **THEN** the expense is stored, and the third read is answered and includes it

#### Scenario: References are enforced on a second opening

- **WHEN** storage is opened a second time and an expense referencing an account id that does not
  exist is stored through that second opening
- **THEN** that opening rejects it, exactly as the first one does

### Requirement: A write waits for its turn, within a bound

Only one opening can write at a time. A write that meets another opening's write SHALL wait until
that write finishes and SHALL then be stored — including a change that reads something before it
stores. The wait SHALL be bounded: a write still
blocked when the bound passes SHALL fail with an error rather than wait forever, and SHALL leave
storage as it was.

#### Scenario: A second writer waits and lands

- **WHEN** one opening of storage is holding a write for a fifth of a second, and another opening
  stores an expense during it
- **THEN** the second opening's expense is stored once the first write finishes, and no error is
  raised

#### Scenario: A change that reads before it stores still waits for its turn

- **WHEN** another opening is holding a write for a fifth of a second, and during it an opening
  begins a change that reads the рахунки and then stores an expense
- **THEN** the change waits until the other write finishes, both expenses are stored, and no error
  is raised

#### Scenario: A wait that outlasts the bound fails and changes nothing

- **WHEN** an opening of storage whose bound is a tenth of a second tries to store an expense
  while another opening holds a write for longer than that
- **THEN** the store fails with an error, and the expense is not in storage afterwards

### Requirement: Opening storage never fails because another opening is busy

Opening storage SHALL succeed and the opening SHALL be usable for reading and writing even when
another opening holds storage busy for longer than the bound at the moment it is opened.

#### Scenario: Storage opened while another opening is busy is usable

- **WHEN** one opening of storage is partway through a read that lasts past the bound, and storage
  is opened a second time with that bound
- **THEN** the second opening raises no error, and once the first read ends it reads the рахунки
  and stores an expense

### Requirement: Migrations applied from two places at once are applied once

The app applies the committed migrations when it opens, and so does a chance the phone gives when
it lands on a process that has not. When both do so at the same moment, each committed migration
SHALL be applied exactly once, and neither SHALL fail because the other applied it first.

#### Scenario: Two openings migrate the same storage at once

- **WHEN** storage has a migration pending, one opening is applying it and has not yet finished,
  and a second opening starts applying the committed migrations
- **THEN** both finish without an error, the migration is recorded as applied once, and storage
  holds accounts and every transaction type
