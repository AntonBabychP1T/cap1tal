## ADDED Requirements

### Requirement: A виклик states why it was proposed, how far it has come and when it is done

Every виклик the system offers SHALL carry four things: the **reason** it was proposed, in the
owner's own terms and from their own numbers; a **progress** that is a measurable number — either a
number against a target, or a count of what is still left to do; an **unambiguous criterion** for
being finished; and one **action** that begins it, leading to the screen where the work is actually
done. A виклик that cannot state all four SHALL NOT be offered.

A progress that counts what is left SHALL be computed from the stored data each time it is shown
and SHALL NOT be read against a total remembered from when the виклик was proposed — only the
owner's decision is ever stored.

A виклик SHALL never block, warn or scold, and SHALL never be worded as a failure.

#### Scenario: A proposed виклик carries all four

- **WHEN** the system proposes «Фінансова подушка» while the резерв in UAH is 900000 minor units and
  the UAH місячна норма витрат is 3000000 minor units
- **THEN** it states the reason from those two numbers, a progress of 900000 against 3000000 minor
  units UAH, the criterion «резерв щонайменше одна місячна норма витрат», and an action leading to
  recording a переказ onto a рахунок of вид `savings`

#### Scenario: Закрий місяць counts down from what is there now

- **WHEN** «Закрий 2026-08» is proposed while 2026-08 holds three витрати «Без категорії», and the
  owner categorises one of them
- **THEN** the progress reads two items remaining, computed from the stored транзакції, and no
  earlier total of three is stored or shown as a denominator

### Requirement: At most three виклики stand at a time, chosen deterministically

The system SHALL offer at most three виклики at any moment. Which ones SHALL be decided by a fixed
order of the catalogue, filtered to those whose conditions to be offered hold and which the owner
has not dismissed, and SHALL be a function of the stored data alone: two devices holding the same
data SHALL offer the same виклики in the same order.

Every виклик SHALL be decided from the same **зведення прогресу** the досягнення are decided from,
together with the цілі-накопичення and their progress, the ліміти, and the owner's stored decisions
— and from nothing else. No виклик SHALL cause the транзакції to be read one by one. No language model SHALL choose, rank, word or
score a виклик, and no виклик's progress or completion SHALL be computed by one.

#### Scenario: Four eligible виклики yield three

- **WHEN** the conditions of «Закрий місяць», «Фінансова подушка», «Ціль — до наступних 25 %» and
  «Втримай ліміт» all hold
- **THEN** three виклики are offered, in the catalogue's fixed order, and the fourth is not

#### Scenario: The same data yields the same виклики

- **WHEN** the same stored state is evaluated twice
- **THEN** the same виклики are offered in the same order, with the same reasons and the same
  progress

### Requirement: Accepting and dismissing are the owner's, and refusing costs nothing

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
   Progress: **how many such items remain**, counted from the stored data each time it is shown and
   never against a remembered total — nothing but the owner's decision is stored, so a denominator
   fixed at the moment it was proposed does not exist. Finished: none of the three remain for that
   місяць. Action: the place where those items are answered.
2. **«Фінансова подушка»** — offered for one currency: the currency whose резерв is below one
   місячна норма витрат of that currency, and, WHEN no currency has a confirmed норма, the currency
   holding the most завершені активні місяці — the one the owner's record knows best — with ties
   broken by the currency code, so the choice is the same on two devices holding the same data. When
   that currency has no confirmed норма, the виклик's first step SHALL be confirming it. Progress:
   резерв against the норма, in that one currency. Finished: резерв at or above one норма. Action:
   recording a переказ onto a рахунок of вид `savings`.
3. **«Ціль “<назва>” — до наступних 25 %»** — offered for the unreached ціль-накопичення closest to
   its next quarter, among those whose progress is exact. **Closest** SHALL mean the smallest
   remaining **share of that ціль's own target**, not the smallest сума — a ціль with a tenth of
   its target still to go is further from its quarter than one with a hundredth, however much
   smaller the tenth is in money. The ціль's identifier SHALL break a tie, so two devices holding
   the same data offer the same one. Progress: that ціль's progress against the
   quarter, as `goals` computes progress. Finished: the quarter is reached. Action: the ціль.
4. **«Втримай ліміт “<категорія>”»** — offered for the категорія with a ліміт that most recently
   went over it. The window is anchored in the data, never in the owner's acceptance: it is the
   завершені місяці **after the most recent місяць that went over**. Progress: how many of those —
   at most three — stayed under the ліміт. Finished: three consecutive завершені місяці under it.
   Action: that категорія's місяць.
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

- **WHEN** «Втримай ліміт “Продукти”» is offered, the two завершені місяці after the most recent
  місяць that went over the ліміт have both stayed under it, and the current місяць is already over
- **THEN** the progress is two of three and the виклик is neither finished nor failed

#### Scenario: The nearest ціль is the one nearest in share, not in сума

- **WHEN** one ціль-накопичення of 100 000 minor units stands at 10 % — 15 000 short of its first
  quarter — and another of 10 000 000 minor units stands at 24 %, 100 000 short of its first
  quarter, and both have an exact progress
- **THEN** «Ціль — до наступних 25 %» is offered for the **second**, which is one per cent from
  its quarter, and not for the first, whose сума is smaller but which still has fifteen per cent
  of its target to go

#### Scenario: The window is the data's, not the acceptance's

- **WHEN** «Втримай ліміт “Продукти”» has never been accepted and the two завершені місяці after
  the last місяць that went over stayed under the ліміт
- **THEN** the progress is two of three, exactly as it would be had the owner accepted it

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
