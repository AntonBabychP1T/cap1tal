## MODIFIED Requirements

### Requirement: Описи and individual транзакції are separate opt-ins

When the owner chooses to include описи, the пакет SHALL carry, per currency, the largest
merchants of the period — a merchant being the продавець the опис of a витрата is recognised as,
named by its назва, or, where the опис is recognised as none, that опис folded; built from витрати
only: a повернення, a дохід, a коригування or a переказ forms no merchant and reduces none —
with their сума, count and категорії, and the recurring merchant candidates that recur in most
months. A продавець that holds витрати in several currencies SHALL appear once in each currency's
list, with that currency's сума only, never summed across currencies. When the owner
chooses to include individual транзакції, the пакет SHALL carry every транзакція of the period
with its дата, type, категорія or джерело, and сума, a переказ with both legs and the вид of each
end, and its опис only when описи are also included. A транзакція SHALL carry no identifier and
no рахунок назва in either case.

The назва of a продавець and its написання are words derived from описи. Neither SHALL appear in a
пакет built without описи, and a написання SHALL appear in none: the пакет names a merchant by its
назва and never says how the app recognised it.

#### Scenario: Merchants when chosen

- **WHEN** описи are included, no продавець recognises «СІЛЬПО», and August holds three витрати
  with the опис «СІЛЬПО» totalling 240000 minor units UAH in «Продукти»
- **THEN** the пакет's UAH merchants list «сільпо» with `2400.00 UAH`, 3 транзакції and «Продукти»

#### Scenario: Every spelling of one продавець is one merchant

- **WHEN** описи are included, «АТБ» holds "атб" and "atb", and August holds витрати carrying
  "Оплата послуг АТБ-Маркет 1234" for 100000, "ATB MARKET" for 50000 and "АТБ 12" for 30000 minor
  units UAH, all in «Продукти»
- **THEN** the пакет's UAH merchants list «АТБ» once with `1800.00 UAH` and 3 транзакції, and no
  row for any of the three описи

#### Scenario: A продавець in two currencies is two rows, never one sum

- **WHEN** описи are included, «Booking» holds "booking", and August holds a витрата of 300000 minor
  units UAH and one of 12000 minor units EUR carrying "BOOKING.COM"
- **THEN** «Booking» appears in the UAH merchants with `3000.00 UAH` and in the EUR merchants with
  `120.00 EUR`, and nowhere with a total of both

#### Scenario: A recurring продавець is one candidate whatever the spelling

- **WHEN** описи are included, «Netflix» holds "netflix", and each of six months holds one витрата
  of about 29900 minor units UAH, carrying "NETFLIX.COM" in three months and "Netflix
  International" in the other three
- **THEN** the recurring merchant candidates list «Netflix» once, recurring in 6 of 6 months

#### Scenario: A назва stays home when описи are off

- **WHEN** «АТБ» recognises August's витрати and the пакет is built without описи
- **THEN** the serialised пакет contains neither «АТБ» nor any of its написання

#### Scenario: Transactions without описи

- **WHEN** individual транзакції are included and описи are not
- **THEN** every транзакція of the period appears with its дата, type, категорія or джерело and
  сума, and none carries an опис or an identifier

#### Scenario: A переказ names its ends by вид, not by назва

- **WHEN** individual транзакції are included and August holds a переказ from a картка to a
  банка of 50000 minor units UAH
- **THEN** it appears as a переказ from a `spending` рахунок to a `savings` рахунок with both
  legs `500.00 UAH` and no рахунок назва

### Requirement: A пакет для аналізу is built deterministically from stored truth alone

The system SHALL build a пакет для аналізу from the stored рахунки, транзакції, категорії, ліміти,
цілі and продавці for a chosen kind of AI-аналіз, a chosen period of whole calendar months and the owner's
detail choices, and from nothing else. Building it SHALL read no clock: the day the пакет is
built for is an input. The same stored state, the same choices and the same day SHALL produce a
пакет equal in every value, whatever the order the stored rows were read in. The пакет SHALL
name its own schema and version, its kind, the period it covers and the day it was built for.
Building a пакет SHALL create, change or delete no транзакція, рахунок, категорія, ліміт, ціль or
продавець and SHALL store nothing.

#### Scenario: The same state builds the same пакет

- **WHEN** a пакет для аналізу of kind monthly-picture is built twice for 2026-06 through 2026-08 on
  2026-09-01 from the same stored state, with the транзакції handed over in a different order
  the second time
- **THEN** the two пакети are equal in every value, and each names its schema, version 1, kind
  monthly-picture, the period 2026-06 through 2026-08 and the day 2026-09-01

#### Scenario: Building leaves the stored state untouched

- **WHEN** a пакет для аналізу is built
- **THEN** every рахунок, транзакція, категорія, ліміт and ціль is exactly what it was, and
  nothing about the пакет or the run is stored

#### Scenario: The period is whole calendar months

- **WHEN** the owner asks for the last three months on 2026-09-01
- **THEN** the period is 2026-07 through 2026-09, the month 2026-09 is marked as partial with
  1 of 30 days elapsed, and 2026-07 and 2026-08 are not marked partial

### Requirement: What a пакет для аналізу never carries

A пакет для аналізу SHALL NOT carry: any identifier of a рахунок, транзакція, категорія, джерело,
правило, ліміт, ціль or продавець; the назва of any рахунок; the monobank token or any key, cursor or
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
