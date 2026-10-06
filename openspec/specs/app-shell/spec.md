# app-shell Specification

## Purpose
The shell around the screens: what the owner meets when the app is launched, before Головний or
Рахунки can be shown, and the identity the app presents while getting there. It exists because
launching is owner-visible behaviour that belongs to no single screen — and because an app holding
someone's whole financial life should open under its own name, not a toolchain's.

## Requirements

### Requirement: Launching the app shows the app's own identity

While the app is preparing and no screen can be shown yet, it SHALL show its own name and SHALL
show no other product's logo, wordmark or brand colour. What is shown SHALL follow the system
light/dark appearance, and the colour behind the app's name SHALL be the same colour the system
shows while the app is still starting, so the two are indistinguishable to the owner.

#### Scenario: Launching shows the app's own name

- **WHEN** the app is launched
- **THEN** what is shown before the first screen carries the app's own name and no other product's
  logo, wordmark or brand colour

#### Scenario: The launch view follows the system appearance

- **WHEN** the app is launched while the system is in dark appearance
- **THEN** the launch view uses the app's dark background and remains legible; in light appearance
  it uses the app's light background

#### Scenario: The handover from the system is seamless

- **WHEN** the app is launched
- **THEN** the colour shown while the system starts the app and the colour behind the app's own
  name are the same, so no other colour flashes between them

### Requirement: The launch view always gives way

The launch view SHALL disappear once the app is ready and SHALL NOT reappear for the rest of that
launch. It SHALL disappear even when preparing storage fails, so that a failure is never hidden
behind it.

#### Scenario: The launch view gives way to the first screen

- **WHEN** the app has finished preparing storage
- **THEN** the launch view disappears, Головний is shown, and the launch view does not appear
  again until the app is launched anew

#### Scenario: A storage failure is not hidden behind the launch view

- **WHEN** preparing storage fails
- **THEN** the launch view still disappears and the failure is shown to the owner

### Requirement: The app ships no unreferenced image

The installed app SHALL contain no image that nothing references — the project scaffold's
leftovers first among them. Every image it ships SHALL be referenced by the app's configuration
or its code, including any image that exists only to satisfy a platform requirement. Scaffold
artwork the configuration still points at — the app icon and its launcher variants — is
referenced and therefore ships; replacing it is a design decision this requirement does not make.

#### Scenario: No unreferenced image is bundled

- **WHEN** the app is bundled for Android
- **THEN** every image present is referenced by the app's configuration or its code, and no image
  the scaffold left behind unreferenced is present

### Requirement: A refusal the owner reads is in Ukrainian

WHEN the app refuses something the owner typed — a сума, a дата, a назва, a form with a choice
still unmade — the refusal SHALL be shown in Ukrainian and SHALL name what about the typed value
is wrong. No refusal reachable by filling in a form SHALL be shown in any other language, and
none SHALL be the internal wording an engine uses to guard its own invariants: a refusal is
something the owner has to act on, so it SHALL be phrased for them.

This holds wherever a сума or a дата is typed — recording, editing, opening a рахунок, setting a
ліміт, creating a ціль — and the wording SHALL be the same for the same mistake, because it is
the same mistake.

#### Scenario: A ліміт that is not positive is refused in Ukrainian

- **WHEN** the owner enters "0" as a ліміт and confirms
- **THEN** the ліміт is not set and the owner is told in Ukrainian that a сума must be greater
  than zero, with no English in what is shown

#### Scenario: A сума that is not a number is refused in Ukrainian

- **WHEN** the owner enters "12 000" as a сума anywhere a сума is typed and confirms
- **THEN** nothing is stored and the owner is told in Ukrainian that what was typed is not a
  сума, with no English in what is shown

#### Scenario: Too many fractional digits are refused in Ukrainian

- **WHEN** the owner enters "12,345" as a сума in UAH and confirms
- **THEN** nothing is stored and the owner is told in Ukrainian that a UAH сума carries at most
  two digits after the comma

#### Scenario: A дата in the wrong shape is refused in Ukrainian

- **WHEN** the owner enters "31.12.2026" as a ціль's дата and confirms
- **THEN** the ціль is not saved and the owner is told in Ukrainian that a дата is written as
  РРРР-ММ-ДД, with no English in what is shown

#### Scenario: A day that does not exist is refused in Ukrainian

- **WHEN** the owner enters "2026-02-31" as a дата and confirms
- **THEN** nothing is stored and the owner is told in Ukrainian that there is no such day in the
  calendar

#### Scenario: A переказ onto the same рахунок is refused in Ukrainian

- **WHEN** the owner records a переказ choosing one рахунок as both the one the money left and
  the one it arrived at
- **THEN** nothing is stored and the owner is told in Ukrainian that a переказ connects two
  different рахунки, with no English in what is shown

### Requirement: An uncaught error while drawing a screen shows a fallback, not a dead app

WHEN an error is thrown while a screen is being drawn and no screen caught it, the app SHALL
record it in the журнал with its message and stack before anything else, and SHALL show, in
Ukrainian and following the system appearance, that the screen failed, with the error's message,
an offer to file a репорт про помилку, and a way back to Головний. The app SHALL NOT close on
its own, and returning from the fallback SHALL NOT show the launch view again.

WHEN an error is thrown in work a screen started after it was drawn, or a promise is rejected
and nobody answers it, the app SHALL record it in the журнал with its message and stack before
the platform's own handling of it, which is otherwise unchanged: such an error is remembered, not
caught.

#### Scenario: A crashed screen is replaced by the fallback

- **WHEN** drawing «Рахунки» throws
- **THEN** the журнал holds the crash with its message and stack, and the owner sees a Ukrainian
  fallback naming the failure with «Повідомити про помилку» and «Повернутися»

#### Scenario: An error in started work is remembered

- **WHEN** work a screen started throws after the screen was drawn, or a promise is rejected
  with nobody answering it
- **THEN** the журнал holds the crash with its message and stack, and what the platform does
  with the error afterwards is what it did before

#### Scenario: The fallback follows the system appearance

- **WHEN** a screen crashes while the system is in dark appearance
- **THEN** the fallback uses the app's dark background and remains legible

#### Scenario: Returning from the fallback shows no launch view

- **WHEN** the owner chooses «Повернутися» on the fallback
- **THEN** Головний is shown and the launch view does not appear in between

### Requirement: The shell offers one fixed set of tabs, wherever the app runs

The shell SHALL offer exactly five tabs and SHALL offer the same five in the same order wherever the
app runs: Головний, Місяць, Рахунки, Звіти, Налаштування. No place the app is built for SHALL offer
a subset of them, a different order, or a sixth.

The order is the one the other specs already depend on — `reports-screen` places «Звіти» between
«Рахунки» and «Налаштування», and `settings-screen` places «Налаштування» last after Головний,
Місяць, Рахунки and Звіти. This requirement is what makes that one set rather than two agreements
that can drift apart.

#### Scenario: Every tab is offered

- **WHEN** the app is opened
- **THEN** five tabs are offered: Головний, Місяць, Рахунки, Звіти and Налаштування, in that order

#### Scenario: A second way of drawing the bar offers the same set

- **WHEN** the app is built for a platform that draws the tabs differently from Android
- **THEN** it offers the same five tabs, in the same order, under the same names

### Requirement: The tab being read is marked, and not by colour alone

Exactly one tab SHALL be marked as the one being read, and it SHALL be the tab whose screen is
shown. The mark SHALL NOT be carried by colour alone: at least one signal that is not a colour
SHALL also separate the marked tab from the four others, so that an owner who cannot tell the two
colours apart can still see which tab they are on.

Any non-colour signal satisfies this — the weight of the tab's name, a shape drawn behind it, or
**the presence of the name itself where the other four show only icons**, which is what a native
Android five-tab bar does on its own. The third is named explicitly because it is the one that
carries this on the platform the app ships on, and a reader who looked only for a weight or a shape
on the device would find neither and conclude the requirement was unmet.

#### Scenario: Opening a tab marks it

- **WHEN** the owner opens «Місяць»
- **THEN** «Місяць» is marked as the one being read and no other tab is

#### Scenario: The mark survives without colour

- **WHEN** the five tabs are compared with every colour difference between them ignored
- **THEN** the marked tab is still distinguishable from the other four

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

### Requirement: A сума is never split across two lines

Wherever a сума is drawn with its currency, the number and its currency code SHALL stay on one
line; when several currencies are read together and do not fit one line, each currency's сума
SHALL take its own line whole rather than break between a number and its code. A screen whose own
requirement puts one currency per line (such as «Усього грошей») does so whether or not they fit.

#### Scenario: Three currencies of a total

- **WHEN** a total reads 187 449,16 UAH, 1 300,22 EUR and 3 353,52 USD on a phone too narrow for
  all three on one line
- **THEN** each of the three is drawn whole on its own line and no line starts with a bare
  currency code

### Requirement: A switch is drawn in the app's own tones

Every on/off switch the app draws SHALL use the app's own palette in both themes: the accent for
the switched-on state and a neutral tone of the theme for the switched-off state. No switch SHALL
carry a colour the rest of the app does not use.

#### Scenario: A switched-on widget in «Налаштувати Головний»

- **WHEN** the owner opens «Налаштувати Головний» with «Статок» shown
- **THEN** its switch is drawn in the accent, in the light and in the dark theme, with no other hue

### Requirement: A field being typed into is never under the keyboard

WHILE the device's keyboard is open over a screen, the field being typed into SHALL be drawn
above the keyboard, and the rest of the screen SHALL remain reachable by scrolling. This SHALL
hold on Android versions that no longer resize the window for the keyboard.

#### Scenario: A ліміт typed near the bottom of a long list

- **WHEN** the owner opens the ліміт editor of a категорія low on «Ліміти» and the keyboard opens
- **THEN** the «Ліміт на місяць» field is visible above the keyboard while the owner types

### Requirement: A tab reads storage only once it is first opened

A tab the owner has not opened yet SHALL read nothing from storage, even when the app prepares it
in the background at launch. It SHALL read the first time it comes into sight, and SHALL show what
storage holds at that moment. At launch, only the tab being shown SHALL read.

#### Scenario: Launch reads only the shown tab

- **WHEN** the app launches onto Головний
- **THEN** Головний reads storage, and Місяць, Рахунки, Звіти and Налаштування read nothing until
  each is first opened

#### Scenario: A tab opened for the first time shows current data

- **WHEN** a транзакція is saved on Головний and then Рахунки is opened for the first time
- **THEN** Рахунки shows balances that include that транзакція

### Requirement: A screen out of sight re-reads when it comes back, not before

A screen that is not in sight SHALL NOT read storage in response to a sync starting or finishing,
a notification being captured, прогрес being judged, or any other event that happens while it is
out of sight. It SHALL note that storage may have changed and SHALL read exactly once when it next
comes into sight. A screen in sight SHALL re-read when such an event actually changed storage. It
SHALL NOT re-read when the event only started work that has not written yet.

#### Scenario: A sync finishing behind a pushed screen does not re-read Головний until return

- **WHEN** the owner is reading a транзакція opened from Головний and a monobank прогін finishes,
  storing new транзакції
- **THEN** Головний reads nothing while hidden, and reads once, showing the new транзакції, when
  the owner goes back to it

#### Scenario: A sync starting reads nothing

- **WHEN** a прогін starts while Головний is in sight
- **THEN** Головний shows that the прогін is running without reading the stored транзакції again

### Requirement: Work that follows a save or the launch never holds up the screen

After the owner saves, categorises or removes a транзакція, work that does not decide what the
next screen shows SHALL run only after the screen has finished changing. That includes judging
досягнення and виклики anew. At launch, the chores that do not draw the first screen SHALL run
only after the first screen is drawn and ready for a tap: filling the starter set and missing
icons, draining captured notifications, starting the monobank прогін and taking a due бекап. None
of this deferral SHALL drop the work or change its outcome. WHEN the deferred work changes what the
screen in sight shows, such as a досягнення earned by the save, that screen SHALL show it without
the owner having to leave and come back. A screen out of sight SHALL show it when it next comes
into sight.

#### Scenario: Saving a транзакція returns to the previous screen before прогрес is judged

- **WHEN** the owner saves a new витрата and leaves the entry form
- **THEN** the previous screen is drawn first, and досягнення and виклики are judged after that,
  reaching the same verdict as before

#### Scenario: A досягнення earned by a save appears on the screen in sight

- **WHEN** a save on Головний earns a досягнення
- **THEN** once it is judged, Головний shows that досягнення as unseen, without the owner leaving
  Головний

#### Scenario: Launch chores run after the first screen is drawn

- **WHEN** the app launches with a бекап due and captured notifications waiting
- **THEN** Головний is drawn first, and the drain and the бекап run after it, each exactly once

### Requirement: A long list draws only what is near the screen

A list that can hold more rows than fit on a few screens SHALL draw only the rows on or near the
screen, and SHALL draw more as the owner scrolls. That covers the «Транзакції» list, a рахунок's
транзакції and a категорія's month. A change to one part of a screen SHALL NOT redraw rows or
widgets whose data did not change, such as typing a сума into one чернетка or choosing one row.
Order, grouping and the ability to reach every row SHALL stay exactly as specified for each list.

#### Scenario: A рахунок with a thousand транзакції opens without drawing them all

- **WHEN** the owner opens a рахунок holding 1 000 транзакції
- **THEN** only the rows near the screen are drawn at first, and scrolling reaches every row in the
  same order as before

#### Scenario: Typing into a чернетка redraws only that чернетка

- **WHEN** the owner types a сума into one чернетка on Головний
- **THEN** the статок, the категорії widget and the feed rows are not redrawn

### Requirement: A count the owner reads carries the Ukrainian form its number asks for

Wherever the app states a number of things in front of the owner, the noun beside it SHALL carry
the form Ukrainian gives that number: the singular for 1 and for anything else ending in 1, the
few-form for 2–4, the many-form for everything else, with 11–14 taking the many-form whatever they
end in. No screen SHALL state a count in one fixed form for every number.

#### Scenario: One of a thing is one

- **WHEN** a screen states a count of 1 рахунок, 1 категорія, 1 джерело and 1 транзакція
- **THEN** it reads «1 рахунок», «1 категорія», «1 джерело» and «1 транзакція»

#### Scenario: Two to four take the few-form

- **WHEN** a screen states a count of 2 рахунки, 3 категорії and 4 джерела
- **THEN** it reads «2 рахунки», «3 категорії» and «4 джерела»

#### Scenario: The teens take the many-form

- **WHEN** a screen states a count of 11 транзакцій and 21 транзакція
- **THEN** it reads «11 транзакцій» and «21 транзакція»

### Requirement: The tab bar never cuts off a name, and marks the open tab by tone

Every tab name the bar draws SHALL be drawn whole — never truncated, never ended in an ellipsis —
on the emulator profile `.claude/rules/android.md` names as the one every smoke pass runs on. This
SHALL hold for «Налаштування», the longest of the five. A name SHALL NOT be shortened, abbreviated
or renamed to make it fit: the bar draws its labels at whatever size shows the longest of the five
whole.

*How many* of the five names the bar draws at once is the platform's own decision and is not
specified here — on Android a five-tab bar names the open tab and leaves the rest to their icons.
The requirement is about what is drawn, not about how much of it is.

The tab the owner is on SHALL be marked by tone and not by the accent colour: its icon and its name
SHALL carry the app's own foreground colour and the other four icons the app's own muted one, the
two tones the rest of the app already uses for a thing in hand against a thing beside it. The
accent SHALL NOT appear in the tab bar — it is the app's «this is the action» colour, and spending
it on navigation would leave it meaning nothing.

#### Scenario: The longest tab name is drawn whole

- **WHEN** the owner is on «Налаштування» on that profile
- **THEN** «Налаштування» is drawn whole under its icon, with no ellipsis

#### Scenario: The open tab is the brighter of the two tones

- **WHEN** the owner is on «Головний»
- **THEN** «Головний»'s icon and its name are drawn in the app's foreground tone and the other four
  icons in its muted tone, and no tab carries the accent colour

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
of a розстрочка and of a зобов'язання; «Категорія», «Переказ на» and «Джерело» of a правило; the категорія a
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
