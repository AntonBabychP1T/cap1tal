## Purpose

The engine that turns another bank app's push notification, read on the device, into the app's
truth: the watched-app mapping onto рахунки, total parsing of notification text into money
movements, чернетки транзакцій awaiting the owner's word, auto-confirmation за правилом,
fingerprint deduplication, and the discipline that keeps every сума in the рахунок's own
currency. Everything here is decided by inputs alone — the same captured notification, watch
set and правила always produce the same чернетки and транзакції — and nothing read ever
leaves the device.

## ADDED Requirements

### Requirement: A watch joins one app to one рахунок, and an unwatched app yields nothing

A watch SHALL join exactly one app package name to exactly one existing рахунок; a second
watch on an already-watched package SHALL be rejected while the first stands, and two watched
packages MAY map to the same рахунок. A captured notification from a package that is not
watched SHALL yield nothing at all — no parse, no чернетка, no remembered fingerprint.

#### Scenario: A watched app maps to its рахунок

- **WHEN** the owner watches the package "ua.privatbank.ap24" mapped to the рахунок "Приват"
- **THEN** the watch exists and captured notifications from that package are processed
  against "Приват"

#### Scenario: A second watch on the same package is rejected

- **WHEN** "ua.privatbank.ap24" is already watched and a watch mapping it to another рахунок
  is proposed
- **THEN** the new watch is rejected and the existing watch stands

#### Scenario: A watch on a рахунок that does not exist is rejected

- **WHEN** a watch is proposed for a рахунок id no рахунок carries
- **THEN** the watch is rejected and nothing is watched

#### Scenario: A watch takes its рахунок's currency

- **WHEN** the owner watches a package mapped to a рахунок held in UAH
- **THEN** the watch carries UAH — the one currency a сума ever attaches to its чернетки in

#### Scenario: An unwatched app's notification yields nothing

- **WHEN** a notification is captured from a package no watch names
- **THEN** no чернетка is created, no fingerprint is remembered, and the notification's text
  takes no part in anything

### Requirement: Parsing is total and yields a movement or unparsed

Parsing a captured notification SHALL choose the parser registered for its app package,
falling back to the generic parser when none is registered, and SHALL yield exactly one typed
outcome: a movement — a direction (money out or money in) and a сума in integer minor units
with its currency — or unparsed. The parse input SHALL be the notification's title and text
joined, title first, runs of whitespace collapsed — some banks put the payload in the title.
Parsing SHALL be total: hostile, alien or empty text SHALL yield unparsed, never a throw and
never a half-read movement. No parse SHALL produce a floating-point number, and an input
naming no readable amount SHALL yield unparsed.

The generic parser SHALL read the first amount the parse input names — digits with an
optional decimal part of one or two digits after "." or ",", with spaces allowed as thousands
separators — paired with a currency the app offers, recognised from its code or its common
marks (UAH, грн, ₴; USD, $; EUR, €). The movement SHALL be money in when the text carries a
money-in mark («зарахування», «поповнення», «повернення», «надходження»), and money out
otherwise — every movement is spending until something says it is not.

#### Scenario: A purchase notification parses to money out in minor units

- **WHEN** the generic parser reads the text "Оплата 250.00UAH. Сільпо. Баланс: 1234.56UAH"
- **THEN** the outcome is a movement of money out, сума 25000 minor units UAH

#### Scenario: A comma-decimal amount with thousands spaces parses exactly

- **WHEN** the generic parser reads the text "Покупка на суму 1 234,56 грн, APTEKA"
- **THEN** the outcome is a movement of money out, сума 123456 minor units UAH

#### Scenario: An amount with no decimal part parses as whole units

- **WHEN** the generic parser reads the text "Списання 250 грн"
- **THEN** the outcome is a movement of money out, сума 25000 minor units UAH

#### Scenario: A top-up notification is money in

- **WHEN** the generic parser reads the text "Поповнення на 500.00 грн"
- **THEN** the outcome is a movement of money in, сума 50000 minor units UAH

#### Scenario: The first amount wins, not the balance

- **WHEN** the generic parser reads a text naming an operation amount first and a balance
  amount after it
- **THEN** the movement's сума is the first amount, and the balance is not read as the сума

#### Scenario: The amount may live in the title

- **WHEN** the generic parser reads a notification titled "Оплата 99.00 грн" whose text reads
  "MEGOGO"
- **THEN** the outcome is a movement of money out, сума 9900 minor units UAH

#### Scenario: A registered parser takes precedence over the generic one

- **WHEN** a parser is registered for a package and a notification from that package is parsed
- **THEN** the registered parser's outcome is the outcome, and the generic parser is not
  consulted

#### Scenario: Hostile text is unparsed, not a crash

- **WHEN** the generic parser reads a text with no amount, or an arbitrary string of any
  content
- **THEN** the outcome is unparsed and nothing was thrown

### Requirement: A captured notification yields at most one чернетка, forever

The system SHALL fingerprint every processed captured notification by its app package, posted
moment, title and text, and SHALL keep the set of fingerprints already seen. A captured
notification whose fingerprint is in the set SHALL yield nothing; processing one SHALL add its
fingerprint. A fingerprint once in the set SHALL keep the notification out even after the
чернетка it created was confirmed or dismissed, and even after the транзакція it created was
deleted — Android re-posting the same notification never doubles money.

#### Scenario: The same notification does not draft twice

- **WHEN** the same captured notification arrives twice
- **THEN** exactly one чернетка results and the second arrival yields nothing

#### Scenario: A dismissed чернетка stays dismissed

- **WHEN** a чернетка was dismissed and its notification is captured again
- **THEN** no new чернетка results

#### Scenario: A deleted транзакція stays deleted

- **WHEN** a чернетка was confirmed, the транзакція it created was deleted, and the same
  notification is captured again
- **THEN** no new чернетка and no new транзакція results

### Requirement: A parsed movement proposes the default транзакція as a чернетка

A movement parsed from a watched app's notification SHALL become a чернетка on the watch's
рахунок, dated the calendar date of the notification's posted moment in the device's
timezone, carrying the parse input (the joined title and text) as its text. A money-out
movement SHALL propose a витрата of the сума; a money-in movement SHALL propose a дохід of
the сума with the reserved джерело «Без джерела» — a starting state, never a verdict. A
watched notification whose parse is unparsed SHALL become a raw чернетка carrying the text
and no сума, so a bank changing its format degrades to hand entry, never to silent loss. A
чернетка SHALL NOT be a транзакція: drafting one SHALL yield no транзакція, so no
розрахунковий баланс and no monthly number can read it — only the транзакція its
confirmation creates counts anywhere.

#### Scenario: Money out proposes a витрата

- **WHEN** a movement of money out, 25000 minor units UAH, parses from a notification posted
  on the device's August 26th on a watch mapped to a UAH рахунок
- **THEN** a чернетка proposing a витрата of 25000 minor units UAH dated 2026-08-26 exists on
  that рахунок

#### Scenario: Money in proposes a дохід «Без джерела»

- **WHEN** a movement of money in, 50000 minor units UAH, parses from a watched notification
- **THEN** the чернетка proposes a дохід of 50000 minor units UAH with the джерело
  «Без джерела»

#### Scenario: An unparsed watched notification is kept raw

- **WHEN** a watched app's notification yields unparsed
- **THEN** a raw чернетка carrying the notification's text and no сума exists on the watch's
  рахунок

#### Scenario: A чернетка moves no money

- **WHEN** a movement drafts a чернетка without auto-confirming
- **THEN** the outcome carries the чернетка and no транзакція — nothing exists for any
  розрахунковий баланс or monthly number to read

### Requirement: A сума attaches only in the рахунок's own currency

A чернетка's сума SHALL be in the currency of the watch's рахунок. A movement whose currency
differs from that рахунок's SHALL become a raw чернетка carrying the text, no сума, and the
parsed movement's сума as its original-currency reference — the notification named that
currency, and the transactions spec keeps a named original-currency amount as information.
The витрата is what the bank charged in the рахунок's currency, and the notification did not
state that; the owner supplies it on confirmation.

#### Scenario: A foreign-currency parse becomes a raw чернетка keeping the reference

- **WHEN** a movement of money out, 1000 minor units USD, parses from a watch mapped to a UAH
  рахунок
- **THEN** a raw чернетка exists carrying the text, no сума, and 1000 minor units USD as its
  original-currency reference

### Requirement: Confirmation creates the транзакція the чернетка proposed

Confirming a чернетка SHALL create exactly the транзакція it proposes on its рахунок, dated
the чернетка's date, carrying the чернетка's text as the транзакція's опис, and SHALL settle
the чернетка so it awaits nothing further. A витрата-чернетка SHALL be categorised by the
owner's правила applied at the moment of confirmation to the чернетка's text with no MCC, and
SHALL fall back to «Без категорії» when no правило matches. A дохід-чернетка SHALL create its
дохід with the джерело «Без джерела». A raw чернетка SHALL NOT confirm without a сума the
owner supplies; with one supplied it SHALL confirm as a витрата of that сума in the
рахунок's currency, categorised the same way, and a raw чернетка holding an original-currency
reference SHALL pass it to that витрата as its original-currency amount — kept as
information, exactly as the transactions spec requires of a source that names the currency.
Dismissing a чернетка SHALL create nothing and SHALL settle it the same way.

#### Scenario: Confirming an unmatched витрата lands in «Без категорії»

- **WHEN** a витрата-чернетка of 25000 minor units UAH with text "Оплата 250.00UAH. НОВИЙ
  ЗАКЛАД" is confirmed and no правило matches
- **THEN** a витрата of 25000 minor units UAH in «Без категорії» with опис carrying the
  чернетка's text exists, and the чернетка is settled

#### Scenario: A правило added after drafting is honoured at confirmation

- **WHEN** a витрата-чернетка with text containing "СІЛЬПО" exists, the owner then creates
  the правило "сільпо → Groceries", and the чернетка is confirmed
- **THEN** the витрата's категорія is Groceries

#### Scenario: Confirming a дохід-чернетка keeps «Без джерела»

- **WHEN** a дохід-чернетка of 50000 minor units UAH is confirmed
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» exists, retypeable
  by the owner as ever

#### Scenario: A raw чернетка needs the owner's сума

- **WHEN** a raw чернетка is confirmed without a сума
- **THEN** confirmation is rejected and the чернетка still awaits

#### Scenario: A raw чернетка confirms with the owner's сума

- **WHEN** a raw чернетка on a UAH рахунок is confirmed with a supplied сума of 30000 minor
  units
- **THEN** a витрата of 30000 minor units UAH with опис carrying the чернетка's text exists

#### Scenario: A foreign reference rides the confirmed витрата as information

- **WHEN** a raw чернетка on a UAH рахунок holding 1000 minor units USD as its
  original-currency reference is confirmed with a supplied сума of 42000 minor units
- **THEN** a витрата of 42000 minor units UAH exists carrying 1000 minor units USD as its
  original-currency amount, kept as information only

#### Scenario: Dismissal creates nothing

- **WHEN** a чернетка is dismissed
- **THEN** no транзакція exists for it, no balance changed, and the чернетка awaits nothing
  further

### Requirement: A правило auto-confirms a parsed витрата-чернетка

A newly drafted витрата-чернетка whose text is matched by one of the owner's правила at the
moment of drafting SHALL confirm itself immediately into a витрата of that правило's
category, with no owner action — FR-S3's "або автоматично за правилом". Matching SHALL run on
the чернетка's text with no MCC, so a правило whose only criterion is an MCC SHALL never
auto-confirm a чернетка. A дохід-чернетка and a raw чернетка SHALL never auto-confirm: the
one has no expense category to gain, the other has no сума to trust.

#### Scenario: A recognised merchant confirms itself

- **WHEN** the правило "сільпо → Groceries" exists and a movement of money out, 12550 minor
  units UAH, with text containing "СІЛЬПО" drafts on a watched UAH рахунок
- **THEN** a витрата of 12550 minor units UAH in Groceries exists at once and no чернетка
  awaits the owner

#### Scenario: An MCC-only правило does not auto-confirm

- **WHEN** the owner's only правило carries an MCC and no merchant pattern, and a money-out
  movement drafts
- **THEN** the чернетка awaits the owner, unconfirmed

#### Scenario: Money in never auto-confirms

- **WHEN** a movement of money in drafts while правила exist
- **THEN** the дохід-чернетка awaits the owner, unconfirmed

#### Scenario: A raw чернетка never auto-confirms

- **WHEN** a watched notification yields unparsed while правила exist
- **THEN** the raw чернетка awaits the owner, unconfirmed

### Requirement: Notifications never invent the owner's distinctions

A чернетка SHALL propose, and its confirmation SHALL create, only the default types — витрата
or дохід «Без джерела» — and the system SHALL NOT infer a переказ, інвестиція, повернення,
коригування, комісія or дохід «Відсотки» from notification text; the owner retypes the
created транзакція exactly as with every other imported source.

#### Scenario: An ATM withdrawal is a витрата until retyped

- **WHEN** a notification whose text reads "Зняття готівки 1000.00 грн" drafts and is
  confirmed
- **THEN** the result is a витрата of 100000 minor units UAH, not a переказ to a cash
  рахунок, until the owner retypes it

#### Scenario: A «повернення» notification is money in, never a повернення verdict

- **WHEN** a notification whose text carries «повернення» parses
- **THEN** the movement is money in, the чернетка proposes a дохід «Без джерела», and only
  the owner's retype makes it the повернення the glossary defines

### Requirement: Captured content stays on the device

Processing a captured notification SHALL involve no network operation, and the notification's
content SHALL appear in nothing the engine yields except the чернетка, the транзакція and the
fingerprint that dedups it. Outcomes SHALL derive only from the captured notification, the
watch set, the seen fingerprints and the правила.

#### Scenario: Processing is offline and deterministic

- **WHEN** the same captured notification is processed twice against the same watch set,
  fingerprints and правила
- **THEN** both runs decide the same outcome, and no run performed any network operation
