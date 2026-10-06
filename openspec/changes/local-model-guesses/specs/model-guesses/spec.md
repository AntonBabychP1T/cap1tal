## Purpose

What a припущення of the local model is: a checked proposal about one thing the owner still has to
answer — a категорія, a продавець or a сума — that decides nothing until the owner accepts it, and
that, once accepted, becomes the owner's own ordinary decision.

## ADDED Requirements

### Requirement: A припущення is one of three kinds, each about one thing

A припущення SHALL be exactly one of:

- a **категорія** for one витрата that carries «Без категорії» and carries an опис, an MCC or both;
- a **продавець** for one group that «Без продавця» shows: a назва with a написання, or a продавець
  that already exists with a написання to add to it;
- a **сума** for one raw чернетка that holds no original-currency reference and whose text carries
  no money-in word: neither the marks the generic parser reads («зарахування», «поповнення»,
  «повернення», «надходження») nor a word beginning, letter case folded, with «зарахов», «надійш»,
  «надход», «отрима», «поповн» or «поверн».

Nothing else SHALL be asked of the model. In particular, no припущення SHALL be made:

- for a повернення, because it returns to the категорія of what was bought, never to whatever its
  text resembles;
- for a дохід, a переказ or a коригування;
- for a витрата in any категорія other than «Без категорії»;
- for a витрата carrying neither an опис nor an MCC, since there is nothing to go on;
- for a parsed чернетка;
- for a raw чернетка holding an original-currency reference, because the сума the bank charged in
  the рахунок's currency is not in its text;
- for a raw чернетка whose text carries a money-in mark, because a raw чернетка confirms only as a
  витрата, and a guessed сума would put money that arrived into витрачено;
- for a «Без продавця» group beyond those the list shows.

No припущення SHALL ever propose a type, a джерело or a рахунок.

#### Scenario: A «Без категорії» витрата with an опис can be guessed

- **WHEN** a витрата carrying the опис "ЗЕРНО 12", which nothing matches, sits in «Без категорії»
- **THEN** it is a thing a категорія припущення can be made for

#### Scenario: A повернення is never guessed

- **WHEN** a повернення carrying the опис "ROZETKA повернення" sits in «Без категорії»
- **THEN** no припущення is made for it

#### Scenario: A витрата with nothing to go on is never guessed

- **WHEN** a витрата recorded by hand carries no опис and no MCC and sits in «Без категорії»
- **THEN** no припущення is made for it

#### Scenario: A foreign-currency raw чернетка is never guessed

- **WHEN** a raw чернетка on a UAH рахунок holds 1000 minor units USD as its original-currency
  reference
- **THEN** no припущення is made for it

#### Scenario: Money that arrived is never given a guessed сума

- **WHEN** raw чернетки on a UAH рахунок carry the texts "Зарахування 500,00 від ФОП Іваненко",
  "Зараховано 500,00" and "Надійшло 1 200,00 від Олени"
- **THEN** no припущення is made for any of them

### Requirement: The model is given a closed set of facts for each kind

For a категорія припущення the model SHALL be given only:

- the витрата's опис and MCC where it carries them;
- its сума with its currency;
- the вид of its рахунок;
- the weekday of its дата;
- the назви of the owner's unarchived expense категорії, «Без категорії», «Коригування» and
  «Комісія» left out;
- the similar витрати chosen as this capability defines, each as its опис and the назва of its
  категорія.

For a продавець припущення the model SHALL be given only up to five описи of the group, the latest
first, and the назви of the owner's продавці. For a сума припущення the model SHALL be given only
the чернетка's text, whole and as the bank wrote it, and the currency code of its рахунок.

From the app's own data, the model SHALL NOT be given the назва of a рахунок, a розрахунковий баланс
or баланс банку, a ліміт, a ціль, any other сума, the monobank token, an identifier, or the text of
any other сповіщення. Whatever a bank's own text says is given as the bank wrote it and is never
read by the app as one of these. The same thing and the same stored state SHALL always give the
same facts.

#### Scenario: A рахунок's назва is not among the facts

- **WHEN** the facts for a категорія припущення are built for a витрата on the рахунок «mono black»
- **THEN** they hold the вид `spending` and nowhere the назва «mono black»

#### Scenario: The reserved категорії are not offered

- **WHEN** the facts for a категорія припущення are built on a device holding Groceries, Eating
  out, an archived «Старе» and the three reserved категорії
- **THEN** the offered категорії are Groceries and Eating out only

#### Scenario: The same state gives the same facts

- **WHEN** the facts for the same витрата are built twice with nothing stored changed in between
- **THEN** both are identical

### Requirement: The similar витрати come from the owner's own history by a fixed order

The candidates for the similar витрати given with a категорія припущення SHALL be the most recent
stored витрата of each folded опис, among the витрати that carry an опис and a категорія other than
«Без категорії», «Коригування» and «Комісія». The candidates SHALL be ordered:

1. those whose опис is recognised as the same продавець as the витрата's;
2. then those carrying the same MCC;
3. then those sharing more words with its опис, a word being a run of letters of the folded опис;
4. then the most recent.

At most eight SHALL be given. A candidate sharing nothing with the витрата — no продавець, no MCC,
no word — SHALL NOT be given.

#### Scenario: The same продавець comes first

- **WHEN** the витрата carries "ZERNO 2", «Зерно» holds "zerno" and recognises a stored витрата
  "ZERNO 1" in COFFEE ☕, and another stored витрата carries the same MCC in Eating out
- **THEN** "ZERNO 1" with COFFEE ☕ is given first

#### Scenario: One per опис, eight at most

- **WHEN** twelve stored витрати carry the same MCC as the витрата, five of them with the опис
  "КАФЕ ЛЬВІВ" and seven with seven different описи
- **THEN** exactly eight are given, and "КАФЕ ЛЬВІВ" appears once, as its most recent витрата

#### Scenario: Nothing in common gives nothing

- **WHEN** no stored витрата shares a продавець, an MCC or a word with the витрата's опис
- **THEN** no similar витрата is given

### Requirement: Every answer is checked before it can be shown

An answer SHALL become a shown припущення only when it passes the check of its kind.

A **категорія** SHALL be one of the категорії offered for that very витрата, and still an
unarchived expense категорія at the moment it is shown. An answer of «не знаю», or anything not
offered, SHALL show nothing.

A **продавець** SHALL pass all of these:

- its назва is not blank, holds at most forty characters, and either occurs in the latest опис of
  the group or is the назва of a продавець that exists, letter case folded in both comparisons;
- its написання occurs in that опис with letter case folded, holds at least three letters, is not
  one of the bank's service words, and is held by no other продавець.

An answer whose назва is that of an existing продавець SHALL become a припущення to add the
написання to that продавець. A продавець припущення SHALL pass this check again whenever it would
be offered, against the group's latest опис and the продавці stored at that moment, and SHALL NOT
be offered once it fails.

A **сума** SHALL be quoted from the text and read by the app the way the generic parser reads an
amount. The amount read SHALL be greater than zero and SHALL be one of the text's **candidate
amounts**: the amounts the text holds, read the same way, except:

- an amount right after «*» or after masking characters, which is part of a card number;
- an amount that is part of a date or a time, such as «26.08», «26.08.2026» or «14:32»;
- an amount among the three words after «залишок», «баланс», «доступно» or «ліміт», which is what
  is left, never what moved.

The text SHALL name no currency other than the рахунок's, whether by an ISO-4217 code standing as a
word of its own, in any letter case, or by a currency sign. The сума shown is the amount the app read, in the рахунок's
currency, never a number the model computed.

An answer that fails its check SHALL be dropped, SHALL show nothing and SHALL be counted as dropped.
The thing it was about SHALL stay exactly as it was.

#### Scenario: An offered категорія passes

- **WHEN** Eating out was offered for a витрата and the model answers Eating out
- **THEN** «Схоже на: Eating out» is shown for that витрата

#### Scenario: «Не знаю» shows nothing

- **WHEN** the model answers «не знаю» for a витрата
- **THEN** no припущення is shown for it and it still carries «Без категорії»

#### Scenario: A категорія not offered is dropped

- **WHEN** the model answers «Коригування», or a назва no offered категорія carries
- **THEN** nothing is shown and the answer is counted as dropped

#### Scenario: A категорія archived before it is shown is not shown

- **WHEN** the model answered Eating out for a витрата and Eating out is archived before the
  припущення is shown
- **THEN** no припущення is shown for that витрата

#### Scenario: A написання outside the опис is dropped

- **WHEN** the latest опис of a group is "ATB MARKET 23" and the model answers the назва «ATB» with
  the написання "атб"
- **THEN** nothing is shown — "атб" does not occur in "ATB MARKET 23"

#### Scenario: A назва of the model's own invention is dropped

- **WHEN** the latest опис of a group is "LIQPAY*ZERNO KAVA KYIV", no продавець «Найкраща кава»
  exists, and the model answers that назва with the написання "zerno kava"
- **THEN** nothing is shown — the назва neither occurs in the опис nor names a продавець

#### Scenario: A назва taken from the опис passes

- **WHEN** the latest опис of a group is "LIQPAY*ZERNO KAVA KYIV" and the model answers the назва
  «Zerno Kava» with the написання "zerno kava"
- **THEN** «Схоже на: Zerno Kava» is shown for that group

#### Scenario: A продавець that exists becomes an addition

- **WHEN** «АТБ» exists and the model answers the назва «атб» with the написання "atb market" for
  the group whose latest опис is "ATB MARKET 23"
- **THEN** the припущення is to add "atb market" to «АТБ»

#### Scenario: A сума stated in the text passes

- **WHEN** a raw чернетка on a UAH рахунок carries the text "Списано 250,00 з картки *1234.
  Залишок 1 000,00" and the model quotes "250,00"
- **THEN** «Схоже на: 250,00 ₴» is shown, read by the app as 25000 minor units UAH

#### Scenario: A card number is not a сума

- **WHEN** the model quotes "1234" for that чернетка
- **THEN** nothing is shown — "1234" follows «*»

#### Scenario: What is left is not a сума

- **WHEN** the model quotes "1 000,00" for that чернетка
- **THEN** nothing is shown — it follows «Залишок»

#### Scenario: A date is not a сума

- **WHEN** a raw чернетка carries the text "26.08 14:32 Списано 99,00" and the model quotes "26.08"
- **THEN** nothing is shown

#### Scenario: A сума the text does not state is dropped

- **WHEN** the model quotes "750,00" for the чернетка "Списано 250,00 з картки *1234. Залишок
  1 000,00"
- **THEN** nothing is shown and the answer is counted as dropped

#### Scenario: A text naming another currency gives no сума

- **WHEN** a raw чернетка on a UAH рахунок, holding no original-currency reference, carries the
  text "Оплата 48,00 PLN Biedronka" and the model quotes "48,00"
- **THEN** nothing is shown — the text names PLN, and the сума in hryvnia is not in it

### Requirement: Accepting a припущення is the owner's own act

Accepting a припущення SHALL do exactly what the owner would have done by hand, and nothing more:

- accepting a **категорія** SHALL put the витрата into it, exactly as picking that категорія does.
  The правило offer SHALL follow as the categorisation-rules capability defines, naming the
  продавець where the опис is recognised, so the next such витрата never reaches the model;
- accepting a **продавець** SHALL open the naming form holding the guessed назва and написання, or
  the guessed продавець to add to. Only storing that form, validated as any naming, SHALL store
  anything;
- accepting a **сума** SHALL put it into the сума field of the чернетка. Only confirming the
  чернетка SHALL create the витрата, exactly as with a сума the owner typed.

A припущення once accepted SHALL be counted as accepted once. It SHALL NOT be asked about again
while its thing is unchanged. Where its thing is still unanswered, because the form was left or the
чернетка not yet confirmed, it SHALL stay offered. «Ні» on such an offer SHALL withdraw it without
counting a refusal: refused counts only припущення refused before any acceptance.

#### Scenario: An accepted категорія becomes a правило offer

- **WHEN** «Зерно» holds "зерно", no правило names it, and the owner accepts «Схоже на: COFFEE ☕»
  on a витрата carrying "ЗЕРНО 12"
- **THEN** the витрата carries COFFEE ☕ and the правило offer names «продавець Зерно» and COFFEE ☕

#### Scenario: An accepted продавець stores nothing until the form does

- **WHEN** the owner accepts «Схоже на: Zerno Kava» on a «Без продавця» row and then leaves the form
  without storing it
- **THEN** no продавець is stored

#### Scenario: An abandoned acceptance is offered again and counted once

- **WHEN** the owner accepts «Схоже на: Zerno Kava», leaves the form without storing it, and the app
  is opened again
- **THEN** the row still offers «Схоже на: Zerno Kava», the model is not asked about it again, and
  the продавці count of accepted припущення went up by one, not two

#### Scenario: An accepted сума still needs the confirmation

- **WHEN** the owner accepts «Схоже на: 250,00 ₴» on a raw чернетка
- **THEN** the чернетка's сума field holds 250,00 ₴, the чернетка still awaits as a raw one, and no
  витрата exists until it is confirmed

### Requirement: «Ні» forgets a припущення for that thing

Refusing a припущення with «Ні» SHALL remove it. The model SHALL NOT be asked again about the same
thing while the thing itself is unchanged:

- for a витрата, its опис, MCC, сума and currency;
- for a «Без продавця» group, its key and its latest опис;
- for a raw чернетка, its text.

A change of the model, of the way it is asked, or of the owner's other транзакції SHALL NOT bring a
refused thing back. A thing that itself changed, such as an опис the owner corrected, SHALL be a new
question. «Ні» SHALL change nothing about the thing itself.

#### Scenario: Refused stays refused

- **WHEN** the owner refuses «Схоже на: Eating out» on a витрата, the phone updates its model, a
  new categorised витрата is stored, and the app is opened again
- **THEN** no припущення is shown for that витрата, the model is not asked about it, and it still
  carries «Без категорії»

#### Scenario: A corrected опис is a new question

- **WHEN** the owner refused a припущення on a витрата and then changed its опис
- **THEN** that витрата may be asked about again

### Requirement: A припущення decides nothing on its own

A припущення SHALL NOT be a tier of автокатегоризація:

- no розбір, import, auto-confirmation of a чернетка, or категорія offered by the entry form SHALL
  read it;
- a витрата with a shown припущення SHALL still carry «Без категорії» everywhere, count wherever
  «Без категорії» is counted, and count toward every number exactly as it did before;
- a raw чернетка with a shown сума припущення SHALL still be a raw чернетка, moving no money until
  confirmed.

#### Scenario: «Потребує уваги» still counts it

- **WHEN** seven витрати carry «Без категорії» and four of them show a категорія припущення
- **THEN** «Потребує уваги» names seven, and «Транзакції» narrowed to «Без категорії» shows all
  seven

#### Scenario: A розбір ignores припущення

- **WHEN** a витрата shows «Схоже на: Groceries» and a правило that does not match it is stored
- **THEN** the розбір leaves that витрата in «Без категорії»

#### Scenario: A guessed сума moves no money

- **WHEN** a raw чернетка on a UAH рахунок shows «Схоже на: 250,00 ₴»
- **THEN** the рахунок's розрахунковий баланс and the month's витрачено are what they were before

### Requirement: A припущення goes away once its thing is answered

A припущення SHALL disappear, and SHALL NOT be shown again, when the thing it was about is answered
another way or no longer exists. That covers:

- the витрата given a категорія in any way, by the owner, a правило or a розбір;
- the group named, or its описи recognised;
- the чернетка confirmed or dismissed;
- the thing itself changed, as «Ні» defines it;
- the thing deleted.

#### Scenario: A правило answers first

- **WHEN** a витрата shows «Схоже на: COFFEE ☕» and the owner stores a правило whose розбір moves it
  onto COFFEE ☕
- **THEN** no припущення is shown for it any more

#### Scenario: A partly named group drops the old guess

- **WHEN** the row for "liqpay" offered «Zerno Kava» with the написання "zerno kava", the owner
  stored «Zerno Kava» from it, and the group still holds "LIQPAY*ROZETKA KYIV" as its latest опис
- **THEN** the row no longer offers «Zerno Kava» — "zerno kava" is now held by a продавець and no
  longer occurs in the latest опис — and the group may be asked about anew

#### Scenario: Naming a group by hand removes its припущення

- **WHEN** the row for "liqpay" shows «Схоже на: Zerno Kava» and the owner names «Zerno» by hand
  with a написання that recognises the group's описи
- **THEN** the row is gone and no припущення about the group remains

#### Scenario: A confirmed чернетка takes its сума припущення along

- **WHEN** a raw чернетка showing «Схоже на: 250,00 ₴» is confirmed with a сума the owner typed
- **THEN** no припущення about it remains

#### Scenario: A dismissed чернетка takes its сума припущення along

- **WHEN** a raw чернетка showing «Схоже на: 250,00 ₴» is dismissed
- **THEN** no припущення about it remains
