## Purpose

The «AI-аналіз» screen, reached from «Звіти»: where the owner chooses what kind of AI-аналіз,
over which period and with which details, reads exactly what would leave the phone, and only
then — by one explicit action — hands the файл для аналізу to an app of their own choosing. It
records nothing and reads no answer back.

## ADDED Requirements

### Requirement: The screen offers the kind, the period and the details

The AI-аналіз screen SHALL offer the kind of AI-аналіз — «Місячна картина» in this change — and
a period: «Цей місяць», «Останні 3 місяці», «Останні 6 місяців», «Останні 12 місяців», or a
custom range of whole calendar months from one month to another. A month of that range that is
not yet a whole calendar month — the owner is still typing it — SHALL be answered with how a month
is written, never with an exception. It SHALL offer two detail
choices, «Продавці» (the описи of транзакції — the bank's text, including what a confirmed
чернетка carried) and «Окремі транзакції», both off when the screen
opens and never remembered between openings. It SHALL state that agregates — the monthly
picture, категорії, тренди, ліміти and цілі — are always included. Changing any choice SHALL
hand nothing to any app.

#### Scenario: The defaults are the least that leaves the phone

- **WHEN** the owner opens the AI-аналіз screen
- **THEN** «Місячна картина» is chosen, «Останні 3 місяці» is chosen, «Продавці» and «Окремі
  транзакції» are both off, and the preview already shows what those defaults would hand over —
  built in memory, with nothing written and nothing handed to any app

#### Scenario: A custom range is whole months

- **WHEN** the owner chooses a custom range from 2026-01 to 2026-06
- **THEN** the period is January through June 2026, six whole calendar months

#### Scenario: A custom range that ends before it starts is refused

- **WHEN** the owner chooses a custom range from 2026-06 to 2026-01
- **THEN** it is refused as a range that ends before it starts, «Поділитися з AI» is not offered,
  and nothing is built

#### Scenario: A half-typed month is a sentence, not an exception

- **WHEN** the owner is still typing a month of a custom range and it is not yet a whole one —
  «2026-0» on the way to «2026-08»
- **THEN** the screen says how a month is written, offers no «Поділитися з AI», builds nothing,
  and shows no exception; the preview returns as soon as both months are whole again

#### Scenario: Details are not remembered

- **WHEN** the owner turns «Продавці» on, leaves the screen and opens it again
- **THEN** «Продавці» is off

### Requirement: The preview names what would leave the phone before anything does

The screen SHALL show a preview of the файл для аналізу as soon as it opens and after every
change of a choice, built in memory from the current choices — there is no separate step
between choosing and previewing. The preview SHALL show: the
sentence that the data will be handed to an app the owner chooses; the period and the number of
months with транзакції; the number of транзакції, категорії and currencies in it; whether
описи are included and whether individual транзакції are included; and the approximate size of
the файл. The preview SHALL be computed from the very пакет that would be handed over, so the
two cannot disagree. The screen SHALL also offer showing the full text of the файл as it will be
handed over.

#### Scenario: The preview counts the пакет

- **WHEN** the owner chooses «Останні 6 місяців» with both details off on a device whose stored
  history holds 642 транзакції over 17 категорії in UAH and USD across those months
- **THEN** the preview says 6 months, 642 транзакції, 17 категорії, 2 currencies, продавці: ні,
  окремі транзакції: ні, and that the data will be handed to an app the owner chooses

#### Scenario: The preview follows the choices

- **WHEN** the owner turns «Окремі транзакції» on
- **THEN** the preview says окремі транзакції: так, and the size grows

#### Scenario: The full text can be read first

- **WHEN** the owner asks to see the файл
- **THEN** the exact text that would be handed over is shown, and nothing has left the phone

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

#### Scenario: An empty period offers nothing to share

- **WHEN** the owner chooses a custom range that holds no транзакція
- **THEN** the screen says there is nothing to analyse for that period and «Поділитися з AI» is
  not offered

#### Scenario: An empty history leads to the first транзакція

- **WHEN** no транзакція is stored at all and the owner opens the AI-аналіз screen
- **THEN** the screen says there is nothing to analyse yet, offers no «Поділитися з AI» and no
  «Скопіювати», and leads to recording the first транзакція

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
