## ADDED Requirements

### Requirement: Every picker of one рахунок, категорія or джерело is the entry form's picker

Every place in the app where the owner picks exactly one рахунок, one категорія or one джерело to be
stored SHALL offer it the way the entry form's pickers do (main-screen, "A picker shows at most a
few choices and names what is behind the rest", "The short list is what was reached for last, and
always holds what is chosen", "The offer opens the full list with a search"): at most five choices
shown — those the owner's latest транзакції reached for, topped up from the head of the full list —
plus whatever is currently chosen when it is not among them; one offer naming how many choices there
are in all, shown only when there are more than five; the full list in Ukrainian order behind it,
with a search by name; and the phone's «назад» closing the full list before the screen. Beyond the
recording path, which main-screen governs, this SHALL hold for: «Рахунок списання» and «Категорія»
of a розстрочка and of a зобов'язання; «Категорія» and «Переказ на» of a правило; the категорія a
базова категорія of the шаблон is sent to; the «Категорія» of a ціль витрат; the рахунок of a
watched bank app; and the existing рахунок a monobank card is linked to. A row of choices that
narrows a list rather than storing an answer (a filter holding «Всі»), a choice of several рахунки
at once (the склад of a ціль) and the Saldo import's merge targets are not such pickers.

What each picker offers stays what its own capability says it offers; only how the offered choices
are shown is fixed here. A choice reached through the full list SHALL be stored exactly as one shown
directly.

#### Scenario: The розстрочка form no longer scrolls through every категорія

- **WHEN** the owner holds 27 unarchived категорії, their latest витрати carry «Продукти», then
  «Кафе», and they open «Нова розстрочка»
- **THEN** «Категорія» shows five choices with «Продукти» before «Кафе», and one offer naming all of
  them, which opens the full list with a search

#### Scenario: A правило-переказ finds its рахунок through the search

- **WHEN** the owner holds 29 unarchived рахунки, creates a правило targeting «Переказ на», opens the
  full list and types «банка»
- **THEN** only the рахунки whose names contain «банка», in any letter case, are shown; picking «Банка
  на відпустку» closes the full list, it stands chosen among the shown few, and the saved правило
  sends that опис as a переказ to «Банка на відпустку»

#### Scenario: A short list is drawn whole

- **WHEN** the owner adds a watched bank app while holding four рахунки that can be offered
- **THEN** all four are shown and no offer to see more is drawn

#### Scenario: A ціль витрат's категорія comes from the same picker

- **WHEN** the owner opens a new ціль витрат while 20 категорії carry no ліміт yet
- **THEN** «Категорія» shows five of them and one offer naming all twenty

#### Scenario: «Назад» closes the full list of a plan form first

- **WHEN** the owner has the full list of «Рахунок списання» open on the розстрочка form, having typed
  a назва, and uses the phone's «назад»
- **THEN** the full list closes and the form is still open with its назва kept

#### Scenario: A picker that acts on tap acts from the full list too

- **WHEN** the owner opens the базова категорія «Підписки», whose target is «Підписки», takes the
  offer naming all 27 категорії, searches «розваг» and picks «Розваги»
- **THEN** the full list closes, «Розваги» stands chosen among the shown few, and the базова
  категорія now sends its продавці to «Розваги», exactly as if «Розваги» had been shown directly

#### Scenario: A filter row is not turned into a picker

- **WHEN** the owner opens «Транзакції» while holding 29 рахунки
- **THEN** the рахунок narrowing is still one row holding «Всі» and the рахунки, as transaction-search
  specifies, and no offer «Всі рахунки (29)» is drawn there

### Requirement: A full list is read before it is searched

Opening the full list of any picker of a рахунок, a категорія, a джерело or a продавець SHALL show
the list and its search field without raising the keyboard; the keyboard SHALL open only when the
owner taps the search field. While the owner types into it, the first of the choices it narrows to
SHALL stay in sight above the keyboard rather than under it.

#### Scenario: The full list of рахунки opens unobstructed

- **WHEN** the owner taps «Всі рахунки (29)» under «Рахунок списання» of the зобов'язання form
- **THEN** the full list is shown and no keyboard covers it

#### Scenario: Typing keeps the matches in sight

- **WHEN** the owner opens all категорії from the правило form, taps the search and types «под»
- **THEN** «Подарунки» and every other категорія containing «под» stand above the keyboard, not
  under it

## MODIFIED Requirements

### Requirement: A транзакція's дата reads as a day

Wherever a line of транзакції shows a дата — the latest-transactions feed, «Транзакції», a
рахунок's рухи, a категорія's month, and the line of a pending чернетка — the дата SHALL read as a
day in Ukrainian rather than as a date code: «сьогодні» for today, «вчора» for the day before,
otherwise the day and the month in the genitive, with the year added only when it is not the current
year. What is today SHALL be decided by the device's local calendar day.

#### Scenario: Today and yesterday are named

- **WHEN** today is 2026-09-23 and the feed holds a витрата dated 2026-09-23 and a дохід dated
  2026-09-22
- **THEN** their lines read «сьогодні» and «вчора» where the дата is shown

#### Scenario: This year's day carries no year

- **WHEN** today is 2026-09-23 and a line's транзакція is dated 2026-09-21
- **THEN** its дата reads «21 вересня»

#### Scenario: Another year's day carries its year

- **WHEN** today is 2026-09-23 and a line's транзакція is dated 2025-08-11
- **THEN** its дата reads «11 серпня 2025»

#### Scenario: A чернетка's line names its day

- **WHEN** today is 2026-08-27 and the owner expands a pending чернетка proposing a витрата of 25000
  minor units UAH dated 2026-08-26 on «Приват»
- **THEN** its line reads «Приват · вчора» and no «2026-08-26» is drawn

### Requirement: A дата in running text is a day and a month in words

Wherever the app draws a дата as part of a sentence or a line — when a вартість was recorded, since
when a рахунок is linked, when a платіж is due or was charged, the day a ціль is due by, the day a
чек was issued, the day a досягнення asks a ціль to be reached by, the day a monobank link starts
reading from — it SHALL be written as the day and the full name of the month in the genitive («21
вересня», «5 листопада»), with the year added only when it is not the current year («5 листопада
2025»). An instant SHALL be written the same way followed by «о» and the time of day («6 жовтня о
14:03»), or «сьогодні о …» / «вчора о …» when it is today or yesterday. No such дата SHALL be drawn
as a date code («2026-09-21», «06.10.2026») or with a shortened month («5 лист.»). A field the owner
types into is not running text.

#### Scenario: The поточна вартість says when it was recorded in words

- **WHEN** the поточна вартість of «облігація $» was recorded on 2026-09-21 and today is 2026-10-05
- **THEN** its line on Рахунки reads «поточна вартість на 21 вересня»

#### Scenario: A платіж date is never shortened

- **WHEN** a зобов'язання's next платіж falls on 2026-11-05 and today is 2026-10-05
- **THEN** its row reads «найближчий платіж 5 листопада»

#### Scenario: Another year is named

- **WHEN** a monobank рахунок has been linked since 2025-12-30 and today is 2026-10-05
- **THEN** the monobank screen reads «з 30 грудня 2025»

#### Scenario: A ціль's deadline is a day in words wherever it is read

- **WHEN** a ціль-накопичення «Відпустка» of 5000000 minor units UAH is due by 2026-12-31 and today
  is 2026-10-06
- **THEN** its row in Налаштування, its own screen and its line on «Звіти» each read «до 31 грудня»,
  and none of them draws «2026-12-31»

#### Scenario: The monobank link confirmation names its day

- **WHEN** today is 2026-10-06 and the owner links «mono USD» starting from 2026-09-11
- **THEN** the confirmation reads «Синхронізувати «mono USD» з 11 вересня включно» and draws no date
  code

#### Scenario: A чек's issue day differs in words

- **WHEN** today is 2026-10-06 and a чек of 23750 minor units UAH issued on 2026-09-21 is attached
  to a витрата dated 2026-09-23
- **THEN** the warning reads «Чек виписано 21 вересня» and the чек's own line names «21 вересня» with
  its time, never «2026-09-21»

#### Scenario: A досягнення's condition names its day

- **WHEN** today is 2026-10-06 and the ціль «Відпустка» is due by 2027-03-01
- **THEN** the досягнення for it reads «Ціль «Відпустка» досягнута не пізніше за 1 березня 2027.»

#### Scenario: A past import is an instant in words

- **WHEN** today is 2026-10-07 and a Saldo import was committed on 2026-10-06 at 14:03
- **THEN** the Saldo screen reads «Імпорт уже виконано вчора о 14:03.» and draws neither
  «06.10.2026» nor seconds

### Requirement: A дата or a місяць the owner sets is set with the app's own control

Every дата the owner sets — the дата of a транзакція, «станом на» of a початковий залишок, «До
дати» of a ціль, «Дата першого платежу» of a розстрочка or a зобов'язання, the date monobank starts
reading from — SHALL be set with the same date control the entry form uses: a step a day back and
forward, «Вчора», «Сьогодні» and «Календар», with typing a date still possible and a typed date
refused in Ukrainian when it is not a date. The step a day forward SHALL stop at today only for a
дата that records what already happened — the дата of a транзакція, «станом на» and the date
monobank starts reading from; for a дата that looks ahead — «До дати» of a ціль and «Дата першого
платежу» — it SHALL be offered whatever the дата, and the calendar SHALL open on future days as
freely as on past ones. Every місяць the owner sets — either end of a custom range on AI-аналіз —
SHALL be set by stepping a місяць back and forward and reads as a місяць in words («вересень 2026»),
never as a code to be typed.

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

#### Scenario: A first платіж steps past today

- **WHEN** today is 2026-10-06, «Дата першого платежу» of a new зобов'язання shows 2026-10-06, and the
  owner taps the one-day-forward step twice
- **THEN** «Дата першого платежу» becomes 2026-10-08 and the step a day forward is still offered

#### Scenario: A транзакція still stops at today

- **WHEN** today is 2026-10-06 and the дата of a витрата being recorded is 2026-10-06
- **THEN** no one-day-forward step is offered
