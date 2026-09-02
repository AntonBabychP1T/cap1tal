## Purpose

The engine that turns the QR code printed on a фіскальний чек into the composition of a purchase
beneath the транзакція that paid for it: reading the реквізити чека out of the QR, looking the
чек up at the tax service, deterministically parsing the fiscal document into a фіскальний чек
with its позиції чека, and deciding whether it may be прикріплений to a транзакція. A фіскальний
чек moves no money and changes no number the app computes.

## ADDED Requirements

### Requirement: A фіскальний чек is detail beneath a транзакція, never money

A фіскальний чек SHALL be attachable to at most one транзакція, and a транзакція SHALL carry at
most one фіскальний чек. A фіскальний чек and its позиції чека SHALL NOT be транзакції: they SHALL
NOT change any розрахунковий баланс, any number of the місячна картина, any ліміт, ціль or звіт,
and SHALL NOT create, split, retype or delete any транзакція. A фіскальний чек MAY be attached to a
транзакція of any category and of type витрата or повернення; nothing in the engine SHALL forbid a
category.

#### Scenario: Attaching a чек changes no number

- **WHEN** a фіскальний чек with a total of 74230 minor units UAH and nine позиції is attached to a
  витрата of 74230 minor units UAH in «Продукти»
- **THEN** the рахунок's розрахунковий баланс, the month's витрачено and the category's spent are
  exactly what they were before the чек was attached

#### Scenario: Позиції never become транзакції

- **WHEN** a фіскальний чек holding позиції «Молоко», «Хліб» and «Чіпси» is attached
- **THEN** exactly one транзакція exists for the purchase, the позиції exist only beneath the
  фіскальний чек, and no позиція carries a категорія

#### Scenario: A second чек on the same транзакція is refused

- **WHEN** a транзакція already carries a фіскальний чек and another фіскальний чек is offered for
  it
- **THEN** attaching is refused with the typed reason that the транзакція already has a чек, and
  the attached чек is unchanged

#### Scenario: A чек is not limited to «Продукти»

- **WHEN** a фіскальний чек is attached to a витрата in category «Побут»
- **THEN** it attaches exactly as it would to a витрата in «Продукти»

### Requirement: The реквізити чека are read from the QR code deterministically

The system SHALL read the реквізити чека from the text of a QR code: the фіскальний номер чека,
the фіскальний номер реєстратора, the calendar date, the time of day to the minute and, when
present, the seconds, and the сума of the чек as integer minor units UAH. The reading SHALL be
total and deterministic: the same text always yields the same реквізити or the same typed reason.
The text SHALL be recognised as a чек QR only when it is a link to the tax service's receipt check
page, whatever the order of its parameters, whether the time is given to the minute or to the
second, and whether or not it carries a message authentication code. A text that is not such a
link SHALL yield the typed reason that this is not a чек QR; a link lacking any реквізит the lookup
needs SHALL yield the typed reason naming what is missing. The сума SHALL be read as a decimal
with a dot into minor units without any floating-point arithmetic.

#### Scenario: A ПРРО QR with seconds and a MAC is read

- **WHEN** the QR text is
  `https://cabinet.tax.gov.ua/cashregs/check?mac=ABCD&date=20260429&time=222006&id=696582&sm=437.40&fn=4000146829`
- **THEN** the реквізити are фіскальний номер чека "696582", реєстратор "4000146829", date
  2026-04-29, time 22:20:06 and сума 43740 minor units UAH

#### Scenario: A QR with the time to the minute and another parameter order is read

- **WHEN** the QR text is
  `https://cabinet.tax.gov.ua/cashregs/check?fn=3000898168&id=45&date=20220904&time=1130&sm=780.00`
- **THEN** the реквізити are the same as for any ordering: чек "45", реєстратор "3000898168",
  2022-09-04, 11:30 with no seconds, 78000 minor units UAH

#### Scenario: A QR that is not a чек is refused

- **WHEN** the QR text is `https://example.com/promo` or `WIFI:S:home;P:secret;;`
- **THEN** the reading yields the typed reason that this is not a чек QR, and nothing else

#### Scenario: A чек QR without the сума or the time is incomplete

- **WHEN** the QR text is `https://cabinet.tax.gov.ua/cashregs/check?id=133104756&fn=4000096193&date=20211212`
- **THEN** the reading yields the typed reason that the реквізити are incomplete and names the
  time and the сума as missing

#### Scenario: A сума is read without floating point

- **WHEN** the QR carries `sm=99.99` and, in another QR, `sm=780`
- **THEN** the сума is 9999 and 78000 minor units UAH respectively

### Requirement: A lookup answers with exactly one typed outcome and never throws

Looking a чек up by its реквізити SHALL yield exactly one of: found, carrying the fiscal document;
not-found (the tax service knows no such чек for these реквізити); request-rejected (the tax
service refused the request as malformed — the contract the app relies on has changed);
unavailable (offline, timeout, or any other failure); or unreadable (an answer that is not the
shape the app expects, or a document it cannot decode). No lookup SHALL throw. The outcome SHALL
say nothing about how the tax service was reached, and the app SHALL depend on no particular
address in the engine. Retrying a lookup SHALL be safe: a lookup stores nothing.

#### Scenario: A known чек is found

- **WHEN** the реквізити of a registered чек are looked up and the tax service answers with the
  document
- **THEN** the outcome is found and carries the decoded fiscal document

#### Scenario: An unknown чек is not-found

- **WHEN** the tax service answers that no such чек exists for the реквізити
- **THEN** the outcome is not-found, nothing is stored, and the same lookup can be tried again
  later

#### Scenario: A malformed answer from the tax service is unreadable

- **WHEN** the tax service answers success but the answer carries no fiscal document, or the
  document cannot be decoded
- **THEN** the outcome is unreadable and nothing was thrown

#### Scenario: A refused request is request-rejected

- **WHEN** the tax service refuses the request as one it cannot process
- **THEN** the outcome is request-rejected, distinct from not-found and from unavailable

#### Scenario: Being offline is unavailable

- **WHEN** the request cannot be sent at all
- **THEN** the outcome is unavailable and nothing was thrown

### Requirement: A fiscal document is parsed deterministically into a чек and its позиції

The system SHALL parse a fiscal document into a фіскальний чек and its позиції чека without any
network, device or model taking part: the same document always yields the same чек. Both
document dialects the tax service serves SHALL be read — the ПРРО check document and the classic
РРО data packet — and the dialect SHALL be recorded on the чек. A чек SHALL hold: its фіскальний
номер чека and фіскальний номер реєстратора, the date and time it was issued, its total as integer
minor units UAH, the seller's name and point of sale when the document names them, the document
kind (sale or return), and the whole decoded document as an immutable source snapshot. A позиція
SHALL hold: its line number, the raw product name exactly as printed, the quantity as integer
thousandths with its unit name when named, the unit price and the line total as integer minor
units UAH when the document names them, the line discount when named, and the barcode and the
УКТЗЕД code when the document carries them. A discount the document states for the whole чек
rather than for one позиція SHALL NOT be kept: the total already reflects it. Nothing absent from
the document SHALL be invented: an absent unit price stays absent, and an absent barcode stays
absent. All money SHALL be integers in minor units; no floating point SHALL take part.

The чек's identity — its фіскальний номер чека and фіскальний номер реєстратора — SHALL be the
реквізити the чек was looked up with, because a ПРРО document need not name its own fiscal
number. WHEN the document names a реєстратор, a date or a total, they SHALL agree with the
реквізити; a document that disagrees SHALL be refused as not the чек looked up, never attached
under the wrong identity. A document that cannot be read as either dialect SHALL yield the typed
reason that it is not a fiscal document, never a partial чек.

#### Scenario: A classic РРО grocery document parses into eight позиції

- **WHEN** a classic РРО document holds eight product rows, among them «Снек Кіндер Мілк Слайс 28г»
  with quantity 2000 thousandths, unit price 2590 and line total 5180 minor units, barcode
  "40084725", and a total of 43740 minor units
- **THEN** the чек holds total 43740 minor units UAH, the dialect classic РРО, and eight позиції in
  document order, the fifth being that product with quantity 2000, unit "шт", unit price 2590,
  line total 5180 and barcode "40084725"

#### Scenario: A weighed product keeps its fractional quantity

- **WHEN** a ПРРО document row holds «Куряче стегно» with AMOUNT 5.701, UNITNM «кг», PRICE 52.30
  and COST 298.16
- **THEN** the позиція holds quantity 5701 thousandths, unit «кг», unit price 5230 and line total
  29816 minor units UAH, and the line total is taken from the document rather than recomputed

#### Scenario: A row without a unit price stays without one

- **WHEN** a classic РРО product row names only a name and a sum, as it may when the quantity is
  one
- **THEN** the позиція holds quantity 1000 thousandths, the line total, and no unit price

#### Scenario: A line discount is kept beside its позиція and the total is the document's

- **WHEN** a ПРРО document holds «морква» COST 100.00 with DISCOUNTSUM 50.00, «цибуля» COST 200.00
  with DISCOUNTSUM 40.00, and CHECKTOTAL SUM 210.00
- **THEN** the позиції hold line totals 10000 and 20000 with discounts 5000 and 4000 minor units,
  and the чек's total is 21000 minor units UAH — the document's, not a recomputation

#### Scenario: A return document is a return

- **WHEN** a ПРРО document carries the return subtype
- **THEN** the чек's kind is return and its позиції are parsed as for a sale

#### Scenario: Free-text lines are not позиції

- **WHEN** a classic РРО document holds free-text lines (cashier, card details, loyalty
  programme) between its product rows
- **THEN** none of them becomes a позиція, and the позиції are exactly the product rows

#### Scenario: A barcode is kept when present and absent when not

- **WHEN** one document row carries a barcode and another does not
- **THEN** the first позиція holds that barcode verbatim and the second holds none

#### Scenario: A чек-level discount figure is not kept

- **WHEN** a ПРРО document's CHECKTOTAL states DISCOUNTSUM 90.00 beside line discounts of 50.00
  and 40.00, and a classic РРО document holds a discount row naming no line
- **THEN** the line discounts are kept on their позиції, no чек-level discount is stored, and the
  чек's total is the document's total

#### Scenario: A ПРРО document without a fiscal number takes its identity from the реквізити

- **WHEN** a ПРРО document names реєстратор "4000146829" and no fiscal number of its own, and
  it was looked up with фіскальний номер чека "1384600901" and реєстратор "4000146829"
- **THEN** the чек's identity is "1384600901" at "4000146829" on the document's date

#### Scenario: A document that disagrees with the реквізити is refused

- **WHEN** a document naming реєстратор "3000909908" arrives for a lookup made with реєстратор
  "4000146829", or names a date other than the lookup's
- **THEN** the outcome is the typed reason that this is not the чек looked up, and no чек is
  produced

#### Scenario: An unknown document is refused whole

- **WHEN** the decoded text is well-formed XML whose root is neither dialect, or is not XML at all
- **THEN** the outcome is the typed reason that this is not a fiscal document, and no чек is
  produced

### Requirement: Two чеки are the same чек by their fiscal identity

The identity of a фіскальний чек SHALL be its фіскальний номер реєстратора, its фіскальний номер
чека and the calendar date it was issued. Two чеки with the same identity SHALL be one чек: it
SHALL be stored at most once, and offering it again SHALL yield the same result as the first time
— attached to the same транзакція it reads as already attached there; offered for a different
транзакція it is refused with the typed reason naming the транзакція it is attached to, and
nothing moves.

#### Scenario: Scanning the same QR twice is one чек

- **WHEN** the same чек QR is read and looked up twice for the same транзакція
- **THEN** exactly one фіскальний чек exists for it, and the second time answers that it is
  already attached to this транзакція

#### Scenario: A чек attached elsewhere is refused, not moved

- **WHEN** a чек attached to транзакція A is offered for транзакція B
- **THEN** attaching is refused with the typed reason naming транзакція A, and the чек stays on A

### Requirement: The чек's total is compared with the транзакція's сума before attaching

Before a фіскальний чек is attached, the system SHALL compare the чек's total with the
транзакція's сума, ignoring sign. WHEN both are in the same currency and equal, attaching SHALL
proceed without a warning. WHEN they differ, or the транзакція is not in UAH, the system SHALL NOT
attach silently: it SHALL yield a warning naming both amounts, and attaching SHALL happen only on
the owner's explicit decision. No tolerance SHALL be applied. A difference between the чек's date
and time and the транзакція's date, between the seller named on the чек and the транзакція's
опис, and between the чек's kind and the транзакція's type — a return чек on a витрата, a sale чек
on a повернення — SHALL be reported as information beside the comparison and SHALL neither block
nor decide anything on its own.

#### Scenario: Equal amounts attach without a warning

- **WHEN** a чек with total 74230 minor units UAH is offered for a витрата of 74230 minor units UAH
- **THEN** the comparison is a match and attaching needs no further decision

#### Scenario: A different amount warns and waits

- **WHEN** a чек with total 74230 minor units UAH is offered for a витрата of 70000 minor units UAH
- **THEN** the comparison is a mismatch naming 74230 and 70000 minor units UAH, and nothing is
  attached until the owner decides

#### Scenario: A foreign-currency транзакція warns

- **WHEN** a чек with total 9999 minor units UAH is offered for a витрата of 9999 minor units USD
- **THEN** the comparison is a mismatch naming both amounts with their currencies

#### Scenario: A date difference is information only

- **WHEN** a чек issued 2026-08-30 22:20 is offered for a витрата dated 2026-08-31 of the same сума
- **THEN** the comparison is a match, and the date difference is reported as information

#### Scenario: A повернення matches a return чек by absolute amount

- **WHEN** a return чек with total 8000 minor units UAH is offered for a повернення of 8000 minor
  units UAH
- **THEN** the comparison is a match

#### Scenario: A return чек on a витрата is information only

- **WHEN** a return чек with total 8000 minor units UAH is offered for a витрата of 8000 minor
  units UAH
- **THEN** the comparison is a match, and the чек being a return is reported as information

### Requirement: Attaching stores the чек and its позиції as one unit

Attaching SHALL store the фіскальний чек, every one of its позиції and the source snapshot as a
single unit under the транзакція; if any part cannot be stored, none SHALL be. Until the owner has
decided to attach, nothing SHALL be stored: a lookup, a parse and a comparison leave storage
untouched. The чек SHALL record how it was acquired — by QR scan in this version — and the moment
it was fetched.

#### Scenario: A failed store leaves no чек behind

- **WHEN** storing the last позиція of a чек is rejected
- **THEN** neither the чек nor any of its позиції is stored, and the транзакція carries no чек

#### Scenario: Backing out stores nothing

- **WHEN** a чек has been looked up and parsed and the owner does not attach it
- **THEN** no чек and no позиція exists in storage

### Requirement: A чек follows its транзакція and can be detached

Deleting a транзакція SHALL delete its фіскальний чек and позиції with it. Editing or retyping a
транзакція SHALL keep its чек: the чек stays attached under the same транзакція whatever its
сума, date, рахунок, category or type becomes, and the чек's own values SHALL NOT change. The owner
SHALL be able to detach a чек, which deletes it and its позиції and leaves the транзакція exactly
as it was; the same чек MAY then be attached again.

#### Scenario: Deleting the транзакція deletes the чек

- **WHEN** a транзакція carrying a чек with nine позиції is deleted
- **THEN** the чек and all nine позиції are gone, and no чек with that identity exists

#### Scenario: Editing the сума keeps the чек

- **WHEN** the сума of a витрата carrying a чек of 74230 minor units is changed to 70000 minor
  units
- **THEN** the same чек is still attached, its total is still 74230 minor units UAH, and the
  транзакція's сума is 70000 minor units UAH

#### Scenario: Retyping keeps the чек

- **WHEN** a витрата carrying a чек is retyped into a повернення
- **THEN** the чек is still attached to the same транзакція

#### Scenario: Detaching deletes the чек and frees its identity

- **WHEN** the owner detaches the чек from a транзакція
- **THEN** the транзакція carries no чек, no позиція of it remains, and the same QR can be
  attached again

### Requirement: The source snapshot is kept but never read by the app's screens

The decoded fiscal document SHALL be kept with the чек as an immutable snapshot, so a later parser
can re-read it without the tax service and so what the tax service served is never lost. Every
number and name a screen shows SHALL come from the parsed чек and позиції, never from the
snapshot; the snapshot SHALL NOT change after it is stored.

#### Scenario: Screens read the parsed чек

- **WHEN** the stored snapshot of a чек were altered
- **THEN** what the чек's screen shows would not change, because it reads the parsed чек and
  позиції

### Requirement: Nothing but the lookup leaves the phone

The only outbound connection this capability makes SHALL be the lookup of a чек by its реквізити,
sent to the tax service on the owner's explicit action. No транзакція, опис, product name, чек
document or позиція SHALL be sent anywhere; nothing SHALL be logged that names a product, a чек's
реквізити or a card; and no analytics SHALL exist. The camera SHALL be used only to decode a QR
code: no image SHALL be stored or sent.

#### Scenario: One request per lookup, carrying only the реквізити

- **WHEN** a чек is looked up
- **THEN** exactly one outbound request is made and it carries the реквізити and nothing else —
  no транзакція, no рахунок, no опис

#### Scenario: A stored чек lives on the phone only

- **WHEN** a чек is attached and the app is used for a month
- **THEN** no outbound connection has carried its позиції or its document
