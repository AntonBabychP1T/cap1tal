# bank-notifications-capture — delta

## Purpose

The on-device layer that makes reading other banks' notifications real: notification access
that can actually be granted and is reported truthfully, capture of watched apps'
notifications as the records the bank-notifications engine consumes, and a bounded local
queue the app collects them from — with nothing read ever leaving the phone.

## ADDED Requirements

### Requirement: Notification access is grantable and answered truthfully

On Android, the installed build SHALL appear on the system's notification-access screen, and
the app SHALL report the access state as the device currently has it: granted when the owner
has switched the app on there, denied when they have not or have switched it off. On a
platform that has no such permission to grant, the app SHALL report that granting is not
possible, as a distinct answer from denied.

#### Scenario: Granting flips the answer to granted

- **WHEN** notification access is not granted, the owner switches the app on at the system's
  notification-access screen, and the app asks again
- **THEN** the state is reported as granted

#### Scenario: Revoking flips the answer back to denied

- **WHEN** the owner switches the app off at the system's notification-access screen and the
  app asks again
- **THEN** the state is reported as denied, not as impossible to grant

#### Scenario: A platform without the permission says so

- **WHEN** the app asks for the access state on a platform where notification access does not
  exist
- **THEN** the answer is that granting is not possible, distinct from denied

### Requirement: Only a watched app's notifications are captured

While notification access is granted, a notification posted by a watched app SHALL be
captured as a captured notification — the posting app's package name, the moment it was
posted, its title and its text. A notification posted by any app that is not watched SHALL
leave no trace: not captured, not stored, not counted.

#### Scenario: A watched app's notification becomes a captured notification

- **WHEN** access is granted, an app is watched, and that app posts a notification
- **THEN** a captured notification exists holding that app's package name, the posted
  moment, the title and the text

#### Scenario: An unwatched app's notification leaves no trace

- **WHEN** access is granted and an app that is not watched posts a notification
- **THEN** nothing is captured, nothing is stored, and no later collection hands anything
  over for it

### Requirement: The watched set holds without the app running

The capture layer SHALL be told the current set of watched app packages and SHALL apply the
set it was most recently told, even when the app itself has not run since the device
restarted. Before it has ever been told a set, the set SHALL be empty and nothing SHALL be
captured.

#### Scenario: Capture works before the app is opened

- **WHEN** a watched set was given, the device restarts, and a watched app posts a
  notification before the owner opens the app
- **THEN** the notification is captured and waits for collection

#### Scenario: Nothing is captured before any set was given

- **WHEN** access is granted but the capture layer has never been told a watched set
- **THEN** a notification from any app leaves no trace

### Requirement: The monobank app is never watched

The watched set SHALL never contain the monobank app package: an instruction that names it
SHALL be refused as a typed rejection leaving the watched set unchanged, and no notification
from that package SHALL ever be captured. monobank is captured by its API with real ids and
balances; a second, weaker capture path for the same рахунки would only manufacture
duplicates.

#### Scenario: A watched set naming monobank is refused

- **WHEN** the capture layer is told a watched set that includes the monobank app package
- **THEN** the instruction is refused as a typed rejection and the watched set stays as it
  was

#### Scenario: A stored watched set naming monobank still captures nothing

- **WHEN** the monobank app posts a notification while a stored watched set somehow names
  its package, past the refusal
- **THEN** nothing is captured and nothing waits for collection

### Requirement: Captured notifications wait on the device until acknowledged

A captured notification SHALL be kept on the device until the app acknowledges it, surviving
the app not running. The waiting queue SHALL be bounded; when it is full, the oldest captured
notification SHALL make room for the newest, so capture degrades by forgetting the oldest —
never by refusing the newest, crashing, or blocking the device.

#### Scenario: Captures outlive the app process

- **WHEN** two watched notifications are captured while the app is not running and the app
  later collects
- **THEN** both captured notifications are handed over, oldest first

#### Scenario: A full queue forgets the oldest first

- **WHEN** the queue holds as many captured notifications as it is allowed to and a watched
  app posts one more
- **THEN** the newest is captured and waiting, and the oldest is gone

### Requirement: A captured notification is delivered until acknowledged, and never after

Collecting SHALL hand the app every waiting captured notification, oldest first, and SHALL
remove nothing by itself; only the app's acknowledgement of what it has safely taken removes
captured notifications from the queue, and an acknowledged captured notification SHALL never
be handed over again. Redelivery of an unacknowledged captured notification is therefore
expected and safe — turning a redelivered record into nothing is the engine's own
fingerprint-deduplication requirement — while a crash between collecting and storing loses
nothing.

#### Scenario: Collecting without acknowledging redelivers

- **WHEN** the app collects the waiting captured notifications and collects again without
  acknowledging them
- **THEN** both collections hand over the same captured notifications

#### Scenario: After acknowledgement nothing returns

- **WHEN** the app acknowledges what a collection handed over and collects again with
  nothing new posted in between
- **THEN** the collection hands over nothing

#### Scenario: A capture during processing survives the acknowledgement

- **WHEN** a watched app posts a notification after a collection was handed over, and the
  app then acknowledges that collection
- **THEN** the next collection hands over exactly the newer captured notification

### Requirement: Nothing captured leaves the device

Captured notifications, the waiting queue and the watched set SHALL exist only on the
device: no outbound connection SHALL carry any of it, and no export or backup the app ever
produces SHALL include the queue or raw notification content.

#### Scenario: A captured notification exists only on the phone

- **WHEN** a watched app's notification is captured, waits, and is collected
- **THEN** every copy of it lives on the device and no outbound connection has carried its
  content

### Requirement: A build that cannot capture answers with values, never a crash

On a build or platform where capture cannot work, collecting SHALL answer with no captured
notifications and telling the watched set SHALL answer with a typed outcome — never a crash
and never a hang.

#### Scenario: Collecting where capture cannot work yields nothing

- **WHEN** the app collects captured notifications on a platform where capture cannot work
- **THEN** the answer is that nothing is waiting, and the app carries on

#### Scenario: Telling the watched set where capture cannot work is a typed outcome

- **WHEN** the app tells the capture layer a watched set on a platform where capture cannot
  work
- **THEN** the answer is the typed outcome that capture cannot work here, and nothing
  crashes
