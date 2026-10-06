## Purpose

Where the owner meets a припущення and answers it with one tap — on the «Без категорії» витрати,
in «Без продавця», on a raw чернетка — and the «Локальна модель» section that holds the switch, the
model's state and an honest count of what was accepted.

## ADDED Requirements

### Requirement: A припущення is always shown as one

A припущення SHALL be shown as «Схоже на: …» beside the thing it is about, with a way to accept it
and «Ні». It SHALL NOT be shown as the thing's value. A витрата showing a категорія припущення
keeps its «Без категорії» mark and its line title. A raw чернетка showing a сума припущення keeps
reading as awaiting its сума. Only accepting SHALL make the guessed value the thing's own.

#### Scenario: The mark stays until it is accepted

- **WHEN** a витрата in «Без категорії» shows «Схоже на: Eating out»
- **THEN** its line still carries the «Без категорії» mark and no line shows Eating out as its
  категорія

### Requirement: A продавець припущення is offered in «Без продавця»

A «Без продавця» row whose group shows a продавець припущення SHALL show «Схоже на: <назва>» under
its опис. «Назвати» on that row SHALL open the naming form holding the guessed назва and написання
instead of the deterministic proposal, marked as the model's guess. When the guess is to add to an
existing продавець, the form SHALL open with «Додати до наявного» and that продавець already
chosen. «Ні» on the row SHALL remove the припущення. The row then stays with «Назвати» and its
deterministic proposal.

#### Scenario: The form arrives with the guess

- **WHEN** the row for "liqpay", whose latest опис is "LIQPAY*ZERNO KAVA KYIV", shows «Схоже на:
  Zerno Kava» with the написання "zerno kava", and the owner taps «Назвати»
- **THEN** the form holds the назва «Zerno Kava» and the написання "zerno kava", marked as the
  model's guess, and storing it names «Zerno Kava»

#### Scenario: A guess to add to an existing продавець

- **WHEN** the row for "atb market" shows «Схоже на: АТБ», an existing продавець, and the owner taps
  «Назвати»
- **THEN** the form opens with «Додати до наявного» and «АТБ» chosen, holding the написання "atb
  market"

#### Scenario: Refused, the row stays deterministic

- **WHEN** the owner refuses «Схоже на: Zerno Kava» on that row
- **THEN** the row shows no припущення and «Назвати» opens the form with the deterministic proposal

### Requirement: The «Локальна модель» section holds the switch, the state and the counts

The «Локальна модель» section SHALL offer the switch and say, before it is turned on:

- what the model reads: описи, суми, MCC, назви of категорії and продавці, and the text of the
  bank сповіщення a raw чернетка carries, on the phone;
- that it only proposes, writes nothing and sends nothing;
- that the model is the phone's own;
- what the phone's system component may report to its vendor, in words fixed when this change is
  built.

The section SHALL show the model's state in words. When the state is «телефон ще не має моделі»,
it SHALL offer fetching the model. While the switch is on, it SHALL show, per kind, how many
припущення were accepted with a tap, once each, and how many were refused before any acceptance,
since it was turned on. Turning the switch off
SHALL first say that every припущення, every «Ні» and these counts will be forgotten, and SHALL
forget them once confirmed.

#### Scenario: The switch says what it does before it is on

- **WHEN** the owner opens «Локальна модель» with the switch off
- **THEN** the section says what the model reads, that it only proposes, writes and sends nothing,
  and what the phone's system component may report, and shows the model's state in words

#### Scenario: An honest count

- **WHEN** since the switch was turned on, eleven категорія припущення were accepted, four were
  refused, and two продавець припущення were accepted
- **THEN** the section shows категорії 11 accepted and 4 refused, продавці 2 accepted and 0
  refused, and суми 0 and 0

#### Scenario: Turning off asks first

- **WHEN** the owner turns the switch off
- **THEN** the section says that every припущення, every «Ні» and the counts will be forgotten, and
  only after confirming is the switch off and they are forgotten
