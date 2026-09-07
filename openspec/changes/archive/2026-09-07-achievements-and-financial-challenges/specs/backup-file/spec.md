## ADDED Requirements

### Requirement: A бекап carries the earned досягнення, the decisions about виклики and the норми

A бекап SHALL carry every earned досягнення with its key, template, дата досягнення, the moment it
was recorded, whether it was seen and its свідчення; every decision the owner made about a виклик
with its key, the decision and its moment; and every місячна норма витрат with its сума, currency
code and the moment it was confirmed. Restoring SHALL make them exactly the бекап's, replacing what
the device held, as a відновлення replaces everything else.

They are carried because they are the owner's own state and cannot be recomputed: a дата досягнення
read from the history, the moment a досягнення was recorded, whether the owner has seen it, a
dismissal and a confirmed норма exist nowhere in the транзакції.

No досягнення, виклик or норма SHALL be carried in a way that lets a restored device read one as
money: the свідчення is restored as the value it was and is never counted into a баланс, a місячна
картина, a ліміт or a ціль.

#### Scenario: The three survive the round trip

- **WHEN** a бекап made on a device holding twelve earned досягнення — one dated from the history and
  one dated the day it was recorded, one seen and one not — two dismissed виклики, one accepted
  виклик and a confirmed UAH норма, is restored onto storage holding nothing
- **THEN** all twelve досягнення are back with their keys, дати, moments, seen states and свідчення,
  all three decisions are back with their moments, and the UAH норма is back with its сума and
  currency

#### Scenario: A відновлення replaces the earned set

- **WHEN** a бекап holding four earned досягнення is restored onto a device holding twenty
- **THEN** the device holds exactly those four afterwards, and the evaluation that follows the
  відновлення earns whatever the restored history still proves

#### Scenario: A restored свідчення is not money

- **WHEN** a бекап holding a досягнення whose свідчення is 4000000 minor units UAH is restored
- **THEN** every розрахунковий баланс and every number of the місячна картина is computed from the
  restored транзакції alone, and none of them changed because of the свідчення
