## MODIFIED Requirements

### Requirement: «Без продавця» leads with the описи that matter most

The «Продавці» section SHALL open with «Без продавця». It groups every stored витрата and повернення
that carries an опис recognised as no продавець by the написання the proposal gives that опис, and
lists the groups:

- the group holding the most транзакції first; a tie goes to the group whose latest транзакція is
  the most recent;
- each with the опис of its latest транзакція as stored, and how many транзакції the group holds;
- each with «Назвати»;
- the first twenty groups, saying how many more there are when there are more.

When every such опис is recognised, «Без продавця» SHALL say so in one line instead of listing
nothing. A дохід, a переказ and a коригування SHALL NOT be listed: the list is about who the owner
paid. Nor SHALL an опис that names a person or a банка rather than a shop — one whose folded text
begins with «від:», «переказ на картку», «переказ з картки» or «поповнення «»:
such a транзакція can still be named from its own editing, but it is not offered as a продавець
waiting for a name.

#### Scenario: Branch spellings of one shop are one row

- **WHEN** «Без категорії» and other категорії hold seven витрати carrying "АТБ-Маркет 1234", five
  carrying "АТБ-Маркет 5678" and four carrying "Uklon *trip", and no продавець exists
- **THEN** «Без продавця» lists first one row for "атб" holding twelve транзакції with the latest
  of those описи, then one row for "uklon" holding four, each with «Назвати»

#### Scenario: Only twenty rows, and the rest is counted

- **WHEN** twenty-three groups of unrecognised описи exist
- **THEN** «Без продавця» lists twenty of them and says three more exist

#### Scenario: Everything recognised

- **WHEN** every stored витрата and повернення carrying an опис has a продавець
- **THEN** «Без продавця» says in one line that every опис is recognised

#### Scenario: A дохід is not a nameless продавець

- **WHEN** the only unrecognised опис is "Зарахування зарплати" on a дохід
- **THEN** «Без продавця» lists nothing for it

#### Scenario: A payment to a person is not a nameless продавець

- **WHEN** the only unrecognised описи are "Від: Lebedianska Svitlana" and "Поповнення «ліки 93
  бригаді»" on витрати
- **THEN** «Без продавця» lists nothing for them, and the editing of either still offers «Назвати
  продавця»
