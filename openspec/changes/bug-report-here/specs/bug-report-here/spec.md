## Purpose

Filing a репорт про помилку from the screen the problem is on, without leaving it: what the owner
does to start one, what the app captures before it draws anything of its own, what it asks them for
and what it fills in by itself, and what it must leave behind when they change their mind.

## ADDED Requirements

### Requirement: A репорт can be started from any screen without leaving it

From any screen of the app the owner SHALL be able to start a репорт про помилку about that screen
by a gesture that does not require them to navigate anywhere first: **two fingers held still for
about 1.2 seconds**. The gesture SHALL work on every screen the app can show, including a screen
that is scrolled part-way through a long list, and SHALL be available whether or not anything has
failed.

The app SHALL additionally offer the same thing as a **visible handle** drawn above every screen,
which the owner turns on and off and which SHALL be off until they do. Activating the handle SHALL
do exactly what the gesture does, by the same path and with the same result.

The owner SHALL be able to turn the gesture off; while it is off the gesture SHALL start nothing
and every other way of filing a репорт SHALL keep working.

#### Scenario: The gesture works on the screen the owner is on

- **WHEN** the owner holds two fingers still on Головний for the required time
- **THEN** a репорт про помилку is started for Головний, without any screen being left first

#### Scenario: The gesture works inside a form

- **WHEN** the owner is editing a транзакція and holds two fingers still on that screen
- **THEN** a репорт is started whose screen is that транзакція's route, and what they had typed
  into the form is still there afterwards

#### Scenario: The gesture works part-way down a long list

- **WHEN** the owner has scrolled a long list of транзакції and then holds two fingers still on it
- **THEN** a репорт is started for that screen, and the list is still scrolled where it was

#### Scenario: The handle does the same thing

- **WHEN** the handle is turned on and the owner activates it on Рахунки
- **THEN** a репорт is started for Рахунки exactly as the gesture would have started it

#### Scenario: The handle is not there until it is turned on

- **WHEN** the owner has never turned the handle on
- **THEN** no handle is drawn over any screen, and the gesture still works

#### Scenario: The gesture can be turned off

- **WHEN** the owner turns the gesture off and then holds two fingers still on Головний
- **THEN** nothing is started, and «Повідомити про помилку» in Налаштування still files a репорт

### Requirement: Ordinary use never starts a репорт

The gesture SHALL NOT be activated by anything the owner does in ordinary use of the app: a tap, a
double tap, a long press with one finger, a scroll, a swipe, a two-finger touch that moves, or a
two-finger touch released before the required time. Starting a репорт SHALL require **two fingers
down at once**, held for **at least the required time**, and moved **no further than a short
distance** during it; any of the three failing SHALL leave the screen exactly as it was.

#### Scenario: A tap is a tap

- **WHEN** the owner taps a рахунок on Рахунки
- **THEN** that рахунок's рухи open and no репорт is started

#### Scenario: A scroll is a scroll

- **WHEN** the owner scrolls a long list with one finger and then with two
- **THEN** the list scrolls and no репорт is started

#### Scenario: A one-finger hold is not the gesture

- **WHEN** the owner holds one finger still on a screen for twice the required time
- **THEN** no репорт is started

#### Scenario: Two fingers released too early start nothing

- **WHEN** the owner puts two fingers down and lifts them well before the required time
- **THEN** no репорт is started

#### Scenario: Two fingers that travel start nothing

- **WHEN** the owner puts two fingers down and drags them across the screen for longer than the
  required time
- **THEN** no репорт is started

### Requirement: The screen is captured before the app draws anything of its own

WHEN a репорт is started this way, the app SHALL capture the screen as one скріншот **before** it
shows the sheet, the handle's pressed state or any other change of its own, and SHALL show the
sheet only once that capture has settled. The скріншот SHALL therefore show the screen the owner
was looking at when they asked, with nothing of the репорт itself in it.

The captured скріншот SHALL be attached to the репорт by the app; the owner SHALL NOT have to find
it or add it by hand.

#### Scenario: The скріншот is the screen, not the sheet

- **WHEN** the owner starts a репорт from a транзакція's screen and the sheet opens
- **THEN** the репорт's скріншот shows that транзакція's screen and shows no part of the sheet, the
  handle or anything else the репорт drew

#### Scenario: The скріншот is already attached

- **WHEN** the owner saves a репорт started this way without doing anything about screenshots
- **THEN** the saved репорт carries that one скріншот, kept on the phone beside it

#### Scenario: A second activation while the first is still working starts nothing

- **WHEN** the owner activates the gesture again while a capture is still in flight
- **THEN** no second capture is taken, no second sheet is opened, and the first one continues
  undisturbed

#### Scenario: The sheet waits for the capture

- **WHEN** the capture takes a moment
- **THEN** the sheet is shown only after it has finished, and nothing of the app's own is drawn
  over the screen in the meantime

### Requirement: The sheet asks one question and fills the rest in itself

The sheet SHALL ask **«Що не так?»** (required) and **«Чого я очікував?»** (optional), in Ukrainian,
and SHALL ask nothing else. It SHALL show the captured скріншот and the screen the репорт is about.

The app SHALL fill in the rest by itself, from what it already keeps: the route of that screen, the
moment, the version and build, the platform and its version, the device model, the number of
migrations applied, the whole журнал, the counts of what the phone holds, and the fact that this
репорт was started from the screen rather than from a dialog, a crash or the section. The owner
SHALL NOT be asked to write what they were doing — the route, the скріншот and the журнал stand for
it, and the line the репорт stores for it SHALL be written by the app from the route.

Saving with «Що не так?» empty SHALL be refused in Ukrainian and SHALL store nothing.

#### Scenario: One line is enough

- **WHEN** the owner writes «підсумок за місяць від'ємний» and saves
- **THEN** a репорт exists carrying that line, the route, the moment, the build, the device, the
  migrations count, the журнал, the counts and the скріншот, without anything else being asked

#### Scenario: The empty question is refused

- **WHEN** the owner saves with «Що не так?» empty
- **THEN** nothing is stored, no скріншот is kept beside any репорт, and the owner is told in
  Ukrainian that this line is needed

#### Scenario: What the owner was doing is written by the app

- **WHEN** a репорт is started from a рахунок's рухи and saved
- **THEN** the репорт's «Що я робив» names that route and says the репорт was filed from the screen
  itself, and the owner was never asked to type it

### Requirement: The sheet offers saving, saving with a hand-over, and changing one's mind

The sheet SHALL offer exactly three actions: **«Зберегти»**, **«Зберегти й передати»** and
**«Скасувати»**.

«Зберегти» SHALL store the репорт with its скріншот and close the sheet, returning the owner to the
screen they were on, unchanged. «Зберегти й передати» SHALL do the same and then hand the репорт
over as **one file** — the same one file «Передати» hands over from a saved репорт, with the
скріншот embedded in it — after the owner has been shown the скріншот and told what it may carry.
«Скасувати» SHALL store nothing.

#### Scenario: Saving returns to the screen

- **WHEN** the owner writes one line and chooses «Зберегти»
- **THEN** the репорт is stored, the sheet closes and the owner is back on the same screen with it
  in the same state

#### Scenario: Saving and handing over gives the system one file

- **WHEN** the owner chooses «Зберегти й передати», confirms after being shown the скріншот, and
  the chooser opens and closes
- **THEN** the репорт is stored, exactly one file holding the whole rendered text with the скріншот
  embedded is given to the phone's chooser, and the репорт records that it was handed over

#### Scenario: A hand-over that cannot happen still leaves the репорт stored

- **WHEN** the owner chooses «Зберегти й передати» and the phone offers no chooser, or the file
  could not be prepared
- **THEN** the репорт is stored with its скріншот all the same, the owner is told in Ukrainian
  which of the two happened, and the репорт records that it has not been handed over

#### Scenario: A stored репорт is still there after a restart

- **WHEN** a репорт filed this way is stored and the app is closed and opened again
- **THEN** the репорт is in «Репорти про помилки» with its line, its route, its скріншот and
  everything the app attached

### Requirement: Changing one's mind leaves nothing behind

WHEN the owner chooses «Скасувати», or leaves the sheet by the device's back gesture, the app SHALL
store no репорт, SHALL keep no скріншот, and SHALL leave no captured file anywhere on the phone.

A refused save is not changing one's mind. WHEN a save is refused the sheet SHALL stay open with
what the owner typed and with the captured скріншот still attached to it, so that the next attempt
carries the picture the first one was refused with. The captured file SHALL be discarded exactly
once, when the sheet closes without a stored репорт; a captured file SHALL NOT outlive the sheet it
was taken for.

A capture that outlived the app itself — the process died between the capture and the save — SHALL
be gone by the end of the next launch, so that a phone that crashed mid-репорт accumulates nothing.

#### Scenario: Cancelling stores nothing and keeps nothing

- **WHEN** the owner starts a репорт, types two lines and chooses «Скасувати»
- **THEN** no репорт exists, no скріншот is kept, and the file captured for it is gone from the
  phone

#### Scenario: The back gesture is the same as cancelling

- **WHEN** the owner starts a репорт and uses the device's back gesture
- **THEN** the sheet closes, no репорт exists and no captured file is left behind

#### Scenario: A refused save keeps the скріншот for the next attempt

- **WHEN** the owner saves with «Що не так?» empty, is refused, then writes one line and saves
- **THEN** the sheet stayed open with the скріншот throughout, and the stored репорт carries that
  same скріншот — the one taken of the screen the owner was complaining about

#### Scenario: A capture that outlived the app is gone at the next launch

- **WHEN** the app is killed between the capture and the save, and is opened again
- **THEN** no репорт exists from that attempt and the phone holds no captured file from it

#### Scenario: Ten cancelled reports leave ten nothings

- **WHEN** the owner starts and cancels a репорт ten times
- **THEN** «Репорти про помилки» is as empty as before and the phone holds no captured file from
  any of them

### Requirement: A capture that fails still lets the репорт be filed

WHEN the screen cannot be captured — the platform offers no capture, or the capture failed — the
app SHALL still open the sheet and SHALL still file a репорт with everything else it attaches. It
SHALL say in Ukrainian, in the sheet and in the репорт itself, that the скріншот could not be taken
and why. A failed capture SHALL NOT refuse the репорт and SHALL NOT be silent.

#### Scenario: No capture, still a репорт

- **WHEN** the capture fails and the owner writes one line and saves
- **THEN** a репорт exists with the route, the build, the device, the журнал and the counts, with
  no скріншот, and the репорт says in Ukrainian why there is none

#### Scenario: The owner is told before they save

- **WHEN** the capture fails
- **THEN** the sheet says in Ukrainian that the скріншот could not be taken, and still offers all
  three actions

### Requirement: Nothing is collected that the репорт does not already collect

Filing a репорт this way SHALL collect nothing about the owner's money that a репорт does not
collect today. The line the app writes for «Що я робив» SHALL name only the route and how the
репорт was started. The route trail the репорт carries SHALL be routes from the журнал and nothing
else. No сума, no назва of a рахунок or категорія, no опис, no merchant text, no text of a bank's
notification, no monobank token and no бекап data SHALL be gathered by this path.

The скріншот is the one thing that can show what the app was displaying. The app SHALL NOT read,
interpret, redact or transmit it; it SHALL show it to the owner before any hand-over and SHALL say
plainly that it carries whatever was on the screen.

#### Scenario: The diagnostic text carries no money

- **WHEN** a репорт is filed by the gesture from a screen full of суми and назви рахунків, and its
  whole text is read
- **THEN** the text contains no сума, no назва of a рахунок or категорія, no опис and no bank text
  beyond what the app's own refusals in the журнал already quote

#### Scenario: The скріншот is shown and named before it can leave

- **WHEN** the owner chooses «Зберегти й передати»
- **THEN** the скріншот is shown to them together with a sentence in Ukrainian saying it carries
  whatever was on the screen, суми and назви included, and nothing is handed over until they
  confirm

#### Scenario: Nothing leaves on its own

- **WHEN** a репорт is filed by the gesture and the app is used for a day
- **THEN** nothing has been sent anywhere, no connection has been made for it, and no file has been
  handed to the system
