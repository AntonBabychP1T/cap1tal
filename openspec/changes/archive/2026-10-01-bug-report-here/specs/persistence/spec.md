## ADDED Requirements

### Requirement: How a репорт was opened survives a restart

Storage SHALL keep, with every репорт про помилку, how it was opened — from the screen itself, from
a failure dialog, from the crash fallback, or from «Репорти про помилки» — and SHALL load it back
unchanged. A репорт stored before this was recorded SHALL load with no origin rather than a guessed
one, and SHALL otherwise be unchanged.

Storage SHALL likewise keep, with a репорт whose скріншот could not be taken, the reason it could
not, and SHALL load it back unchanged. A репорт that has a скріншот, and a репорт that was never
going to have one, SHALL both load with no such reason rather than an invented one.

#### Scenario: The origin comes back

- **WHEN** a репорт opened from the screen itself is stored and storage is reopened
- **THEN** it loads with everything it held and with that origin

#### Scenario: Each origin round-trips

- **WHEN** one репорт of each origin is stored and read back
- **THEN** each loads with exactly the origin it was stored with

#### Scenario: The reason a скріншот could not be taken comes back

- **WHEN** a репорт filed on a screen the app could not capture is stored and storage is reopened
- **THEN** it loads with no скріншот and with the reason it has none, word for word as it was
  stored, so the rendered text says the same thing it said before the restart

#### Scenario: A репорт that has its скріншот holds no such reason

- **WHEN** a репорт filed with a successful capture is stored and read back
- **THEN** it loads with its скріншот and with no reason at all

#### Scenario: A репорт stored before the origin existed loads without one

- **WHEN** a репорт is stored under the previously committed migrations alone and the database is
  brought to the current shape
- **THEN** that репорт loads unchanged, with its lines, build, device, журнал, counts and
  screenshots intact, with no origin and with no capture reason

### Requirement: The two switches for filing from a screen survive a restart

Storage SHALL keep whether the gesture and whether the handle are on, and SHALL load them back
unchanged. A device on which neither has been touched SHALL load the gesture on and the handle off.

#### Scenario: The switches come back

- **WHEN** the gesture is turned off and the handle on, and storage is reopened
- **THEN** the gesture loads off and the handle loads on

#### Scenario: A fresh database has the defaults

- **WHEN** all committed migrations are applied to an empty database
- **THEN** the gesture loads on, the handle loads off, and nothing fails

### Requirement: The origin, the capture reason and the switches arrive by a new migration that keeps stored rows

The storage for how a репорт was opened, for why a скріншот could not be taken, and for the two
switches SHALL be introduced by a new migration; committed migrations SHALL stay untouched.
Every row stored under the previously committed migrations — рахунки, транзакції, категорії,
джерела, правила, ліміти, цілі, monobank
state, чернетки and their fingerprints, репорти, their screenshots and the журнал — SHALL
survive the new migration unchanged.

#### Scenario: Pre-migration rows survive unchanged

- **WHEN** a рахунок, one транзакція of each type, a репорт with two screenshots and a журнал of
  300 entries are stored under the previously committed migrations alone, and the database is
  brought to the current shape
- **THEN** all of them load unchanged, the репорт loads with no origin and no capture reason, and
  the switches load at their defaults

#### Scenario: A fresh database from migrations alone holds both

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a репорт can be stored with its origin and its capture reason and read back, and both
  switches can be set and read back

### Requirement: Neither the origin, the capture reason nor the switches are in a бекап

A бекап SHALL contain none of how a репорт was opened, why its скріншот could not be taken, or
the two switches — for the reason the репорти, their screenshots and the журнал are already
outside it: they describe this phone and its testing, not the owner's money. A відновлення SHALL
leave all three exactly as they were on the phone.

#### Scenario: A бекап carries none of them

- **WHEN** a бекап is made on a phone holding two репорти with their origins and both switches
  changed from their defaults
- **THEN** the бекап contains no origin, no capture reason and no switch

#### Scenario: A restore leaves them in place

- **WHEN** a бекап is restored onto a phone whose gesture is off and whose handle is on
- **THEN** the gesture is still off, the handle is still on, and the репорти keep their origins
  and their capture reasons
