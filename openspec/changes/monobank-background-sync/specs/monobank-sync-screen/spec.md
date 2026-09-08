## MODIFIED Requirements

### Requirement: Sync progress and every terminal outcome are understandable and retryable

Starting sync SHALL visibly account for every linked monobank account and SHALL end by reporting
how many new транзакції were imported together with one outcome for each account: complete,
invalid-token, rate-limited, unavailable, cancelled, or postponed — the last being an account the
run stopped before finishing, for want of time or because the app left the foreground, with the
pages it had committed kept and its last-sync moment not moved. A failed or postponed account SHALL
remain retryable, and a failure of one account SHALL NOT make a successfully committed account
appear failed or roll it back. The screen SHALL name every outcome it can report, so a result line
reads without guessing.

A run that never began because the app is not set up yet — no токен configured, or no рахунок
linked — SHALL NOT be offered a retry: there is no unfinished work to repeat, and repeating it
would only restate the same setup message. Such a run SHALL be answered by what would actually
move it on — entering the токен when that is what is missing — and by nothing else.

#### Scenario: A complete run reports imported transactions

- **WHEN** two linked accounts complete and together import seven new транзакції
- **THEN** the result identifies both accounts as complete and reports seven imported транзакції

#### Scenario: A partial run keeps its truth

- **WHEN** one linked card completes with two new транзакції and a second card is rate-limited
- **THEN** the first card remains complete with its two транзакції stored, the second is identified
  as rate-limited, and retry is offered for unfinished work

#### Scenario: Sync without a token offers the token, not a retry

- **WHEN** the owner starts sync with no токен configured
- **THEN** the screen says the токен is needed first and offers entering it, and no retry is
  offered

#### Scenario: Sync with nothing linked offers no retry

- **WHEN** the owner starts sync with a токен configured but no рахунок linked
- **THEN** the screen says nothing is linked and no retry is offered

#### Scenario: An invalid stored token asks for replacement

- **WHEN** a sync request is rejected because the configured token is no longer valid
- **THEN** the run identifies invalid-token, imports nothing from that answer, and offers replacing
  the token rather than presenting an offline error

#### Scenario: A run that yielded reads as postponed and offers the retry

- **WHEN** the owner starts a sync on the screen, one linked card completes, and the app leaves the
  foreground before the second card's request is sent
- **THEN** the result identifies the first card as complete and the second as postponed, and, once
  no run is going on, offers retrying the unfinished work

#### Scenario: Every outcome is named on the screen

- **WHEN** the owner reads the monobank screen
- **THEN** it names every outcome a result line can carry — complete, invalid-token, rate-limited,
  unavailable, cancelled and postponed — in the owner's words

## ADDED Requirements

### Requirement: The screen says that sync also runs in the background

WHEN at least one рахунок is linked, the sync section of the monobank screen SHALL say that sync
also runs while the app is not open — about every quarter of an hour, when the phone allows it —
and SHALL promise no exact cadence and no clock time. WHEN no рахунок is linked, the section SHALL
say nothing about the background: there is nothing for a background run to do.

#### Scenario: A linked bank is told about the background

- **WHEN** one рахунок is linked and the owner opens the monobank screen
- **THEN** the sync section says that sync also runs in the background about every quarter of an
  hour when the phone allows it, and names no time of day

#### Scenario: Nothing linked, nothing said about the background

- **WHEN** no рахунок is linked and the owner opens the monobank screen
- **THEN** the sync section says nothing about the background
