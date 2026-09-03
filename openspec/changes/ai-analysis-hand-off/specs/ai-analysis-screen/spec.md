## ADDED Requirements

### Requirement: The screen offers the короткий запит on its own

Beside copying the whole файл, the screen SHALL offer copying the короткий запит alone, in one
action, whenever a preview exists — whether or not a chooser is available and whether or not a
hand-off has happened.

Whenever that action is offered, and before it is used, the screen SHALL say standing beside it
what it is for: that the застосунок the owner chooses may take the файл and nothing else, and that
this запит is what to send after it. After the action is used, the screen SHALL say that the запит
is on the clipboard and nothing further — never that it was sent, delivered or read.

The screen SHALL NOT claim that a запит went with the файл unless the platform reported that it
was carried, and SHALL never name, prefer or single out any assistant, either in that standing
sentence or anywhere else on the screen.

#### Scenario: The action explains itself before it is used

- **WHEN** the owner has a preview and has copied nothing
- **THEN** the screen already says that the застосунок they choose may take the файл alone and
  that this запит is what to send after it

#### Scenario: The запит is copied in one action

- **WHEN** the owner has a preview and chooses to copy the запит
- **THEN** the clipboard holds exactly the короткий запит, the файл is not on the clipboard,
  nothing was handed to any app, and the screen says the запит is on the clipboard and claims
  nothing about it having been sent

#### Scenario: Both copies stay available after a hand-off

- **WHEN** the owner has handed the файл to the system and the screen is showing that
- **THEN** copying the whole файл and copying the короткий запит are both still offered

#### Scenario: No assistant is named

- **WHEN** the screen explains the copied запит
- **THEN** it speaks of «застосунок, який ви оберете» and names no assistant, brand or app

#### Scenario: A запит that did not travel is not claimed

- **WHEN** the файл was handed over and the platform reported that the короткий запит was not
  carried with it
- **THEN** the screen says the файл was handed to the system, and says nothing about a request
  having been sent with it

#### Scenario: A запит that travelled is handed over and no more

- **WHEN** the файл was handed over and the platform reported that the короткий запит was carried
  with it
- **THEN** the screen says the файл and the запит were handed to the system — the one further
  sentence it is permitted — and says nothing about either being sent to, delivered to, received
  by, read by or answered by any app

## MODIFIED Requirements

### Requirement: The preview names what would leave the phone before anything does

The screen SHALL show a preview of the файл для аналізу as soon as it opens and after every
change of a choice, built in memory from the current choices — there is no separate step
between choosing and previewing. The preview SHALL show: the
sentence that the data will be handed to an app the owner chooses; the sentence that a запит to
the assistant — what to do with the data and what every term in it means — is prepared inside the
файл together with the numbers, so the owner need write nothing; the period and the number of
months with транзакції; the number of транзакції, категорії and currencies in it; whether
описи are included and whether individual транзакції are included; and the approximate size of
the файл. The preview SHALL be computed from the very пакет that would be handed over, so the
two cannot disagree. The screen SHALL also offer showing the full text of the файл as it will be
handed over, and what is shown SHALL be the whole of that text — the запит included — and not an
extract, a rendering or a summary of it.

#### Scenario: The preview counts the пакет

- **WHEN** the owner chooses «Останні 6 місяців» with both details off on a device whose stored
  history holds 642 транзакції over 17 категорії in UAH and USD across those months
- **THEN** the preview says 6 months, 642 транзакції, 17 категорії, 2 currencies, продавці: ні,
  окремі транзакції: ні, and that the data will be handed to an app the owner chooses

#### Scenario: The preview says the request is already inside

- **WHEN** the owner opens the AI-аналіз screen
- **THEN** the preview says that a запит to the assistant is prepared inside the файл along with
  the numbers, and that the owner need write nothing themselves

#### Scenario: The preview follows the choices

- **WHEN** the owner turns «Окремі транзакції» on
- **THEN** the preview says окремі транзакції: так, and the size grows

#### Scenario: The full text can be read first

- **WHEN** the owner asks to see the файл
- **THEN** the exact text that would be handed over is shown, opening with the запит, and nothing
  has left the phone

### Requirement: The screen refuses an empty period and flags a short one

WHEN the chosen period holds no транзакція, the screen SHALL say there is nothing to analyse for
that period and SHALL offer no «Поділитися з AI». WHEN the stored history holds no транзакція at
all, the screen SHALL say so plainly and lead to recording the first one. WHEN the period holds
транзакції in fewer than two months, the screen SHALL warn that trends need more than one month
and SHALL still allow handing over — «Цей місяць» therefore always carries that warning, and
that is accepted: a single month's picture is still worth explaining.

Where there is nothing to preview there is nothing to copy either: neither the файл nor the
короткий запит SHALL be offered when no пакет was built.

#### Scenario: An empty period offers nothing to share

- **WHEN** the owner chooses a custom range that holds no транзакція
- **THEN** the screen says there is nothing to analyse for that period and «Поділитися з AI» is
  not offered

#### Scenario: An empty history leads to the first транзакція

- **WHEN** no транзакція is stored at all and the owner opens the AI-аналіз screen
- **THEN** the screen says there is nothing to analyse yet, offers no «Поділитися з AI», no
  «Скопіювати» and no copying of the короткий запит, and leads to recording the first транзакція

#### Scenario: A one-month history is warned, not refused

- **WHEN** the stored history holds транзакції in one month only and the owner chooses
  «Останні 6 місяців»
- **THEN** the screen warns that one month shows no trend and still offers «Поділитися з AI»
