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

### Requirement: A транзакція's дата reads as a day

Wherever a line of транзакції shows a дата — the latest-transactions feed, «Транзакції», a
рахунок's рухи and a категорія's month — the дата SHALL read as a day in Ukrainian rather than as
a date code: «сьогодні» for today, «вчора» for the day before, otherwise the day and the month in
the genitive, with the year added only when it is not the current year. What is today SHALL be
decided by the device's local calendar day.

#### Scenario: Today and yesterday are named

- **WHEN** today is 2026-09-23 and the feed holds a витрата dated 2026-09-23 and a дохід dated
  2026-09-22
- **THEN** their lines read «сьогодні» and «вчора» where the дата is shown

#### Scenario: This year's day carries no year

- **WHEN** today is 2026-09-23 and a line's транзакція is dated 2026-09-21
- **THEN** its дата reads «21 вересня»

#### Scenario: Another year's day carries its year

- **WHEN** today is 2026-09-23 and a line's транзакція is dated 2025-08-11
- **THEN** its дата reads «11 серпня 2025»

### Requirement: A сума is never split across two lines

Wherever a сума is drawn with its currency, the number and its currency code SHALL stay on one
line; when several currencies are read together and do not fit one line, each currency's сума
SHALL take its own line whole rather than break between a number and its code. A screen whose own
requirement puts one currency per line (such as «Усього грошей») does so whether or not they fit.

#### Scenario: Three currencies of a total

- **WHEN** a total reads 187 449,16 UAH, 1 300,22 EUR and 3 353,52 USD on a phone too narrow for
  all three on one line
- **THEN** each of the three is drawn whole on its own line and no line starts with a bare
  currency code

### Requirement: A switch is drawn in the app's own tones

Every on/off switch the app draws SHALL use the app's own palette in both themes: the accent for
the switched-on state and a neutral tone of the theme for the switched-off state. No switch SHALL
carry a colour the rest of the app does not use.

#### Scenario: A switched-on widget in «Налаштувати Головний»

- **WHEN** the owner opens «Налаштувати Головний» with «Статок» shown
- **THEN** its switch is drawn in the accent, in the light and in the dark theme, with no other hue

### Requirement: A field being typed into is never under the keyboard

WHILE the device's keyboard is open over a screen, the field being typed into SHALL be drawn
above the keyboard, and the rest of the screen SHALL remain reachable by scrolling. This SHALL
hold on Android versions that no longer resize the window for the keyboard.

#### Scenario: A ліміт typed near the bottom of a long list

- **WHEN** the owner opens the ліміт editor of a категорія low on «Ліміти» and the keyboard opens
- **THEN** the «Ліміт на місяць» field is visible above the keyboard while the owner types
