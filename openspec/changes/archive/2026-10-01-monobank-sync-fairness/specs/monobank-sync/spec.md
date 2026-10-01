## ADDED Requirements

### Requirement: A run gives each linked account a turn, longest-waiting first

A sync run SHALL work through the linked рахунки in order of how long each has waited for a turn:
every рахунок that has never had one before every рахунок that has, then by the moment of its last
turn, oldest first. Two рахунки that have waited exactly as long SHALL be ordered by their monobank
account identifier, so a run is reproducible.

A **turn** is a run sending the bank a request about that рахунок — taken whether the рахунок went
on to complete, to fail, or to be stopped, and not taken at all when the run spends no request on
it. The moment of a рахунок's last turn SHALL be remembered on the device and SHALL survive the run
that took it.

The order SHALL be decided from the moments as they stand when the run begins, and SHALL NOT change
while that run is going on: a рахунок this run gives a turn to does not move to the back of this
run's own queue.

This ordering exists because a turn costs one request at the API's one-request-a-minute pace and a
run may end at any point — the owner stops it, the token is rejected, the app stops running. An
order that does not follow need would spend every run's requests on the same рахунки and leave
those at its end never synced at all, however many times sync is asked for. Ordering by the turn
rather than by the completed sync is what keeps that true when a рахунок cannot complete: a рахунок
whose statement always fails costs one turn per cycle, exactly like every other.

#### Scenario: An account that has never had a turn goes first

- **WHEN** a run begins with one linked рахунок that had a turn an hour ago and one that has never
  had one
- **THEN** the рахунок that has never had a turn is the first the run asks the bank about

#### Scenario: The longest-waiting account goes first

- **WHEN** a run begins with three linked рахунки whose last turns were three days ago, an hour ago
  and a minute ago
- **THEN** the run works through them oldest first: three days, then an hour, then a minute

#### Scenario: Accounts that have waited equally are ordered reproducibly

- **WHEN** a run begins with two linked рахунки that have never had a turn
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

The system SHALL send no request to the personal API sooner than the API's minimum gap after the
last request it sent, counting requests made by earlier runs as well as by the current one. The
moment of the last request SHALL be remembered on the device, SHALL be updated for every request
actually sent — whatever that request answered — and SHALL survive the run that sent it ending,
however it ended and whether or not the app kept running.

A remembered moment that lies in the future of the device's clock SHALL NOT make a run wait longer
than the gap itself: the wait SHALL never exceed one gap.

Remembering the moment SHALL NOT be able to fail a run: storage that refuses the write SHALL leave
the run pacing itself as it would have, rather than ending it.

#### Scenario: A run started immediately after another waits

- **WHEN** a run ends and another is started before the API's minimum gap has passed since the
  last request the previous run sent
- **THEN** the new run waits out the remainder of the gap before its first request, rather than
  sending it at once

#### Scenario: A run started long after another does not wait

- **WHEN** a run is started well after the minimum gap has passed since the last request any run
  sent
- **THEN** its first request goes out without waiting

#### Scenario: The first run on a device does not wait

- **WHEN** a run starts on a device that has never sent a request to the personal API
- **THEN** its first request goes out without waiting

#### Scenario: A clock moved forward does not stall sync

- **WHEN** the remembered moment of the last request lies in the future of the device's clock
- **THEN** the run waits at most one gap before its first request, and does not wait out the
  difference

#### Scenario: A failed run still moves the remembered moment

- **WHEN** a run's request is answered with a rate limit and the run ends
- **THEN** the moment of that request is remembered, so the next run paces itself from it

#### Scenario: Storage that will not remember the moment does not stop the run

- **WHEN** remembering the moment of a request fails
- **THEN** the run carries on and imports what it can, and the failure ends nothing
