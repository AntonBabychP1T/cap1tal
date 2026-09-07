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

### Requirement: An uncaught error while drawing a screen shows a fallback, not a dead app

WHEN an error is thrown while a screen is being drawn and no screen caught it, the app SHALL
record it in the журнал with its message and stack before anything else, and SHALL show, in
Ukrainian and following the system appearance, that the screen failed, with the error's message,
an offer to file a репорт про помилку, and a way back to Головний. The app SHALL NOT close on
its own, and returning from the fallback SHALL NOT show the launch view again.

WHEN an error is thrown in work a screen started after it was drawn, or a promise is rejected
and nobody answers it, the app SHALL record it in the журнал with its message and stack before
the platform's own handling of it, which is otherwise unchanged: such an error is remembered, not
caught.

#### Scenario: A crashed screen is replaced by the fallback

- **WHEN** drawing «Рахунки» throws
- **THEN** the журнал holds the crash with its message and stack, and the owner sees a Ukrainian
  fallback naming the failure with «Повідомити про помилку» and «Повернутися»

#### Scenario: An error in started work is remembered

- **WHEN** work a screen started throws after the screen was drawn, or a promise is rejected
  with nobody answering it
- **THEN** the журнал holds the crash with its message and stack, and what the platform does
  with the error afterwards is what it did before

#### Scenario: The fallback follows the system appearance

- **WHEN** a screen crashes while the system is in dark appearance
- **THEN** the fallback uses the app's dark background and remains legible

#### Scenario: Returning from the fallback shows no launch view

- **WHEN** the owner chooses «Повернутися» on the fallback
- **THEN** Головний is shown and the launch view does not appear in between

### Requirement: The shell offers one fixed set of tabs, wherever the app runs

The shell SHALL offer exactly five tabs and SHALL offer the same five in the same order wherever the
app runs: Головний, Місяць, Рахунки, Звіти, Налаштування. No place the app is built for SHALL offer
a subset of them, a different order, or a sixth.

The order is the one the other specs already depend on — `reports-screen` places «Звіти» between
«Рахунки» and «Налаштування», and `settings-screen` places «Налаштування» last after Головний,
Місяць, Рахунки and Звіти. This requirement is what makes that one set rather than two agreements
that can drift apart.

#### Scenario: Every tab is offered

- **WHEN** the app is opened
- **THEN** five tabs are offered: Головний, Місяць, Рахунки, Звіти and Налаштування, in that order

#### Scenario: A second way of drawing the bar offers the same set

- **WHEN** the app is built for a platform that draws the tabs differently from Android
- **THEN** it offers the same five tabs, in the same order, under the same names

### Requirement: The tab being read is marked, and not by colour alone

Exactly one tab SHALL be marked as the one being read, and it SHALL be the tab whose screen is
shown. The mark SHALL NOT be carried by colour alone: at least one signal that is not a colour
SHALL also separate the marked tab from the four others, so that an owner who cannot tell the two
colours apart can still see which tab they are on.

Any non-colour signal satisfies this — the weight of the tab's name, a shape drawn behind it, or
**the presence of the name itself where the other four show only icons**, which is what a native
Android five-tab bar does on its own. The third is named explicitly because it is the one that
carries this on the platform the app ships on, and a reader who looked only for a weight or a shape
on the device would find neither and conclude the requirement was unmet.

#### Scenario: Opening a tab marks it

- **WHEN** the owner opens «Місяць»
- **THEN** «Місяць» is marked as the one being read and no other tab is

#### Scenario: The mark survives without colour

- **WHEN** the five tabs are compared with every colour difference between them ignored
- **THEN** the marked tab is still distinguishable from the other four

