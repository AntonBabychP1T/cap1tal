## ADDED Requirements

### Requirement: When each linked account last synced is shown, and its absence is said plainly

The monobank screen SHALL show, for every linked monobank account, the moment at which a sync last
completed for it, and SHALL state the most recent such moment among the linked accounts as the
screen's own last sync. WHEN no sync has completed for an account, the screen SHALL say so for that
account plainly rather than showing nothing; WHEN no sync has completed for any linked account, the
screen SHALL say that too. Only a completed account SHALL move a moment: an account that ends
invalid-token, rate-limited or unavailable SHALL keep whatever moment it had, so the screen never
claims a sync that did not happen. The moments SHALL survive closing and reopening the app.

Sync SHALL remain something the owner starts: nothing here makes the app sync on its own.

#### Scenario: A completed sync is dated on the screen

- **WHEN** a linked account completes a sync and the owner returns to the monobank screen
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

#### Scenario: The screen's last sync is the most recent of the accounts

- **WHEN** one linked account last completed a sync on 30 August and another on 1 September
- **THEN** the screen states 1 September as the last sync

#### Scenario: The moments survive a restart

- **WHEN** the app is closed and reopened after a completed sync
- **THEN** the same moment is still shown for that account
