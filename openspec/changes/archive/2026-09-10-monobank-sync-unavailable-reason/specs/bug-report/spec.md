## MODIFIED Requirements

### Requirement: The журнал records what the app itself did, not only what refused

The app SHALL add entries to the журнал for the work it does on the owner's behalf, whether or not
it succeeds: a monobank sync run, each рахунок's turn within it, the collection of captured bank
notifications, a бекап, a відновлення, the Saldo import, and every reach for a service the app
makes through a library rather than through a request port — the Google sign-in exchange. Each
SHALL be recorded when it begins and when it ends; the ending entry SHALL carry what it came to, how long it took, and the counts
the operation measured — as numbers only. Entries belonging to one operation SHALL carry a shared
mark that ties them together, so a run's entries can be read as one run even when other entries
fall between them. A рахунок's turn that ends «недоступно» because the bank did answer but the app
could not read that answer as it expected SHALL carry one further entry naming why, in the app's
own enumerated word — never a sentence it composed. A turn that ends «недоступно» for a cause that
already reads as itself elsewhere in the журнал — the request never reached the bank, the bank
refused it outright, or the cause is the app's own and has nothing to do with what the bank
answered — adds no such entry.

#### Scenario: A sync run reads as a run

- **WHEN** a sync run over three linked рахунки finishes
- **THEN** the журнал holds an entry for the run beginning, one for each рахунок's turn with the
  outcome that turn came to, and one for the run ending with how long it took and how many
  транзакції it imported — all carrying the same mark

#### Scenario: A рахунок that fails is named among those that did not

- **WHEN** a run syncs two рахунки successfully and a third comes to «недоступно»
- **THEN** the журнал names all three turns with their outcomes, and the third's identifies which
  рахунок it was

#### Scenario: An operation that succeeds is recorded, not only one that fails

- **WHEN** a бекап is written successfully
- **THEN** the журнал holds its beginning and its ending with how long it took, and no failure
  entry

#### Scenario: The counts an operation measures are numbers

- **WHEN** the collection of captured bank notifications ends having made two чернетки out of five
  captured notifications
- **THEN** the журнал's entry for it carries those two numbers and no part of any notification's
  text

#### Scenario: A недоступно рахунок names a currency that does not match its own

- **WHEN** a рахунок's statement request answers with a body the bank did send, and a рядок in it
  reports a currency other than the рахунок's own stored currency
- **THEN** the журнал holds one more entry for that рахунок's turn, naming that the currency did
  not match

#### Scenario: A недоступно рахунок names a body it could not read at all

- **WHEN** a рахунок's request answers with a body that is not readable text the app can interpret
- **THEN** the журнал holds one more entry for that рахунок's turn, naming that the body could not
  be read

#### Scenario: A недоступно рахунок names a body of the wrong shape

- **WHEN** a рахунок's request answers with a body the app can read as text but that is not the
  shape the endpoint promises — for either reason other than the two above
- **THEN** the журнал holds one more entry for that рахунок's turn, naming that the body was not
  the expected shape

#### Scenario: A недоступно рахунок with no answer to read names no reason

- **WHEN** a рахунок's turn comes to «недоступно» because the request itself never reached the
  bank, the bank refused it with a status the run does not otherwise name, or the cause was the
  app's own and had nothing to do with what the bank answered
- **THEN** the журнал names the turn's outcome as it already does, and adds no further entry —
  the cause already reads as itself elsewhere in the журнал, or is not about the bank's answer at
  all
