## MODIFIED Requirements

### Requirement: What a пакет для аналізу never carries

A пакет для аналізу SHALL NOT carry: any identifier of a рахунок, транзакція, категорія, джерело,
правило, ліміт or ціль; the назва of any рахунок; the monobank token or any key, cursor or
identifier of the monobank connection; any баланс банку; the stored payload of any captured bank
notification, any pending чернетка with its text, or any fingerprint; any відстежуваний
застосунок; the бекап or its envelope; any device or installation identifier; any **досягнення**,
its **свідчення**, any decision about a **виклик**, or any **місячна норма витрат**. An опис that a
confirmed чернетка left on its транзакція is an опис like any other — the bank's text, as an
imported monobank опис is — and leaves only under the «Продавці» choice, never by default.
Whether описи and individual транзакції are carried SHALL be decided by the owner's explicit
choice for that run, off by default and never remembered between runs.

#### Scenario: Nothing secret and nothing overheard reaches the пакет

- **WHEN** a пакет is built on a device holding a monobank token, a linked рахунок with a баланс
  банку, two pending чернетки with their notification text and a відстежуваний застосунок
- **THEN** the пакет, serialised, contains none of the token, the баланс банку, the pending
  чернетки or their text, or the застосунок, and none of the stored identifiers

#### Scenario: A confirmed чернетка's опис is an опис

- **WHEN** a чернетка with the text «Оплата ATB 350.00 UAH» was confirmed into a витрата carrying
  that text as its опис, and a пакет is built with «Продавці» off and then with «Продавці» on
- **THEN** the first пакет contains no part of that text, and the second carries it only as the
  опис of that витрата and in the merchants list

#### Scenario: Account names stay on the phone

- **WHEN** the stored рахунки are «mono black», «Готівка» and «Військові облігації»
- **THEN** the serialised пакет contains none of those назви, and counts three рахунки by вид

#### Scenario: Описи are absent unless chosen

- **WHEN** the owner has not chosen to include описи
- **THEN** no опис of any транзакція appears in the пакет, and no merchant list appears

#### Scenario: The прогрес state stays on the phone

- **WHEN** a пакет is built on a device holding twenty earned досягнення, two accepted виклики and
  a confirmed UAH норма
- **THEN** the serialised пакет holds none of them, in no form and under no name
