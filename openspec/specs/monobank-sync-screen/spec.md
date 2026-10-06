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
prefilled but editable where the account rules allow. The app MAY propose which of those two a
given account is, and which рахунок; a proposal SHALL be a starting point the owner can change or
refuse, and never a link in itself. Before any link becomes active — singly or as part of an
accepted set — the owner SHALL confirm an inclusive calendar date from which statement items may
be imported.

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

#### Scenario: A proposal can be overridden before it is accepted

- **WHEN** the app proposes an existing рахунок for a card and the owner picks a different
  unlinked рахунок of the same currency instead
- **THEN** the link is made to the рахунок the owner picked and the proposal is not applied

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

### Requirement: Getting a token starts inside the app

The app SHALL offer, from the monobank connection screen, a way to open monobank's own personal
token page without the owner having to find it themselves. Returning from that page SHALL be
treated as the owner's own action, and the app MAY then read the device clipboard once. A
clipboard whose contents are shaped like a token SHALL be offered already filled in and validated
against monobank without a further step; contents of any other shape SHALL be discarded without
being sent anywhere, and the owner SHALL be told the clipboard held no token and offered the
field to type into.

#### Scenario: The token page is reachable in one step

- **WHEN** the owner is not connected to monobank and asks to get a token
- **THEN** monobank's own personal token page opens, and the owner is not asked to find or type
  its address

#### Scenario: A copied token is offered and validated on return

- **WHEN** the owner returns from the token page and the clipboard holds a token-shaped value
- **THEN** that value is offered as the candidate and validated against monobank, and it is kept
  only if monobank reads it

#### Scenario: An unrelated clipboard is not sent to the bank

- **WHEN** the owner returns from the token page and the clipboard holds a sentence, a link or
  nothing at all
- **THEN** no validation request is made with it, the value is not shown as a candidate, and the
  owner is told the clipboard held no token

### Requirement: The clipboard is read only when the owner asks

The app SHALL read the device clipboard only on returning from the token page or on an explicit
paste action, and SHALL NOT read it on opening a screen, on a timer, or in the background. A
clipboard read SHALL be used for nothing but a token candidate.

#### Scenario: Opening the screen reads nothing

- **WHEN** the owner opens the monobank screen, however many times
- **THEN** the clipboard is not read

#### Scenario: Pasting is available while typing

- **WHEN** the owner is entering a token by hand and asks to paste from the clipboard
- **THEN** the clipboard is read once and a token-shaped value fills the field, while any other
  value leaves the field as it was and is reported as no token

### Requirement: Unlinked monobank accounts are given link proposals

After a successful client-info answer, the system SHALL propose, for every unlinked monobank
account, either one named existing unlinked рахунок of the same currency whose name the bank's
name for the account matches, or a new рахунок prefilled from the bank's name, currency and
suggested вид. Where the evidence matches more than one рахунок equally well, the system SHALL
propose neither and SHALL say the choice is the owner's. No рахунок SHALL be proposed for more
than one monobank account, and no proposal SHALL be for a рахунок of another currency. A monobank
account known only from an earlier connection's cached answer SHALL be listed but SHALL NOT be
proposed: proposals SHALL be built only from a client-info answer that succeeded during the
current opening of the screen.

#### Scenario: A matching рахунок is proposed by name

- **WHEN** a token shows a UAH card the bank names `black ··4321` and the owner keeps an unlinked
  UAH рахунок named «Monobank Black»
- **THEN** that рахунок is proposed for that card

#### Scenario: Two equally matching рахунки propose nothing

- **WHEN** a token shows a UAH card and two unlinked UAH рахунки match its name equally well
- **THEN** no рахунок is proposed for that card, both are named as the candidates, and the choice
  is left to the owner

#### Scenario: An unrecognised account proposes a new рахунок

- **WHEN** a token shows a USD банка whose name matches no unlinked USD рахунок
- **THEN** a new рахунок is proposed with the банка's name, USD and the suggested вид `savings`

#### Scenario: One рахунок is never proposed twice

- **WHEN** two monobank cards both match one unlinked рахунок best
- **THEN** that рахунок is proposed for one of them only, and the other is given its own proposal

#### Scenario: No successful answer this opening proposes nothing

- **WHEN** the owner opens the monobank screen and no client-info answer has succeeded yet this
  time — none was attempted, or every one attempted failed — however many monobank accounts an
  earlier connection had already shown
- **THEN** no proposal is shown for any of them and there is nothing to accept

### Requirement: The proposed links are accepted as one reviewed set

The system SHALL present the proposals as one list the owner reviews before anything is written,
with one inclusive sync boundary confirmed for the whole set. Accepting the set SHALL create every
accepted link — and every рахунок a proposal creates — or none of them: a refusal of any one of
them SHALL leave the device exactly as it was. Each proposal SHALL remain individually
acceptable, changeable and refusable, and no proposal SHALL take effect without the owner
accepting it.

#### Scenario: Accepting the set links every proposal at once

- **WHEN** the owner reviews four proposals, confirms the boundary and accepts the set
- **THEN** four links exist, each рахунок a proposal named or created is linked to its monobank
  account, and every link's first sync may import items dated on or after that boundary

#### Scenario: A refused member leaves nothing behind

- **WHEN** accepting a set of proposals is refused for one of them
- **THEN** no link from that set exists, no рахунок from that set was created, and the reason is
  shown

#### Scenario: A proposal is not a link

- **WHEN** proposals have been shown and the owner leaves the screen without accepting anything
- **THEN** no link exists and no рахунок was created

### Requirement: The screen says that sync also runs in the background

WHEN at least one рахунок is linked, the sync section of the monobank screen SHALL say whether the
phone lets the app run in the background, in one of three readings, and SHALL promise no exact
cadence and no clock time in any of them:

- **allowed** — the app is exempt from battery optimisation and not restricted: the section says
  that sync also runs while the app is not open — about every quarter of an hour, when the phone
  allows it — and offers nothing;
- **optimised** — the phone may put background work off for hours: the section says so in those
  words and offers «Дозволити роботу у фоні», which opens the phone's own request to exempt the app
  from battery optimisation;
- **restricted** — the owner restricted the app's background activity in the phone's settings: the
  section says background sync is switched off there and offers «Відкрити налаштування
  застосунку», which opens the app's page in the phone's settings.

The reading SHALL be taken again whenever the screen comes back into view, so returning from the
phone's dialog or settings shows the new state without leaving and reopening the screen. On a phone
that cannot tell, the section SHALL say what the allowed reading says and offer nothing. WHEN no
рахунок is linked, the section SHALL say nothing about the background: there is nothing for a
background run to do.

#### Scenario: A linked bank is told about the background

- **WHEN** one рахунок is linked, the app is exempt from battery optimisation, and the owner opens
  the monobank screen
- **THEN** the sync section says that sync also runs in the background about every quarter of an
  hour when the phone allows it, names no time of day, and offers nothing

#### Scenario: An optimised phone is offered the exemption

- **WHEN** the owner opens the monobank screen with рахунки linked and the app not exempt from battery
  optimisation
- **THEN** the section says the phone may put off background sync for hours and offers «Дозволити
  роботу у фоні»

#### Scenario: Granting it is shown on return

- **WHEN** the owner taps «Дозволити роботу у фоні», allows it in the phone's dialog and returns
- **THEN** the section says sync also runs in the background, and offers nothing

#### Scenario: A restriction set by hand points to the settings

- **WHEN** the owner has restricted the app's background activity in the phone's settings
- **THEN** the section says background sync is switched off in the settings and offers «Відкрити
  налаштування застосунку»

#### Scenario: Nothing linked, nothing said about the background

- **WHEN** no рахунок is linked and the owner opens the monobank screen
- **THEN** the sync section says nothing about the background

### Requirement: How much of the bank has synced, and how old that picture is, is said plainly

The monobank screen SHALL show, for every linked monobank account, the moment at which a sync last
completed for it. As the screen's own last sync it SHALL state how much of the bank it has heard
from, not the best case among the accounts: WHEN a sync has completed for every linked account, the
screen SHALL state the **oldest** such moment, that being the age of the whole picture; WHEN a sync
has completed for some of them but not all, the screen SHALL state how many of how many linked
accounts have synced, and SHALL NOT date the sync at all. WHEN no sync has completed for an
account, the screen SHALL say so for that account plainly rather than showing nothing; WHEN no sync
has completed for any linked account, the screen SHALL say that too. Only a completed account SHALL
move a moment: an account that ends invalid-token, rate-limited or unavailable SHALL keep whatever
moment it had, so the screen never claims a sync that did not happen. The moments SHALL survive
closing and reopening the app.

Sync is no longer only something the owner starts here: a run also starts without them asking, as
the monobank-sync capability defines, so these moments may move without anything on this screen
being tapped.

WHEN a run started elsewhere is going on, the screen SHALL say that a sync is going on, SHALL NOT
offer starting a second one, and SHALL NOT offer stopping it — it is not this screen's run to
stop. Such a run reports no per-account progress here and no terminal per-account outcome list:
those belong to a run the owner started on this screen, which is unchanged. WHEN a run started
elsewhere ends while this screen is open, the screen SHALL show the moments it moved, and the
owner may then start one of their own.

#### Scenario: A completed sync is dated on the screen

- **WHEN** the one linked account completes a sync and the owner returns to the monobank screen
- **THEN** that account shows the moment the sync completed, and the screen states it as the last
  sync

#### Scenario: A never-synced account says so

- **WHEN** an account is linked and no sync has completed for it
- **THEN** the screen says that account has not synced yet, rather than showing an empty moment

#### Scenario: No linked account has ever synced

- **WHEN** links exist and no sync has completed for any of them
- **THEN** the screen states that no sync has happened on this device yet

#### Scenario: A failed run leaves the moment alone

- **WHEN** an account that last completed a sync yesterday ends rate-limited today
- **THEN** that account still shows yesterday's moment, and the run's outcome is reported as
  rate-limited

#### Scenario: The screen's last sync is the oldest of the accounts

- **WHEN** one linked account last completed a sync on 30 August and another on 1 September, and
  every linked account has synced
- **THEN** the screen states 30 August as the last sync

#### Scenario: A partly synced bank is stated as a count, not as a moment

- **WHEN** three of nine linked accounts have completed a sync and six never have
- **THEN** the screen states that three of nine рахунки are synced, as «Синхронізовано 3 з 9
  рахунків», and states no moment as its last sync

#### Scenario: The count reads as Ukrainian for every number of accounts

- **WHEN** one of three linked accounts has completed a sync
- **THEN** the screen says «Синхронізовано 1 з 3 рахунків» — the noun after «з» is the genitive
  plural whatever the number is, so it is «рахунків» for 2, 3 and 4 as much as for 9

#### Scenario: The moments survive a restart

- **WHEN** the app is closed and reopened after a completed sync
- **THEN** the same moment is still shown for that account

#### Scenario: A run started elsewhere is not started again here

- **WHEN** a run the owner did not ask for is going on and the owner opens the monobank screen and
  asks for a sync
- **THEN** the screen says a sync is going on and no second run starts

#### Scenario: A run started elsewhere is not this screen's to stop

- **WHEN** a run the owner did not ask for is going on and the owner is on the monobank screen
- **THEN** the screen offers neither starting a sync nor stopping the one going on

#### Scenario: A run that begins while the screen is open is seen there

- **WHEN** the monobank screen is already open and a run starts elsewhere
- **THEN** the screen says a sync is going on without being left and reopened

#### Scenario: A run started elsewhere dates the accounts it completed

- **WHEN** a run started on opening completes while the owner is on the monobank screen
- **THEN** the screen shows the new moment for every account that completed

### Requirement: A рахунок the token no longer shows is said plainly on its row

A linked рахунок the newest stored client-info answer does not name SHALL say on its row that
monobank no longer shows it — «monobank більше не показує цей рахунок» — in place of a last-sync
line that would read as a failure to sync, and the screen's own last sync and count SHALL be taken
over the other linked рахунки. This takes precedence over «How much of the bank has synced, and how
old that picture is, is said plainly» for that row and for that reading. It SHALL stay linked, with
its history untouched, until the owner disconnects it.

#### Scenario: A closed card is named, not blamed

- **WHEN** the newest stored answer does not name a linked card last synced two days ago
- **THEN** its row says «monobank більше не показує цей рахунок», and the screen's count of synced
  рахунки is taken over the other linked рахунки

### Requirement: The refresh of the рахунки list says what it refreshes

The action that re-reads the list of monobank cards and банки without syncing транзакції SHALL be
labelled «Оновити список рахунків», so it cannot be mistaken for «Синхронізувати». WHILE no token is
configured it SHALL be shown as unavailable, because there is no list it could refresh; the screen
already offers entering a token above it.

#### Scenario: Without a token there is nothing to refresh

- **WHEN** the owner opens the monobank screen with no token kept
- **THEN** «Оновити список рахунків» is shown unavailable and tapping it does nothing

#### Scenario: The two actions read differently

- **WHEN** the owner opens the monobank screen with a token kept
- **THEN** the list refresh reads «Оновити список рахунків» and the sync reads «Синхронізувати»
