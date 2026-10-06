## ADDED Requirements

### Requirement: Every виклик sentence names its місяць in its grammatical case

Every sentence a виклик shows — its name, its reason and its criterion — that names a місяць SHALL
name it as Ukrainian grammar asks at that place, never by pasting in the label the місяць carries as
a heading («Липень 2026»):

- after «у»/«в», where the sentence says what happened in the місяць, in the locative — «у липні
  2026»;
- after a preposition that asks for another case — «у», «в», «до», «з», «від», «після» — never in
  the heading's form, capitalised or not: «у Липень 2026», «у липень 2026» and «до Липень 2026» are
  all wrong;
- in the middle of a sentence, in lower case — «Закрий вересень 2026»;
- with a capital letter only where the місяць opens its sentence — «Вересень 2026 закрито», «У
  липні 2026 ліміт…».

This binds every виклик of the catalogue, not one template: a виклик added later SHALL follow it
without the rule being restated for it.

#### Scenario: The ліміт виклик names the місяць that went over in its case

- **WHEN** «Втримай ліміт “Продукти”» is offered and липень 2026 is the most recent завершений
  місяць whose витрати in «Продукти» went over its ліміт
- **THEN** its reason begins «У липні 2026 ліміт «Продукти» перевищено востаннє», and it does not
  contain «у Липень 2026»

#### Scenario: A місяць that opens its sentence keeps its capital

- **WHEN** «Закрий вересень 2026» is shown after nothing is left without an answer in вересень 2026
- **THEN** its reason begins «Вересень 2026 закрито»

#### Scenario: No виклик puts a heading's місяць inside a sentence

- **WHEN** every виклик of the catalogue that names a місяць is offered, «Закрий <місяць>» both with
  something left and with nothing left
- **THEN** none of their names, reasons or criteria carries a місяць in the heading's form after
  «у», «в», «до», «з», «від» or «після», and none carries a capitalised місяць anywhere but at
  the start of a sentence

## MODIFIED Requirements

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

- **WHEN** «Закрий серпень 2026» is proposed while серпень 2026 holds three витрати «Без
  категорії», and the owner categorises one of them
- **THEN** the progress reads two items remaining, computed from the stored транзакції, and no
  earlier total of three is stored or shown as a denominator

### Requirement: A виклик is finished by its criterion, and finishing it earns no badge of its own

A виклик SHALL be finished exactly when its stated criterion holds, whether or not it was accepted
and whatever the owner did to bring it about. Finishing a виклик SHALL NOT by itself earn a
досягнення: a досягнення is earned by the financial or bookkeeping fact, never by the act of
accepting a suggestion. A finished виклик SHALL stop being proposed and SHALL be readable as
finished where the owner can see it.

#### Scenario: The criterion decides, not the acceptance

- **WHEN** the owner never accepts «Закрий липень 2026» but categorises every «Без категорії» of
  липень 2026 and settles its чернетки
- **THEN** the виклик is finished and no longer proposed

#### Scenario: Finishing earns only the underlying fact

- **WHEN** an accepted «Закрий липень 2026» is finished and липень 2026 thereby becomes a чистий
  місяць
- **THEN** «Чистий місяць» is earned for the місяць, and no досягнення is earned for having accepted
  or completed a виклик
