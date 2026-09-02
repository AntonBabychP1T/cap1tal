## Purpose

Everything the app itself posts to the phone: one optional daily нагадування at a time the owner
chose, and a сповіщення про збій when work that keeps the record complete failed while nobody was
watching. It defines what raises each, what may never appear in one, where a tap leads, and the
promise that all of it is scheduled by this phone for this phone.

## ADDED Requirements

### Requirement: The daily нагадування is optional and set to a time the owner chose

The app SHALL offer one нагадування: a notification posted on this device once every calendar day
at a time of day the owner chose. It SHALL be off until the owner turns it on, and a device that
has never been asked SHALL have nothing arranged.

While it is on, exactly one нагадування SHALL be arranged at a time. Changing its time SHALL move
it rather than add a second one, and turning it off SHALL leave nothing arranged. It SHALL remain
arranged across restarts of the app and of the phone, without the owner turning it on again, and
after the phone's time zone changes it SHALL arrive at the same time of day in the zone the phone
is now in.

#### Scenario: A fresh install reminds the owner of nothing

- **WHEN** the app is opened on a device where the нагадування was never turned on
- **THEN** no нагадування is arranged and nothing is posted

#### Scenario: Turning it on arranges it for the chosen time

- **WHEN** the owner turns the нагадування on for 21:00
- **THEN** one нагадування is arranged for 21:00 every day

#### Scenario: Changing the time moves the one нагадування

- **WHEN** the нагадування is on for 21:00 and the owner changes the time to 09:30
- **THEN** exactly one нагадування is arranged, for 09:30, and none remains for 21:00

#### Scenario: Turning it off leaves nothing arranged

- **WHEN** the owner turns the нагадування off
- **THEN** no нагадування is arranged and none is posted the next day

#### Scenario: A restart does not lose it

- **WHEN** the нагадування is on for 21:00 and the phone is restarted
- **THEN** it is still arranged for 21:00, without the owner turning it on again

#### Scenario: What the app believes is reconciled with what the phone holds

- **WHEN** the app is opened and the нагадування is on for 21:00 while the phone holds nothing
  arranged
- **THEN** the нагадування is arranged again for 21:00, and the owner is not asked to do it

#### Scenario: A time zone change keeps the hour the owner chose

- **WHEN** the нагадування is on for 21:00, the phone moves to another time zone, and the app is
  opened there
- **THEN** exactly one нагадування is arranged, for 21:00 in the zone the phone is now in

### Requirement: Tapping the нагадування opens where the day is recorded

Tapping the нагадування SHALL open Головний — where the «+» records a транзакція and pending
чернетки wait — whether the app was running or not.

#### Scenario: A tap while the app is closed opens Головний

- **WHEN** the app is not running and the owner taps the нагадування
- **THEN** the app opens on Головний, showing the «+» that records and any pending чернетки

#### Scenario: A tap while the app is running opens Головний

- **WHEN** the app is open on another screen and the owner taps the нагадування
- **THEN** Головний is shown

### Requirement: The нагадування asks for the system's permission and never pretends

Turning the нагадування on SHALL ask the system for permission to post notifications. Only a
granted permission SHALL arrange it.

A refused permission SHALL leave the нагадування off and SHALL be reported as refused, together
with where in the system settings it is granted. A device that cannot post local notifications at
all SHALL be reported as such and SHALL be offered no system screen. A permission granted once and
later revoked SHALL be reported as refused at the next opportunity, and the нагадування SHALL NOT
be shown as arranged while it cannot be.

#### Scenario: A refused permission leaves it off

- **WHEN** the owner turns the нагадування on and the system permission is refused
- **THEN** the нагадування is off, nothing is arranged, and the refusal is reported with where it
  can be granted

#### Scenario: A granted permission arranges it

- **WHEN** the owner turns the нагадування on and the system permission is granted
- **THEN** the нагадування is arranged for the chosen time

#### Scenario: A permission revoked behind the app's back is not hidden

- **WHEN** the нагадування was on and the permission is revoked in the system settings while the
  app is not running, and the app is opened afterwards
- **THEN** the нагадування is reported as not arranged and the permission as refused, and nothing
  claims that a нагадування will arrive

### Requirement: A failure of work the owner was not watching raises a сповіщення про збій

Each of these actions SHALL raise a сповіщення про збій when it fails: collecting the bank
notifications the phone captured, a monobank sync, committing a Saldo import, saving a транзакція
locally, and saving or restoring a бекап file. Each сповіщення SHALL name the action that failed
and SHALL lead to the screen where that failure's details and its retry are.

Access to other apps' notifications being withdrawn while the owner still has відстежувані
застосунки SHALL raise the same сповіщення as a failed collection: from the owner's side, the
transactions stop arriving either way.

A failure whose own screen is in front of the owner at the moment it happens SHALL be reported
there and SHALL raise no сповіщення: the app SHALL NOT tell the owner what they are already
reading.

#### Scenario: A failed collection raises a сповіщення

- **WHEN** collecting the captured bank notifications fails
- **THEN** one сповіщення про збій is raised naming that collection failed, leading to
  «Сповіщення банків»

#### Scenario: A sync that fails after the owner left the app raises a сповіщення

- **WHEN** a monobank sync the owner started ends in a failure while the app is not in front of
  them
- **THEN** one сповіщення про збій is raised naming that the monobank sync failed, leading to
  «monobank»

#### Scenario: A failure the owner is looking at raises nothing

- **WHEN** saving a бекап fails while the owner is on «Бекап»
- **THEN** the screen reports the failure and no сповіщення про збій is raised

#### Scenario: Withdrawn notification access is announced like a failed collection

- **WHEN** the app is opened, відстежувані застосунки exist, and access to other apps'
  notifications is no longer granted
- **THEN** one сповіщення про збій is raised leading to «Сповіщення банків», and a second opening
  with the access still withdrawn raises no second one

#### Scenario: Withdrawn access with nothing watched announces nothing

- **WHEN** the app is opened, access to other apps' notifications is not granted, and no
  відстежуваний застосунок exists
- **THEN** no сповіщення про збій is raised

#### Scenario: A failed import commit leads back to the import

- **WHEN** committing a Saldo import fails while the app is not in front of the owner
- **THEN** one сповіщення про збій is raised naming that the import failed, leading to
  «Імпорт Saldo»

### Requirement: One failure is one сповіщення

While a сповіщення про збій of one action is outstanding, the same action failing again SHALL NOT
raise a second one. A сповіщення SHALL be cleared when that same action next succeeds, and when
the owner opens the screen it leads to. Clearing one action's сповіщення SHALL NOT clear another's,
and two different actions SHALL be able to be outstanding at once.

An outstanding сповіщення SHALL survive the app being closed and reopened, so a failure is not
announced a second time by a restart.

#### Scenario: The same failure three times is one сповіщення

- **WHEN** collecting the captured bank notifications fails three times in a row
- **THEN** exactly one сповіщення про збій for that action exists

#### Scenario: Success clears it

- **WHEN** a сповіщення про збій for the monobank sync is outstanding and a sync then succeeds
- **THEN** that сповіщення is cleared and nothing about it remains posted

#### Scenario: Opening the screen it leads to clears it

- **WHEN** a сповіщення про збій for the бекап is outstanding and the owner opens «Бекап»
- **THEN** that сповіщення is cleared

#### Scenario: Two different failures stand side by side

- **WHEN** collecting captured notifications and a monobank sync have both failed
- **THEN** both сповіщення exist, and clearing one leaves the other

#### Scenario: A restart does not announce the same failure again

- **WHEN** a сповіщення про збій is outstanding, the app is closed and opened again, and the same
  action fails once more
- **THEN** still exactly one сповіщення for that action exists

### Requirement: Nothing the app posts carries money, a name or bank text

What the app posts SHALL contain only the app's own words: the invitation to record expenses, or
the name of the action that failed. It SHALL NOT contain a сума in any currency, the назва of a
рахунок, категорія or джерело, the опис of a транзакція, any part of a captured bank
notification's title, text or package, the monobank token or any part of it, or any Google
authorisation.

#### Scenario: A collection failure says nothing about what was captured

- **WHEN** collecting captured notifications fails after a captured notification naming
  «Продукти 250,00 UAH» from a bank's app
- **THEN** what is posted contains neither that сума, nor that text, nor the app it came from —
  only that collecting bank notifications failed

#### Scenario: The нагадування carries no numbers

- **WHEN** the нагадування is posted on a device holding транзакції, рахунки and цілі
- **THEN** what is posted names no сума, no рахунок and no категорія

### Requirement: A tap leads only where the app already knows

Acting on a tapped notification SHALL open only one of the screens this app defines. A
notification naming a destination the app does not recognise SHALL open Головний and SHALL lead
nowhere else.

#### Scenario: An unrecognised destination opens Головний

- **WHEN** a notification whose destination the app does not recognise is tapped
- **THEN** the app opens on Головний and navigates nowhere else

### Requirement: Every notification is arranged by this phone for this phone

The нагадування and every сповіщення про збій SHALL be scheduled and posted locally. The app
SHALL NOT register the device with any remote push service, SHALL NOT obtain or store a push
token, and SHALL make no network request in order to arrange or post one.

#### Scenario: No network is needed

- **WHEN** the owner turns the нагадування on with the phone in flight mode
- **THEN** it is arranged for the chosen time and no network request is made

#### Scenario: A failure is announced with no network

- **WHEN** an action fails while the phone has no network
- **THEN** its сповіщення про збій is raised and posted anyway

### Requirement: A device that cannot post notifications answers with values, never a crash

Where the platform offers no way to post a local notification, the permission SHALL be reported as
unavailable rather than refused, turning the нагадування on SHALL be declined in words, and a
failure SHALL still be recorded as outstanding without anything being posted. No path SHALL raise
an error to the owner's screen.

#### Scenario: A build that cannot notify says so

- **WHEN** the app runs where local notifications cannot be posted and the owner opens the
  reminder settings
- **THEN** the permission is reported as unavailable, no system screen is offered, and nothing
  crashes

#### Scenario: A failure without notifications is still remembered

- **WHEN** an action fails where local notifications cannot be posted
- **THEN** its сповіщення про збій is recorded as outstanding, nothing is posted, and the same
  failure again raises no second one

### Requirement: The нагадування's setting travels with the owner's money; outstanding failures do not

Whether the нагадування is on and the time it is set for SHALL be part of what a бекап carries, so
a restored phone reminds the owner as the old one did. The outstanding сповіщення про збій SHALL
NOT be carried in a бекап: they describe what this phone last failed at, not the owner's money.

#### Scenario: The reminder comes back with the бекап

- **WHEN** a бекап is made while the нагадування is on for 09:30 and is restored onto a device
  where it was never turned on
- **THEN** the нагадування is on for 09:30 on that device

#### Scenario: Another phone's failures do not arrive

- **WHEN** a бекап is made while a сповіщення про збій is outstanding and is restored onto another
  device
- **THEN** no сповіщення про збій is outstanding on that device
