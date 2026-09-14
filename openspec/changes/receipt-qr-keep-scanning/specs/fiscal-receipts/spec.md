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
needs SHALL yield the typed reason naming what is missing. The сума SHALL be read as a decimal
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
