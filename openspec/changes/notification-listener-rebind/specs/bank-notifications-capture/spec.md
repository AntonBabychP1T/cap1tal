## MODIFIED Requirements

### Requirement: Notification access is grantable and answered truthfully

On Android, the installed build SHALL appear on the system's notification-access screen, and
the app SHALL report the access state as the device currently has it: granted when the owner
has switched the app on there and the capture layer is receiving notifications, denied when
they have not or have switched it off. On a platform that has no such permission to grant, the
app SHALL report that granting is not possible, as a distinct answer from denied.

WHEN the owner has switched the app on but the capture layer is not receiving notifications,
the app SHALL report that as an answer of its own, distinct both from granted and from denied.
A capture layer left switched on and unheard — which is what an app update, a reinstall or a
forced stop leaves behind — SHALL NEVER be reported as granted: silence is this feature's worst
failure, because a чернетка that never appears looks exactly like a day with no spending.

WHEN the owner has switched the app on and the capture layer is not receiving notifications, the
app SHALL ask the system to reconnect it, so the common case repairs itself without the owner
opening system settings, and SHALL report the not-receiving answer only for a state that outlives
that request. Where the device cannot say whether the capture layer is receiving, the app SHALL
report granted rather than not-receiving: an unanswered question is not a "no".

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

#### Scenario: A switched-on capture layer that hears nothing is not reported as granted

- **WHEN** the app is switched on at the system's notification-access screen, the capture layer
  is not receiving notifications, a reconnection has been asked for and has not restored it, and
  the app asks for the state
- **THEN** the state is reported as switched on but not receiving, distinct from granted and
  from denied

#### Scenario: A reconnected capture layer reads as granted

- **WHEN** the app is switched on at the system's notification-access screen and the capture
  layer is receiving notifications again after the reconnection was asked for
- **THEN** the state is reported as granted

#### Scenario: A device that cannot say is not reported as silent

- **WHEN** the app is switched on at the system's notification-access screen and the device
  cannot say whether the capture layer is receiving notifications
- **THEN** the state is reported as granted
