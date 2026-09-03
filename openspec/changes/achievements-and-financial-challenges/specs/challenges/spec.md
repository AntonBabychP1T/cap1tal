## ADDED Requirements

### Requirement: A виклик states why it was proposed, how far it has come and when it is done

Every виклик the system offers SHALL carry four things: the **reason** it was proposed, in the
owner's own terms and from their own numbers; a **progress** that is a measurable number against a
target; an **unambiguous criterion** for being finished; and one **action** that begins it, leading
to the screen where the work is actually done. A виклик that cannot state all four SHALL NOT be
offered.

A виклик SHALL never block, warn or scold, and SHALL never be worded as a failure.

#### Scenario: A proposed виклик carries all four

- **WHEN** the system proposes «Фінансова подушка» while the резерв in UAH is 900000 minor units and
  the UAH місячна норма витрат is 3000000 minor units
- **THEN** it states the reason from those two numbers, a progress of 900000 against 3000000 minor
  units UAH, the criterion «резерв щонайменше одна місячна норма витрат», and an action leading to
  recording a переказ onto a рахунок of вид `savings`

### Requirement: At most three виклики stand at a time, chosen deterministically

The system SHALL offer at most three виклики at any moment. Which ones SHALL be decided by a fixed
order of the catalogue, filtered to those whose conditions to be offered hold and which the owner
has not dismissed, and SHALL be a function of the stored data alone: two devices holding the same
data SHALL offer the same виклики in the same order. No language model SHALL choose, rank, word or
score a виклик, and no виклик's progress or completion SHALL be computed by one.

#### Scenario: Four eligible виклики yield three

- **WHEN** the conditions of «Закрий місяць», «Фінансова подушка», «Ціль — до наступних 25 %» and
  «Втримай ліміт» all hold
- **THEN** three виклики are offered, in the catalogue's fixed order, and the fourth is not

#### Scenario: The same data yields the same виклики

- **WHEN** the same stored state is evaluated twice
- **THEN** the same виклики are offered in the same order, with the same reasons and the same
  progress

### Requirement: Accepting, dismissing and hiding are the owner's, and refusing costs nothing

The owner SHALL be able to **accept** a proposed виклик, to **dismiss** it, and to bring a dismissed
one back. Dismissing SHALL be recorded so the same виклик with the same parameters is not proposed
again until the owner brings it back or its parameters change; it SHALL NOT be counted anywhere,
SHALL NOT reduce anything, and SHALL NOT be shown as a failure, a miss or a lost opportunity. There
SHALL be no penalty of any kind for dismissing a виклик or for leaving an accepted one unfinished.

#### Scenario: A dismissed виклик stops being proposed

- **WHEN** the owner dismisses «Інвестиційна звичка»
- **THEN** it is not proposed again, and nothing about the owner's record changes because of it

#### Scenario: A dismissal binds only its own parameters

- **WHEN** the owner dismisses «Закрий 2026-07» and 2026-08 later ends holding «Без категорії»
- **THEN** «Закрий 2026-08» is proposed

#### Scenario: An unfinished accepted виклик costs nothing

- **WHEN** an accepted виклик's progress does not move for three місяці
- **THEN** nothing is deducted, no досягнення is affected, and no notification of any kind is sent

### Requirement: Only the owner's decision is stored; the progress never is

The system SHALL store, per виклик, only what the owner decided about it and when: that it was
accepted or dismissed. A виклик's **progress** and whether it is **finished** SHALL be derived from
the транзакції, рахунки, цілі, ліміти, чернетки and норми each time they are shown, and SHALL NOT be
stored. No score, no count of completed виклики and no total of any kind SHALL be stored.

#### Scenario: Progress is recomputed, not remembered

- **WHEN** an accepted «Фінансова подушка» shows a progress of 30 % and the owner then records a
  переказ onto a банка
- **THEN** the progress shown next is computed from the new розрахунковий баланс, and no progress was
  read from storage

#### Scenario: Nothing counts completed виклики

- **WHEN** the owner finishes three виклики
- **THEN** no stored number of completed виклики, points or level exists

### Requirement: A виклик is finished by its criterion, and finishing it earns no badge of its own

A виклик SHALL be finished exactly when its stated criterion holds, whether or not it was accepted
and whatever the owner did to bring it about. Finishing a виклик SHALL NOT by itself earn a
досягнення: a досягнення is earned by the financial or bookkeeping fact, never by the act of
accepting a suggestion. A finished виклик SHALL stop being proposed and SHALL be readable as
finished where the owner can see it.

#### Scenario: The criterion decides, not the acceptance

- **WHEN** the owner never accepts «Закрий 2026-07» but categorises every «Без категорії» of 2026-07
  and settles its чернетки
- **THEN** the виклик is finished and no longer proposed

#### Scenario: Finishing earns only the underlying fact

- **WHEN** an accepted «Закрий 2026-07» is finished and 2026-07 thereby becomes a чистий місяць
- **THEN** «Чистий місяць» is earned for the місяць, and no досягнення is earned for having accepted
  or completed a виклик

### Requirement: The виклики of v1 are these five and no others

The catalogue SHALL hold exactly these виклики, in this order of priority:

1. **«Закрий <місяць>»** — offered when the most recent завершений активний місяць still holds a
   витрата «Без категорії», a дохід «Без джерела», or a чернетка dated inside it still waiting.
   Progress: how many of those items remain, of how many there were when it was proposed. Finished:
   none of the three remain for that місяць. Action: the place where those items are answered.
2. **«Фінансова подушка»** — offered when a currency's резерв is below one місячна норма витрат of
   that currency; when that currency has no confirmed норма, the виклик's first step SHALL be
   confirming it. Progress: резерв against the норма, in that one currency. Finished: резерв at or
   above one норма. Action: recording a переказ onto a рахунок of вид `savings`.
3. **«Ціль “<назва>” — до наступних 25 %»** — offered for the unreached ціль closest to its next
   quarter. Progress: that ціль's progress against the quarter, as `goals` computes progress.
   Finished: the quarter is reached. Action: the ціль.
4. **«Втримай ліміт “<категорія>”»** — offered for the категорія with a ліміт that most recently
   went over it. Progress: how many of three consecutive завершені місяці have passed without going
   over. Finished: three consecutive завершені місяці under the ліміт. Action: that категорія's
   місяць.
5. **«Інвестиційна звичка»** — offered when інвестовано was above zero in fewer than three of the
   last four завершені місяці. Progress: how many of those four hold an інвестиція. Finished: three
   of the last four do. Action: recording a переказ onto a рахунок of вид `investment`.

No виклик SHALL ask the owner to spend, to spend less in a way the app cannot measure, to open the
app, or to do anything the app cannot verify from the транзакції.

#### Scenario: Закрий місяць is offered ahead of the rest

- **WHEN** 2026-08 is завершений and holds two витрати «Без категорії», and the conditions of
  «Фінансова подушка» and «Інвестиційна звичка» also hold
- **THEN** «Закрий 2026-08» is offered first

#### Scenario: The подушка asks for the норма first

- **WHEN** «Фінансова подушка» is offered for UAH and no UAH місячна норма витрат is confirmed
- **THEN** its first step is confirming the норма, with the proposal and the місяці it came from

#### Scenario: The ліміт виклик counts завершені місяці only

- **WHEN** «Втримай ліміт “Продукти”» is accepted, the two завершені місяці since have both stayed
  under the ліміт and the current місяць is already over it
- **THEN** the progress is two of three and the виклик is neither finished nor failed

#### Scenario: The інвестиційна звичка reads the last four завершені місяці

- **WHEN** інвестовано was above zero in one of the last four завершені місяці
- **THEN** «Інвестиційна звичка» is offered with a progress of one of three

### Requirement: A device with no history is offered no виклик

WHEN no транзакція is stored, the system SHALL offer no виклик at all — «Перші кроки» is where a
device with nothing is told what to do, and a виклик SHALL NOT repeat it.

#### Scenario: A fresh install proposes nothing

- **WHEN** the app is opened on a device holding no транзакція
- **THEN** no виклик is proposed, and the progress screen states plainly that there is nothing yet
  rather than showing an empty list of виклики
