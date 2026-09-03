## ADDED Requirements

### Requirement: «Прогрес» is a pushed screen, never a sixth tab

The app SHALL offer a «Прогрес» screen pushed over the tabs, like «Транзакції» and the рухи of a
рахунок, reached from Головний and from «Звіти». It SHALL NOT become a tab, and the five tabs SHALL
stay «Головний», «Місяць», «Рахунки», «Звіти» and «Налаштування».

#### Scenario: The tabs are unchanged

- **WHEN** the owner opens the app after this change
- **THEN** the same five tabs are there and «Прогрес» is not among them

#### Scenario: Звіти leads to Прогрес

- **WHEN** the owner opens «Звіти»
- **THEN** «Прогрес» can be opened from it, over the tabs, with a «Назад»

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

Opening a виклик SHALL show its назва, why it was proposed, its progress against its target, its
criterion for being finished in one sentence, and its action.

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

### Requirement: Головний shows «Прогрес» only when something is waiting

Головний SHALL show a «Прогрес» section only when there is at least one earned досягнення the owner
has not yet been shown, or at least one accepted виклик. With neither, the section SHALL NOT be
rendered at all: no heading, no empty state, no placeholder.

The section SHALL hold at most two lines: the unseen досягнення, and the accepted виклик closest to
being finished. It SHALL lead to «Прогрес» and SHALL record nothing.

#### Scenario: Nothing waiting, no section

- **WHEN** every earned досягнення has been seen and no виклик is accepted
- **THEN** Головний shows no «Прогрес» section of any kind

#### Scenario: One accepted виклик is shown

- **WHEN** three виклики are accepted
- **THEN** Головний shows the one closest to being finished, and «Прогрес» is where the rest are

### Requirement: New досягнення are announced once, quietly, and in one group

WHEN one досягнення has been earned and not yet seen, Головний's «Прогрес» section SHALL name it.
WHEN two or more have been earned and not yet seen, it SHALL show a single line stating how many
there are and leading to «Прогрес» — never one line per досягнення, and never a second announcement
of the same one.

No досягнення SHALL be announced by a dialog that must be dismissed, by a notification to the phone,
by a sound, or by anything that interrupts what the owner was doing. Opening «Прогрес» SHALL mark
every unseen досягнення as seen.

#### Scenario: Twelve retroactive досягнення are one line

- **WHEN** the first evaluation on an existing history earns twelve досягнення
- **THEN** Головний shows one line stating that there are twelve to look at, and no dialog appears

#### Scenario: One new досягнення is named

- **WHEN** exactly one unseen досягнення exists
- **THEN** Головний's «Прогрес» section names that досягнення

#### Scenario: Seen is seen

- **WHEN** the owner opens «Прогрес» while twelve досягнення are unseen and returns to Головний
- **THEN** the «Прогрес» section no longer announces them, and it is not rendered at all unless a
  виклик is accepted

#### Scenario: Nothing is pushed to the phone

- **WHEN** a досягнення is earned
- **THEN** no сповіщення of any kind is posted to the phone's notification shade

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
