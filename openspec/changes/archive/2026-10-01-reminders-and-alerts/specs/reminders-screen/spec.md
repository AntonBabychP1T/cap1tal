## Purpose

The «Нагадування» section of Налаштування: the one place the owner decides whether the app may
speak first — the permission in plain words, the daily нагадування's switch and its time, and an
honest statement of what the app will announce and what it will never put in a notification.

## ADDED Requirements

### Requirement: The «Нагадування» section explains what it is for and reports the permission

The section SHALL state, before anything can be switched, what the app posts: one daily
нагадування to record and check expenses, and a сповіщення про збій when something the app did on
its own failed. It SHALL report the current permission state in the owner's words — granted,
refused, or unavailable on this device — and SHALL refresh that state when the owner returns to
the app.

While the permission is refused, the section SHALL offer the way to the system screen where it is
granted. Where local notifications are unavailable, it SHALL say so and SHALL offer no system
screen.

#### Scenario: The section says what the app will post

- **WHEN** the owner opens «Нагадування»
- **THEN** it states that the app posts one daily нагадування, if turned on, and a сповіщення
  when an action failed, and nothing else

#### Scenario: A refused permission offers where to grant it

- **WHEN** the owner opens «Нагадування» while the permission is refused
- **THEN** the refusal is stated and the system screen where notifications are allowed is offered

#### Scenario: Returning from the system screen updates the state

- **WHEN** the owner grants the permission on the system screen and comes back to the app
- **THEN** the section reports the permission as granted without being reopened

#### Scenario: A device that cannot notify offers nothing to press

- **WHEN** the owner opens «Нагадування» where local notifications are unavailable
- **THEN** it says the phone cannot post them, offers no system screen, and the switch cannot be
  turned on

### Requirement: The daily нагадування is turned on and off in this section

The section SHALL show whether the нагадування is on, and SHALL let the owner turn it on and off.
Turning it on SHALL ask for the permission if it has not been granted; if the permission is
refused, the switch SHALL return to off and the refusal SHALL be stated. Turning it off SHALL take
effect immediately, without asking anything.

#### Scenario: Turning it on with permission granted

- **WHEN** the owner turns the switch on and the permission is granted
- **THEN** the section shows the нагадування as on, with the time it will arrive

#### Scenario: Turning it on with permission refused

- **WHEN** the owner turns the switch on and the permission is refused
- **THEN** the switch shows off, the refusal is stated, and the system screen is offered

#### Scenario: Turning it off asks nothing

- **WHEN** the owner turns the switch off
- **THEN** the section shows it as off and no permission is asked for

### Requirement: The time is chosen in this section and a value that is not a time is refused

The section SHALL show the time the нагадування is set for and SHALL let the owner change it. Only
a time of day SHALL be accepted; anything else SHALL be refused with a word about what is expected,
and the previously set time SHALL remain in force.

#### Scenario: A new time is taken

- **WHEN** the нагадування is on for 21:00 and the owner sets it to 09:30
- **THEN** the section shows 09:30 and the нагадування arrives at 09:30

#### Scenario: A value that is not a time changes nothing

- **WHEN** the owner enters «25:70»
- **THEN** it is refused with a word about what a time looks like, and the нагадування is still
  set for the time it had

#### Scenario: An empty time changes nothing

- **WHEN** the owner clears the time and leaves it empty
- **THEN** it is refused and the previously set time remains

### Requirement: The section states what a notification will never contain

The section SHALL state that no notification the app posts contains a сума, a рахунок, a категорія
or any text from a bank's own notification, and that the app posts nothing over a network.

#### Scenario: The privacy promise is on the screen

- **WHEN** the owner opens «Нагадування»
- **THEN** it states that notifications carry no сума, no рахунок and no bank text, and that
  nothing is sent anywhere
