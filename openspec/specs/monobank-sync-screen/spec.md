# monobank-sync-screen Specification

## Purpose
Gives the owner one visible, local-only flow for connecting monobank accounts, deciding where
their history belongs, importing new activity and understanding every outcome.
## Requirements
### Requirement: The monobank token is accepted only after validation and remains secret

The system SHALL keep a submitted monobank token only after it returns readable client-info; a
rejected, rate-limited or unavailable submission SHALL leave any previously valid token unchanged.
Once kept, the token SHALL be represented only as configured or not configured: its value SHALL
never be shown again, written among the owner's financial data, included in a backup or diagnostic,
or sent anywhere except the monobank personal API.

#### Scenario: A valid token becomes configured without being revealed

- **WHEN** the owner submits a token and monobank returns readable client-info
- **THEN** monobank becomes configured, the token value is no longer shown, and the fetched
  accounts are offered for linking

#### Scenario: An invalid replacement keeps the working token

- **WHEN** monobank is already configured and the owner submits a replacement token that the API
  rejects
- **THEN** the replacement is not kept, the existing token remains configured, and the outcome is
  identified as an invalid token

#### Scenario: An unavailable first validation keeps nothing

- **WHEN** no token is configured and validation cannot reach monobank
- **THEN** no token is kept and the owner is offered a retry without the candidate value being
  echoed

### Requirement: Every monobank account and its connection state is visible

After a successful client-info answer, the system SHALL present every offered-currency card and
банка from that token with its bank name, currency, баланс банку and either the linked рахунок or
an explicit unlinked state; no unlinked account SHALL be hidden or take part in sync.

#### Scenario: Linked and unlinked accounts are both present

- **WHEN** a token has two cards and one банка and only one card is linked
- **THEN** all three are shown, the linked card names its рахунок, and the other card and банка are
  visibly unlinked

#### Scenario: Each balance keeps its own currency

- **WHEN** client-info contains a UAH card and a USD банка
- **THEN** each баланс банку is shown in its account's currency and no combined or converted amount
  replaces either one

### Requirement: Linking is an explicit same-currency decision with a sync boundary

The owner SHALL link an unlinked monobank account either to one existing unlinked рахунок of the
same currency or to one newly created рахунок whose bank name, currency and suggested вид are
prefilled but editable where the account rules allow. Before the link becomes active, the owner
SHALL confirm an inclusive calendar date from which statement items may be imported.

#### Scenario: An existing same-currency рахунок is linked

- **WHEN** the owner links a UAH monobank card to an unlinked UAH рахунок and confirms 2026-08-28
- **THEN** the link becomes active and its first sync may import items dated 2026-08-28 or later

#### Scenario: Creating for a банка starts from a suggestion

- **WHEN** the owner chooses to create a рахунок for a USD банка
- **THEN** its bank name and USD currency are prefilled, `savings` is the suggested вид, and the
  owner can choose another permitted вид before confirming

#### Scenario: A different-currency рахунок is not a link choice

- **WHEN** the owner links a USD monobank account
- **THEN** UAH and EUR рахунки are not offered as destinations

### Requirement: Sync progress and every terminal outcome are understandable and retryable

Starting sync SHALL visibly account for every linked monobank account and SHALL end by reporting
how many new транзакції were imported together with one outcome for each account: complete,
invalid-token, rate-limited or unavailable. A failed account SHALL remain retryable, and a failure
of one account SHALL NOT make a successfully committed account appear failed or roll it back.

#### Scenario: A complete run reports imported transactions

- **WHEN** two linked accounts complete and together import seven new транзакції
- **THEN** the result identifies both accounts as complete and reports seven imported транзакції

#### Scenario: A partial run keeps its truth

- **WHEN** one linked card completes with two new транзакції and a second card is rate-limited
- **THEN** the first card remains complete with its two транзакції stored, the second is identified
  as rate-limited, and retry is offered for unfinished work

#### Scenario: An invalid stored token asks for replacement

- **WHEN** a sync request is rejected because the configured token is no longer valid
- **THEN** the run identifies invalid-token, imports nothing from that answer, and offers replacing
  the token rather than presenting an offline error

### Requirement: Disconnecting monobank never deletes the owner's money history

The owner SHALL be able to unlink a monobank account or remove the configured token without
deleting any рахунок, транзакція, imported-item memory, опис or last known баланс банку; no further
sync SHALL occur until a valid token and an active link exist again.

#### Scenario: Removing the token keeps imported history

- **WHEN** the owner removes the configured token after monobank transactions were imported
- **THEN** the token is gone, sync is disabled, and every рахунок and транзакція remains unchanged

#### Scenario: Relinking does not resurrect a deleted transaction

- **WHEN** an imported транзакція is deleted, its monobank account is unlinked and later linked
  again, and the same statement item arrives
- **THEN** no транзакція is recreated because that item remains remembered as imported

