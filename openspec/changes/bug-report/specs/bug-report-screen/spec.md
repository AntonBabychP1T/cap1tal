## Purpose

The screens of the репорт про помилку: where the owner files one the moment something went
wrong — from the failure dialog, from the crash fallback, or on their own from Налаштування —
and where a saved репорт is read whole, given screenshots, copied, handed over or removed.

## ADDED Requirements

### Requirement: Every failure dialog offers to report it

WHEN the app refuses an action in a dialog — a save, a rename, a rule, a ліміт, a ціль, a
link, a чек that did not attach — the dialog SHALL offer, beside closing it, «Повідомити про
помилку», which SHALL open the репорт form with that failure already attached as its prompting
failure and the screen the dialog was shown on as its route. A failure the app shows in place on
a screen rather than in a dialog — a бекап, a monobank sync, the Saldo import, the collection of
bank notifications — is in the журнал like any other and is reported from «Репорти про помилки».

#### Scenario: A refused save offers the репорт

- **WHEN** recording a транзакція is refused and the dialog is shown
- **THEN** the dialog offers «Повідомити про помилку», and choosing it opens the form with that
  refusal attached and the transaction form's route as the screen

#### Scenario: Closing the dialog files nothing

- **WHEN** the owner closes such a dialog without choosing «Повідомити про помилку»
- **THEN** no репорт is created and the failure is still in the журнал

### Requirement: The crash fallback offers to report the crash

WHEN a screen has crashed and the fallback is shown, it SHALL offer «Повідомити про помилку»
and «Повернутися». The first SHALL open the form with the crash attached and, once saved, return
the owner to the app; the second SHALL return them without a репорт.

#### Scenario: Reporting from the fallback saves and returns

- **WHEN** the owner chooses «Повідомити про помилку» on the fallback, writes one line and saves
- **THEN** a репорт with the crash attached exists and the owner is back in the app on Головний

#### Scenario: Returning without reporting

- **WHEN** the owner chooses «Повернутися» on the fallback
- **THEN** no репорт exists, the crash is in the журнал, and the owner is back on Головний

### Requirement: The form asks for three lines and saves on one

The репорт form SHALL offer «Що я робив» (required), «Що сталося» and «Чого я очікував», in
Ukrainian, with the prompting failure shown above them when there is one, and SHALL save on
«Зберегти», opening the saved репорт in place of the form — except on the crash fallback, where
saving returns the owner to Головний, as that requirement says. A save with «Що я робив» empty
SHALL be refused in Ukrainian. Leaving the form by the device's back gesture SHALL store nothing.

#### Scenario: Saving opens the saved репорт

- **WHEN** the owner writes «натиснув Записати» and saves
- **THEN** the saved репорт's screen replaces the form, showing its rendered text

#### Scenario: The required line is enforced in Ukrainian

- **WHEN** the owner saves with «Що я робив» empty
- **THEN** the form stays, nothing is stored, and the refusal names the line in Ukrainian

#### Scenario: A save that fails says so and keeps the form

- **WHEN** the owner saves a репорт and storing it fails
- **THEN** the form stays with what they wrote, nothing is stored, the owner is told in Ukrainian
  that the репорт could not be saved and why, and that failure is itself in the журнал

#### Scenario: The back gesture discards the form

- **WHEN** the owner has typed two lines and uses the device's back gesture
- **THEN** the form closes and no репорт was created

### Requirement: The saved репорт is read whole and acted on

The saved репорт's screen SHALL show the rendered text whole — everything that would leave —
followed by its screenshots as thumbnails, and SHALL offer «Додати скріншот», «Скопіювати»,
«Передати» and «Видалити». Handing over SHALL show the outcome in the owner's words; removing
SHALL ask first. WHILE a hand-over is in progress the screen SHALL start no second one.

#### Scenario: The whole text is on the screen

- **WHEN** the owner opens a saved репорт
- **THEN** the screen shows the rendered text with the owner's lines, the build, the failure, the
  counts and the журнал, and the screenshots beneath

#### Scenario: Handing over says it was handed over

- **WHEN** the owner chooses «Передати» and the chooser opens and closes
- **THEN** the screen says the file was handed to the system and shows the moment

#### Scenario: Removing asks first

- **WHEN** the owner chooses «Видалити» and confirms
- **THEN** the репорт is gone from the list; without confirming, it stays

#### Scenario: A second hand-over waits for the first

- **WHEN** the owner taps «Передати» while a hand-over is in progress
- **THEN** no second file is handed over

### Requirement: The list holds every репорт, newest first

The «Репорти про помилки» section SHALL list every saved репорт newest first — its moment, the
first line of «Що я робив», the screen, whether it was handed over — and SHALL offer «Повідомити
про помилку», which opens the form with no prompting failure. An empty list SHALL say in
Ukrainian that there are no репорти yet.

#### Scenario: The list is newest first

- **WHEN** two репорти were saved a day apart and the owner opens the section
- **THEN** the later one is listed first, each with its moment, first line, screen and hand-over
  state

#### Scenario: Filing on one's own

- **WHEN** the owner chooses «Повідомити про помилку» in the section
- **THEN** the form opens with no prompting failure and the section's route as the screen

#### Scenario: The empty list says so

- **WHEN** no репорт has been saved and the owner opens the section
- **THEN** the section says in Ukrainian that there are no репорти yet and still offers
  «Повідомити про помилку»
