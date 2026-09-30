## ADDED Requirements

### Requirement: Choosing on Звіти re-derives only what the choice changes

Choosing a month, a категорія or a currency on Звіти SHALL re-derive only the parts of the tab that
depend on that choice: the highlighted month, the spelled-out month, the chosen категорія's
series, and for a currency choice that currency's history series and its axis. The history by month, the list of категорії that appear in the history, and the цілі with
their progress SHALL be derived once per read of storage, and SHALL NOT be derived again for a
choice. Every number shown after a choice SHALL be exactly what a full re-derivation would show.

#### Scenario: Tapping a month column does not rebuild the history

- **WHEN** the owner taps a different month column on Звіти
- **THEN** that month is highlighted and spelled out, and the history by month, the категорії list
  and the цілі are not derived again

#### Scenario: A choice shows the same numbers a full derivation would

- **WHEN** any month, категорія and currency are chosen in any order
- **THEN** every number on the tab equals the one derived from scratch for the same choice
