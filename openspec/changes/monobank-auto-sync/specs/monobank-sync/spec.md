## ADDED Requirements

### Requirement: A sync starts without the owner asking, no oftener than the quiet interval

The system SHALL be able to start a sync that the owner did not ask for, on the app being opened
and on it returning to the foreground. Such a run SHALL start only while monobank is configured
and at least one рахунок is linked, and only when the moment of the last attempt is older than the
quiet interval of 15 minutes; otherwise nothing starts and no request goes out at all. A run the
owner asked for SHALL start whatever the last attempt was — the interval governs only the runs
they did not ask for.

Every run that reaches monobank SHALL record the moment it was attempted, whether it completed or
failed, so a device that cannot reach the bank spends one attempt per interval and not one per
opening. A run that could not reach it at all — no token kept, no link, or the token storage
itself unreadable — SHALL leave no attempt behind, whether or not one was provisionally recorded
before the run knew: nothing was tried, so the next opening tries at once.

#### Scenario: The first opening on a linked device syncs

- **WHEN** monobank is configured, one рахунок is linked, no attempt has ever been recorded, and
  the app is opened
- **THEN** a sync starts

#### Scenario: Reopening inside the interval sends nothing

- **WHEN** an attempt was recorded two minutes ago and the app is opened again
- **THEN** no run starts and no request is sent to monobank

#### Scenario: Returning after hours syncs

- **WHEN** an attempt was recorded three hours ago and the app returns to the foreground
- **THEN** a sync starts

#### Scenario: A run the owner asked for ignores the interval

- **WHEN** an attempt was recorded one minute ago and the owner asks for a sync
- **THEN** the run starts all the same

#### Scenario: Without a token nothing is attempted

- **WHEN** monobank is not configured and the app is opened
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: With nothing linked nothing is attempted

- **WHEN** monobank is configured, no рахунок is linked and the app is opened
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: Unreadable token storage is not an attempt either

- **WHEN** the token storage cannot be read and the app is opened
- **THEN** no request is sent, no attempt is left recorded, and the next opening tries again at
  once

#### Scenario: A failed run still spends its interval

- **WHEN** a run that started on opening reaches monobank and ends without an answer, and the app
  is opened again one minute later
- **THEN** the failed run's moment was recorded and no second run starts

### Requirement: At most one sync run exists at a time

While a sync is going on the system SHALL NOT start another, whoever asks: an opening, a return to
the foreground, the owner asking on Головний and the owner asking on the monobank screen SHALL
each be refused while a run is in flight. A refused start SHALL change nothing — no cursor, no
attempt, no imported item — and SHALL report that a run is already going on rather than failing.
When the run ends, however it ended, the next start SHALL be allowed again.

Whether a run is going on SHALL be observable while it is going on, not only once it has ended: a
screen opened during a run SHALL be able to say so, and SHALL be told both when a run begins and
when it ends.

#### Scenario: A second trigger during a run starts nothing

- **WHEN** a run started on opening is still going on and the app returns to the foreground
- **THEN** no second run starts and the first one continues untouched

#### Scenario: The owner asking during a run is told, not queued

- **WHEN** a run is going on and the owner asks for a sync
- **THEN** no second run starts, nothing is changed, and the answer is that a run is already going
  on

#### Scenario: A run beginning is announced, not only its end

- **WHEN** a run starts while a screen is already open
- **THEN** that screen is told a run began, and told again when it ends

#### Scenario: After a run ends the next one may start

- **WHEN** a run ends — completed, failed or cancelled — and a start is asked for afterwards
- **THEN** that start is allowed

### Requirement: A run is remembered by its moment and by the outcome that most needs the owner

The system SHALL remember one attempt — the latest — as the moment it was made together with the
single outcome among that run's accounts that most needs the owner, in the order invalid-token,
then rate-limited, then unavailable, then cancelled, then complete. A run in which every account
completed SHALL be remembered as complete. The ordering SHALL cover every outcome an account can
end with, so no run is left without a remembered outcome.

The moment SHALL be recorded when the run starts and the outcome when it ends, so a run the phone
did not survive — the app killed, the device restarted — still spends its interval rather than
letting the next opening send a request straight away. Until a run reports, its attempt SHALL
carry no outcome at all, which is a different answer from any of the five.

The remembered attempt SHALL NOT stand in for the moments a completed sync sets per linked account:
those are the monobank-sync-screen capability's and move only for an account that completed, while
the attempt moves for every run that reached the bank.

#### Scenario: The worst outcome is the one remembered

- **WHEN** a run ends with one account complete and one account invalid-token
- **THEN** the attempt is remembered as invalid-token

#### Scenario: A rate limit outranks an unavailable account

- **WHEN** a run ends with one account rate-limited and one account unavailable
- **THEN** the attempt is remembered as rate-limited

#### Scenario: A stopped account outranks a completed one

- **WHEN** a run ends with one account complete and one account cancelled because the owner
  stopped it
- **THEN** the attempt is remembered as cancelled

#### Scenario: A whole run that worked is remembered as complete

- **WHEN** a run ends with every account complete
- **THEN** the attempt is remembered as complete

#### Scenario: A run the app did not survive still holds its moment

- **WHEN** a run starts and the app is killed before it reports anything
- **THEN** the attempt holds the moment that run started and carries no outcome

### Requirement: monobank needs the owner only when there is something for them to do

From the remembered attempt and the moments the linked рахунки last completed a sync, the system
SHALL decide whether monobank needs the owner and, when it does, which of two situations it is:
the token was rejected, or the data has not been refreshed. Putting either into words is the
main-screen capability's; what is decided here is whether there is anything to say.

It SHALL need them at once when the last attempt was remembered as invalid-token — no run can
succeed until they supply another token. For an attempt remembered as rate-limited or unavailable
it SHALL need them only once no linked рахунок has completed a sync within the last 24 hours: a
request that failed while the phone was underground is not something to put in front of anyone.

An attempt remembered as complete SHALL never need the owner. An attempt remembered as cancelled
SHALL never need the owner either, however old the data is: the run stopped because they stopped
it, and calling their own decision a problem would blame the bank for it. WHEN no attempt is
remembered at all — nothing has been tried on this device yet — monobank SHALL NOT need the owner,
and neither SHALL an attempt that carries no outcome, a run going on now or one the phone did not
survive: nothing is known about it to put in front of them.

#### Scenario: A rejected token needs the owner at once

- **WHEN** the last attempt was remembered as invalid-token and a рахунок completed a sync ten
  minutes ago
- **THEN** monobank needs the owner, and the situation is that the token was rejected

#### Scenario: A single unreachable attempt over fresh data needs nobody

- **WHEN** the last attempt was remembered as unavailable and a linked рахунок completed a sync
  two hours ago
- **THEN** monobank does not need the owner

#### Scenario: Failing over stale data needs the owner

- **WHEN** the last attempt was remembered as unavailable and no linked рахунок has completed a
  sync for 30 hours
- **THEN** monobank needs the owner, and the situation is that the data has not been refreshed

#### Scenario: A run the owner stopped is not a failure

- **WHEN** the last attempt was remembered as cancelled and no linked рахунок has completed a sync
  for 30 hours
- **THEN** monobank does not need the owner

#### Scenario: A run that worked needs nobody

- **WHEN** the last attempt was remembered as complete
- **THEN** monobank does not need the owner

#### Scenario: A device that has tried nothing yet needs nobody

- **WHEN** monobank is configured, a рахунок is linked and no attempt is remembered
- **THEN** monobank does not need the owner

#### Scenario: An attempt with no outcome needs nobody

- **WHEN** the remembered attempt carries a moment and no outcome, and no linked рахунок has
  completed a sync for 30 hours
- **THEN** monobank does not need the owner
