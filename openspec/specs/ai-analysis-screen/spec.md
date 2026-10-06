# ai-analysis-screen Specification

## Purpose

The «AI-аналіз» screen, reached from «Звіти»: where the owner chooses what kind of AI-аналіз,
over which period and with which details, reads exactly what would leave the phone, and only
then — by one explicit action — hands the файл для аналізу to an app of their own choosing. It
records nothing and reads no answer back.

## Requirements

### Requirement: The screen offers the kind, the period and the details

The AI-аналіз screen SHALL offer the kind of AI-аналіз — «Місячна картина» in this change — and
a period: «Цей місяць», «Останні 3 місяці», «Останні 6 місяців», «Останні 12 місяців», or a
custom range of whole calendar months from one month to another, each end set by stepping a місяць
back or forward and read as a місяць in words, as the app-shell capability requires. No end can be a
month after the current one. It SHALL offer two detail
choices, «Продавці» (the описи of транзакції — the bank's text, including what a confirmed
чернетка carried — and the назви the owner gave their продавці) and «Окремі транзакції», both off when the screen
opens and never remembered between openings. It SHALL state that agregates — the monthly
picture, категорії, тренди, ліміти and цілі — are always included. Changing any choice SHALL
hand nothing to any app.

WHEN the screen is opened for one given month — from that month's підсумок — the period SHALL be
the custom range from that month to that same month. Every other choice SHALL be at its default
as on any opening, and the owner SHALL be able to change the period like any other choice. A
given month that is not a whole calendar month SHALL leave the period at its default rather than
fail.

#### Scenario: The defaults are the least that leaves the phone

- **WHEN** the owner opens the AI-аналіз screen from «Звіти»
- **THEN** «Місячна картина» is chosen, «Останні 3 місяці» is chosen, «Продавці» and «Окремі
  транзакції» are both off, and the preview already shows what those defaults would hand over —
  built in memory, with nothing written and nothing handed to any app

#### Scenario: Opened for one month

- **WHEN** the owner opens the AI-аналіз screen from the підсумок of September 2026
- **THEN** the period is the custom range вересень 2026 — вересень 2026, «Продавці» and «Окремі транзакції»
  are off, the preview shows that one month's пакет, the one-month warning of a short period is
  shown, and nothing has been handed to any app

#### Scenario: A malformed given month falls back to the default period

- **WHEN** the screen is opened for the given month «2026-13»
- **THEN** «Останні 3 місяці» is chosen and no exception is shown

#### Scenario: A custom range is whole months

- **WHEN** the owner sets a custom range from січень 2026 to червень 2026
- **THEN** the period is January through June 2026, six whole calendar months

#### Scenario: A custom range that ends before it starts is refused

- **WHEN** the owner sets a custom range from червень 2026 to січень 2026
- **THEN** it is refused as a range that ends before it starts, «Поділитися з AI» is not offered,
  and nothing is built

#### Scenario: A half-typed month is a sentence, not an exception

- **WHEN** the owner steps either end of a custom range back and forward several times — stepping
  replaced typing, so a month can no longer be half-typed
- **THEN** each end reads as a whole місяць in words at every step, no sentence about how a month is
  written appears, no exception is shown, and the preview follows each step

#### Scenario: A range end cannot step past this month

- **WHEN** «До» reads жовтень 2026, the current month, and the owner steps it forward
- **THEN** it stays жовтень 2026

#### Scenario: «Продавці» says the owner's назви go too

- **WHEN** the owner reads the «Продавці» choice
- **THEN** it says it carries the описи as the bank sent them and the назви the owner gave their
  продавці

#### Scenario: Details are not remembered

- **WHEN** the owner turns «Продавці» on, leaves the screen and opens it again
- **THEN** «Продавці» is off

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

### Requirement: Nothing leaves the phone before «Поділитися з AI»

The screen SHALL hand the файл для аналізу over only when the owner performs the one primary
action «Поділитися з AI», and only then SHALL the system's own chooser of apps open. The screen
SHALL never pick a destination app, open a specific app, or use any app-specific link. Until that
action, no файл SHALL exist outside the app's own private storage and no app SHALL have been
offered anything.

#### Scenario: The chooser opens on the action alone

- **WHEN** the owner has a preview and performs «Поділитися з AI»
- **THEN** the system's chooser of apps opens with the файл, and the owner picks the app

#### Scenario: Leaving the screen hands nothing over

- **WHEN** the owner has a preview and leaves the screen without performing the action
- **THEN** no chooser opened and nothing left the phone

### Requirement: The screen tells the truth about each outcome

After «Поділитися з AI» the screen SHALL say what happened, in the owner's own words: that the
файл was handed to the system — and SHALL NOT claim that it was received, read or answered,
because the app cannot know what the owner did in the chooser; that this platform has no way to
hand a файл over; or that the файл could not be prepared, with the reason, including the
storage being full. Copying the whole файл to the clipboard SHALL be offered beside the primary
action whenever a preview exists, so an owner whose assistant the chooser does not list, or
whose platform cannot hand a файл over, has the same text another way. The screen SHALL never
show an exception.

#### Scenario: Handed over is all that is claimed

- **WHEN** the chooser closes after the owner picked an app, or after the owner dismissed it
- **THEN** the screen says the файл was handed to the system and claims nothing further

#### Scenario: No way to share on this platform

- **WHEN** the platform reports it cannot hand a файл over
- **THEN** the screen says so and offers copying the файл to the clipboard

#### Scenario: The файл could not be prepared

- **WHEN** the файл cannot be written because the storage is full
- **THEN** the screen says the файл could not be prepared, names the reason, and nothing was
  handed over

#### Scenario: Copying puts the same text on the clipboard

- **WHEN** the owner chooses to copy instead
- **THEN** the clipboard holds exactly the text the preview showed

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

### Requirement: The answer never comes back as truth

The AI-аналіз screen SHALL read no answer from any app, store nothing about a run, and SHALL
create, change or delete no транзакція, категорія, правило, ліміт, ціль or поточна вартість.
Whatever the chosen app answers stays in that app; anything the owner decides to do about it is
done through the app's ordinary screens, by hand.

#### Scenario: A run changes nothing

- **WHEN** the owner hands a файл over and returns to the app
- **THEN** every рахунок, транзакція, категорія, ліміт and ціль is exactly what it was, the
  Місяць numbers are unchanged, and nothing about the run is stored

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
