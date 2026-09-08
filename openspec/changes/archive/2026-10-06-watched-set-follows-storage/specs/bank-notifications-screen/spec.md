## MODIFIED Requirements

### Requirement: Waiting captures are collected, decided and stored atomically

WHEN the app opens or returns to the foreground while notification access is granted, the
system SHALL first tell the capture layer the packages of the stored відстежувані застосунки,
the monobank family excepted, so the set the capture layer applies is the set of відстежувані
застосунки storage holds — on the first collection after a відновлення replaced them, and again
on every collection after it, never once per run of the app. A package of the monobank family
SHALL be left out of what is told rather than making the whole set refused: monobank is never
watched, and one such stored watch must not stop every other відстежуваний застосунок from being
applied. A build where capture cannot work SHALL leave everything as it was and SHALL NOT stop
the collection: it proceeds and reports exactly what it would have reported without it.

It SHALL then collect the waiting captured notifications and decide each one against the stored
watches, the remembered fingerprints and the owner's правила. Each decided outcome SHALL be
stored atomically — the fingerprint together with the чернетка it drafted, or together with
the транзакція it auto-confirmed — and a collected notification SHALL be acknowledged to the
capture layer only after its outcome is safely stored; an outcome that stores nothing (an
unwatched package, an already-seen fingerprint) SHALL be acknowledged without storing. A
redelivered capture SHALL yield nothing the second time, so a crash between collecting and
storing loses nothing and doubles nothing.

#### Scenario: A collection after a відновлення reads the restored watches

- **WHEN** a відновлення replaced the stored відстежувані застосунки with a бекап's, telling the
  capture layer nothing, and the app then collects
- **THEN** the capture layer has been told exactly the packages those restored watches name,
  before anything was collected

#### Scenario: A collection tells the capture layer the stored watches

- **WHEN** two apps are watched and the app collects
- **THEN** the capture layer was told exactly those two packages before anything was collected

#### Scenario: No watches tells the capture layer to watch nothing

- **WHEN** no app is watched and the app collects, with nothing waiting on the device
- **THEN** the capture layer was told the empty set all the same

#### Scenario: Watches changed between two collections are told again

- **WHEN** the app collects, the stored відстежувані застосунки then change without the capture
  layer being told, and the app collects a second time
- **THEN** the second collection told the capture layer the new set, not only the first one

#### Scenario: A stored monobank watch does not disable the others

- **WHEN** the stored відстежувані застосунки name a package of the monobank family alongside
  another bank's app, and the app collects
- **THEN** the capture layer was told the other bank's package and not the monobank one, so that
  app is read and monobank stays uncaptured

#### Scenario: A build that cannot capture still collects

- **WHEN** the app collects on a build where telling the capture layer a watched set answers that
  capture cannot work here
- **THEN** the collection carries on and reports what it always would, and nothing crashes

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
