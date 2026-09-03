## MODIFIED Requirements

### Requirement: A репорт про помилку is what the owner wrote plus what the app attaches

A репорт про помилку SHALL hold what the owner wrote — what they did, what happened, and what
they expected, the first of which is required and the rest optional — and what the app attaches
by itself at the moment the репорт is created: the app's version and build (commit and whether
the working tree was clean), the platform and its version, the device model, the number of
migrations applied, the route of the screen the репорт was opened from, the moment, the entire
журнал at that moment, the failure or crash that prompted it where one did, and counts of what
the phone holds — рахунки, транзакції, категорії, правила, чернетки — as numbers only. The app
SHALL create the репорт with all of that even when the owner wrote a single line.

A репорт SHALL additionally record **how it was opened** — from the screen itself, from a failure
dialog, from the crash fallback, or from «Репорти про помилки» — and **the route trail**: the
routes of the screens the owner passed through before it, newest last, taken from the журнал and
holding nothing but routes. WHERE a скріншот was to be taken and could not be, the репорт SHALL
also hold **why** in Ukrainian, as a value it keeps rather than a message that was shown once: the
saved репорт is read again after a restart, and a section that said «не вдалося» without saying
what failed would be the one line of the репорт that cannot be reproduced. All three SHALL be
attached by the app; none SHALL be asked of the owner.
Where the репорт was opened from the screen itself, the app SHALL write the required «Що я робив»
line itself, naming that route and how the репорт was started.

#### Scenario: A репорт from a failure dialog carries that failure

- **WHEN** a save is refused, the owner chooses to report it and writes «натиснув Записати»
- **THEN** a репорт exists whose prompting failure is that refusal, whose screen is the route the
  dialog was shown on, and whose журнал holds that refusal's entry as its last failure entry, and
  which records that it was opened from a failure dialog

#### Scenario: A репорт from a crash carries the crash

- **WHEN** a screen crashes with an uncaught error and the owner reports it from the fallback
- **THEN** the репорт's prompting failure is that crash, with its message and stack, the журнал
  attached holds the crash's entry as its last crash entry, and the репорт records that it was
  opened from the crash fallback

#### Scenario: A репорт filed on its own carries the context anyway

- **WHEN** the owner opens «Репорти про помилки» and files a репорт with nothing prompting it
- **THEN** the репорт has no prompting failure and still carries the build, the device, the
  route, the moment, the whole журнал and the counts, and records that it was opened from the
  section

#### Scenario: A репорт filed from the screen writes its own «Що я робив»

- **WHEN** a репорт is opened from the screen itself on a рахунок's рухи and saved with one line
- **THEN** the репорт records that it was opened from the screen, its «Що я робив» names that
  route, and the owner typed none of it

#### Scenario: The route trail is routes and nothing else

- **WHEN** the owner opens Місяць, then Рахунки, then one рахунок, and files a репорт there
- **THEN** the репорт's route trail ends with those routes in that order, and holds no сума, no
  назва, no опис and nothing the owner typed

#### Scenario: A репорт without the required line is refused

- **WHEN** the owner saves a репорт leaving «Що я робив» empty
- **THEN** nothing is stored and the owner is told in Ukrainian that this line is needed

### Requirement: Screenshots are attached to a saved репорт and kept with it

A saved репорт SHALL accept screenshots the owner picks from the phone's own files, one at a
time, each kept on the phone beside the репорт in the image format it was picked in. Removing a
репорт SHALL remove its screenshots. A picker the owner backs out of SHALL attach nothing and
SHALL not be reported as a failure.

A скріншот SHALL additionally be capable of being **captured by the app itself at the moment a
репорт is created**, kept beside that репорт in exactly the same way and indistinguishable from a
picked one afterwards. A скріншот captured for a репорт that is never stored SHALL be removed from
the phone; nothing captured SHALL outlive the репорт it was captured for.

#### Scenario: A picked image is kept with the репорт

- **WHEN** the owner adds a screenshot to a saved репорт and picks an image
- **THEN** the репорт lists one screenshot, and the image is on the phone beside the репорт

#### Scenario: Backing out of the picker attaches nothing

- **WHEN** the owner adds a screenshot and dismisses the picker without picking
- **THEN** the репорт lists the same screenshots as before and no failure is shown

#### Scenario: A captured скріншот is kept like a picked one

- **WHEN** a репорт is created with a скріншот the app captured, and the owner then adds a picked
  one
- **THEN** the репорт lists two screenshots, both on the phone beside it, and both are carried by
  the file that is handed over

#### Scenario: A скріншот captured for a репорт that was never stored is removed

- **WHEN** a скріншот is captured for a репорт the owner then abandons
- **THEN** no репорт exists and that скріншот is not on the phone

#### Scenario: Removing the репорт removes its screenshots

- **WHEN** the owner removes a репорт that holds two screenshots
- **THEN** neither the репорт nor its screenshots remain on the phone

### Requirement: A репорт is rendered as one self-contained text

The app SHALL render a репорт as one text, deterministic for the same репорт, and that text SHALL
contain every value the репорт holds, so what the owner reads on the screen is what would leave.
Only the file that is handed over SHALL additionally carry every скріншот embedded as image data;
what is shown and what is copied SHALL name the screenshots without their data.

The text SHALL be laid out for the two readers it has — the owner, who reads it on the phone before
it leaves, and whoever will reproduce the bug at the laptop — with its sections in this order and
under these headings, each naming its subject in English and then in Ukrainian:

1. **Bug report** — the title.
2. **User observation** — what the owner wrote about what happened, kept separate from «Що я
   робив», which on a репорт filed from the screen is the app's line and not theirs.
3. **Expected behaviour** — what the owner wrote about what should have happened.
4. **Context** — the moment, how the репорт was opened, and whether it has been handed over and
   when. The screenshots are named in §9 and not here.
5. **App/build/device** — the version, the commit and whether the tree was dirty, when it was
   built, the platform and its version, the device model and the number of migrations applied.
6. **Current route** — the route of the screen the репорт was filed from.
7. **Recent journal** — the whole журнал, one line per entry, in order.
8. **Relevant failures/errors** — the prompting failure or crash whole, with its stack readable as
   a stack, followed by every failure and crash entry the журнал holds.
9. **Screenshots** — each скріншот by name, and in the handed-over file its image data with it; a
   скріншот the app could not capture SHALL be named here as missing, with the reason the репорт
   stored, so the same text is rendered from the same репорт after a restart.
10. **Reproduction context** — the route trail, the counts of what the phone holds, and a plain
    statement of what the app does not collect.

A section the репорт has nothing for SHALL still appear and SHALL say so, rather than being
omitted.

#### Scenario: The rendered text is the репорт

- **WHEN** a репорт with a prompting failure, ten journal entries and one скріншот is rendered
- **THEN** the text carries the owner's lines, the build, the device, the failure with its stack,
  the counts, the route trail and all ten entries in order, and the handed-over file additionally
  carries the скріншот's image data

#### Scenario: The sections are the ones the reader looks for

- **WHEN** any репорт is rendered
- **THEN** the text holds the headings «Bug report», «User observation», «Expected behaviour»,
  «Context», «App/build/device», «Current route», «Recent journal», «Relevant failures/errors»,
  «Screenshots» and «Reproduction context», in that order, each also naming its subject in
  Ukrainian

#### Scenario: An empty section says it is empty

- **WHEN** a репорт with no prompting failure and no скріншот is rendered
- **THEN** «Relevant failures/errors» and «Screenshots» are both present and each says in Ukrainian
  that there is nothing, and no section is missing

#### Scenario: A скріншот that could not be taken is named

- **WHEN** a репорт was filed on a screen the app could not capture
- **THEN** «Screenshots» says in Ukrainian that the скріншот could not be taken and why

#### Scenario: Rendering is deterministic

- **WHEN** the same репорт is rendered twice
- **THEN** the two texts are identical

### Requirement: A репорт leaves the phone only by the owner's hand

A репорт SHALL be stored on the phone and SHALL leave it only when the owner hands it over
(«Передати») to an app they pick in the phone's own chooser, as one file, or copies its text to
the clipboard. The app SHALL make no connection for it, SHALL send nothing on its own, and SHALL
claim afterwards only that the file was handed to the system. The copied text SHALL be the
rendered text without the screenshot data.

WHERE the репорт holds at least one скріншот, the hand-over SHALL pass through the confirmation
the скріншот's own requirement below demands, and the one file SHALL be given to the chooser only
after the owner has confirmed it. Copying SHALL be unaffected, since the copied text carries no
image data.

#### Scenario: Handing over gives the system one file

- **WHEN** the owner hands over a репорт with one screenshot and confirms the скріншот warning
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

## ADDED Requirements

### Requirement: A скріншот is the one thing a репорт carries that can show the owner's money

The rules about what a репорт may carry are unchanged for everything the app writes: no сума, no
назва, no опис, no merchant text, no text of a bank's notification, no monobank token and no бекап
data, and the one quotation allowed is the app's own refusal exactly as the owner was shown it.

A скріншот is outside that guarantee by its nature: it shows whatever was on the screen, which on
this app is usually money. The app SHALL therefore NOT read, interpret, redact, blur or transmit a
скріншот, and SHALL, before a репорт holding one is handed over, show the скріншот to the owner
together with a statement in Ukrainian that it carries whatever was on the screen — суми and назви
included — and hand nothing over until the owner has confirmed. A репорт SHALL still leave the
phone only by the owner's hand, as one file, exactly as it does today.

#### Scenario: The скріншот is seen before it can leave

- **WHEN** the owner hands over a репорт that holds a скріншот
- **THEN** the скріншот is shown to them with that statement in Ukrainian first, and nothing is
  handed over until they confirm

#### Scenario: Backing out of the warning hands over nothing

- **WHEN** the owner is shown the скріншот and the warning and backs out
- **THEN** nothing is handed to the system and the репорт is unchanged

#### Scenario: A репорт with no скріншот is not warned about

- **WHEN** the owner hands over a репорт holding no скріншот
- **THEN** the hand-over proceeds as it does today, with no warning about screenshots

#### Scenario: The app never looks inside a скріншот

- **WHEN** a репорт holding a скріншот is stored, read, rendered and handed over
- **THEN** the app has derived nothing from the скріншот's pixels, and its text says nothing about
  what the скріншот shows
