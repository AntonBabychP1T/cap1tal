# progress-screen Specification

## Purpose
«Прогрес» — the pushed screen reached from «Звіти», which names an unseen досягнення quietly
beside its own entry rather than on Головний, and that shows «Виклики», «У процесі» and
«Отримані», with a detail per досягнення and per виклик naming its exact condition. It exists so
that what the history proves and what is worth reaching next have one place to be read, without
becoming a sixth tab, a home widget or a game.
## Requirements

### Requirement: «Прогрес» is a pushed screen, never a sixth tab

«Прогрес» SHALL remain reachable through «Звіти» over the existing five tabs with «Назад», independently of unseen achievements or accepted challenges and without requiring a default Головний widget.

#### Scenario: Звіти leads to Прогрес
- **GIVEN** no unseen досягнення and no accepted виклик
- **WHEN** the owner opens «Звіти» and chooses «Прогрес»
- **THEN** the existing Progress content opens with back navigation and the same five tabs remain

#### Scenario: The tabs are unchanged
- **GIVEN** the new default dashboard
- **WHEN** the app opens
- **THEN** its five tabs remain Головний, Місяць, Рахунки, Звіти and Налаштування, with Прогрес offered over them rather than as a sixth tab

#### Scenario: Existing data survives removing the home widget
- **GIVEN** twelve earned досягнення and three accepted виклики
- **WHEN** the new dashboard is used and Прогрес is opened from Звіти
- **THEN** all earned facts, evidence, dates, challenge decisions and norms remain intact with unchanged evaluation rules

### Requirement: «Прогрес» shows виклики, what is in progress and what was earned

The «Прогрес» screen SHALL hold three sections in this order: **«Виклики»** — the виклики offered
now and those the owner accepted, each with its reason, its progress and its action; **«У процесі»**
— the досягнення not yet earned whose progress is measurable, each with how far it has come;
**«Отримані»** — the earned досягнення, newest first by their дата досягнення, each with that дата.

A section with nothing in it SHALL say so in one plain sentence rather than be shown empty. A
досягнення that has no measurable progress SHALL NOT be listed under «У процесі» — an unmeasurable
thing shown as 0 % is a nag, not information.

#### Scenario: The three sections are shown in order

- **WHEN** the owner opens «Прогрес» with two виклики offered, three measurable досягнення not yet
  earned and twelve earned
- **THEN** «Виклики», «У процесі» and «Отримані» are shown in that order, holding two, three and
  twelve items

#### Scenario: Отримані are newest first

- **WHEN** досягнення are earned with дати 2024-12-03, 2025-03-31 and 2026-09-02
- **THEN** they are listed 2026-09-02, 2025-03-31, 2024-12-03

#### Scenario: An empty section says so

- **WHEN** no виклик is offered or accepted
- **THEN** «Виклики» states there is nothing to do right now, in one sentence

#### Scenario: A досягнення with no measurable progress is not listed as in progress

- **WHEN** «Ціль досягнута вчасно» cannot be earned because no ціль exists
- **THEN** it is not listed under «У процесі»

### Requirement: A досягнення and a виклик each open a detail that states the exact condition

Opening a досягнення SHALL show its назва, the exact condition in one sentence the owner can check
against their own data, its свідчення labelled as what was true when it was earned, and its дата
досягнення — stated as «досягнуто» when the history dated it and as «помічено» when the day it was
recorded dated it. Where the condition still has a current number, that number SHALL be recomputed
and shown beside the свідчення, never in place of it.

Opening a виклик SHALL show its назва, why it was proposed, its progress — a number against a
target, or a count of what is still left to do — its criterion for being finished in one sentence,
and its action.

#### Scenario: The detail explains why it was earned

- **WHEN** the owner opens «500 транзакцій»
- **THEN** it states the condition, shows 500 as the свідчення with the дата досягнення, and shows
  the current stored count beside it

#### Scenario: A balance-dated досягнення says «помічено»

- **WHEN** the owner opens «Ціль “Авто” — 50 %», dated the day it was recorded
- **THEN** the дата is presented as «помічено», not as «досягнуто»

#### Scenario: A виклик's detail names its finish

- **WHEN** the owner opens «Фінансова подушка»
- **THEN** it states why it was proposed, the progress with its two сум in one currency, the
  criterion for being finished, and the action that begins it

### Requirement: New досягнення are announced once, quietly, and in one group

Unseen досягнення SHALL be announced quietly beside the existing «Звіти» entry to «Прогрес» (one name for one, one count line for several), retaining seen state until Прогрес is opened and using no home widget, dialog, sound or phone notification.

#### Scenario: Twelve retroactive досягнення are one line
- **GIVEN** twelve unseen досягнення
- **WHEN** Звіти is read
- **THEN** one count line accompanies the Progress entry and reading it alone marks none seen

#### Scenario: One new досягнення is named
- **GIVEN** exactly one unseen досягнення
- **WHEN** Звіти is read
- **THEN** its name appears by the Progress entry without an interrupting announcement

#### Scenario: Seen is seen
- **GIVEN** twelve unseen досягнення
- **WHEN** Прогрес is opened and the owner returns to Звіти and Головний
- **THEN** all twelve are seen, the count announcement disappears, the Reports entry stays, and Home shows no Progress widget

#### Scenario: Nothing is pushed to the phone
- **GIVEN** an achievement becomes earned at an existing evaluation moment
- **WHEN** the result is recorded
- **THEN** no phone notification, sound or interrupting dialog is emitted

#### Scenario: Evaluation still happens only at existing moments
- **GIVEN** the app has already evaluated at startup
- **WHEN** the owner repeatedly opens Головний or Звіти without changing data
- **THEN** these renders neither evaluate achievements nor emit any notification

### Requirement: «Прогрес» is stated in the register of a financial app

Every number «Прогрес» shows SHALL be a сума in integer minor units with its currency, a count, or a
share of a stated target, and SHALL name what it is about. No point, score, level, coin, rank or
experience SHALL be shown anywhere. Amounts of different currencies SHALL NOT be summed into one
figure or converted for display.

#### Scenario: No score exists to show

- **WHEN** the owner opens «Прогрес» with twenty earned досягнення
- **THEN** no total score, level or point count is shown — only the досягнення themselves

#### Scenario: Two currencies read as two amounts

- **WHEN** a резерв milestone is earned in UAH and another in USD
- **THEN** each is shown with its own сума and currency, and no combined figure appears

### Requirement: A device with nothing yet says so plainly

WHEN no транзакція is stored, «Прогрес» SHALL state in one sentence what the screen is for and that
there is nothing yet, SHALL show no виклик and no empty progress bars, and Головний SHALL show no
«Прогрес» section.

#### Scenario: A fresh install shows one sentence

- **WHEN** the owner opens «Прогрес» on a device holding no транзакція
- **THEN** one sentence states what the screen is for and that there is nothing yet, and no list,
  bar or placeholder is drawn
