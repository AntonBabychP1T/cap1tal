## ADDED Requirements

### Requirement: Головний says how fresh the bank data is

WHEN monobank is configured and at least one рахунок is linked, Головний SHALL state how long ago
the linked рахунки last completed a sync, as an age rather than a timestamp: «щойно» under a
minute, whole minutes under an hour, whole hours under a day, and the calendar moment beyond that.
The moment it states SHALL be the most recent completed sync among the linked рахунки — the same
moment the monobank screen states, in shorter words — and SHALL move only when a sync completes,
so a failed run leaves the line exactly where it was.

WHEN a sync is going on, the line SHALL say that instead of stating an age, and SHALL go back to
stating the age when the run ends — whoever started that run, and whether it started before or
after Головний was opened.

WHEN no linked рахунок has ever completed a sync, Головний SHALL say that plainly instead of
showing an empty age. WHEN monobank is not configured, or no рахунок is linked, Головний SHALL
show no freshness line at all — an owner who never connected a bank is told nothing about one.

The line SHALL introduce no number of its own: it is a reading of the moments the monobank
capability already keeps.

#### Scenario: Minutes are stated as minutes

- **WHEN** the most recent completed sync among the linked рахунки was three minutes ago
- **THEN** Головний says the data was updated 3 хв ago

#### Scenario: A sync just now is «щойно»

- **WHEN** the most recent completed sync was 20 seconds ago
- **THEN** Головний says the data was updated «щойно»

#### Scenario: Hours are stated as hours

- **WHEN** the most recent completed sync was five hours ago
- **THEN** Головний says the data was updated 5 год ago

#### Scenario: Beyond a day it is a calendar moment

- **WHEN** the most recent completed sync was yesterday at 21:14
- **THEN** Головний states that moment as a date and time rather than as an age

#### Scenario: A linked bank that has never synced says so

- **WHEN** monobank is configured, one рахунок is linked and no sync has ever completed
- **THEN** Головний says that no sync has happened yet rather than showing an empty age

#### Scenario: Without monobank there is no line

- **WHEN** monobank is not configured, or is configured with no linked рахунок
- **THEN** Головний shows no freshness line

#### Scenario: A run in flight is what the line says

- **WHEN** a run started on opening is going on
- **THEN** the line says a sync is going on rather than stating an age, and states the new age once
  the run ends

#### Scenario: A run that begins while Головний is open reaches the line

- **WHEN** Головний is already open and a run starts
- **THEN** the line says a sync is going on without Головний being left and reopened

#### Scenario: A failed run does not move the line

- **WHEN** the line states an age of two hours and a run ends without reaching monobank
- **THEN** the line still states the same completed sync, now two hours and a little older

### Requirement: Pulling down on Головний refreshes it and syncs monobank now

Головний SHALL respond to a pull-down by re-reading everything it shows from storage and, when
monobank is configured with at least one linked рахунок, by starting a sync at once — the quiet
interval governs only the runs the owner did not ask for, and this is one they asked for. While
that run is going on the pull SHALL show that work is in progress, and it SHALL stop showing it
when the run ends. Транзакції the run imported SHALL appear on Головний without the owner leaving
it, and the freshness line SHALL state the new moment.

A pull while monobank is not configured, or while no рахунок is linked, SHALL re-read storage,
send no request and refuse nothing — no dialog, no error. A pull while a run is already going on
SHALL NOT start a second one; it SHALL show the run that is already going on until it ends.

#### Scenario: A pull imports and shows the result in place

- **WHEN** the owner pulls down on Головний and the run that starts imports two транзакції
- **THEN** both stand among the latest транзакції and the freshness line states the new moment,
  without Головний being left

#### Scenario: A pull inside the quiet interval still syncs

- **WHEN** an attempt was recorded one minute ago and the owner pulls down
- **THEN** a run starts

#### Scenario: A pull without monobank changes nothing but the reading

- **WHEN** monobank is not configured and the owner pulls down
- **THEN** Головний re-reads what it shows, no request is sent, and nothing is refused

#### Scenario: A pull during a run starts no second one

- **WHEN** a run started on opening is still going on and the owner pulls down
- **THEN** no second run starts and the pull shows the run already going on until it ends

### Requirement: A sync the owner did not ask for is silent unless it needs them

A sync started without the owner asking SHALL announce nothing while it needs nothing from them:
no dialog, no toast, no сповіщення про збій, and nothing to dismiss. What it imported appearing
among the latest транзакції and the freshness line moving are the whole of what it says. A run that
failed while monobank does not need the owner SHALL be equally silent, and SHALL raise no
сповіщення про збій in any case — it runs precisely while the app is in front of the owner, where
«Потребує уваги» says it in more words than a notification may carry.

WHEN such a run completes, any сповіщення про збій standing for monobank sync SHALL be cleared, as
it is for a run the owner started: the action has succeeded, whoever asked for it.

What Головний shows when monobank does need the owner is the «Потребує уваги» section's, which
this change modifies to hold that row.

#### Scenario: A successful automatic run says nothing

- **WHEN** a run started on opening completes and imports three транзакції
- **THEN** the three транзакції stand among the latest ones, the freshness line states the new
  moment, and no dialog, toast or notification appears

#### Scenario: An automatic run that imported nothing says nothing either

- **WHEN** a run started on opening completes with no new транзакція
- **THEN** Головний shows nothing about it beyond the freshness line's new moment

#### Scenario: A failing automatic run posts no notification

- **WHEN** a run started on opening ends unavailable
- **THEN** no сповіщення про збій is posted and none is left standing for a later screen to clear

#### Scenario: A run that works clears what an earlier failure left standing

- **WHEN** a сповіщення про збій for monobank sync is outstanding and a run started on opening
  completes
- **THEN** that сповіщення is cleared

## MODIFIED Requirements

### Requirement: «Потребує уваги» appears only when something is waiting

Головний SHALL carry a «Потребує уваги» section that exists only while something is actually
waiting on the owner: транзакції carrying «Без категорії», pending чернетки зі сповіщень, and
monobank when it needs the owner. WHEN none of the three exists, the section SHALL NOT be rendered
at all — no heading, no empty state and no space held for it.

The section SHALL name how many stored транзакції carry «Без категорії», counted over everything
stored and not only over what the latest-transactions section shows, and SHALL offer going to
«Транзакції», where they are marked as the transaction-search capability defines. A дохід carrying
«Без джерела» SHALL NOT be counted: it is a different reserved row, and naming it here would ask
the owner to fix something this section never leads to.

The section SHALL hold the pending чернетки surface the bank-notifications capability defines,
unchanged — each чернетка with its рахунок, its date, its text and what it proposes, confirmed or
dismissed in place.

The section SHALL also hold one monobank row, and only while monobank needs the owner as the
monobank-sync capability decides: one row saying which of the two situations it is — the token was
rejected, or the data has not been refreshed — and leading to the monobank screen where it is
retried. A run that failed while monobank does not need the owner SHALL put nothing here.

The section SHALL introduce no new type of транзакція and no number of its own: «Без категорії» and
the pending чернетки are read from what they already are, and the monobank row is read from the
attempt the monobank-sync capability already remembers.

#### Scenario: Nothing waiting, no section

- **WHEN** no stored транзакція carries «Без категорії», no чернетка is pending and monobank does
  not need the owner
- **THEN** Головний shows no «Потребує уваги» section and no empty placeholder in its place

#### Scenario: Uncategorised транзакції are named and counted

- **WHEN** two stored транзакції carry «Без категорії»
- **THEN** «Потребує уваги» says that two транзакції are without a категорія and offers going to
  «Транзакції»

#### Scenario: The count is of everything stored, not of the latest ones

- **WHEN** seven stored транзакції carry «Без категорії» and only one of them is among the latest
  the section shows
- **THEN** «Потребує уваги» names seven

#### Scenario: A дохід «Без джерела» is not counted

- **WHEN** the only thing stored without a label is a дохід carrying «Без джерела», and monobank
  needs nobody
- **THEN** «Потребує уваги» is not shown

#### Scenario: A pending чернетка puts the section on the screen

- **WHEN** one чернетка is pending and no транзакція carries «Без категорії»
- **THEN** «Потребує уваги» is shown, holding that чернетка with its рахунок, its date, its text
  and what it proposes, to confirm or dismiss

#### Scenario: Answering the last item takes the section away

- **WHEN** the only pending чернетка, dated today and matched by a правило to a категорія, is
  confirmed while no транзакція carries «Без категорії»
- **THEN** the confirmed транзакція stands at the top of the latest-transactions section and
  Головний shows no «Потребує уваги» section

#### Scenario: A чернетка confirmed into «Без категорії» keeps the section

- **WHEN** the only pending чернетка, whose text no правило matches, is confirmed while no
  транзакція carries «Без категорії»
- **THEN** «Потребує уваги» is still shown, now naming one транзакція without a категорія instead
  of the чернетка

#### Scenario: Categorising from the feed lowers the count

- **WHEN** «Потребує уваги» names three транзакції without a категорія and the owner picks a
  категорія on one of them from the latest-transactions section
- **THEN** «Потребує уваги» names two

#### Scenario: A rejected token puts the section on the screen

- **WHEN** the last sync attempt was remembered as invalid-token while no транзакція carries «Без
  категорії» and no чернетка is pending
- **THEN** «Потребує уваги» is shown, holding one row saying the monobank token was rejected, which
  opens the monobank screen

#### Scenario: A transient failure over fresh data puts nothing there

- **WHEN** the last sync attempt was remembered as unavailable and a linked рахунок completed a
  sync an hour ago
- **THEN** «Потребує уваги» holds no monobank row

#### Scenario: The monobank row goes when the problem does

- **WHEN** «Потребує уваги» holds the monobank row and a later run completes
- **THEN** the row is gone, and with nothing else waiting the section is gone with it
