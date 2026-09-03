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
another entry's рахунок or onto an existing рахунок, and undo either. Both the вид and the
redirect targets SHALL be offered on the entry's own row and only after the owner has asked for
them there; the owner SHALL NOT have to select a second entry elsewhere on the screen, and SHALL
NOT have to read the targets of every entry to reach the entry they mean. What those targets are,
in what order they stand and how they are searched is stated in "Merge targets are offered only
when the owner asks for them, in the row's own currency, most alike first". A redirect the import
rejects SHALL be shown as rejected with its reason on that entry's row, and the map SHALL stay as
it was.

#### Scenario: Merging two entries leaves one рахунок

- **WHEN** the owner redirects the entry "mono black" (UAH) onto the entry "Monobank UAH, Black"
  (UAH)
- **THEN** the map shows one рахунок receiving both, and the plan holds one рахунок for them

#### Scenario: The targets are offered on the row

- **WHEN** the owner asks to merge the entry "mono black" (UAH)
- **THEN** the рахунки it may be merged onto are offered by name and currency on that entry's own
  row, picking one applies the redirect, and no other entry's targets are drawn

#### Scenario: Changing a вид changes what the month counts

- **WHEN** the owner opens the вид of the entry "РЕЗЕРВ" and changes it from `spending` to
  `savings`
- **THEN** the plan's рахунок for it is of вид `savings`, so перекази into it count as відкладено,
  and the row states the вид it now carries

#### Scenario: A вид changed by hand can be given back to Saldo

- **WHEN** the owner has changed the вид of an entry and asks for the вид Saldo proposed
- **THEN** the row states the proposed вид again and the plan's рахунок carries it

#### Scenario: A cross-currency redirect is shown as rejected

- **WHEN** the owner's decisions carry a redirect of a UAH entry onto a USD рахунок — which the
  merge targets never offer
- **THEN** the flow shows the redirect as rejected with its reason on that row and the map is
  unchanged

### Requirement: The account map is a compact list with one line of state per рахунок

The account map SHALL be shown as one row per entry, and a row SHALL show, without the owner
opening anything: the Saldo account's name, its currency, the вид the рахунок it becomes will
carry, and one line of state saying what will happen to it — that a new рахунок will be created,
that it will be merged onto another entry's рахунок and which, or that it will be added to a
рахунок the owner already has and which. A row that other entries are merged onto SHALL also name
them, so a merge is readable from both of its ends. No row SHALL draw the choices of a вид, of a
merge target, or of anything else until the owner asks for them on that row (see "Merge targets
are offered only when the owner asks for them, in the row's own currency, most alike first").

An entry the owner never touches SHALL become its own new рахунок with the вид the import
proposed: leaving the step untouched SHALL be a complete answer, and the map SHALL ask for no
decision it can make itself.

The step SHALL open with one line saying how many рахунки the export holds, how many of them
carried a підказка про дубль when the export was read (see "A підказка про дубль points out a pair
that can only be one рахунок"), and that the rest will simply be created — worded so it stays true
after the owner has answered them. The rows carrying one SHALL be grouped ahead of the rest
under a heading naming how many there are. Both that grouping and the two counts of the opening
line SHALL be decided when the export is read and SHALL NOT change as the owner decides, so no row
moves under the owner's finger and no count moves under their eye.

The action that leads on to the звірка SHALL stand under that opening line as well as after the
last row, so reading the whole list is not the price of going on.

#### Scenario: A row states what will happen without being opened

- **WHEN** the account map holds the entry "mono black" (UAH), proposed as a new рахунок of вид
  `spending`, and the owner has decided nothing
- **THEN** the row shows «mono black», UAH, the вид `spending` and that a new рахунок will be
  created, and it draws no list of вид choices and no list of merge targets

#### Scenario: A merged row states what it merges into

- **WHEN** the owner has redirected the entry "mono black" (UAH) onto the entry
  "Monobank UAH, Black" (UAH)
- **THEN** the "mono black" row states that it is merged onto «Monobank UAH, Black», and the
  "Monobank UAH, Black" row names «mono black» among what it receives

#### Scenario: A row added to a рахунок the owner already has says so

- **WHEN** the owner redirects the entry «гаманець» (UAH) onto the existing рахунок «гаманець»
- **THEN** the row states that it is being added to an existing рахунок and names it, distinctly
  from a merge onto another entry of the import

#### Scenario: Twenty-three entries are twenty-three rows and no chips

- **WHEN** the export holds twenty-three (Saldo account, currency) pairs and the owner has opened
  nothing
- **THEN** the step shows twenty-three rows, none of which draws a вид choice or a merge target

#### Scenario: Going on without touching anything creates every рахунок separately

- **WHEN** the export holds twenty-three entries and the owner goes on to the звірка without
  opening a single row
- **THEN** the plan holds twenty-three рахунки, each with the вид the import proposed, and nothing
  was merged

#### Scenario: The step opens with what it found and the way on

- **WHEN** the account map holds twenty-three entries of which two carry a підказка про дубль
- **THEN** the step opens with one line naming twenty-three рахунки and two підказки, and the
  action leading to the звірка is offered there as well as after the last row

#### Scenario: Neither the grouping nor the counts move while the owner decides

- **WHEN** two rows are grouped as carrying a підказка про дубль and the owner merges one of them
- **THEN** both rows stay in that group, in the same order, with the merged one now stating its
  merge, and the opening line still names two підказки

### Requirement: Merge targets are offered only when the owner asks for them, in the row's own currency, most alike first

Every row SHALL offer an action that opens the merge targets for that entry, and the targets SHALL
be drawn only while it is open. At most one editor SHALL be open on the step at a time — a row's
merge targets, a row's вид, or the existing rows offered to a proposed категорія or джерело:
opening any of them SHALL close whatever was open before, and the phone's own «назад» SHALL close
the open one before it leaves the screen.

The targets offered SHALL be exactly the рахунки the entry may legally be merged onto: the other
entries of the import **of that entry's currency** that are not themselves merged away, and the
owner's unarchived рахунки **of that entry's currency**. A рахунок of another currency SHALL NOT
be offered — the import rejects such a merge, and an offer that exists to be refused is not an
offer. Each target SHALL be named with its currency, and a target that is a рахунок the owner
already has SHALL be distinguishable from an entry of this import, because the two can carry the
same name and are different decisions.

The targets SHALL be ordered by how much each name resembles the entry's own, most alike first,
ties keeping the order they already have — the entries of the import in the export's order, then
the existing рахунки in theirs.

The open targets SHALL always offer creating a separate рахунок instead, above the targets and
marked as the current answer while the entry is not merged; taking it SHALL undo any merge on that
entry. That offer is not a target: it SHALL NOT be removed by a search, and it SHALL NOT count
toward the number of targets that raises the search field. The owner SHALL also be able to close
the targets without choosing, leaving the entry's answer as it was.

WHEN more targets are offered than a picker shows at once, the open targets SHALL also show a
field that narrows them by name, matching anywhere in the name and ignoring letter case in
Ukrainian and in Latin; a search matching no target SHALL say so. WHEN no target at all can be
offered, the open targets SHALL say that there is no рахунок of that currency to merge with.

#### Scenario: Nothing is drawn until the row is asked

- **WHEN** the account map holds twenty-three entries and the owner has opened no row
- **THEN** no merge target is drawn anywhere on the step

#### Scenario: Opening one row's targets closes another's

- **WHEN** the owner opens the merge targets of "mono black" and then those of «гаманець»
- **THEN** only «гаманець»'s targets are drawn

#### Scenario: Opening a вид closes the open targets

- **WHEN** the owner has the merge targets of "mono black" open and opens the вид of «гаманець»
- **THEN** the merge targets are closed and only the вид choices are drawn

#### Scenario: «Назад» closes an open вид before the step

- **WHEN** the owner has a row's вид open and uses the phone's «назад»
- **THEN** the вид closes, the account map is still open, and every decision made so far is kept

#### Scenario: Only рахунки of the row's currency are offered

- **WHEN** the owner opens the merge targets of the UAH entry "mono black" while the map also
  holds the USD entries "binance usdt" and "валюта моно"
- **THEN** neither USD entry is offered, and every target offered is in UAH

#### Scenario: The most alike name comes first

- **WHEN** the owner opens the merge targets of "mono black" (UAH) while the map holds
  "Monobank UAH, Black", «гаманець» and "OTP", all UAH
- **THEN** "Monobank UAH, Black" is offered before «гаманець» and "OTP"

#### Scenario: An entry already merged away is not a target

- **WHEN** "mono black" has been merged onto "Monobank UAH, Black" and the owner opens the merge
  targets of "OTP" (UAH)
- **THEN** "Monobank UAH, Black" is offered and "mono black" is not

#### Scenario: An archived рахунок is not a target

- **WHEN** the owner has an archived UAH рахунок and opens the merge targets of a UAH entry
- **THEN** that рахунок is not offered

#### Scenario: An existing рахунок is told apart from an entry of the import

- **WHEN** the owner has a рахунок named «гаманець» and the export also holds a Saldo account
  named «гаманець», both UAH, and the owner opens the merge targets of another UAH entry
- **THEN** both are offered and the one the owner already has is marked as such

#### Scenario: Long lists of targets are searched by name

- **WHEN** the owner opens the merge targets of a UAH entry while seventeen UAH targets are
  offered and types «mono»
- **THEN** only the targets whose names contain «mono», in any letter case, are shown

#### Scenario: A search that matches nothing still leaves the way out

- **WHEN** the owner searches the merge targets for text no target's name contains
- **THEN** the targets say that nothing was found, no рахунок is shown, and creating a separate
  рахунок is still offered

#### Scenario: The way out is never a search result

- **WHEN** exactly five targets are offered to an entry and the owner opens them
- **THEN** no search field is shown — creating a separate рахунок does not count toward what
  raises one — and that offer stands above the five

#### Scenario: A currency with nothing to merge says so

- **WHEN** the export holds exactly one EUR entry and the owner has no EUR рахунок, and the owner
  opens that entry's merge targets
- **THEN** they say there is no рахунок of that currency to merge with, and offer only creating a
  separate рахунок

#### Scenario: Creating a separate рахунок is always the way back

- **WHEN** the owner has merged "mono black" onto "Monobank UAH, Black", opens its merge targets
  again and takes «створити окремий рахунок»
- **THEN** the merge is undone, the row states again that a new рахунок will be created, and the
  plan holds a рахунок for "mono black" of its own

#### Scenario: Closing the targets without choosing changes nothing

- **WHEN** the owner opens the merge targets of an entry and closes them without choosing
- **THEN** the entry's answer is what it was, and nothing was decided

#### Scenario: «Назад» closes the open targets before the step

- **WHEN** the owner has one row's merge targets open and uses the phone's «назад»
- **THEN** the targets close, the account map is still open, and every decision made so far is
  kept

### Requirement: A підказка про дубль points out a pair that can only be one рахунок

A **підказка про дубль** is one sentence on a row saying that the entry looks like the same
рахунок as one other, naming that one. The flow SHALL state it only under the rules below, and
SHALL state it whenever exactly one рахунок qualifies under them and it has not been withdrawn.
It SHALL offer beside it both merging with the рахунок it names and dismissing it, and SHALL merge
nothing on its own: until the owner takes the merge, the entry SHALL still become its own new
рахунок.

The one рахунок a підказка may name SHALL be one the row's merge targets would offer — of the
entry's own currency, another entry of the import or an unarchived рахунок the owner already has —
so taking it applies exactly the redirect the owner could have made through those targets. It SHALL
be stated only when the two names leave little doubt: they are the same once letter case and
surrounding spaces are ignored, or the shorter name has at least two words and each of them matches
a word of the longer one, two words matching when they are equal, or when neither is a number and
one is a prefix of the other of at least four letters. No other likeness SHALL be stated. WHEN more
than one candidate would qualify for one entry, none SHALL be stated — a guess between two is not a
підказка.

One pair SHALL be pointed out at most once: WHEN two entries of the import qualify for each other,
only the later of them in the map's order SHALL carry the підказка, naming the earlier. WHEN an
entry qualifies against a рахунок the owner already has, the entry SHALL carry it.

A підказка SHALL stop being stated once its row has been merged, once the рахунок it names has
itself been merged away, or once the owner dismisses it; a dismissal SHALL last for the rest of the
flow and SHALL be stored nowhere. Neither dismissing a підказка nor its disappearing SHALL change
the plan, and taking its merge SHALL be undoable exactly as any other merge is.

#### Scenario: An obvious duplicate is pointed out, not merged

- **WHEN** the map holds "mono black" (UAH) and "Monobank UAH, Black" (UAH)
- **THEN** one of the two rows carries a підказка про дубль naming the other, and until the owner
  acts the plan still holds two separate рахунки

#### Scenario: A рахунок the owner already has is pointed out

- **WHEN** the owner has created the рахунок «Гаманець» (UAH) by hand and the export holds the
  Saldo account «гаманець» (UAH)
- **THEN** that entry's row carries a підказка про дубль naming «Гаманець»

#### Scenario: Taking the підказка merges exactly as the targets would

- **WHEN** the owner takes the merge offered by the підказка on the "mono black" row
- **THEN** the plan holds one рахунок receiving both, the row states its merge, and undoing it
  through that row leaves two рахунки again

#### Scenario: A dismissed підказка does not come back

- **WHEN** the owner dismisses the підказка on a row and goes on to the звірка and back to the
  account map
- **THEN** that row carries no підказка, it is still to become its own new рахунок, the plan is
  exactly what it was before the dismissal, and nothing about the dismissal was stored

#### Scenario: A merged row states its merge and no підказка

- **WHEN** a row carrying a підказка про дубль is merged onto some other рахунок
- **THEN** the row states that merge and carries no підказка

#### Scenario: An archived рахунок is never named by a підказка

- **WHEN** the owner has an archived UAH рахунок whose name is identical to a UAH entry's
- **THEN** no row carries a підказка naming it, exactly as no row offers it as a merge target

#### Scenario: A підказка naming a рахунок that has since been merged away is withdrawn

- **WHEN** a row carries a підказка naming another entry, and that other entry is then merged onto
  a third рахунок
- **THEN** the row carries no підказка any more, and the merge targets are what is left to the
  owner

#### Scenario: Different currencies are never called the same рахунок

- **WHEN** the map holds "валюта моно" (UAH) and "валюта моно" (USD)
- **THEN** neither row carries a підказка про дубль

#### Scenario: A mere family likeness is not a підказка

- **WHEN** the map holds "Monobank UAH, Black" and "Monobank UAH, White"
- **THEN** neither row carries a підказка про дубль

#### Scenario: Two candidates cancel each other out

- **WHEN** an entry's name qualifies against two different рахунки of its currency
- **THEN** its row carries no підказка and the owner is left with the merge targets

#### Scenario: A pair is pointed out on one side only

- **WHEN** the map holds "mono black" and "Monobank UAH, Black" and both would qualify
- **THEN** exactly one of the two rows carries the підказка

### Requirement: Every decision of the account map is reachable with a thumb

Every action of the account map — opening a row's merge targets, opening its вид, choosing a
target, taking or dismissing a підказка про дубль, undoing a merge, and going on to the звірка —
SHALL be a touch target of at least the size the app uses everywhere else, and SHALL carry a name
that says what it does without the row's other lines being read aloud with it.

The step SHALL be readable on the narrowest screen the app supports without scrolling sideways: a
Saldo account's name too long for one line SHALL wrap or be shortened while its currency and its
state stay visible, and no row SHALL require a horizontal gesture to be read or acted upon.

#### Scenario: A long Saldo name does not push the currency off the screen

- **WHEN** a Saldo account's name is longer than the width of the narrowest supported screen
- **THEN** its row still shows the currency and the state, and the step scrolls only vertically

#### Scenario: Every action of a row is a full touch target

- **WHEN** a row offers opening its merge targets, opening its вид and undoing a merge
- **THEN** each of them is at least the app's standard touch target in height

### Requirement: A proposed категорія or джерело can be redirected onto an existing row

The flow SHALL list every категорія and every джерело the plan proposes to create, and SHALL let
the owner redirect any of them onto an existing row instead, and undo that. A redirected proposal
SHALL create no new row. The existing rows SHALL be drawn only after the owner asks for them on
that proposal's own row, which is one of the editors the step opens one at a time (see "Merge
targets are offered only when the owner asks for them, in the row's own currency, most alike
first") — and WHEN more of them are
offered than a picker shows at once, they SHALL be narrowed by a field matching anywhere in the
name and ignoring letter case in Ukrainian and in Latin, a search matching nothing saying so.

#### Scenario: A proposed category is redirected onto an existing one

- **WHEN** the plan proposes creating the category "булка" and the owner redirects it onto the
  existing category «Продукти»
- **THEN** no category "булка" is proposed any more and those витрати carry «Продукти»

#### Scenario: The existing категорії are searched rather than scrolled

- **WHEN** the plan proposes creating a category, the owner asks for the existing ones while
  twenty-seven are offered, and types «прод»
- **THEN** only the категорії whose names contain «прод», in any letter case, are shown

#### Scenario: «Назад» closes an open list of existing rows before the step

- **WHEN** the owner has the existing категорії open on a proposal's row and uses the phone's
  «назад»
- **THEN** that list closes, the account map is still open, and every decision made so far is kept

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

