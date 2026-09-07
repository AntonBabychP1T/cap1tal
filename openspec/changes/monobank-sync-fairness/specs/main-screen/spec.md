## MODIFIED Requirements

### Requirement: Головний says how fresh the bank data is

WHEN monobank is configured and at least one рахунок is linked, Головний SHALL state how fresh the
bank data is, as a reading of the moments the monobank capability already keeps and never as a
number of its own.

WHEN a sync has completed for every linked рахунок, the line SHALL state the age of the **oldest**
of those completed syncs — the age of the whole picture, not of its freshest corner — as an age
rather than a timestamp: «щойно» under a minute, whole minutes under an hour, whole hours under a
day, and the calendar moment beyond that. It is the same moment the monobank screen states, in
shorter words.

WHEN a sync has completed for some linked рахунки but not all, the line SHALL state how many of how
many are synced instead of any age: an age read off the рахунки that did sync would tell the owner
their picture is fresh while most of their money is missing from it.

The line SHALL move only when a sync completes, so a failed run leaves it exactly where it was.

The moment «Потребує уваги» decides its monobank row from SHALL be the same one this line reads:
the oldest completed sync when every linked рахунок has synced, and **no moment at all** while any
linked рахунок has never synced. A bank the app has never wholly heard from is not fresh data,
whatever its freshest рахунок says, so a failing run over it is a failure over stale data and the
row appears; deciding that row from the newest moment would hide exactly the situation the count
above exists to state.

WHEN a sync is going on, the line SHALL say that instead of stating an age or a count, and SHALL go
back to its reading when the run ends — whoever started that run, and whether it started before or
after Головний was opened.

WHEN no linked рахунок has ever completed a sync, Головний SHALL say that plainly instead of
showing an empty age. WHEN monobank is not configured, or no рахунок is linked, Головний SHALL
show no freshness line at all — an owner who never connected a bank is told nothing about one.

#### Scenario: Minutes are stated as minutes

- **WHEN** every linked рахунок has synced and the oldest of those syncs was three minutes ago
- **THEN** Головний says the data was updated 3 хв ago

#### Scenario: A sync just now is «щойно»

- **WHEN** every linked рахунок has synced and the oldest of those syncs was 20 seconds ago
- **THEN** Головний says the data was updated «щойно»

#### Scenario: Hours are stated as hours

- **WHEN** every linked рахунок has synced and the oldest of those syncs was five hours ago
- **THEN** Головний says the data was updated 5 год ago

#### Scenario: Beyond a day it is a calendar moment

- **WHEN** every linked рахунок has synced and the oldest of those syncs was yesterday at 21:14
- **THEN** Головний states that moment as a date and time rather than as an age

#### Scenario: The age is the oldest account's, not the newest

- **WHEN** one linked рахунок synced a minute ago and another three days ago
- **THEN** Головний states the age of the three-day-old sync

#### Scenario: A partly synced bank is stated as a count

- **WHEN** three of nine linked рахунки have completed a sync and six never have
- **THEN** Головний says «Синхронізовано 3 з 9 рахунків», and states no age

#### Scenario: The count reads as Ukrainian for every number of рахунки

- **WHEN** one of three linked рахунки has completed a sync
- **THEN** Головний says «Синхронізовано 1 з 3 рахунків» — the noun after «з» is the genitive
  plural whatever the number is

#### Scenario: A failing run over a partly synced bank needs the owner

- **WHEN** six of nine linked рахунки have never completed a sync and the last run ended
  unavailable
- **THEN** «Потребує уваги» carries the monobank row, because a bank the app has never wholly
  heard from is not fresh data

#### Scenario: A pull that must wait out the request gap says a sync is going on

- **WHEN** the owner pulls Головний down within a minute of the last request any run sent, so the
  run they started sits out the rest of the gap before its first request
- **THEN** the line says a sync is going on for the whole of that wait, and states its reading when
  the run ends

#### Scenario: A linked bank that has never synced says so

- **WHEN** monobank is configured, one рахунок is linked and no sync has ever completed
- **THEN** Головний says that no sync has happened yet rather than showing an empty age

#### Scenario: Without monobank there is no line

- **WHEN** monobank is not configured, or is configured with no linked рахунок
- **THEN** Головний shows no freshness line

#### Scenario: A run in flight is what the line says

- **WHEN** a run started on opening is going on
- **THEN** the line says a sync is going on rather than stating an age, and states the new reading
  once the run ends

#### Scenario: A run that begins while Головний is open reaches the line

- **WHEN** Головний is already open and a run starts
- **THEN** the line says a sync is going on without Головний being left and reopened

#### Scenario: A failed run does not move the line

- **WHEN** the line states an age of two hours and a run ends without reaching monobank
- **THEN** the line still states the same completed sync, now two hours and a little older
