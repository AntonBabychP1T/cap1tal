## ADDED Requirements

### Requirement: A прогін nobody asked for spends its allowance on the statement, not on balances it already has

A прогін the owner did not ask for SHALL NOT send a client-info request when it already holds an
answer that serves it. The class is named in full below, and it is wider than «the ones the тихий
інтервал governs»: the follow-up after a перенесено прогін is expressly not governed by it and is
still a прогін nobody asked for. The answer it holds is the **newest** client-info answer this phone has stored, whoever
stored it — a прогін, or the monobank screen — and it serves when it was obtained less than the
**межа свіжості** ago. Such a прогін SHALL use it, and its first request to the personal API SHALL
be a statement request.

A прогін the owner asked for SHALL always send a client-info request, whatever the phone holds.
«Asked for» is the division the тихий інтервал already draws and SHALL be the same one here — there
is one notion of it in the app, not two: «Синхронізувати» on the monobank screen and the pull on
Головний are прогони the owner asked for; a прогін an opening starts, one a return to the
foreground starts, the follow-up after a перенесено прогін, and one a chance the phone gives are
прогони nobody asked for.

Both asked-for triggers are the owner saying «now», and answering them with balances from up to an
hour ago would take the one control they have for that away from them. Such a прогін can afford the
request: the owner is watching it, it may wait out the minute between requests, and over the ten
requests a sweep of nine рахунки costs, one spent on client-info is a tenth rather than the whole of
a chance.

A linked рахунок the newest stored answer does not name SHALL be treated exactly as a рахунок a
freshly fetched answer does not name: the token no longer shows it, the рахунок ends unavailable,
and nothing of its cursor, its imported item ids or its транзакції is touched. It SHALL NOT be a
reason to fetch client-info again. A рахунок the token has stopped showing keeps a stored row that
no answer will ever refresh, so treating that row as a reason to refetch would spend every прогін's
allowance on client-info for ever — which is the defect this requirement exists to remove.

A stored answer older than the межа свіжості, one dated in the future of the device's clock, or a
phone that holds none at all SHALL make the прогін ask the bank, exactly as it always has. So SHALL
one older than the cursor of a рахунок no синхронізація has ever completed: that answer reaches
nothing of the рахунок's history, so a прогін working from it would have nothing to ask about it —
and «finished without asking» is neither complete, which the screen would contradict with «Ще не
синхронізовано» in the same breath, nor перенесено, which says requests are still owed and would
make the прогін follow itself for as long as the app stayed open. Asking the bank costs one request
and heals it, because the answer that comes back is dated after the boundary the owner set. A
boundary in the future of the device's own clock is not healed by any answer and SHALL NOT force
the request, or the allowance would go to client-info for ever. The
answer it gets SHALL be stored before the прогін works its first рахунок, so a прогін that spends
its whole allowance on that request leaves the прогін after it able to send a statement request.

Committing a statement answer SHALL never move a рахунок's moment backwards. A прогін using a
stored answer commits the moment it read, and a fresher answer may have been stored meanwhile — by
the monobank screen, or by another рахунок's page — so a commit that overwrote it would leave one
рахунок behind the answer the next прогін reads and hand it `unavailable` for no reason.

Storing a client-info answer the app fetched is the opposite and SHALL overwrite every рахунок it
names, in either direction. It is the newest thing the bank has said, and it is what heals a row
this phone cannot otherwise correct — a row dated in the future of the device's clock is refreshed
to a moment *earlier* than the one it carried, and a rule that refused that would leave those rows
future-dated for ever and send every прогін back to client-info, which is the defect this
requirement exists to remove.

The bank's one request a minute is a single allowance across every request to the personal API, and
this requirement does not weaken it: a client-info request that IS sent takes the minute like any
other, and so does a client-info request the app sends outside a прогін.

Reading the stored answer SHALL NOT be able to fail a прогін: storage that refuses to answer SHALL
leave the прогін fetching client-info as it would have, rather than ending it.

#### Scenario: A fresh stored answer sends the allowance to the statement

- **WHEN** a прогін nobody asked for starts over two linked рахунки, the newest stored client-info
  answer names both and was obtained ten minutes ago, and the minimum gap has passed
- **THEN** no client-info request is sent, and the first request is the statement request of the
  рахунок that has waited longest since its хід

#### Scenario: «Синхронізувати» asks the bank however fresh the stored answer is

- **WHEN** the owner starts a прогін on the monobank screen ten minutes after the newest stored
  client-info answer was obtained
- **THEN** the прогін sends a client-info request, and what it imports is bounded by that answer's
  moment and not by the stored one's

#### Scenario: The pull on Головний asks the bank too

- **WHEN** the owner pulls down on Головний ten minutes after the newest stored client-info answer
  was obtained
- **THEN** the прогін sends a client-info request, exactly as «Синхронізувати» does

#### Scenario: A прогін an opening starts uses the stored answer

- **WHEN** the app is opened ten minutes after the newest stored client-info answer was obtained,
  and the тихий інтервал allows a прогін
- **THEN** no client-info request is sent and the first request is a statement request

#### Scenario: A link the token no longer names does not send every прогін back to client-info

- **WHEN** a рахунок is linked whose monobank account the newest stored answer — obtained ten
  minutes ago — does not name, while every other link is named
- **THEN** no client-info request is sent, that рахунок ends unavailable with nothing of its cursor
  or its транзакції touched, and the прогін spends its allowance on the other рахунки

#### Scenario: An answer older than the межа свіжості is refetched

- **WHEN** a прогін nobody asked for starts and the newest stored answer was obtained two hours ago
- **THEN** the прогін sends a client-info request before any statement request

#### Scenario: An answer dated in the future is refetched

- **WHEN** the newest stored client-info answer is dated after the device's clock
- **THEN** the прогін sends a client-info request rather than trusting it

#### Scenario: A phone that has never read client-info asks the bank

- **WHEN** a прогін starts on a phone that holds no stored client-info answer at all
- **THEN** the прогін sends a client-info request before any statement request

#### Scenario: A прогін that refetches leaves the next one able to send a statement

- **WHEN** a прогін spends its whole allowance on a client-info request and stops before any
  statement request
- **THEN** the answer it received is stored, and the прогін after it sends a statement request
  without asking for client-info again

#### Scenario: A committed page does not move a рахунок's moment backwards

- **WHEN** a прогін reads a stored answer, the monobank screen stores a newer one while that прогін
  is working, and the прогін then commits a page for one рахунок
- **THEN** that рахунок keeps the newer moment, and the прогін after it still reads it as named by
  the newest answer

#### Scenario: A прогін that may send one request imports with it

- **WHEN** a прогін that can afford exactly one request starts with a stored answer inside the межа
  свіжості
- **THEN** that one request is a statement request, the рахунок it was about takes its хід, and what
  it answers is imported

#### Scenario: Storage that will not answer does not stop the прогін

- **WHEN** reading the stored client-info answer fails
- **THEN** the прогін sends a client-info request and carries on, and the failure ends nothing

#### Scenario: A statement request is not sent seconds after a request the screen made

- **WHEN** the monobank screen has just sent a client-info request of its own and a прогін nobody
  asked for starts with a stored answer inside the межа свіжості
- **THEN** the прогін owes the minimum gap from that request and does not send a statement request
  inside it

### Requirement: A прогін imports nothing later than the client-info answer it used

A прогін SHALL import no транзакція later than the moment of the client-info answer it is using, and
SHALL commit that answer's баланс банку with that answer's own moment. A прогін SHALL therefore
never itself leave a рахунок holding a баланс банку newer than the транзакції it imported beside it,
and for a рахунок it carries to completion the two describe the same instant.

What can still leave the two apart is a refresh from outside the прогін, and it is bounded: a
рахунок that ends перенесено, or one still working through the вікна of its first синхронізація,
holds a баланс банку from an instant its cursor has not reached — as it always has, and as «Ще не
синхронізовано» says on the screen — and a рахунок whose row the monobank screen refreshed *while*
a прогін was working keeps that newer баланс банку beside транзакції through the older moment, for
as long as it takes the next прогін to reach it. The gap in that last case is one прогін wide rather
than a межа свіжості wide, which is what makes it the pre-existing shape and not the hour-long one
this requirement exists to prevent.

This is what keeps «Звірити» meaningful. Рахунки offers a коригування for the difference between a
рахунок's розрахунковий баланс and its баланс банку; a прогін that imported an hour of транзакції
against a баланс банку from an hour earlier would make that difference an hour of the owner's real
spending, and confirming «Звірити» would write a коригування for money that was already explained.
Ending the прогін's span at the answer's moment costs nothing — the span between it and now is
imported by the прогін after it, from the cursor this one committed.

The moment a рахунок's completed синхронізація is remembered by SHALL be the moment of the answer
the прогін used, and never the moment the прогін happened to finish. A рахунок whose cursor already
stands at that moment has nothing to ask the bank about: the прогін SHALL send no request about it,
take no хід for it, and report it complete — and the moment it is remembered by SHALL stay exactly
where it is rather than moving to now, because a sync the bank was never asked about is not a sync
that happened. Complete is the right word for it and перенесено is not: перенесено says requests
are still owed, a прогін that ends on it is followed at once by another while the app is in front,
and a прогін that could only report the same thing again would follow itself without end.

The pace's own clock is untouched by any of this. The moment the device last sent a request, and
the moment a link last took its хід, are moments of *requests* and SHALL go on being read from the
clock at the instant the request is sent.

#### Scenario: A прогін using a stored answer imports only up to that answer's moment

- **WHEN** a прогін uses a stored client-info answer obtained forty minutes ago and the bank holds
  транзакції from ten minutes ago
- **THEN** no транзакція later than the answer's moment is imported, and the рахунок's cursor lands
  at that moment

#### Scenario: The next прогін imports the rest

- **WHEN** the прогін after it uses a client-info answer of its own
- **THEN** it imports the транзакції between the previous answer's moment and its own

#### Scenario: A committed баланс банку carries the age of the answer it came from

- **WHEN** a рахунок's pages are committed from a stored client-info answer obtained forty minutes
  ago
- **THEN** the баланс банку stored with them is dated forty minutes ago and not the moment of the
  commit

#### Scenario: A completed рахунок is remembered by the answer's moment

- **WHEN** a рахунок completes every вікно up to a stored answer obtained forty minutes ago
- **THEN** its синхронізація is remembered as of forty minutes ago and not as of now

#### Scenario: A рахунок the screen refreshed mid-прогін keeps the newer balance

- **WHEN** the monobank screen stores a newer client-info answer while a прогін using an older one
  is working, and that прогін then completes a рахунок
- **THEN** the рахунок keeps the newer баланс банку and the newer moment, and the прогін after it
  brings its транзакції up to that moment

#### Scenario: A stored answer older than a рахунок the owner has just linked is refetched

- **WHEN** a рахунок no синхронізація has ever completed is linked with a boundary after the moment
  of the newest stored answer
- **THEN** the прогін sends a client-info request rather than working from that answer, and the
  answer it gets reaches past the boundary

#### Scenario: A boundary in the future of the clock does not force a request every прогін

- **WHEN** such a рахунок's boundary lies after the device's own clock, so no answer could reach it
- **THEN** the прогін uses the stored answer as it otherwise would

#### Scenario: A прогін with nothing to ask moves no moment

- **WHEN** a прогін runs while every linked рахунок's cursor already stands at the moment of the
  answer it is using
- **THEN** no request is sent, no хід is taken, every рахунок reports complete, and no рахунок's
  remembered synchronisation moment moves

#### Scenario: The pace still measures from the request

- **WHEN** a прогін using an hour-old stored answer sends a statement request
- **THEN** the moment the device last sent a request, and that link's хід, are both recorded as now
  and not as the answer's moment

### Requirement: A фоновий прогін sends what the pace allows and postpones the rest

A прогін started on a chance the phone gives SHALL send every request the bank's minimum gap
already allows at the moment it asks, and SHALL NOT wait for a gap it still owes: WHEN the next
request would have to sit out any part of the minimum gap, the прогін SHALL stop there without
sending, and every рахунок it did not finish SHALL end перенесено. A request already sent SHALL be
answered and its answer stored whole — the pace is asked before a request, never in the middle of
an answer.

A фоновий прогін SHALL have no time budget and SHALL start no timer. The phone's own chances are
what pace the app: they come no oftener than a quarter of an hour, which is longer than the gap the
bank asks for, so a chance that finds the gap passed may send. A прогін that waited would be
waiting on a timer the phone stops along with the app, which is a прогін that holds the one-run
lock for as long as the app stays closed and starves every chance that follows it.

A рахунок the прогін stopped before ends перенесено in the two shapes перенесено already takes:

- a рахунок no request was sent about has nothing moved — no request spent, no хід taken, its
  cursor and its last-sync moment exactly as they were — and, because no хід was taken, it keeps
  its place at the head of the next прогін's order;
- a рахунок the прогін stopped between its вікна keeps every page it committed, the cursor those
  pages moved and the хід its request took, and its last-sync moment does not move, because it did
  not complete; it queues behind every рахунок that has not yet had a хід, as the order of ходи
  already ranks it.

In both shapes the next прогін finds a cursor that is valid to continue from, so successive chances
work through every linked рахунок however many there are, each chance taking the рахунок that has
waited longest since its хід. The app SHALL claim no cadence for that: the phone defers chances as
it sees fit, and what the app promises is that every рахунок is reached by the chances that come
and by every opening, not that one is reached every quarter of an hour.

A прогін given no pacing to answer to SHALL never postpone anything.

#### Scenario: A chance sends what the gap allows and stops

- **WHEN** a chance starts a прогін over three linked рахунки, the phone's last request was a
  quarter of an hour ago, and a stored client-info answer inside the межа свіжості names all
  three
- **THEN** one statement request is sent for the рахунок that has waited longest since its хід,
  that рахунок takes its хід, and the other two end перенесено with no request sent about them

#### Scenario: A chance that owes the gap sends nothing

- **WHEN** a chance starts a прогін and this phone sent a request less than the minimum gap ago
- **THEN** no request is sent, every рахунок ends перенесено, and nothing is reported as a failure

#### Scenario: Successive chances work through every рахунок

- **WHEN** three chances a quarter of an hour apart each start a прогін over the same three linked
  рахунки
- **THEN** each chance sends its statement request about a different рахунок, in the order of ходи,
  and after the third every рахунок has had a хід

#### Scenario: A chance starts no timer

- **WHEN** a chance starts a прогін that cannot send, because the gap it owes has not passed
- **THEN** the прогін ends without having scheduled anything to wake it, and the next chance is
  what continues it

#### Scenario: An answer in flight when the прогін stops is still stored whole

- **WHEN** a statement answer is being stored as the прогін reaches a request it may not send
- **THEN** that answer's транзакції are stored and its cursor advances, and only the next request
  is not sent

#### Scenario: A рахунок never asked about keeps its place in the order

- **WHEN** a chance postponed two рахунки without sending a request about them, and a later прогін
  begins
- **THEN** those two are the first the later прогін asks the bank about, because no хід was taken
  for them

#### Scenario: A рахунок stopped between its вікна keeps its pages and its хід

- **WHEN** a рахунок whose first синхронізація spans three вікна has two committed when the прогін
  reaches a request it may not send
- **THEN** it ends перенесено with the транзакції of those two вікна stored, its cursor at the end
  of the second, its хід taken, and its last-sync moment not moved; the next прогін continues it
  from the third вікно

#### Scenario: A перенесено рахунок moves no moment

- **WHEN** a рахунок that completed a синхронізація yesterday ends перенесено today
- **THEN** its last-sync moment is still yesterday

#### Scenario: A прогін with no pacing to answer to postpones nothing

- **WHEN** a прогін over nine linked рахунки is given no pacing to answer to
- **THEN** every рахунок is sent its request and none ends перенесено

## REMOVED Requirements

### Requirement: A background run has a time budget and postpones what it cannot finish

**Reason**: The budget could not do what it was written to do. It assumed a фоновий прогін could
sit out the bank's minute inside a chance, and on the owner's phone that wait is a timer Android
stops along with the app: one chance sat inside a fifty-nine-second wait for twenty minutes,
holding the one-run lock, and the two chances that followed it found a прогін already running and
did nothing. Nine рахунки were linked and not one statement request was sent in two days.

**Migration**: Replaced by «A фоновий прогін sends what the pace allows and postpones the rest»,
which keeps every promise this requirement made about перенесено — both of its shapes, the cursor
that is valid to continue from, the answer in flight stored whole, and successive прогони working
through every рахунок — and drops only the budget and the wait. Nothing stored changes and no
рахунок needs re-syncing.

## MODIFIED Requirements

### Requirement: A run in front of the owner yields when the app leaves the foreground

A run started while the app is in front of the owner — on opening, on the pull, or on the monobank
screen — SHALL yield when the app leaves the foreground: it SHALL stop before its next request, and
the рахунки it had not finished SHALL end postponed in exactly the two shapes перенесено takes.
The wait before a request SHALL end at once when the app leaves the foreground, so the run does not
hold the one-run lock until the app is next opened. A request already sent SHALL be answered and
its answer stored whole.

The phone answers «in front» or «away» and nothing finer, and the app takes that answer at its
word: it cannot tell the owner leaving from a dialog drawn over the app, and it SHALL NOT guess.
What it may do is not waste a whole run on the answer. A run SHALL NOT yield before it has sent its
first request: a phone that reports «away» at the instant a run starts — a cold start whose window
is not resumed yet, a run begun as the owner glances elsewhere — then costs that run one request
rather than the whole of it, and what the run learns from that request is kept.

That rule reaches as far as the pace allows and no further. A run that is not in front of the owner
and that starts already owing the bank the minute between requests — because this device sent one
inside it — SHALL stop having sent nothing, and its рахунки SHALL end postponed. Such a run has
nothing it may send: the wait it owes is the pace's, not the foreground's; the app is not in front
for a timer to run it out; and a request sent regardless would be refused by the bank rather than
answered. Nothing is lost by it — the request it did not spend is the one whichever run went before
it just spent — and the next run continues from the same cursors. A run that owes the same minute
while the app *is* in front simply waits it out and carries on, as it always has.

This rule is the foreground run's alone. A фоновий прогін answers the same question from the pace
alone — it never waits, so it has no wait for a foreground to cut short — and is unaffected by any
of these sentences.

A run the owner stopped themselves SHALL still end cancelled, not postponed: postponed is a run
that stopped for want of time or of foreground, cancelled is the owner's decision, and the two
SHALL be told apart wherever an outcome is reported. Neither a run that yielded nor a run the owner
stopped SHALL raise a сповіщення про збій: a run that stopped is not a run that failed.

#### Scenario: Leaving the app stops the run at its next request

- **WHEN** a run over three linked рахунки has completed one and the app leaves the foreground
  during the wait before the second's request
- **THEN** the wait ends at once, no further request is sent, and the two remaining рахунки end
  postponed with no request sent about them

#### Scenario: An answer in flight is kept

- **WHEN** the app leaves the foreground while a statement answer is being awaited
- **THEN** that answer is stored when it arrives, and the run stops before the next request

#### Scenario: A run that has sent nothing does not yield

- **WHEN** a run in front of the owner starts while the phone already answers «away», and no
  request has been sent
- **THEN** the run sends its first request and keeps what it answers; only from the second request
  on does «away» stop it

#### Scenario: A run that owes the bank a minute sends nothing while the app is away

- **WHEN** a run starts while the phone answers «away» and this device sent a request less than
  the minute between requests ago
- **THEN** no request is sent, every рахунок ends postponed, and nothing is reported as a failure —
  the run had nothing it could spend without being refused

#### Scenario: The owner's stop still reads as cancelled

- **WHEN** the owner stops a run on the monobank screen while it waits before a request
- **THEN** the unfinished рахунки end cancelled, and none of them reads as postponed

#### Scenario: A run that yielded raises no сповіщення про збій

- **WHEN** a run the owner started on the monobank screen yields because the app left the
  foreground, with one рахунок complete and two postponed
- **THEN** no сповіщення про збій is raised

#### Scenario: A run the owner stopped raises no сповіщення про збій

- **WHEN** the owner stops a run on the monobank screen and the app is not in front of them when
  it ends
- **THEN** no сповіщення про збій is raised


### Requirement: A postponed run does not spend the quiet interval

WHEN the last attempt is remembered as postponed, a sync the owner did not ask for SHALL be allowed
to start at once — on opening, on returning to the foreground, and on a chance the phone gives —
because that run stopped for want of time or of foreground, not for want of need, and the requests
it did not spend are still owed. WHEN a run ends postponed while the app is in front of the owner,
the system SHALL start a run in front of the owner at once, so a run the background began finishes
in front of the owner instead of waiting for the next chance. The follow-up SHALL be decided from the
outcome of the run that just ended and from nothing else: a run that ended any other way — complete,
failed, cancelled, or one that never reached the bank and left no attempt — SHALL be followed by
nothing, and a run that ends while the app is not in front of the owner SHALL be followed by
nothing either. A run that ends any other way SHALL hold the quiet interval as it does today.

#### Scenario: Opening after a postponed run syncs at once

- **WHEN** the last attempt was two minutes ago and is remembered as postponed, and the app is
  opened
- **THEN** a run starts

#### Scenario: A completed run still holds the interval

- **WHEN** the last attempt was two minutes ago and is remembered as complete, and the app is
  opened
- **THEN** no run starts and no request is sent

#### Scenario: A run the background began finishes in front of the owner

- **WHEN** a background run ends postponed while the app is in front of the owner
- **THEN** a run in front of the owner starts at once, which waits out the gap it owes rather than
  stopping at it

#### Scenario: The follow-up is not a loop

- **WHEN** that follow-up run ends complete
- **THEN** no further run starts until the quiet interval has passed

#### Scenario: A run that never reached the bank is not followed up

- **WHEN** a рахунок is linked, no токен is configured, the app is in front of the owner, and a
  run starts and ends without reaching the bank
- **THEN** no attempt is left recorded and no second run starts

#### Scenario: A run that yields in the background is not followed up

- **WHEN** a run ends postponed while the app is not in front of the owner
- **THEN** no run starts until the app is next opened or the phone next gives a chance
