## ADDED Requirements

### Requirement: The section governs the two ways of filing a репорт from a screen

The «Репорти про помилки» section SHALL carry, above the list, two switches in Ukrainian that
decide how a репорт can be filed from the screen the owner is on:

- **the gesture** — two fingers held still — which SHALL be on until the owner turns it off;
- **the handle** — a small marker drawn above every screen — which SHALL be off until the owner
  turns it on.

Each switch SHALL be accompanied by one sentence in Ukrainian saying what it does, and the section
SHALL state plainly that filing from a screen takes a скріншот of that screen and that a скріншот
shows whatever was on it. Both switches SHALL survive a restart. Turning either off SHALL leave
every other way of filing a репорт — the failure dialogs, the crash fallback and «Повідомити про
помилку» here — working exactly as before.

#### Scenario: The switches are in the section

- **WHEN** the owner opens «Репорти про помилки» on a phone where nothing has been changed
- **THEN** the gesture is shown as on, the handle as off, each with its sentence, and the section
  says that filing from a screen takes a скріншот of that screen

#### Scenario: A switch takes effect without a restart

- **WHEN** the owner turns the handle on and goes back to Головний
- **THEN** the handle is drawn there straight away, without the app being closed and opened

#### Scenario: A switch survives a restart

- **WHEN** the owner turns the handle on and the app is closed and opened again
- **THEN** the handle is still on and is still drawn above every screen

#### Scenario: Turning both off leaves the section working

- **WHEN** the owner turns both switches off and then chooses «Повідомити про помилку»
- **THEN** the form opens with no prompting failure and a репорт can be filed as before

## MODIFIED Requirements

### Requirement: The saved репорт is read whole and acted on

The saved репорт's screen SHALL show the rendered text whole — everything that would leave —
followed by its screenshots as thumbnails, and SHALL offer «Додати скріншот», «Скопіювати»,
«Передати» and «Видалити». Handing over SHALL show the outcome in the owner's words; removing
SHALL ask first. WHILE a hand-over is in progress the screen SHALL start no second one.

WHERE the репорт holds at least one скріншот, «Передати» SHALL first show those screenshots
together with a sentence in Ukrainian saying that a скріншот carries whatever was on the screen,
суми and назви included, and SHALL hand nothing over until the owner confirms. Backing out of that
step SHALL hand over nothing and SHALL leave the репорт unchanged. «Скопіювати» SHALL be unaffected
by it, since the copied text carries no image data.

#### Scenario: The whole text is on the screen

- **WHEN** the owner opens a saved репорт
- **THEN** the screen shows the rendered text with the owner's lines, the build, the failure, the
  counts and the журнал, and the screenshots beneath

#### Scenario: Handing over says it was handed over

- **WHEN** the owner chooses «Передати» on a репорт holding a скріншот, confirms the warning, and
  the chooser opens and closes
- **THEN** the screen says the file was handed to the system and shows the moment

#### Scenario: The скріншот warning stands between the репорт and the chooser

- **WHEN** the owner chooses «Передати» on a репорт holding a скріншот and backs out of the warning
- **THEN** no chooser opened, nothing was handed to the system and the репорт still says it has not
  been handed over

#### Scenario: A репорт without screenshots is handed over as before

- **WHEN** the owner chooses «Передати» on a репорт holding no скріншот
- **THEN** the chooser opens with no warning step in between

#### Scenario: Removing asks first

- **WHEN** the owner chooses «Видалити» and confirms
- **THEN** the репорт is gone from the list; without confirming, it stays

#### Scenario: A second hand-over waits for the first

- **WHEN** the owner taps «Передати» while a hand-over is in progress
- **THEN** no second file is handed over
