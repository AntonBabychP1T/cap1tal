# bug-report Specification

## Purpose

The репорт про помилку and the журнал: how the app remembers what it was doing, what the owner
writes down when something went wrong, what the app attaches by itself, and how the whole thing
leaves the phone only by the owner's hand — so a bug met on the phone can be reproduced and fixed
from one file in a chat.

## Requirements

### Requirement: The журнал records what the app did, bounded, and never the owner's money

The app SHALL keep a журнал: an ordered record, each entry with the moment it happened, of every
screen opened (by its route), every action that failed with the text the owner was shown, every
сповіщення про збій raised or cleared, and every crash with its message and stack. The журнал
SHALL hold at most the most recent 500 entries; adding one beyond that SHALL drop the oldest.
An entry SHALL carry nothing of the owner's data beyond the app's own refusal or error text,
exactly as the owner was shown it: it SHALL never hold a сума, a назва, an опис or the text of a
bank's notification of its own making, and never the monobank token under any circumstance — an
action is named by its kind, a screen by its route, and a failure by the app's own text. Where
that text quotes what the owner typed into the refused field, the quote is in that one entry and
nowhere else.

#### Scenario: A screen opening is an entry

- **WHEN** the owner opens «Місяць» and then «Рахунки»
- **THEN** the журнал ends with two entries, in that order, naming those two routes, each with the
  moment it happened

#### Scenario: A refused save is an entry with the refusal text

- **WHEN** recording a витрата is refused because no рахунок was chosen
- **THEN** the журнал gains a failure entry naming the recording action and carrying the exact
  Ukrainian refusal the owner saw

#### Scenario: A сповіщення про збій is an entry even when nothing is posted

- **WHEN** an action fails a second time while its сповіщення про збій is already outstanding
- **THEN** the журнал gains an entry naming that action's kind, and no second notification is
  posted

#### Scenario: Taking a сповіщення back is an entry

- **WHEN** the action a сповіщення про збій stood for succeeds and the сповіщення is cleared
- **THEN** the журнал gains an entry naming that action's kind

#### Scenario: The журнал is bounded

- **WHEN** 500 entries are in the журнал and one more is added
- **THEN** the журнал holds 500 entries, the oldest is gone and the newest is the one just added

#### Scenario: A collection failure carries no bank text

- **WHEN** collecting captured bank notifications fails while a captured notification's text is
  on the phone
- **THEN** the журнал gains an entry naming the collection, and no entry contains any part of
  that notification's text

#### Scenario: The journal carries no money

- **WHEN** the owner records транзакції, renames a рахунок and sets a ліміт, one rename is
  refused because that назва already exists, and the журнал is then read whole
- **THEN** the refused назва appears only inside that refusal's entry, and no other entry
  contains any сума, any назва or any опис the owner typed

### Requirement: A репорт про помилку is what the owner wrote plus what the app attaches

A репорт про помилку SHALL hold what the owner wrote — what they did, what happened, and what
they expected, the first of which is required and the rest optional — and what the app attaches
by itself at the moment the репорт is created: the app's version and build (commit and whether
the working tree was clean), the platform and its version, the device model, the number of
migrations applied, the route of the screen the репорт was opened from, the moment, the entire
журнал at that moment, the failure or crash that prompted it where one did, and counts of what
the phone holds — рахунки, транзакції, категорії, правила, чернетки — as numbers only. The app
SHALL create the репорт with all of that even when the owner wrote a single line.

#### Scenario: A репорт from a failure dialog carries that failure

- **WHEN** a save is refused, the owner chooses to report it and writes «натиснув Записати»
- **THEN** a репорт exists whose prompting failure is that refusal, whose screen is the route the
  dialog was shown on, and whose журнал holds that refusal's entry as its last failure entry

#### Scenario: A репорт from a crash carries the crash

- **WHEN** a screen crashes with an uncaught error and the owner reports it from the fallback
- **THEN** the репорт's prompting failure is that crash, with its message and stack, and the
  журнал attached holds the crash's entry as its last crash entry

#### Scenario: A репорт filed on its own carries the context anyway

- **WHEN** the owner opens «Репорти про помилки» and files a репорт with nothing prompting it
- **THEN** the репорт has no prompting failure and still carries the build, the device, the
  route, the moment, the whole журнал and the counts

#### Scenario: A репорт without the required line is refused

- **WHEN** the owner saves a репорт leaving «Що я робив» empty
- **THEN** nothing is stored and the owner is told in Ukrainian that this line is needed

### Requirement: Screenshots are attached to a saved репорт and kept with it

A saved репорт SHALL accept screenshots the owner picks from the phone's own files, one at a
time, each kept on the phone beside the репорт in the image format it was picked in. Removing a
репорт SHALL remove its screenshots. A picker the owner backs out of SHALL attach nothing and
SHALL not be reported as a failure.

#### Scenario: A picked image is kept with the репорт

- **WHEN** the owner adds a screenshot to a saved репорт and picks an image
- **THEN** the репорт lists one screenshot, and the image is on the phone beside the репорт

#### Scenario: Backing out of the picker attaches nothing

- **WHEN** the owner adds a screenshot and dismisses the picker without picking
- **THEN** the репорт lists the same screenshots as before and no failure is shown

#### Scenario: Removing the репорт removes its screenshots

- **WHEN** the owner removes a репорт that holds two screenshots
- **THEN** neither the репорт nor its screenshots remain on the phone

### Requirement: A репорт is rendered as one self-contained text

The app SHALL render a репорт as one text, deterministic for the same репорт, in Ukrainian
headings: what the owner wrote, the build and device, the prompting failure with its stack, the
counts, the журнал as one line per entry, and — only in the file that is handed over — every
screenshot embedded as image data. The text SHALL contain every value the репорт holds, so what
the owner reads on the screen is what would leave.

#### Scenario: The rendered text is the репорт

- **WHEN** a репорт with a prompting failure, ten journal entries and one screenshot is rendered
- **THEN** the text carries the owner's lines, the build, the device, the failure with its stack,
  the counts and all ten entries in order, and the handed-over file additionally carries the
  screenshot's image data

#### Scenario: Rendering is deterministic

- **WHEN** the same репорт is rendered twice
- **THEN** the two texts are identical

### Requirement: A репорт leaves the phone only by the owner's hand

A репорт SHALL be stored on the phone and SHALL leave it only when the owner hands it over
(«Передати») to an app they pick in the phone's own chooser, as one file, or copies its text to
the clipboard. The app SHALL make no connection for it, SHALL send nothing on its own, and SHALL
claim afterwards only that the file was handed to the system. The copied text SHALL be the
rendered text without the screenshot data.

#### Scenario: Handing over gives the system one file

- **WHEN** the owner hands over a репорт with one screenshot
- **THEN** exactly one file, holding the rendered text with the screenshot embedded, is given to
  the phone's chooser, and the репорт shows it was handed over and when

#### Scenario: Nothing leaves without the owner

- **WHEN** a репорт has been saved and the app has been used for a day
- **THEN** no file has been handed to the system and nothing has been sent anywhere

#### Scenario: A phone without a chooser is told so

- **WHEN** the owner hands over a репорт on a build that has no chooser
- **THEN** nothing leaves, the owner is told in Ukrainian that handing over is unavailable here,
  and copying the text is still offered

#### Scenario: Copying gives the text without image data

- **WHEN** the owner copies a репорт with two screenshots
- **THEN** the clipboard holds the rendered text, names two screenshots, and carries no image
  data

### Requirement: Репорти and the журнал are never in a бекап

A бекап SHALL contain neither the репорти, their screenshots nor the журнал, and a відновлення
SHALL leave all three exactly as they were on the phone.

#### Scenario: A бекап carries no репорт

- **WHEN** a бекап is made on a phone holding two репорти and a full журнал
- **THEN** the бекап contains none of the репорти, their text, their screenshots or any journal
  entry

#### Scenario: A restore leaves them in place

- **WHEN** a бекап is restored onto a phone holding two репорти and a журнал of 300 entries
- **THEN** the same two репорти and the same 300 entries are still there afterwards
