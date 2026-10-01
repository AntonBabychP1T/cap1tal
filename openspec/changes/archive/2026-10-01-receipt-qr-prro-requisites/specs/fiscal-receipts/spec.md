## MODIFIED Requirements

### Requirement: The реквізити чека are read from the QR code deterministically

The system SHALL read the реквізити чека from the text of a QR code: the фіскальний номер чека,
the фіскальний номер реєстратора, the calendar date, the time of day to the minute and, when
present, the seconds, and the сума of the чек as integer minor units UAH. The reading SHALL be
total and deterministic: the same text always yields the same реквізити or the same typed reason.
The text SHALL be recognised as a чек QR only when it is a link to the tax service's receipt check
page, whatever the order of its parameters, whether the time is given to the minute or to the
second, and whether or not it carries a message authentication code. A text that is not such a
link SHALL yield the typed reason that this is not a чек QR; a link lacking any реквізит the lookup
needs SHALL yield the typed reason naming what is missing. The фіскальний номер чека SHALL be
read as one or more ASCII letters and digits, kept exactly as written; the фіскальний номер
реєстратора SHALL be read as digits only. The time SHALL be read whether its parts are written
together (`HHmm`, `HHmmss`) or separated by colons (`HH:mm`, `HH:mm:ss`). The сума SHALL be read as a decimal
with a dot into minor units without any floating-point arithmetic. Whitespace and control
characters from the C0 range (`U+0000`–`U+001F`) plus DEL (`U+007F`) before the start or after the
end of the text SHALL be ignored, so a
чек QR a реєстратор pads with them yields the same реквізити as without them. Only characters at
the ends SHALL be dropped; a control character inside the text SHALL be kept, so a реквізит
containing one is unreadable.

#### Scenario: A чек QR ending in a NUL is read as without it

- **WHEN** the QR text is
  `https://cabinet.tax.gov.ua/cashregs/check?date=20260912&time=140004&id=19930061&sm=4370.91&fn=3000876257`
  followed by one NUL character
- **THEN** the реквізити are фіскальний номер чека "19930061", реєстратор "3000876257", date
  2026-09-12, time 14:00:04 and сума 437091 minor units UAH — the same as for the text without the
  NUL

#### Scenario: Whitespace and control characters at either end are ignored

- **WHEN** the QR text of a complete чек link is preceded by a space and a tab and followed by a
  carriage return, a line feed and two NUL characters
- **THEN** the реквізити are the same as for the link alone

#### Scenario: A control character inside the text is not ignored

- **WHEN** the QR text is a чек link whose `fn` value is `30008\u000076257` (a NUL between digits)
  and every other реквізит is well formed
- **THEN** the reading yields the typed reason that the реквізити are incomplete and names the
  фіскальний номер реєстратора as missing

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

#### Scenario: A ПРРО QR with a lettered чек number and a colon time is read

- **WHEN** the QR text is
  `https://cabinet.tax.gov.ua/cashregs/check?mac=e3300a1cc0ecdb62af956fcaf12d4d7eba17fa9ee8c94f63373d92d0d2165ddf&date=20260912&time=17:21:47&fn=4001481902&id=WwNagtghkq8&sm=219.30`
- **THEN** the реквізити are фіскальний номер чека "WwNagtghkq8", реєстратор "4001481902", date
  2026-09-12, time 17:21:47 and сума 21930 minor units UAH

#### Scenario: A malformed фіскальний номер чека or time is incomplete

- **WHEN** a чек link otherwise well formed carries `id=45/6`, or in another link `time=17:2147`
- **THEN** the reading yields the typed reason that the реквізити are incomplete and names the
  фіскальний номер чека, respectively the time, as missing

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
reason that it is not a fiscal document, never a partial чек. A classic РРО data packet SHALL NOT
be read as naming its own фіскальний номер чека: its document counter is not that number, so a чек
served in that dialect takes its фіскальний номер чека from the реквізити alone.

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

#### Scenario: A ПРРО чек served as a РРО data packet attaches under a lettered number

- **WHEN** a РРО data packet names реєстратор "4001481902", document counter 73, date 2026-09-12
  and total 21930 minor units, and it was looked up with фіскальний номер чека "WwNagtghkq8",
  реєстратор "4001481902", date 2026-09-12 and сума 219.30
- **THEN** the чек's identity is "WwNagtghkq8" at "4001481902" on 2026-09-12, and it is not refused
  as another чек

#### Scenario: A document that disagrees with the реквізити is refused

- **WHEN** a document naming реєстратор "3000909908" arrives for a lookup made with реєстратор
  "4000146829", or names a date other than the lookup's
- **THEN** the outcome is the typed reason that this is not the чек looked up, and no чек is
  produced

#### Scenario: An unknown document is refused whole

- **WHEN** the decoded text is well-formed XML whose root is neither dialect, or is not XML at all
- **THEN** the outcome is the typed reason that this is not a fiscal document, and no чек is
  produced
