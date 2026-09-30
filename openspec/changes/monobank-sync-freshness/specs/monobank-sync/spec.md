## MODIFIED Requirements

### Requirement: A прогін nobody asked for spends its allowance on the statement, not on balances it already has

A прогін the owner did not ask for SHALL NOT send a client-info request when it already holds an
answer that serves it. The answer it holds is the **newest** client-info answer this phone has
stored, whoever stored it — a прогін, or the monobank screen — and it serves when it was obtained
less than the **межа свіжості** ago. The межа свіжості SHALL be one minute: a прогін that starts more
than a minute after the newest stored answer asks the bank for the balances first, because the
balances are what tell it which рахунки moved (see «A moved баланс банку, a new link and a sync the
owner asked for make a рахунок позачерговий»). Inside the межа свіжості such a прогін SHALL use the
stored answer, and its first request to the personal API SHALL be a statement request.

A прогін the owner asked for SHALL always send a client-info request, whatever the phone holds.
«Asked for» is the division the тихий інтервал already draws and SHALL be the same one here:
«Синхронізувати» on the monobank screen, and the pull and «Оновити» on Головний, are прогони the
owner asked for; a прогін an opening starts, one a return to the foreground starts, the follow-up
after a перенесено прогін, a дочитування and one a chance the phone gives are прогони nobody asked
for.

The client-info request SHALL NOT be paced against the statement minute and SHALL NOT count against
it: the bank limits the two separately, so a прогін that asks for the balances still sends its first
statement request as soon as the minute since the last statement request allows.

A linked рахунок the newest stored answer does not name SHALL be treated exactly as a рахунок a
freshly fetched answer does not name: the token no longer shows it and it is set aside (see «A
рахунок the token no longer shows is set aside, not failed»), and nothing of its cursor, its imported
item ids or its транзакції is touched. It SHALL NOT be a reason to fetch client-info again.

A stored answer dated in the future of the device's clock, or a phone that holds none at all, SHALL
make the прогін ask the bank. So SHALL an answer older than the cursor of a рахунок no синхронізація
has ever completed, unless that cursor is itself in the future of the device's clock. The answer it
gets SHALL be stored before the прогін works its first рахунок.

Committing a statement answer SHALL never move a рахунок's moment backwards; storing a client-info
answer the app fetched SHALL overwrite every рахунок it names, in either direction. Reading the
stored answer SHALL NOT be able to fail a прогін: storage that refuses to answer SHALL leave the
прогін fetching client-info as it would have, rather than ending it.

#### Scenario: A stored answer from seconds ago sends the allowance to the statement

- **WHEN** a прогін nobody asked for starts over two linked рахунки, the newest stored client-info
  answer names both and was obtained twenty seconds ago, and the minimum gap has passed
- **THEN** no client-info request is sent, and the first request is a statement request

#### Scenario: A stored answer older than a minute is refetched

- **WHEN** a прогін nobody asked for starts and the newest stored answer was obtained ten minutes
  ago
- **THEN** the прогін sends a client-info request before any statement request

#### Scenario: «Синхронізувати» asks the bank however fresh the stored answer is

- **WHEN** the owner starts a прогін on the monobank screen twenty seconds after the newest stored
  client-info answer was obtained
- **THEN** the прогін sends a client-info request, and what it imports is bounded by that answer's
  moment and not by the stored one's

#### Scenario: The balances do not cost the statement its minute

- **WHEN** a прогін nobody asked for starts two minutes after the last statement request and eleven
  minutes after the newest stored answer
- **THEN** it sends a client-info request and then a statement request without waiting between them

#### Scenario: A link the token no longer names does not send every прогін back to client-info

- **WHEN** a рахунок is linked whose monobank account the newest stored answer — obtained twenty
  seconds ago — does not name, while every other link is named
- **THEN** no client-info request is sent, that рахунок is set aside with nothing of its cursor or
  its транзакції touched, and the прогін spends its allowance on the other рахунки

#### Scenario: An answer dated in the future is refetched

- **WHEN** the newest stored client-info answer is dated after the device's clock
- **THEN** the прогін sends a client-info request rather than trusting it

#### Scenario: A phone that has never read client-info asks the bank

- **WHEN** a прогін starts on a phone that holds no stored client-info answer at all
- **THEN** the прогін sends a client-info request before any statement request

#### Scenario: A committed page does not move a рахунок's moment backwards

- **WHEN** a прогін reads a stored answer, the monobank screen stores a newer one while that прогін
  is working, and the прогін then commits a page for one рахунок
- **THEN** that рахунок keeps the newer moment

#### Scenario: Storage that will not answer does not stop the прогін

- **WHEN** reading the stored client-info answer fails
- **THEN** the прогін sends a client-info request and carries on, and the failure ends nothing

### Requirement: A run gives each linked account a turn, longest-waiting first

A sync run SHALL work through the linked рахунки in three groups: first every **позачерговий**
рахунок that has not had a turn since it became позачерговий; then every **overdue** рахунок — one
whose last turn was three hours ago or more, or that has never had one; then every other linked
рахунок. Within each group the order SHALL be how long each рахунок has waited for a turn: every
рахунок that has never had one before every рахунок that has, then by the moment of its last turn,
oldest first. Two рахунки that have waited exactly as long SHALL be ordered by their monobank
account identifier, so a run is reproducible.

A **turn** is a run sending the bank a request about that рахунок — taken whether the рахунок went
on to complete, to fail, or to be stopped, and not taken at all when the run spends no request on
it. The moment of a рахунок's last turn SHALL be remembered on the device and SHALL survive the run
that took it.

The order SHALL be decided once per run, after the run has the client-info answer it works from —
so a рахунок that answer shows to have moved is already позачерговий — and SHALL NOT change while
that run is going on: a рахунок this run gives a turn to does not move to the back of this run's own
queue.

Priority ends at the turn. A позачерговий рахунок that has had a turn since it became позачерговий
and is still позачерговий — its statement failed, or it needs more pages than that turn read — waits
in the later groups like any other, and an overdue рахунок is not overdue again until three hours
after its turn. That is what keeps a рахунок that cannot complete from spending every run's requests
while the rest starve, and the overdue group is what bounds how long a рахунок that is never
позачерговий can be passed over while busier рахунки take every chance: once three hours have passed
since its turn, it goes before every рахунок that is merely waiting.

#### Scenario: A позачерговий рахунок goes before one that has waited longer

- **WHEN** a run begins with one linked рахунок whose last turn was two hours ago and one that
  became позачерговий ten minutes ago and has had no turn since, its last turn an hour ago
- **THEN** the позачерговий рахунок is the first the run asks the bank about

#### Scenario: A рахунок the balances show moved goes first in the run that saw it

- **WHEN** a run fetches client-info and the answer shows one рахунок's баланс банку differs from the
  one stored, while that рахунок had its turn a minute ago and two others waited longer
- **THEN** that рахунок is the first the run sends a statement request about

#### Scenario: A рахунок the busy ones keep passing over is reached within three hours

- **WHEN** the black card moves before every chance, so it is позачерговий in each, and a white card
  that never moves had its last turn three hours ago
- **THEN** the white card is overdue and goes before every рахунок that is merely waiting, second
  only to the позачерговий black card

#### Scenario: An account that has never had a turn goes first among those not позачергові

- **WHEN** a run begins with one linked рахунок that had a turn an hour ago and one that has never
  had one, neither позачерговий
- **THEN** the рахунок that has never had a turn is the first the run asks the bank about

#### Scenario: The longest-waiting account goes first

- **WHEN** a run begins with three linked рахунки, none позачерговий or overdue, whose last turns
  were two hours ago, an hour ago and a minute ago
- **THEN** the run works through them oldest first: two hours, then an hour, then a minute

#### Scenario: Accounts that have waited equally are ordered reproducibly

- **WHEN** a run begins with two linked рахунки in the same group that have never had a turn
- **THEN** they are processed in the order of their monobank account identifiers, and a second run
  from the same state uses the same order

#### Scenario: A run cut short leaves different accounts first next time

- **WHEN** a run over nine linked рахунки, none of which has had a turn, is stopped after three of
  them complete
- **THEN** the next run begins with the six that have not had a turn, and spends no request on the
  three that already had one until all six have

#### Scenario: An account that never completes does not hold the queue

- **WHEN** a linked рахунок whose statement is answered `unavailable` every time is the first of
  nine in a run
- **THEN** its failed turn still counts as a turn, and the next run begins with a рахунок that has
  waited longer rather than with it again

#### Scenario: A позачерговий рахунок that keeps failing does not hold the queue

- **WHEN** a позачерговий рахунок whose statement is answered `unavailable` every time had its turn
  in the last run, and two other рахунки are linked that waited longer
- **THEN** the next run begins with a рахунок that has waited longer rather than with it again

#### Scenario: An account no request is spent on keeps its place

- **WHEN** a linked рахунок the token no longer shows is passed over without a request being sent
- **THEN** no turn is taken for it and its place in the next run's order is unchanged

#### Scenario: A run stopped while it waits spends no request and takes no turn

- **WHEN** the owner stops a run while it is waiting out the API's minimum gap before a рахунок's
  request
- **THEN** no request is sent for that рахунок, no turn is taken for it, and the run reports it as
  stopped rather than as a failure of the bank

#### Scenario: Giving an account its turn does not reorder the run it is in

- **WHEN** a run's first рахунок completes and the run moves on
- **THEN** the run continues through the rest of the order it began with, and does not revisit the
  рахунок it has just given a turn to

### Requirement: The minimum gap between requests holds across runs, not only within one

The system SHALL send no **statement** request to the personal API sooner than the API's minimum gap
after the last statement request it sent, counting requests made by earlier runs as well as by the
current one. The moment of the last statement request SHALL be remembered on the device, SHALL be
updated for every statement request actually sent — whatever that request answered — and SHALL
survive the run that sent it ending, however it ended and whether or not the app kept running. A
client-info request is limited by the bank apart from the statement and SHALL neither wait for this
gap nor move this moment.

A remembered moment that lies in the future of the device's clock SHALL NOT make a run wait longer
than the gap itself: the wait SHALL never exceed one gap.

Remembering the moment SHALL NOT be able to fail a run: storage that refuses the write SHALL leave
the run pacing itself as it would have, rather than ending it.

#### Scenario: A run started immediately after another waits

- **WHEN** a run ends and another is started before the API's minimum gap has passed since the
  last statement request the previous run sent
- **THEN** the new run waits out the remainder of the gap before its first statement request,
  rather than sending it at once

#### Scenario: A run started long after another does not wait

- **WHEN** a run is started well after the minimum gap has passed since the last statement request
  any run sent
- **THEN** its first request goes out without waiting

#### Scenario: The first run on a device does not wait

- **WHEN** a run starts on a device that has never sent a request to the personal API
- **THEN** its first request goes out without waiting

#### Scenario: A client-info request does not move the gap

- **WHEN** a run sends a client-info request and then a statement request, and the last statement
  request was two minutes before
- **THEN** the statement request goes out without waiting, and the remembered moment is that of the
  statement request

#### Scenario: A clock moved forward does not stall sync

- **WHEN** the remembered moment of the last statement request lies in the future of the device's
  clock
- **THEN** the run waits at most one gap before its first statement request, and does not wait out
  the difference

#### Scenario: A failed run still moves the remembered moment

- **WHEN** a run's statement request is answered with a rate limit and the run ends
- **THEN** the moment of that request is remembered, so the next run paces itself from it

#### Scenario: Storage that will not remember the moment does not stop the run

- **WHEN** remembering the moment of a request fails
- **THEN** the run carries on and imports what it can, and the failure ends nothing

### Requirement: A фоновий прогін sends what the pace allows and postpones the rest

A прогін started on a chance the phone gives, or by a дочитування, SHALL send every request the
bank's minimum gap already allows at the moment it asks, and SHALL NOT wait for a gap it still
owes: WHEN the next statement request would have to sit out any part of the minimum gap, the прогін
SHALL stop there without sending, and every рахунок it did not finish SHALL end перенесено. A
request already sent SHALL be answered and its answer stored whole — the pace is asked before a
request, never in the middle of an answer.

A фоновий прогін SHALL have no time budget and SHALL start no timer of its own inside the app. What
continues it is the phone: the next periodic chance, or a дочитування it asked the phone for — a
one-off chance the phone schedules and delivers even when the app is not running (see «A прогін that
stops with an unread позачерговий рахунок asks for a дочитування»). A прогін that waited would be
waiting on a timer the phone stops along with the app, which is a прогін that holds the one-run lock
for as long as the app stays closed and starves every chance that follows it.

A рахунок the прогін stopped before ends перенесено in the two shapes перенесено already takes:

- a рахунок no request was sent about has nothing moved — no request spent, no хід taken, its
  cursor and its last-sync moment exactly as they were — and, because no хід was taken, it keeps
  its place in the next прогін's order;
- a рахунок the прогін stopped between its вікна keeps every page it committed, the cursor those
  pages moved and the хід its request took, and its last-sync moment does not move, because it did
  not complete.

In both shapes the next прогін finds a cursor that is valid to continue from, so successive chances
work through every linked рахунок however many there are. The app SHALL claim no cadence for that:
the phone defers chances as it sees fit.

A прогін given no pacing to answer to SHALL never postpone anything.

#### Scenario: A chance sends what the gap allows and stops

- **WHEN** a chance starts a прогін over three linked рахунки, none позачерговий, the phone's last
  statement request was a quarter of an hour ago, and a stored client-info answer inside the межа
  свіжості names all three
- **THEN** one statement request is sent for the рахунок that has waited longest since its хід,
  that рахунок takes its хід, and the other two end перенесено with no request sent about them

#### Scenario: A chance that owes the gap sends nothing

- **WHEN** a chance starts a прогін and this phone sent a statement request less than the minimum
  gap ago
- **THEN** no statement request is sent, every рахунок ends перенесено, and nothing is reported as a
  failure

#### Scenario: Successive chances work through every рахунок

- **WHEN** three chances a quarter of an hour apart each start a прогін over the same three linked
  рахунки, none позачерговий
- **THEN** each chance sends its statement request about a different рахунок, in the order of ходи,
  and after the third every рахунок has had a хід

#### Scenario: A chance starts no timer

- **WHEN** a chance starts a прогін that cannot send, because the gap it owes has not passed, and
  no рахунок is left позачерговий without its turn or overdue
- **THEN** the прогін ends without having started a timer or asked for anything to wake it, and the
  next chance is what continues it

#### Scenario: An answer in flight when the прогін stops is still stored whole

- **WHEN** a statement answer is being stored as the прогін reaches a request it may not send
- **THEN** that answer's транзакції are stored and its cursor advances, and only the next request
  is not sent

#### Scenario: A рахунок stopped between its вікна keeps its pages and its хід

- **WHEN** a рахунок whose first синхронізація spans three вікна has two committed when the прогін
  reaches a request it may not send
- **THEN** it ends перенесено with the транзакції of those two вікна stored, its cursor at the end
  of the second, its хід taken, and its last-sync moment not moved; a later прогін continues it
  from the third вікно

#### Scenario: A перенесено рахунок moves no moment

- **WHEN** a рахунок that completed a синхронізація yesterday ends перенесено today
- **THEN** its last-sync moment is still yesterday

#### Scenario: A прогін with no pacing to answer to postpones nothing

- **WHEN** a прогін over nine linked рахунки is given no pacing to answer to
- **THEN** every рахунок is sent its request and none ends перенесено

### Requirement: A postponed run does not spend the quiet interval

WHEN the last attempt is remembered as postponed, a sync the owner did not ask for SHALL be allowed
to start at once — on opening, on returning to the foreground, on a chance the phone gives and on a
дочитування — because that run stopped for want of time or of foreground, not for want of need, and
the requests it did not spend are still owed. A chance the phone gives and a дочитування SHALL
also start at once WHEN a рахунок the token shows is позачерговий without a turn since, or overdue:
the bank holds something the phone has not read, whatever the last attempt came to. An opening and a
return to the foreground keep the тихий інтервал for that case, as today.

WHEN a run ends postponed while the app is in front of the owner, the system SHALL start a run in
front of the owner at once, so a run the background began finishes in front of the owner instead of
waiting for the next chance. That follow-up SHALL be decided from the outcome of the run that just
ended and from nothing else: a run that ended any other way — complete, failed, cancelled, or one
that never reached the bank and left no attempt — SHALL be followed by nothing in front of the
owner. A run that ends while the app is not in front of the owner SHALL start nothing in the app; it
SHALL be continued by a дочитування exactly when that requirement asks for one, and otherwise by the
next chance or opening. A run that ends any other way SHALL hold the quiet interval as it does today.

#### Scenario: Opening after a postponed run syncs at once

- **WHEN** the last attempt was two minutes ago and is remembered as postponed, and the app is
  opened
- **THEN** a run starts

#### Scenario: A completed run still holds the interval

- **WHEN** the last attempt was two minutes ago and is remembered as complete, no рахунок is
  позачерговий or overdue, and the app is opened
- **THEN** no run starts and no request is sent

#### Scenario: A failure in the middle of a chain does not end it

- **WHEN** a дочитування's прогін reads one позачерговий рахунок, whose statement is answered
  `unavailable`, and two позачергові рахунки without a turn are left
- **THEN** the attempt is remembered as unavailable, and the next дочитування still runs rather than
  ending not due

#### Scenario: A run the background began finishes in front of the owner

- **WHEN** a background run ends postponed while the app is in front of the owner
- **THEN** a run in front of the owner starts at once, which waits out the gap it owes rather than
  stopping at it

#### Scenario: The follow-up is not a loop

- **WHEN** that follow-up run ends complete
- **THEN** no further run starts in front of the owner until the quiet interval has passed

#### Scenario: A run that never reached the bank is not followed up

- **WHEN** a рахунок is linked, no токен is configured, the app is in front of the owner, and a
  run starts and ends without reaching the bank
- **THEN** no attempt is left recorded and no second run starts

#### Scenario: A run that yields in the background starts nothing in the app

- **WHEN** a run ends postponed while the app is not in front of the owner, with no рахунок left
  позачерговий without its turn or overdue
- **THEN** nothing runs until the app is next opened or the phone next gives a chance

### Requirement: A sync also runs on the chances the phone gives while the app is not in front of the owner

The system SHALL ask the phone for chances to run in the background while monobank has at least
one linked рахунок, and SHALL stop asking when none is linked. On every chance the phone gives,
the system SHALL start a **background run** — the same sync an opening starts, under the same
rules: the quiet interval (and what makes a run due inside it), the one-request-a-minute pace held
across runs, the order of turns, the one-run lock and the remembered attempt — so a chance that is
not due, or that comes while a run is going on, sends nothing. The token SHALL reach the bank
exactly as it does in front of the owner: read for the run and kept nowhere else.

Periodic chances SHALL be asked for no oftener than about every fifteen minutes. Beside them the
system SHALL ask for one-off chances only as a дочитування — after a прогін that left a позачерговий
or overdue рахунок unread, or after a поштовх — never more than one pending at a time. WHEN the phone gives
either is the phone's decision: the system SHALL claim no cadence, and the runs an opening, a pull or
the owner start SHALL remain exactly as they are, so a phone that gives no chance syncs as it does
today.

#### Scenario: A background run after the quiet interval syncs without the app being opened

- **WHEN** monobank is configured, a рахунок is linked, the last attempt was twenty minutes ago,
  and the phone gives a chance to run
- **THEN** a background run starts, the транзакції it imports are stored, and the moments it moved
  are what the app shows when it is next opened

#### Scenario: A chance inside the quiet interval sends nothing

- **WHEN** the last attempt was five minutes ago and complete, no рахунок is позачерговий or
  overdue, no поштовх came since, and the phone gives a chance to run
- **THEN** no request is sent and the remembered attempt is unchanged

#### Scenario: A chance while a run is going on starts no second one

- **WHEN** a run is going on and the phone gives a chance to run
- **THEN** no second run starts and nothing is changed

#### Scenario: A chance with nothing linked sends nothing and leaves no attempt

- **WHEN** no рахунок is linked and the phone gives a chance to run
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: A chance without a token sends nothing and leaves no attempt

- **WHEN** a рахунок is linked, monobank is not configured, and the phone gives a chance to run
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: Unreadable token storage on a chance sends nothing and leaves no attempt

- **WHEN** a рахунок is linked, the token storage cannot be read, and the phone gives a chance to
  run
- **THEN** no request is sent, no attempt is left recorded, and the next chance tries again

#### Scenario: Chances are wanted exactly while a рахунок is linked

- **WHEN** the owner links the first рахунок, later unlinks the last one, and later links one
  again
- **THEN** the phone is asked for chances and поштовхи are wanted after the first link, neither
  after the last unlink, and both again after the relink

## ADDED Requirements

### Requirement: A moved баланс банку, a new link and a sync the owner asked for make a рахунок позачерговий

A linked рахунок SHALL be **позачерговий** from a moment on, when the app knows the bank holds
something about it that has not been read yet, and SHALL stop being позачерговий when a
синхронізація of it completes up to that moment or later. Three things make a рахунок позачерговий:

- storing a client-info answer whose баланс банку for a linked рахунок differs from the one stored
  before it — whoever stores it, a прогін or the monobank screen; the moment is that answer's;
- linking it; the moment is its sync boundary;
- a прогін the owner asked for; every linked рахунок becomes позачерговий at the moment the прогін
  starts.

A рахунок already позачерговий SHALL take the **later** of its moment and the new one, so a
синхронізація that completes up to an older answer cannot clear a movement it never saw. A synced
рахунок SHALL stay позачерговий when the синхронізація that completed reached a moment earlier than
the one it is позачерговий from. An unchanged баланс банку SHALL change nothing: the app does not
claim a рахунок current because its balance did not move, and a рахунок that is not позачерговий is
still read in its turn.

#### Scenario: A balance that moved makes its рахунок позачерговий

- **WHEN** a client-info answer is stored in which the black card's баланс банку is 120 000 lower than
  the stored one, and every other рахунок's is unchanged
- **THEN** the black card is позачерговий from that answer's moment, and no other рахунок is

#### Scenario: The screen's own refresh is not lost

- **WHEN** the monobank screen stores a client-info answer in which a linked рахунок's баланс банку
  moved, and a прогін nobody asked for starts twenty seconds later without fetching client-info
- **THEN** that рахунок is позачерговий and goes first in that прогін

#### Scenario: Asking for a sync makes every рахунок позачерговий

- **WHEN** the owner pulls down on Головний with nine linked рахунки, none позачерговий
- **THEN** all nine are позачергові from the moment the прогін started

#### Scenario: A new link is позачерговий from its boundary

- **WHEN** the owner links a рахунок with a sync boundary of 2026-09-01
- **THEN** it is позачерговий from the start of 2026-09-01 until a синхронізація of it completes

#### Scenario: A completed sync clears it

- **WHEN** a позачерговий рахунок completes a синхронізація up to a moment after the one it became
  позачерговий at
- **THEN** it is no longer позачерговий

#### Scenario: A later movement is not lost to a sync over an older answer

- **WHEN** a прогін works from an answer of 10:04, the monobank screen stores one of 10:05 in which
  the same рахунок moved again, and the прогін then completes that рахунок up to 10:04
- **THEN** it stays позачерговий from 10:05

#### Scenario: An unchanged balance changes nothing

- **WHEN** a client-info answer is stored in which no linked рахунок's баланс банку moved
- **THEN** no рахунок becomes позачерговий and no рахунок's last-sync moment moves

### Requirement: A прогін that stops with an unread позачерговий рахунок asks for a дочитування

WHEN a прогін ends with at least one рахунок перенесено that is позачерговий without a turn since it
became so, or overdue, and the app is not in front of the owner as it ends, the system SHALL ask the
phone for a **дочитування**: a one-off chance to run again, no sooner than the minimum gap after the
last statement request allows a statement request. A дочитування SHALL run the same прогін a chance
the phone gives runs, under the same rules — it never waits, it is a прогін nobody asked for, and it
is due while such a рахунок waits — and SHALL itself ask for the next дочитування by the same rule, so
a chain of them reads the remaining рахунки about one a minute.

Each рахунок keeps a chain going for at most one of its turns: after it, it is neither позачерговий
without a turn nor overdue, so a рахунок that fails, or needs page after page, falls back to the
ordinary chances instead of waking the phone every minute. A рахунок the token no longer shows never
keeps a chain going.

No дочитування SHALL be asked for when the прогін ended with no such рахунок перенесено, nor when the
app is in front of the owner, whose own follow-up continues a перенесено прогін there. At most one
дочитування SHALL be pending at a time; asking again while one is pending changes nothing. Every
request a прогін makes for one SHALL be recorded in the журнал, and a chance a поштовх made due SHALL
say so in its own entry, so a chain can be told from the periodic chances.

On a phone that cannot schedule one, asking SHALL change nothing and SHALL NOT fail the прогін: the
next chance the phone gives continues from the cursors, as it always has.

#### Scenario: «Оновити» finishes with the app closed

- **WHEN** the owner presses «Оновити» on Головний with nine linked рахунки, two complete, and the
  owner leaves the app while the прогін waits for the third
- **THEN** the прогін ends перенесено and a дочитування is asked for no sooner than a minute after
  the second statement request, and each дочитування reads one of the remaining позачергові рахунки
  and asks for the next until all nine have had their turn

#### Scenario: A phone that gave no chance for hours catches up in minutes

- **WHEN** a chance comes after four hours without one, with all nine рахунки overdue, and reads one
- **THEN** a дочитування is asked for, and the chain reads the other eight about one a minute

#### Scenario: A background chance that reads the one moved рахунок asks for nothing more

- **WHEN** a background chance reads the one позачерговий рахунок, which completes, and ends with the
  other eight перенесено, none of them позачерговий or overdue
- **THEN** no дочитування is asked for

#### Scenario: A failure does not start a chain

- **WHEN** a прогін's only позачерговий рахунок is answered `unavailable`
- **THEN** no дочитування is asked for

#### Scenario: A рахунок already given its turn does not keep the chain going

- **WHEN** a позачерговий рахунок that needs more pages than one turn reads had its turn in this
  прогін and ends перенесено, and no other рахунок is позачерговий without a turn or overdue
- **THEN** no дочитування is asked for, and the next chance the phone gives continues it

#### Scenario: Nothing is asked while the owner is watching

- **WHEN** a прогін ends перенесено with позачергові рахунки unread while the app is in front of the
  owner
- **THEN** no дочитування is asked for, and the follow-up in front of the owner continues the прогін

#### Scenario: A second request while one is pending changes nothing

- **WHEN** a дочитування is pending and another прогін ends asking for one
- **THEN** still exactly one дочитування is pending

### Requirement: A notification from the monobank app is a поштовх

WHEN the monobank app posts a notification while at least one рахунок is linked and the app holds
notification access, the system SHALL take it as a **поштовх**: it SHALL note the moment and ask for
a дочитування a little over a minute later, so the balances the bank reports by then include what
the notification was about. Only the posting app, the posting moment and the notification's own
flags SHALL be looked at: an ongoing notification, one that belongs to a foreground service and a
group summary are not a поштовх. Its title, text and every other part of its content SHALL NOT be
read, stored, logged or used in any other way.

A notification while a дочитування is already pending SHALL note its moment and change nothing
else, so however many notifications the monobank app posts, a поштовх costs at most about one
прогін a minute.

A background chance or a дочитування that starts after a поштовх noted later than the last attempt
SHALL be due whatever the тихий інтервал says. What it reads first is decided by the balances, as for
every прогін: a notification that moved no баланс банку makes no рахунок позачерговий.

With no рахунок linked, or without notification access, a monobank notification SHALL change
nothing.

#### Scenario: A purchase on the black card is read within about two minutes

- **WHEN** the monobank app posts a notification about a purchase on the black card five minutes after
  the last background chance, with the app closed
- **THEN** a дочитування runs a little over a minute later, fetches client-info, finds the black
  card's баланс банку moved, and reads the black card first

#### Scenario: A поштовх is due inside the тихий інтервал

- **WHEN** a background chance starts three minutes after the last attempt and a поштовх was noted
  after that attempt
- **THEN** the прогін runs rather than ending not due

#### Scenario: Nothing of the notification is kept

- **WHEN** the monobank app posts a notification titled with a сума and a merchant
- **THEN** nothing of its title or text is stored, logged or queued for collection; only its moment
  is noted

#### Scenario: An ongoing notification is no поштовх

- **WHEN** the monobank app posts an ongoing notification, or a group summary
- **THEN** no moment is noted and no дочитування is asked for

#### Scenario: No link, no поштовх

- **WHEN** the monobank app posts a notification on a phone with no linked рахунок
- **THEN** no moment is noted and no дочитування is asked for

#### Scenario: A burst of notifications costs one дочитування

- **WHEN** the monobank app posts three notifications within ten seconds
- **THEN** exactly one дочитування is pending

### Requirement: A рахунок the token no longer shows is set aside, not failed

A linked рахунок that the client-info answer a прогін works from does not name SHALL be **set
aside**, decided before anything else about it in that прогін: no request is sent about it, it takes
no turn, it is never перенесено, it ends `unavailable` with its reason recorded as «not shown by the
token», and nothing of its link, cursor, imported item ids or транзакції is touched.

A set-aside рахунок SHALL NOT decide how the прогін is remembered: the remembered outcome SHALL be the
one that most needs the owner among the other рахунки of the прогін. This takes precedence over «A
run is remembered by its moment and by the outcome that most needs the owner» and «A postponed
рахунок ranks between cancelled and complete when a run is remembered», whose «among that run's
accounts» and «a failure anywhere in it» are read over the рахунки that were not set aside.

Nor SHALL it count toward how fresh the bank data reads. Every requirement that reads the moments of
«the linked рахунки» to say how fresh the bank data is, or whether monobank needs the owner — the
whole-bank moment and the count Головний and the monobank screen state, the moment «Потребує уваги»
decides its monobank row from, «monobank needs the owner only when there is something for them to
do», and the moment a background run decides whether to announce from — SHALL read them over the
linked рахунки the newest stored client-info answer names. This requirement takes precedence over the
wording «every linked рахунок» in those requirements.

WHEN the phone holds no client-info answer, or the newest one names none of the linked рахунки,
nothing is set aside: the прогін is remembered as `unavailable` and every linked рахунок counts toward
freshness, exactly as before, because then there is something the owner has to do.

#### Scenario: A vanished card does not make a working прогін unavailable

- **WHEN** a прогін ends with one рахунок complete, seven перенесено, and one set aside because the
  token no longer shows it
- **THEN** the attempt is remembered as перенесено, and a follow-up in front of the owner continues it

#### Scenario: A vanished card does not keep Головний stale

- **WHEN** eight linked рахунки completed a синхронізація within the last hour and a ninth, last
  synced two days ago, is not named by the newest stored answer
- **THEN** Головний reads the bank data as updated within the hour, monobank does not need the
  owner, and a background run raises no сповіщення

#### Scenario: A token that shows nothing linked is still a failure

- **WHEN** the token shows none of the three linked рахунки
- **THEN** the прогін is remembered as unavailable, and after 24 hours without a completed
  синхронізація monobank needs the owner

#### Scenario: A set-aside рахунок takes no turn and is never перенесено

- **WHEN** a прогін that stops at the minute it owes passes over a рахунок the token no longer shows
- **THEN** no request is sent about it, its last-turn moment does not move, and it ends set aside
  rather than перенесено
