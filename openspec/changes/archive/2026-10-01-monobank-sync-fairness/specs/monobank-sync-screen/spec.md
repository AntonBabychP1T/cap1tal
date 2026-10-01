## REMOVED Requirements

### Requirement: When each linked account last synced is shown, and its absence is said plainly

**Reason**: Its central rule — that the screen states the *most recent* completed sync among the
linked accounts as its own last sync — is the defect this change exists to fix: on a device where
one account of nine had synced, it made the screen date a sync while eight accounts had never had
one. What the screen states is no longer a single moment but how much of the bank has synced and
how old the whole picture is, so the requirement is replaced rather than amended: its scenario
«The screen's last sync is the most recent of the accounts» asserts the very behaviour that is
being removed.

**Migration**: None for stored data — no moment, link or транзакція changes, and every per-account
moment is read exactly as before. The requirement below states everything this one did, with the
screen's own last sync answered differently.

## ADDED Requirements

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
