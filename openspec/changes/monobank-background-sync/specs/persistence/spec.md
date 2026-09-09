## MODIFIED Requirements

### Requirement: Monobank links and progress survive a restart

The system SHALL store each active link's monobank account id, рахунок id, confirmed first-sync
boundary, committed cursor and latest баланс банку, and SHALL read them back unchanged after a
restart. A monobank account and a рахунок SHALL each occur in at most one active link, and every
stored balance SHALL carry the linked рахунок's currency.

A link SHALL also store where a window it is half-way through has got to — the end of that window
and the end its next request should ask for — or nothing at all for a link with no window in
progress, which is what every link stored before this reads back as. The pair SHALL be written in
the same transaction as the транзакції and imported ids of the answer that produced it, so a
position can never outlive an answer that did not store, and SHALL be read back unchanged after a
restart: it is what lets a рахунок too large for one прогін be finished by several.

It SHALL NOT travel in a бекап, for the reason `last_attempted_at` does not: it describes how far
*this* phone has read, and a phone restored from a бекап has read nothing.

#### Scenario: A link resumes after restart

- **WHEN** a UAH link with a confirmed boundary, committed cursor and баланс банку is stored and
  storage is reopened
- **THEN** the same monobank account is linked to the same UAH рахунок with the same boundary,
  cursor and bank balance

#### Scenario: A second active link is rejected

- **WHEN** storage already links monobank account M to рахунок A and an attempt is made to link M
  to рахунок B or another monobank account to A
- **THEN** the attempted second link is rejected and the existing link remains unchanged

#### Scenario: A half-paged window survives a restart

- **WHEN** a link that stopped in the middle of a window is stored and storage is reopened
- **THEN** the window it was paging and the page its next request should ask for read back
  unchanged, beside the cursor that has not moved

#### Scenario: A link with no window in progress remembers no position

- **WHEN** a link whose last window answered short is stored and storage is reopened
- **THEN** it carries no paging position at all, and reading one back is not an error

#### Scenario: Existing links survive gaining the paging position

- **WHEN** links, cursors, imported ids and bank balances stored under the previously committed
  migrations alone are brought to the current storage shape
- **THEN** all of them load unchanged, and each carries no paging position

#### Scenario: A бекап carries no paging position

- **WHEN** a бекап is made from a phone whose link is half-way through a window and is restored
- **THEN** the restored link has the same boundary and cursor and no paging position, so its next
  прогін plans that window afresh
