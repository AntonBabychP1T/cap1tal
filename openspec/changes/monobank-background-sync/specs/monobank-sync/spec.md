## ADDED Requirements

### Requirement: A sync also runs on the chances the phone gives while the app is not in front of the owner

The system SHALL ask the phone for chances to run in the background while monobank has at least
one linked рахунок, and SHALL stop asking when none is linked. On every chance the phone gives,
the system SHALL start a **background run** — the same sync an opening starts, under the same
rules: the quiet interval, the one-request-a-minute pace held across runs, the longest-waiting-first
order of turns, the one-run lock and the remembered attempt — so a chance inside the quiet
interval, or while a run is going on, sends nothing. The token SHALL reach the bank exactly as it
does in front of the owner: read for the run and kept nowhere else.

A chance SHALL be asked for no oftener than about every fifteen minutes. WHEN the phone gives one
is the phone's decision: the system SHALL claim no cadence, and the runs an opening, a pull or the
owner start SHALL remain exactly as they are, so a phone that gives no chance syncs as it does
today.

#### Scenario: A background run after the quiet interval syncs without the app being opened

- **WHEN** monobank is configured, a рахунок is linked, the last attempt was twenty minutes ago,
  and the phone gives a chance to run
- **THEN** a background run starts, the транзакції it imports are stored, and the moments it moved
  are what the app shows when it is next opened

#### Scenario: A chance inside the quiet interval sends nothing

- **WHEN** the last attempt was five minutes ago and the phone gives a chance to run
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
- **THEN** the phone is asked for chances after the first link, is no longer asked after the last
  unlink, and is asked again after the relink

### Requirement: A background run has a time budget and postpones what it cannot finish

A background run SHALL be given a time budget shorter than what the phone allows it, and SHALL
send no request the budget cannot hold: WHEN the wait before the next request would end past the
budget, or the budget has already passed, the run SHALL stop there without sending. A request
already sent SHALL be answered and its answer stored whole — the budget is asked before a request,
never in the middle of an answer.

A рахунок the run stopped before SHALL end **postponed**, and postponed SHALL be neither a failure
of the bank nor a decision of the owner. It takes one of two shapes, both reported under the one
word:

- a рахунок the run never sent a request about has nothing moved — no request spent, no turn
  taken, its cursor and its last-sync moment exactly as they were — and, because no turn was
  taken, it keeps its place at the head of the next run's order;
- a рахунок the run stopped between its windows keeps every page it committed, the cursor those
  pages moved and the turn its request took, and its last-sync moment does not move, because it
  did not complete; it queues behind every рахунок that has not yet had a turn, as the order of
  turns already ranks it.

In both shapes the next run finds a cursor that is valid to continue from, so successive background
runs work through every linked рахунок however many there are. A run given no budget SHALL never
postpone anything.

#### Scenario: The budget stops the run before a wait it cannot hold

- **WHEN** a background run over three linked рахунки is given a budget that holds the client-info
  request and one statement request but not the minute before a second
- **THEN** the first рахунок completes, exactly two requests are sent, and the other two рахунки
  end postponed with no request sent about them

#### Scenario: An answer in flight when the budget passes is still stored whole

- **WHEN** the budget passes while a statement answer is being stored
- **THEN** that answer's транзакції are stored and its cursor advances, and only the next request
  is not sent

#### Scenario: A рахунок never asked about keeps its place in the order

- **WHEN** a background run postponed two рахунки without sending a request about them, and a later
  run begins
- **THEN** those two are the first the later run asks the bank about, because no turn was taken
  for them

#### Scenario: A рахунок stopped between its windows keeps its pages and its turn

- **WHEN** a рахунок whose first sync spans three windows has two committed when the budget passes
- **THEN** it ends postponed with the транзакції of those two windows stored, its cursor at the end
  of the second, its turn taken, and its last-sync moment not moved; the next run continues it
  from the third window

#### Scenario: A postponed рахунок moves no moment

- **WHEN** a рахунок that completed a sync yesterday ends postponed today
- **THEN** its last-sync moment is still yesterday

#### Scenario: A run without a budget postpones nothing

- **WHEN** a run over nine linked рахунки is given no budget
- **THEN** every рахунок is sent its request and none ends postponed

### Requirement: A run in front of the owner yields when the app leaves the foreground

A run started while the app is in front of the owner — on opening, on the pull, or on the monobank
screen — SHALL yield when the app leaves the foreground: it SHALL stop before its next request, and
the рахунки it had not finished SHALL end postponed in exactly the two shapes a budget produces.
The wait before a request SHALL end at once when the app leaves the foreground, so the run does not
hold the one-run lock until the app is next opened. A request already sent SHALL be answered and
its answer stored whole.

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
the system SHALL start a run without a budget at once, so a run the background began finishes in
front of the owner instead of waiting for the next chance. The follow-up SHALL be decided from the
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
- **THEN** a run without a budget starts at once

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

### Requirement: A postponed рахунок ranks between cancelled and complete when a run is remembered

The outcome a run is remembered by SHALL rank postponed after cancelled and before complete: a run
in which every рахунок reached completed and the rest were postponed SHALL be remembered as
postponed, and a run with a failure anywhere in it SHALL be remembered by that failure, as the
order already ranks them. An attempt remembered as postponed SHALL never need the owner, however
old the data is, for the reason a cancelled one does not: the run stopped for want of time, not
because the bank or the token failed, and the next run continues it.

#### Scenario: A postponed рахунок outranks a completed one

- **WHEN** a run ends with one рахунок complete and two postponed
- **THEN** the attempt is remembered as postponed

#### Scenario: A failure outranks a postponed рахунок

- **WHEN** a run ends with one рахунок unavailable and two postponed
- **THEN** the attempt is remembered as unavailable

#### Scenario: A cancelled рахунок outranks a postponed one

- **WHEN** a run ends with one рахунок cancelled and one postponed
- **THEN** the attempt is remembered as cancelled

#### Scenario: A postponed attempt needs nobody

- **WHEN** the last attempt is remembered as postponed and no linked рахунок has completed a sync
  for 30 hours
- **THEN** monobank does not need the owner

### Requirement: A background run announces a failure only when monobank needs the owner

A background run SHALL raise a сповіщення про збій for the monobank sync only when, once it has
ended, monobank needs the owner as this capability decides — the token was rejected, or the runs
are failing and the picture is stale: the oldest completed sync among the linked рахунки is older
than a day, or some linked рахунок has never completed one. It SHALL raise nothing for a run that ended postponed,
nothing for one that failed over fresh data, and nothing while the app is in front of the owner —
«Потребує уваги» on Головний says it there. It SHALL clear a standing сповіщення про збій for the
monobank sync when it completes. A background run that finds that сповіщення already standing SHALL
neither raise nor record anything more: one failure is one сповіщення and one record, however
many runs end the same way. A background run SHALL show no dialog and SHALL write no text the
owner never saw: what it did is visible where every run's work is, in the транзакції it stored and
the moments it moved.

#### Scenario: A rejected token in the background is announced once

- **WHEN** a background run ends invalid-token while no сповіщення про збій for the monobank sync is
  standing, and the next background run ends the same way
- **THEN** exactly one сповіщення про збій for the monobank sync is raised, leading to «monobank»,
  and the second run leaves no record of a second one

#### Scenario: A phone offline for one run stays silent

- **WHEN** a background run ends unavailable while every linked рахунок completed a sync two hours
  ago
- **THEN** no сповіщення про збій is raised

#### Scenario: A day without a sync is announced

- **WHEN** a background run ends unavailable while the oldest completed sync among the linked
  рахунки is 30 hours old
- **THEN** one сповіщення про збій for the monobank sync is raised

#### Scenario: A bank never wholly heard from is stale

- **WHEN** a background run ends unavailable while two of five linked рахунки have never completed
  a sync
- **THEN** one сповіщення про збій for the monobank sync is raised

#### Scenario: A postponed run announces nothing

- **WHEN** a background run ends postponed, whatever the age of the data
- **THEN** no сповіщення про збій is raised

#### Scenario: A failure the owner is already looking at is announced nowhere but on the screen

- **WHEN** a background run ends invalid-token and the owner has the app in front of them when it
  ends
- **THEN** no сповіщення про збій is raised, and «Потребує уваги» on Головний carries the row

#### Scenario: A completed run clears what an earlier one raised

- **WHEN** a сповіщення про збій for the monobank sync is standing and a background run completes
- **THEN** that сповіщення is cleared

### Requirement: A request that does not answer within the timeout ends unavailable and the run goes on

Every request a run sends to the personal API SHALL be given up after a timeout of thirty seconds
without an answer, and a request given up SHALL end that рахунок unavailable exactly as a request
that failed at once does — nothing stored, the cursor and imported ids untouched, the turn taken,
and the run going on to its next рахунок. No run SHALL wait on the bank indefinitely: a request
the bank never answers must not hold the one-run lock until the app is closed, because every later
start — every background run included — waits on that lock.

#### Scenario: A request the bank never answers ends unavailable

- **WHEN** a statement request receives no answer for longer than the timeout
- **THEN** that рахунок ends unavailable with its cursor and imported ids unchanged, and the run
  goes on to the next рахунок

#### Scenario: A request that answers in time is unaffected

- **WHEN** a statement request answers within the timeout
- **THEN** its answer is stored exactly as before, and nothing about the timeout is visible
