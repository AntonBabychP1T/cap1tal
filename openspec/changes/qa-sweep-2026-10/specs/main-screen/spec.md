## MODIFIED Requirements

### Requirement: Sync occupies a compact header

Configured linked monobank accounts SHALL expose existing coverage/freshness and manual sync in the compact header, preserving pull-to-refresh, existing manual-sync rules and in-flight joining without creating a separate sync card. Linked accounts without a configured token are not quiet: the service rail says so, as «A linked bank without a token is stated under the header» requires, while pulling down only reloads local data.

#### Scenario: Partial coverage is not fresh coverage
- **GIVEN** three of nine linked accounts have completed a sync
- **WHEN** the header is read
- **THEN** it reports 3 of 9, never an age implying all nine are current; once all nine complete the oldest completion defines age

#### Scenario: Button and gesture share a run
- **GIVEN** a sync is running
- **WHEN** the owner pulls to refresh or taps manual sync
- **THEN** the existing run is joined, no duplicate starts, cached values stay readable and refreshing ends on success or failure

#### Scenario: No bank remains quiet
- **GIVEN** no linked accounts
- **WHEN** Головний is read or pulled to refresh
- **THEN** no bank status/control or bank failure appears and the gesture only reloads local data

#### Scenario: A linked bank without a token is not synced by the gesture
- **GIVEN** linked accounts and no configured token
- **WHEN** Головний is pulled to refresh
- **THEN** no sync starts, no request leaves the phone, local data reloads, and the no-token row stays

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
showing an empty age. WHEN no рахунок is linked, Головний SHALL show no freshness line at all — an owner who never
connected a bank is told nothing about one. WHEN рахунки are linked but monobank is not configured
— the token was removed or never re-entered — Головний SHALL show no freshness line either, and
the service rail SHALL instead say that the bank is not being heard, as «A linked bank without a
token is stated under the header» requires.

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

### Requirement: The «Спостереження» widget points at what is notable this month

When visible, the «Спостереження» widget SHALL show up to three спостереження of the current
month. It SHALL take the first three in the order the observations capability defines, each in
its one sentence, each leading where that capability says. A можливий дубль SHALL carry its «Не
дубль» answer, which takes effect in place without leaving Головний.

WHEN the current month has more than three спостереження, the widget SHALL offer «Усі (N)»,
naming how many there are and leading to Місяць on the current month.

WHEN the current month has none, the widget SHALL say so in one sentence, drawn inside the same card
its lines are drawn in, and keep its place.

On the first seven days of a month, WHEN the previous month is a завершений активний місяць, the
widget SHALL open with one more row, «Підсумок <місяця>», leading to that month's підсумок. From
the eighth day that row SHALL no longer be shown. It is not remembered as seen.

Showing the widget SHALL write nothing, post nothing and request nothing.

#### Scenario: Three of five

- **WHEN** October 2026 has five спостереження and the widget is visible
- **THEN** the widget shows the first three in order and «Усі (5)», which opens Місяць on October

#### Scenario: Nothing notable yet

- **WHEN** today is 2026-10-10 and the current month has no спостереження
- **THEN** the widget says there is nothing unusual this month so far, inside the widget's card,
  and nothing else

#### Scenario: September's підсумок in the first week of October

- **WHEN** today is 2026-10-02 and September 2026 holds транзакції
- **THEN** the widget opens with «Підсумок вересня», which opens the підсумок of September

#### Scenario: The підсумок row leaves after the seventh day

- **WHEN** today is 2026-10-08
- **THEN** the widget shows no «Підсумок вересня» row, and the підсумок is still reachable from
  Місяць

#### Scenario: «Не дубль» on Головний

- **WHEN** the widget shows a можливий дубль and the owner answers «Не дубль»
- **THEN** the pair disappears from the widget, the next спостереження takes its place if there is
  one, and Головний is not left

#### Scenario: A hidden widget shows nothing

- **WHEN** the owner has hidden «Спостереження» in dashboard editing
- **THEN** Головний shows no спостереження and no «Підсумок» row, and the service rail is unchanged

## ADDED Requirements

### Requirement: A linked bank without a token is stated under the header

WHEN at least one unarchived рахунок is linked to monobank and no monobank token is configured,
the service rail directly below Головний's header SHALL carry one compact row saying that monobank
is not being read for lack of a token, how many linked рахунки are affected, and since when: the
oldest last completed sync among the linked рахунки that ever synced, as a дата in words — a
linked рахунок that never synced does not hide the others' дата — or, when none of them ever
synced, no дата and that they never synced. Its tap SHALL
open the monobank screen. The row SHALL follow the rail's rules: outside the configurable widgets,
never hidden or reordered, taking no space when absent, and making no network request of its own.
It SHALL be gone as soon as a token is configured or no рахунок is linked any more.

#### Scenario: Twelve days without a token are said

- **WHEN** nine рахунки are linked to monobank, no token is configured, the oldest last sync of
  them completed on 2026-09-21 and today is 2026-10-05
- **THEN** the rail says monobank is not read without a token for 9 рахунків since 21 вересня, and
  its tap opens the monobank screen

#### Scenario: Some linked рахунки never synced

- **WHEN** nine рахунки are linked to monobank, no token is configured, seven of them last synced
  between 2026-09-21 and 2026-09-28, two never synced, and today is 2026-10-05
- **THEN** the rail says monobank is not read without a token for 9 рахунків since 21 вересня

#### Scenario: No linked рахунок ever synced

- **WHEN** two рахунки are linked to monobank, no token is configured and neither ever synced
- **THEN** the rail says monobank is not read without a token for 2 рахунків and that they never
  synced, and names no дата

#### Scenario: A device that never connected a bank stays quiet

- **WHEN** no рахунок is linked and no token is configured
- **THEN** no monobank row and no freshness line appear

#### Scenario: Entering the token clears the row

- **WHEN** the owner enters a token on the monobank screen and returns to Головний
- **THEN** the no-token row is gone and the freshness line states the bank's freshness as usual

### Requirement: A дохід «Без джерела» is given its джерело in one tap

The feed and «Транзакції» SHALL visibly mark every дохід carrying «Без джерела», and from that
mark the owner SHALL be able to pick an unarchived джерело and have it stored on that дохід without
opening editing; the mark SHALL disappear with the pick. The джерела offered SHALL follow the same
short-list rule as the категорії of «Без категорії»: at most five, the rest behind one offer naming
how many there are in all, «Без джерела» itself not among them. The mark SHALL offer only джерела.
A дохід «Без джерела» that is really a повернення or one leg of a переказ is not answered from the
mark: tapping the line itself, outside the mark, SHALL open its editing as it does today, where the
дохід is retyped as that editing already allows.

#### Scenario: One tap gives a дохід its джерело

- **WHEN** the feed holds a дохід of 96000 minor units UAH «Від: Міхаіл Кас'ян» in «Без джерела»
  and the owner picks «Подарунки» from its mark
- **THEN** that дохід carries «Подарунки», editing never opened, and the mark is gone

#### Scenario: The same mark in «Транзакції»

- **WHEN** «Транзакції» lists a дохід of 96000 minor units UAH «Від: Міхаіл Кас'ян» in «Без
  джерела» and the owner picks «Подарунки» from its mark
- **THEN** that дохід carries «Подарунки», editing never opened, and the mark is gone

#### Scenario: A дохід that is really a повернення is retyped from its editing

- **WHEN** the feed holds a дохід «Без джерела» of 45000 minor units UAH «Скасування покупки
  Rozetka» and the owner taps the line outside its mark
- **THEN** the editing of that дохід opens, where it can be retyped as a повернення as it can
  today, and the mark itself offers nothing but джерела

#### Scenario: Nothing else is offered a джерело

- **WHEN** the feed holds a витрата, a переказ and a коригування
- **THEN** none of them carries the «Без джерела» mark

### Requirement: The quick категорія picker leads with what a правило would give

WHEN the «Без категорії» mark is used on a витрата whose опис a правило or the шаблон categorises,
that категорія SHALL be offered first among the five, marked as the suggestion; it SHALL be stored
only when the owner picks it. Opening the full list of категорії from the mark SHALL show the list
and its search field without raising the keyboard; the keyboard SHALL open only when the owner taps
the search field, and the list SHALL stay in sight above it while they type.

#### Scenario: The шаблон's категорія is one tap away

- **WHEN** a витрата «Oplata poslug MEGOGO KYIV» in «Без категорії» is marked and the шаблон gives
  that опис «Підписки»
- **THEN** «Підписки» is the first of the five offered, marked as the suggestion, and nothing is
  stored until it is picked

#### Scenario: The full list is read before it is searched

- **WHEN** the owner opens «Всі категорії (27)» from the mark
- **THEN** the list is shown and no keyboard covers it

### Requirement: A сума the owner left empty or not positive is refused by what is wrong

The entry and editing forms SHALL refuse an empty сума with «Напишіть суму» and a сума that is
zero or negative with «Сума має бути більшою за нуль», and keep the refusal that quotes the typed
text for anything that is not a number.

#### Scenario: An empty сума asks for one

- **WHEN** the owner chooses a рахунок, leaves «Сума» empty and taps «Записати»
- **THEN** nothing is recorded and the refusal reads «Напишіть суму»

#### Scenario: A negative сума is named as such

- **WHEN** the owner types «-50» into «Сума» and taps «Записати»
- **THEN** nothing is recorded and the refusal reads «Сума має бути більшою за нуль»
