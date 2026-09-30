## MODIFIED Requirements

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

## ADDED Requirements

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
labelled «Оновити список рахунків», so it cannot be mistaken for «Синхронізувати».

#### Scenario: The two actions read differently

- **WHEN** the owner opens the monobank screen with a token kept
- **THEN** the list refresh reads «Оновити список рахунків» and the sync reads «Синхронізувати»
