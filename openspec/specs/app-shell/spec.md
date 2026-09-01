# app-shell Specification

## Purpose
The shell around the screens: what the owner meets when the app is launched, before Головний or
Рахунки can be shown, and the identity the app presents while getting there. It exists because
launching is owner-visible behaviour that belongs to no single screen — and because an app holding
someone's whole financial life should open under its own name, not a toolchain's.
## Requirements
### Requirement: Launching the app shows the app's own identity

While the app is preparing and no screen can be shown yet, it SHALL show its own name and SHALL
show no other product's logo, wordmark or brand colour. What is shown SHALL follow the system
light/dark appearance, and the colour behind the app's name SHALL be the same colour the system
shows while the app is still starting, so the two are indistinguishable to the owner.

#### Scenario: Launching shows the app's own name

- **WHEN** the app is launched
- **THEN** what is shown before the first screen carries the app's own name and no other product's
  logo, wordmark or brand colour

#### Scenario: The launch view follows the system appearance

- **WHEN** the app is launched while the system is in dark appearance
- **THEN** the launch view uses the app's dark background and remains legible; in light appearance
  it uses the app's light background

#### Scenario: The handover from the system is seamless

- **WHEN** the app is launched
- **THEN** the colour shown while the system starts the app and the colour behind the app's own
  name are the same, so no other colour flashes between them

### Requirement: The launch view always gives way

The launch view SHALL disappear once the app is ready and SHALL NOT reappear for the rest of that
launch. It SHALL disappear even when preparing storage fails, so that a failure is never hidden
behind it.

#### Scenario: The launch view gives way to the first screen

- **WHEN** the app has finished preparing storage
- **THEN** the launch view disappears, Головний is shown, and the launch view does not appear
  again until the app is launched anew

#### Scenario: A storage failure is not hidden behind the launch view

- **WHEN** preparing storage fails
- **THEN** the launch view still disappears and the failure is shown to the owner

### Requirement: The app ships no unreferenced image

The installed app SHALL contain no image that nothing references — the project scaffold's
leftovers first among them. Every image it ships SHALL be referenced by the app's configuration
or its code, including any image that exists only to satisfy a platform requirement. Scaffold
artwork the configuration still points at — the app icon and its launcher variants — is
referenced and therefore ships; replacing it is a design decision this requirement does not make.

#### Scenario: No unreferenced image is bundled

- **WHEN** the app is bundled for Android
- **THEN** every image present is referenced by the app's configuration or its code, and no image
  the scaffold left behind unreferenced is present

### Requirement: A refusal the owner reads is in Ukrainian

WHEN the app refuses something the owner typed — a сума, a дата, a назва, a form with a choice
still unmade — the refusal SHALL be shown in Ukrainian and SHALL name what about the typed value
is wrong. No refusal reachable by filling in a form SHALL be shown in any other language, and
none SHALL be the internal wording an engine uses to guard its own invariants: a refusal is
something the owner has to act on, so it SHALL be phrased for them.

This holds wherever a сума or a дата is typed — recording, editing, opening a рахунок, setting a
ліміт, creating a ціль — and the wording SHALL be the same for the same mistake, because it is
the same mistake.

#### Scenario: A ліміт that is not positive is refused in Ukrainian

- **WHEN** the owner enters "0" as a ліміт and confirms
- **THEN** the ліміт is not set and the owner is told in Ukrainian that a сума must be greater
  than zero, with no English in what is shown

#### Scenario: A сума that is not a number is refused in Ukrainian

- **WHEN** the owner enters "12 000" as a сума anywhere a сума is typed and confirms
- **THEN** nothing is stored and the owner is told in Ukrainian that what was typed is not a
  сума, with no English in what is shown

#### Scenario: Too many fractional digits are refused in Ukrainian

- **WHEN** the owner enters "12,345" as a сума in UAH and confirms
- **THEN** nothing is stored and the owner is told in Ukrainian that a UAH сума carries at most
  two digits after the comma

#### Scenario: A дата in the wrong shape is refused in Ukrainian

- **WHEN** the owner enters "31.12.2026" as a ціль's дата and confirms
- **THEN** the ціль is not saved and the owner is told in Ukrainian that a дата is written as
  РРРР-ММ-ДД, with no English in what is shown

#### Scenario: A day that does not exist is refused in Ukrainian

- **WHEN** the owner enters "2026-02-31" as a дата and confirms
- **THEN** nothing is stored and the owner is told in Ukrainian that there is no such day in the
  calendar

#### Scenario: A переказ onto the same рахунок is refused in Ukrainian

- **WHEN** the owner records a переказ choosing one рахунок as both the one the money left and
  the one it arrived at
- **THEN** nothing is stored and the owner is told in Ukrainian that a переказ connects two
  different рахунки, with no English in what is shown

