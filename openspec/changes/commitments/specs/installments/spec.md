## MODIFIED Requirements

### Requirement: A платіж is linked to its списання by the app

Before the app shows a розстрочка's платежі, counts «Вільно після зобов'язань» or arranges an
нагадування про платіж, it SHALL link every платіж that is neither сплачено nor закрито to its
списання, when one exists. A транзакція SHALL be a candidate for a платіж only when it is a
витрата — never a переказ, an інвестиція, a повернення, a дохід or a коригування — on the
розстрочка's рахунок списання, in UAH, of exactly the платіж's scheduled сума, dated no more than
three days before or after the платіж's дата, not linked to any платіж of a розстрочка or of a
зобов'язання, and not refused for that платіж by the owner. Платежі SHALL be served in order of
their дата, then of the moment their розстрочка was recorded, then of their number; each SHALL take
the candidate nearest its дата, and of equally near candidates the one recorded first. The платежі
of розстрочки SHALL be served before those of any зобов'язання. At the moment it is linked, a
витрата that is «Без категорії» SHALL take the розстрочка's категорія when the розстрочка has one; a
витрата with any other категорія SHALL keep it. Nothing SHALL re-categorise a витрата after that
moment: an owner who sets a linked витрата back to «Без категорії», or changes the розстрочка's
категорія, is not overruled.

#### Scenario: A monobank debit becomes the платіж

- **WHEN** платіж 5 of «iPhone» is 100000 minor units UAH on 2026-10-05 on «mono black», and
  monobank brings a витрата «Без категорії» of 100000 minor units UAH on 2026-10-05 on «mono black»
- **THEN** the витрата is linked to платіж 5, платіж 5 is сплачено, and the витрата's категорія is
  «Техніка»

#### Scenario: A categorised витрата keeps its категорія

- **WHEN** the витрата linked to a платіж of «iPhone» already carried the категорія «Подарунки»
- **THEN** it is linked and its категорія stays «Подарунки»

#### Scenario: The owner's категорія after linking stands

- **WHEN** a витрата took «Техніка» when it was linked, and the owner later sets it to «Без
  категорії»
- **THEN** it stays «Без категорії» and stays linked

#### Scenario: A different сума is not a списання

- **WHEN** the only витрата on «mono black» within three days of a платіж of 100000 minor units UAH
  is 100001 minor units UAH
- **THEN** the платіж stays unlinked

#### Scenario: A переказ of the same сума is not a списання

- **WHEN** the only транзакція on «mono black» of 100000 minor units UAH within three days of a
  платіж of that сума is a переказ to a банка
- **THEN** the платіж stays unlinked and the переказ is still a переказ

#### Scenario: Another рахунок is not the рахунок списання

- **WHEN** a витрата of exactly the платіж сума on the платіж дата sits on «mono white» while the
  рахунок списання is «mono black»
- **THEN** the платіж stays unlinked

#### Scenario: Two розстрочки of the same сума on the same day

- **WHEN** «Пилосос», recorded first, and «Чайник» each have a платіж of 50000 minor units UAH on
  2026-10-05 on «mono black», and two such витрати arrive that day
- **THEN** each платіж is linked to a different витрата: «Пилосос» to the one recorded first and
  «Чайник» to the other

#### Scenario: A витрата already linked to a зобов'язання is not taken

- **WHEN** the only витрата of 100000 minor units UAH on «mono black» within three days of платіж 5
  of «iPhone» is already linked to a платіж of the зобов'язання «Спортзал»
- **THEN** платіж 5 stays unlinked and the витрата stays linked to «Спортзал»

### Requirement: The owner corrects what the app linked

The owner SHALL be able to unlink a платіж from its списання; the app SHALL then never link that
транзакція to that платіж again by itself, and the категорія the транзакція took SHALL stay. The
owner SHALL be able to link a платіж that is not сплачено to a витрата they pick among the UAH
витрати on the рахунок списання dated no more than ten days before or after its дата and not linked
to any платіж of a розстрочка or of a зобов'язання, whatever their сума; a picked витрата that is
«Без категорії» SHALL take the розстрочка's категорія when it has one, as at the app's own linking.
The owner SHALL be able to mark a платіж сплачено without any списання, and to take that mark back.
When a linked транзакція is removed, or is changed so that it is no longer a UAH витрата on the
розстрочка's рахунок списання, its платіж SHALL be unlinked and return to the state its дата gives
it.

#### Scenario: An unlinked debit is not taken back

- **WHEN** the owner unlinks платіж 5 from the витрата the app linked
- **THEN** платіж 5 is not сплачено, and the next linking leaves that витрата unlinked from
  платіж 5 even though it still matches

#### Scenario: A debit of another сума picked by hand

- **WHEN** платіж 5 of 100000 minor units UAH is списання не знайдено because the bank debited
  100050, and the owner picks that витрата for it
- **THEN** платіж 5 is сплачено and linked to that витрата, and the залишок falls by 100000

#### Scenario: A hand-picked витрата without a категорія takes the розстрочка's

- **WHEN** the owner picks a витрата «Без категорії» for платіж 5 of «iPhone», whose категорія is
  «Техніка»
- **THEN** платіж 5 is linked to it and the витрата's категорія is «Техніка»

#### Scenario: A витрата linked to a зобов'язання is not offered

- **WHEN** the owner chooses a списання by hand for платіж 5 of «iPhone», and a витрата on «mono
  black» within ten days of its дата is linked to a платіж of «Інтернет»
- **THEN** that витрата is not among the ones offered

#### Scenario: Marked as paid without a debit

- **WHEN** the owner marks платіж 5 сплачено because they paid it from a рахунок the app does not
  track
- **THEN** платіж 5 is сплачено with no списання, and taking the mark back makes it what its дата
  says

#### Scenario: A debit retyped as a переказ releases its платіж

- **WHEN** the owner changes the витрата linked to платіж 5 into a переказ to a банка
- **THEN** платіж 5 is no longer linked to it

#### Scenario: A deleted debit releases its платіж

- **WHEN** the owner deletes the витрата linked to платіж 5, and платіж 5's дата was 2026-10-05,
  and today is 2026-10-20
- **THEN** платіж 5 is списання не знайдено

## REMOVED Requirements

### Requirement: Вільно після розстрочок is залишилось less what this month still owes

**Reason**: Superseded by «Вільно після зобов'язань» in the commitments capability (owner's
decision, 2026-10-02). That reading subtracts the current month's платежі of розстрочки that are
очікується or списання не знайдено exactly as this one did, and also subtracts the платежі of
зобов'язання. One reading beneath залишилось replaces two that the owner would have to add up.

**Migration**: Nothing stored changes. While no зобов'язання is owed in the current month, the UAH
«Вільно після зобов'язань» is the same сума «Вільно після розстрочок» was; only its name on Місяць
changes.
