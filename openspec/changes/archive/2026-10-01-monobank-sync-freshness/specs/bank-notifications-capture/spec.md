## MODIFIED Requirements

### Requirement: Only a watched app's notifications are captured

While notification access is granted, a notification posted by a watched app SHALL be
captured as a captured notification — the posting app's package name, the moment it was
posted, its title and its text. A notification posted by any app that is not watched SHALL
leave no trace: not captured, not stored, not counted — with one exception, the monobank app,
whose notification's posting moment alone is noted as a поштовх for the monobank sync (see «A
monobank notification is noted as a поштовх and never captured»).

#### Scenario: A watched app's notification becomes a captured notification

- **WHEN** access is granted, an app is watched, and that app posts a notification
- **THEN** a captured notification exists holding that app's package name, the posted
  moment, the title and the text

#### Scenario: An unwatched app's notification leaves no trace

- **WHEN** access is granted and an app that is not watched, other than the monobank app, posts
  a notification
- **THEN** nothing is captured, nothing is stored, and no later collection hands anything
  over for it

## ADDED Requirements

### Requirement: A monobank notification is noted as a поштовх and never captured

The capture layer SHALL, for a notification the monobank app posts while the app has said a рахунок
is linked, note only the moment it was posted — as a поштовх for the monobank sync — and ask for a
дочитування itself, because the notification may arrive while no JavaScript is running. It SHALL
look at nothing but the posting package, the posting moment and the notification's flags: an
ongoing notification, one belonging to a foreground service and a group summary SHALL be ignored.
It SHALL NOT read the notification's title, text or any other content, SHALL NOT store, log or
queue any of it, and SHALL NOT make it collectable: the monobank app stays never watched, and no
чернетка can come from it. The moment SHALL be kept on the device where the sync can read it
without the app running.

#### Scenario: Only the moment is noted

- **WHEN** the monobank app posts a notification while a рахунок is linked
- **THEN** its posting moment is noted, a дочитування is asked for, and nothing waits for
  collection

#### Scenario: Nothing is noted when no рахунок is linked

- **WHEN** the monobank app posts a notification after the last link was removed
- **THEN** no moment is noted and no дочитування is asked for

#### Scenario: An ongoing monobank notification is ignored

- **WHEN** the monobank app posts an ongoing notification, one of a foreground service, or a group
  summary
- **THEN** no moment is noted and no дочитування is asked for

#### Scenario: A watched bank's capture is unchanged

- **WHEN** a watched bank app posts a notification
- **THEN** it is captured exactly as before, and no поштовх is noted
