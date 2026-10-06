## ADDED Requirements

### Requirement: A сума reads with its currency code everywhere

Every сума the app draws in running text, in a line, in a графік of платежі or in a чек SHALL be
written as its number followed by the ISO 4217 code of its currency — «80,00 UAH», «20,00 USD» —
the same way on every screen. No screen SHALL write a currency by its sign («₴», «$», «€»). Two
readings keep their own form because they are not a сума of one currency: the approximate hryvnia
reading «≈ … грн» (glossary «Усе ≈ грн»), and a chart's scale, which may round to whole units
(«160 263 UAH»). A сума typed by the owner is unaffected: only what the app draws is.

#### Scenario: A зобов'язання and a витрата on one screen write their сума alike

- **WHEN** Місяць shows a витрата «Кава» of 12345 minor units UAH and, under «Платежі місяця», a
  платіж of a зобов'язання of 80000 minor units UAH
- **THEN** both read with «UAH» after the number — «123,45 UAH» and «800,00 UAH» — and no «₴» is
  drawn anywhere on the screen

#### Scenario: A чек writes UAH too

- **WHEN** a чек of 23750 minor units with a позиція of 4500 is shown
- **THEN** the чек reads «237,50 UAH» and the позиція «45,00 UAH»

### Requirement: A дата in running text is a day and a month in words

Wherever the app draws a дата as part of a sentence or a line — when a вартість was recorded, since
when a рахунок is linked, when a платіж is due or was charged — it SHALL be written as the day and
the full name of the month in the genitive («21 вересня», «5 листопада»), with the year added only
when it is not the current year («5 листопада 2025»). No such дата SHALL be drawn as a date code
(«2026-09-21») or with a shortened month («5 лист.»). A field the owner types into is not running
text.

#### Scenario: The поточна вартість says when it was recorded in words

- **WHEN** the поточна вартість of «облігація $» was recorded on 2026-09-21 and today is 2026-10-05
- **THEN** its line on Рахунки reads «поточна вартість на 21 вересня»

#### Scenario: A платіж date is never shortened

- **WHEN** a зобов'язання's next платіж falls on 2026-11-05 and today is 2026-10-05
- **THEN** its row reads «найближчий платіж 5 листопада»

#### Scenario: Another year is named

- **WHEN** a monobank рахунок has been linked since 2025-12-30 and today is 2026-10-05
- **THEN** the monobank screen reads «з 30 грудня 2025»

### Requirement: A дата or a місяць the owner sets is set with the app's own control

Every дата the owner sets — the дата of a транзакція, «станом на» of a початковий залишок, «До
дати» of a ціль, «Дата першого платежу» of a розстрочка or a зобов'язання, the date monobank starts
reading from — SHALL be set with the same date control the entry form uses: a step a day back and
forward, «Вчора», «Сьогодні» and «Календар», with typing a date still possible and a typed date
refused in Ukrainian when it is not a date. Every місяць the owner sets — either end of a custom
range on AI-аналіз — SHALL be set by stepping a місяць back and forward and reads as a місяць in
words («вересень 2026»), never as a code to be typed.

#### Scenario: A ціль's date is chosen from the calendar

- **WHEN** the owner opens the form of a new ціль-накопичення and taps «Календар» under «До дати»
- **THEN** the calendar opens, the picked day is shown in words, and nothing has to be typed as
  «РРРР-ММ-ДД»

#### Scenario: An impossible typed date is refused

- **WHEN** the owner types «2026-02-30» into «До дати» and saves
- **THEN** the ціль is not stored and the refusal says, in Ukrainian, that such a дата does not exist

#### Scenario: A custom range is stepped, not typed

- **WHEN** the owner chooses «Свій діапазон» on AI-аналіз and steps «Від» back twice from вересень
  2026
- **THEN** the range reads «липень 2026 — вересень 2026» and no month code is typed

### Requirement: An alphabetical list follows Ukrainian order, letter case folded

Every list or picker the app orders by name SHALL order it as Ukrainian is ordered, with letter
case folded and Latin names after Cyrillic ones, the same way on every screen; two names that
fold equal keep a stable order. A name written in capitals SHALL NOT come before a lower-case name
that follows it in the alphabet.

#### Scenario: Capitals do not jump the queue

- **WHEN** the owner's рахунки are «ПУМБ», «РЕЗЕРВ», «валюта моно» and «гаманець»
- **THEN** every alphabetical list of them reads «валюта моно», «гаманець», «ПУМБ», «РЕЗЕРВ»

### Requirement: The status bar is legible in both appearances

The phone's status bar SHALL be drawn with dark marks over the app's light appearance and with
light marks over its dark appearance, on every screen and from the moment the app's own screens
are drawn.

#### Scenario: The clock is readable on a light screen

- **WHEN** the phone is in its light appearance and Головний is shown
- **THEN** the status bar's clock and icons are dark against the light header

### Requirement: A form with unsaved edits asks before «назад» discards it

WHEN the device's back gesture would close a form or sheet the owner types into and discard what was
typed — the entry form and the editing of a транзакція; every create or edit form of Налаштування;
«Звірити» and «Обʼєднати з іншим рахунком» on a рахунок; a продавець's screen; the forms of a
розстрочка, a зобов'язання and a ціль; the репорт form and the репорт sheet — it SHALL first ask
«Відкинути зміни?» when the form holds anything the owner changed since it opened,
offering «Відкинути» and «Лишитися». «Відкинути» SHALL close the form exactly as the back gesture
would have, storing nothing; «Лишитися» SHALL leave the form open with everything still typed. A
form the owner opened and changed nothing in SHALL close at once, without asking.

#### Scenario: An edited form asks first

- **WHEN** the owner opens «Нове правило», types «zzqa» into «Текст опису» and uses the back gesture
- **THEN** the form asks «Відкинути зміни?»; «Лишитися» keeps «zzqa» in the field and nothing is
  stored

#### Scenario: An untouched form closes at once

- **WHEN** the owner opens «Нове правило» and uses the back gesture without typing anything
- **THEN** the form closes with no question

### Requirement: Every switch and every coloured mark has an accessible name

Every switch SHALL carry an accessible name saying what it switches, and its state SHALL be read
with it. Every state the app marks by colour — a категорія over its ліміт, a сума that is a loss
such as a зміна of Статок that fell — SHALL also be part of the accessible name of what carries it,
so a screen reader hears what the colour shows.

#### Scenario: A widget switch says which widget

- **WHEN** a screen reader reaches the switch of «Статок» on «Налаштувати Головний»
- **THEN** it hears «Статок» and whether it is shown

#### Scenario: A line over its ліміт says so

- **WHEN** the feed shows a витрата of 120000 minor units UAH in «Кафе», whose ліміт this month is
  already exceeded, and a screen reader reaches that line
- **THEN** the line's accessible name contains «понад ліміт»

#### Scenario: A зміна that fell is heard as a fall

- **WHEN** the «Статок» screen shows July, whose зміна is −5600000 minor units UAH drawn in the
  danger colour, and a screen reader reaches the зміна on the card
- **THEN** it hears «зміна мінус 56 000 гривень, спад», as the month table and the «Статок» widget
  already say it

### Requirement: A name in a line breaks between words, never inside one

WHERE a line draws a name that does not fit its width — a рахунок, a категорія, a продавець — it
SHALL break the text only between words, and a word that cannot fit SHALL be shortened with «…»
rather than split across two rows. This SHALL hold at the largest text size the phone offers.

#### Scenario: A переказ title at a large text size

- **WHEN** the phone's text size is 200 % and the feed shows a переказ «гаманець → РЕЗЕРВ»
- **THEN** «гаманець» is drawn whole on its row, and no row starts in the middle of a word
