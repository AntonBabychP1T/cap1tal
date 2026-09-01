# saldo-import-screen Specification

## Purpose

The one-time move out of Saldo as the owner experiences it: choosing the export file, confirming
which рахунок each Saldo account becomes,
reading the proof that the розрахункові баланси come out right, and only then letting the history
be written to the device. What the import makes of any given export row is the `saldo-import`
capability's truth and is not restated here; this capability is about what the flow shows, what it
refuses to do before the owner has decided, and what committing writes.
## Requirements
### Requirement: The import shows what it would do before it does anything

The system SHALL offer a one-time «Імпорт Saldo» flow that reads the chosen export, builds the
import plan from the owner's decisions and displays it, and SHALL write nothing to storage until
the owner commits. Leaving the flow before committing SHALL leave the owner's рахунки,
категорії, джерела and транзакції exactly as they were. Confirming the account map SHALL lead
straight to the verification report; the flow SHALL ask nothing about debts.

#### Scenario: Leaving before the commit stores nothing

- **WHEN** the owner opens the flow, chooses an export, confirms the map and leaves without
  committing
- **THEN** no рахунок, категорія, джерело or транзакція has been created or changed

#### Scenario: The plan is shown before it is committed

- **WHEN** an export is chosen and the account map confirmed
- **THEN** the flow shows how many транзакції the plan holds and how many рахунки, категорії and
  джерела it would create, before the commit is offered

#### Scenario: The map step leads straight to the звірка

- **WHEN** the owner has confirmed the account map of an export holding «Борг» transactions
- **THEN** the next step of the flow is the verification report, and the commit is offered from
  it without any debt having been assigned

### Requirement: The export file is chosen, and a rejected file says why

The owner SHALL choose the export file from the device. A file the import cannot read — a header
missing a required column, an amount that is not a plain two-decimal number — SHALL be refused
with the reason the import gives, naming what is wrong, and SHALL leave the flow ready for
another file. Nothing SHALL be imported from a refused file.

#### Scenario: A file with an alien header is refused with the reason

- **WHEN** the owner chooses a file whose header lacks a required column
- **THEN** the flow shows the reason naming that column, offers choosing another file, and
  imports nothing

#### Scenario: A readable export moves the flow on

- **WHEN** the owner chooses a well-formed export
- **THEN** the flow shows the account map built from it

### Requirement: The owner confirms the account map before the plan is built

The flow SHALL show every entry of the account map with the рахунок it proposes — its name, its
вид and its currency — and SHALL let the owner change an entry's вид, redirect an entry onto
another entry's рахунок or onto an existing рахунок, and undo either. The redirect targets SHALL
be offered on the entry's own row as a list to choose from, naming each candidate рахунок with
its currency; the owner SHALL NOT have to select a second entry elsewhere on the screen. A redirect the import
rejects — onto a рахунок of another currency — SHALL be shown as rejected with its reason, and
the map SHALL stay as it was.

#### Scenario: Merging two entries leaves one рахунок

- **WHEN** the owner redirects the entry "mono black" (UAH) onto the entry "Monobank UAH, Black"
  (UAH)
- **THEN** the map shows one рахунок receiving both, and the plan holds one рахунок for them

#### Scenario: The targets are offered on the row

- **WHEN** the owner chooses to merge the entry "mono black" (UAH)
- **THEN** the other entries and the owner's existing unarchived рахунки are offered by name and
  currency on that entry's row, and picking one applies the redirect

#### Scenario: Changing a вид changes what the month counts

- **WHEN** the owner changes the вид of the entry "РЕЗЕРВ" from `spending` to `savings`
- **THEN** the plan's рахунок for it is of вид `savings`, so перекази into it count as відкладено

#### Scenario: A cross-currency redirect is shown as rejected

- **WHEN** the owner redirects a UAH entry onto a USD рахунок
- **THEN** the flow shows the redirect as rejected with its reason and the map is unchanged

### Requirement: A proposed категорія or джерело can be redirected onto an existing row

The flow SHALL list every категорія and every джерело the plan proposes to create, and SHALL let
the owner redirect any of them onto an existing row instead, and undo that. A redirected proposal
SHALL create no new row.

#### Scenario: A proposed category is redirected onto an existing one

- **WHEN** the plan proposes creating the category "булка" and the owner redirects it onto the
  existing category «Продукти»
- **THEN** no category "булка" is proposed any more and those витрати carry «Продукти»

### Requirement: The verification report is shown before the commit

Before the commit the flow SHALL show, per рахунок of the plan, the balance Saldo implies and the
розрахунковий баланс the plan yields, marking those that differ and naming what explains each
difference; SHALL show the resulting розрахунковий баланс of every рахунок-борг, so a negative one
is visible; and SHALL show every dropped or unexplained row. A report holding differences SHALL
NOT block the commit — it is the owner's to judge — but the commit SHALL NOT be offered without
the report having been shown.

#### Scenario: A reconciling рахунок is shown as equal

- **WHEN** every leg of "гаманець" is interpreted into the plan
- **THEN** the report shows equal balances for the гаманець рахунок

#### Scenario: A difference is shown with its explanation

- **WHEN** one unpairable in-transit departure of 12198 minor units UAH is excluded from the plan
- **THEN** the report shows that рахунок differing by 12198 minor units UAH and names that row

#### Scenario: An over-repaid рахунок-борг is visible before the commit

- **WHEN** the plan lends 100000 minor units UAH onto one рахунок-борг and repays 110000 back
- **THEN** the report shows that рахунок-борг at −10000 minor units UAH and the commit is still
  offered

### Requirement: Committing writes the whole plan and reports what was written

Committing SHALL store the plan — its рахунки with their початкові залишки, its категорії, its
джерела and every транзакція — as one whole, and SHALL then show what was written: how many
транзакції, рахунки, категорії and джерела. If the write fails, the flow SHALL say so and the
owner's data SHALL be exactly what it was before the commit.

#### Scenario: A committed plan reaches the rest of the app

- **WHEN** the owner commits a plan holding one рахунок and two транзакції
- **THEN** that рахунок and both транзакції are stored, the flow reports one рахунок and two
  транзакції written, and the рахунок's розрахунковий баланс is its початковий залишок plus both

#### Scenario: A failed commit leaves nothing behind

- **WHEN** the write fails partway through committing a plan
- **THEN** the flow reports the failure and no рахунок, категорія, джерело or транзакція of the
  plan is stored

### Requirement: A second import warns before it doubles the history

The system SHALL record the moment an import was committed. Opening the flow when an import has
already been committed SHALL show when that was, and committing again SHALL require an explicit
confirmation beyond the ordinary one. Without that confirmation nothing SHALL be written.

#### Scenario: The first import needs no extra confirmation

- **WHEN** no import has been committed and the owner commits a plan
- **THEN** the plan is stored without a second confirmation being asked

#### Scenario: A second import states when the first happened

- **WHEN** an import was committed and the owner opens the flow again
- **THEN** the flow shows that an import was already committed and when

#### Scenario: Declining the extra confirmation writes nothing

- **WHEN** an import was already committed and the owner reaches the commit but declines the
  extra confirmation
- **THEN** nothing of the second plan is stored

#### Scenario: Accepting the extra confirmation stores the second plan

- **WHEN** an import was already committed and the owner gives the extra confirmation
- **THEN** the second plan is stored and the marker holds the moment of this second import

