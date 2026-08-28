## ADDED Requirements

### Requirement: The flow proposes which map entries are the same рахунок

Before the owner changes anything, the flow SHALL propose a merge for every account map entry
whose name matches another entry of the same currency, or an unarchived рахунок of the same
currency the owner already has. Each proposal SHALL name what would merge into what and why it
was proposed. An existing рахунок SHALL be preferred over another entry where both match. Where
an entry matches two targets equally well, no merge SHALL be proposed for it. No proposal SHALL
target an entry that is itself proposed to merge elsewhere, and no proposal SHALL cross
currencies.

#### Scenario: Two spellings of one card are proposed as one рахунок

- **WHEN** the export carries the UAH entries «mono black» and «Monobank Black»
- **THEN** merging the second into the first is proposed, with the matched name given as the
  reason, and the map still shows both entries until the owner accepts

#### Scenario: A рахунок the owner already keeps wins over another entry

- **WHEN** a UAH entry matches both another UAH entry and an existing unarchived UAH рахунок
- **THEN** the merge proposed for it is onto the existing рахунок

#### Scenario: An equal match proposes nothing

- **WHEN** an entry matches two targets on evidence of the same strength
- **THEN** no merge is proposed for that entry and the choice is left to the owner

#### Scenario: Nothing is proposed across currencies

- **WHEN** a UAH entry and a USD entry carry the same name
- **THEN** no merge between them is proposed

#### Scenario: Proposals never chain

- **WHEN** three entries of one currency all match each other
- **THEN** two merges onto the first entry are proposed and no proposal targets an entry that is
  itself merging away

### Requirement: The proposed merges are accepted or refused by the owner

The flow SHALL apply no proposed merge until the owner accepts it. The owner SHALL be able to
accept the whole proposed set in one step, to refuse individual proposals before accepting, and
to undo an accepted merge afterwards exactly as a merge made by hand is undone. Accepting a set
SHALL leave the map in the same state that making those merges one at a time would have left it.

#### Scenario: Accepting the set merges every proposal at once

- **WHEN** three merges are proposed and the owner accepts the set
- **THEN** the map shows one рахунок receiving each merged group, and the plan holds one рахунок
  per group

#### Scenario: A refused proposal is not applied

- **WHEN** the owner refuses one of three proposals and accepts the rest
- **THEN** the refused entry stays its own рахунок in the map and the other two are merged

#### Scenario: An accepted merge can be undone

- **WHEN** the owner accepts the proposed set and then undoes one of the merges
- **THEN** that entry becomes its own рахунок again and the rest of the map is unchanged

#### Scenario: Nothing is written by proposing or accepting

- **WHEN** merges are proposed and accepted and the owner leaves before committing the import
- **THEN** the device holds no new рахунок and no транзакція from this import

## MODIFIED Requirements

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
