## MODIFIED Requirements

### Requirement: Sync progress and every terminal outcome are understandable and retryable

Starting sync SHALL visibly account for every linked monobank account and SHALL end by reporting
how many new транзакції were imported together with one outcome for each account: complete,
invalid-token, rate-limited or unavailable. A failed account SHALL remain retryable, and a failure
of one account SHALL NOT make a successfully committed account appear failed or roll it back.

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
