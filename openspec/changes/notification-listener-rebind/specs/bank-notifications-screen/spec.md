## MODIFIED Requirements

### Requirement: The «Сповіщення банків» section explains the permission and reports its state

The «Сповіщення банків» section SHALL state what reading bank notifications is for and that
nothing read leaves the phone, and SHALL show notification access as the device reports it.
While access is denied it SHALL offer opening the system screen where the owner grants it, and
SHALL show the fresh state when the owner returns. While granting is not possible on this build
it SHALL say reading bank notifications is not available and SHALL offer no way to grant.
While access is granted it SHALL show the watched apps management.

WHILE access is switched on but the capture layer is not receiving notifications, the section
SHALL say that сповіщення are not being read rather than report the access as granted, SHALL
say what restores it — switching the access off and on again in the system settings — and SHALL
offer the system screen where that is done. It SHALL keep showing the watched apps management in
that state: the watched apps are unaffected by it, and taking the list away would hide the very
thing the owner came to check.

#### Scenario: Granting flips the section to granted

- **WHEN** the section shows denied, the owner opens the offered system screen, grants access
  there and returns
- **THEN** the section shows granted and offers the watched apps management

#### Scenario: An unsupported build offers nowhere to go

- **WHEN** the owner opens the section on a build where notification access cannot be granted
- **THEN** the section says reading bank notifications is not available and offers no system
  screen

#### Scenario: Revoked access is reported as denied again

- **WHEN** access was granted, the owner revokes it in the system settings and reopens the
  section
- **THEN** the section shows denied and offers the system screen again

#### Scenario: A switched-on but silent capture layer is reported and explained

- **WHEN** the owner opens the section while access is switched on and the capture layer is not
  receiving notifications
- **THEN** the section says сповіщення are not being read, says that switching the access off
  and on again in the system settings restores it, offers that system screen, and still shows
  the watched apps management

### Requirement: Waiting captures are collected, decided and stored atomically

WHEN the app opens or returns to the foreground while notification access is switched on, the
system SHALL collect the waiting captured notifications and decide each one against the stored
watches, the remembered fingerprints and the owner's правила. Each decided outcome SHALL be
stored atomically — the fingerprint together with the чернетка it drafted, or together with
the транзакція it auto-confirmed — and a collected notification SHALL be acknowledged to the
capture layer only after its outcome is safely stored; an outcome that stores nothing (an
unwatched package, an already-seen fingerprint) SHALL be acknowledged without storing. A
redelivered capture SHALL yield nothing the second time, so a crash between collecting and
storing loses nothing and doubles nothing.

The collection SHALL run while access is switched on but the capture layer is not receiving
notifications, exactly as it does while access is granted: what the capture layer heard before
it fell silent is still waiting on the device, and stranding it would lose транзакції the owner
can no longer recover any other way. WHILE that state holds and at least one відстежуваний
застосунок remains, the app SHALL announce it as a сповіщення про збій exactly as it announces a
collection that failed — from where the owner stands, транзакції have stopped arriving either way
— and a further collection in the same state SHALL NOT add a second one.

#### Scenario: A notification captured while the app was closed becomes a чернетка

- **WHEN** a watched app posted a purchase notification while the app was not running, and the
  owner opens the app
- **THEN** a чернетка proposing that витрата awaits on Головний, on the watch's рахунок

#### Scenario: A crash before acknowledgement does not double the чернетка

- **WHEN** a collection's чернетка was stored but the acknowledgement never happened, and the
  app collects again
- **THEN** exactly one чернетка exists for that notification and the redelivery is acknowledged
  with nothing new stored

#### Scenario: A правило match lands in the feed without waiting

- **WHEN** the правило "сільпо → Groceries" exists and a watched app's parsed money-out
  notification containing "СІЛЬПО" is collected
- **THEN** a витрата in Groceries is stored and appears in the feed, and no чернетка awaits the
  owner

#### Scenario: Outcomes that store nothing still drain the queue

- **WHEN** a collection hands over a notification whose fingerprint is already remembered
- **THEN** nothing new is stored, the capture is acknowledged, and the next collection hands
  over nothing for it

#### Scenario: What was captured before the silence is still collected

- **WHEN** captured notifications are waiting from before the capture layer stopped receiving,
  access is still switched on, and the owner opens the app
- **THEN** those captured notifications are collected, decided and stored exactly as they would
  have been had the capture layer never fallen silent

#### Scenario: A capture layer that stopped receiving is announced

- **WHEN** the app collects while access is switched on, the capture layer is not receiving
  notifications and at least one відстежуваний застосунок remains
- **THEN** one сповіщення про збій is raised leading to «Сповіщення банків», and a second
  collection in the same state adds no second one
