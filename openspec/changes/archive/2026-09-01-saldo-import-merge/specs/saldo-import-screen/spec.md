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
