## MODIFIED Requirements

### Requirement: The виклики of v1 are these five and no others

The catalogue SHALL hold exactly these виклики, in this order of priority:

1. **«Закрий <місяць>»** — offered when the most recent завершений активний місяць still holds a
   витрата or a повернення «Без категорії», a дохід «Без джерела», or a чернетка dated inside it
   still waiting.
   Progress: **how many such items remain**, counted from the stored data each time it is shown and
   never against a remembered total — nothing but the owner's decision is stored, so a denominator
   fixed at the moment it was proposed does not exist. Finished: none of the three remain for that
   місяць. Action: the place where those items are answered. Its name and sentences SHALL carry the
   місяць as Ukrainian grammar asks — «Закрий вересень 2026», «У вересні 2026 ще 9 записів…» —
   never the nominative label of a heading inside a sentence.
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

Each **action** SHALL open the work its виклик names, already shaped: «recording a переказ onto a
рахунок of вид `savings`» SHALL open the entry form as a **переказ** with a рахунок of that вид
already chosen where one exists, and «the place where those items are answered» SHALL open the
queue «Що потребує відповіді» already narrowed to the місяць in question, where every витрата or
повернення «Без категорії», every дохід «Без джерела» and every чернетка dated in it is answered in
place; once nothing is left in that місяць, it SHALL open «Транзакції» narrowed to it. An action
that merely opens a screen on its own defaults is not
the work the criterion measures.

No виклик SHALL ask the owner to spend, to spend less in a way the app cannot measure, to open the
app, or to do anything the app cannot verify from the транзакції.

#### Scenario: Закрий місяць is offered ahead of the rest

- **WHEN** 2026-08 is завершений and holds two витрати «Без категорії», and the conditions of
  «Фінансова подушка» and «Інвестиційна звичка» also hold
- **THEN** «Закрий серпень 2026» is offered first

#### Scenario: The month is named in its case

- **WHEN** «Закрий <місяць>» is offered for вересень 2026 with nine доходи «Без джерела» left
- **THEN** it is named «Закрий вересень 2026» and its reason begins «У вересні 2026 ще 9 записів»

#### Scenario: Only доходи left opens them

- **WHEN** its action is begun while вересень 2026 holds no витрата «Без категорії» and nine доходи
  «Без джерела»
- **THEN** the queue opens narrowed to вересень 2026, holding «Без джерела» with those nine

#### Scenario: Nothing left opens the month's транзакції

- **WHEN** its action is begun after вересень 2026 holds nothing «Без категорії» or «Без джерела»
  and no чернетка
- **THEN** «Транзакції» opens narrowed to вересень 2026

#### Scenario: Only чернетки left opens them in the queue

- **WHEN** its action is begun while вересень 2026 holds nothing «Без категорії» or «Без джерела»
  and one чернетка dated 2026-09-28 of 25000 minor units UAH still waits
- **THEN** the queue opens narrowed to вересень 2026, holding «Чернетки» with that one

#### Scenario: The action opens the переказ, not a витрата form

- **WHEN** «Фінансова подушка»'s action is begun on a device holding a рахунок of вид `savings`
- **THEN** the entry form opens as a переказ with that рахунок as the destination, and not as a
  витрата

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
