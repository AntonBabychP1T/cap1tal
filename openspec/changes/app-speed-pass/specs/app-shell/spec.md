## ADDED Requirements

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
