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
сповіщення про збій raised or cleared, every crash with its message and stack, every request that
left the phone, every operation the app performed, and what the device did to it. An entry MAY
additionally carry the mark tying it to one operation, how long the thing it names took, and the
counts that thing measured; every count SHALL be a number, so no text of the owner's can enter
one. The журнал SHALL hold at most the most recent 2000 entries; adding one beyond that SHALL drop
the oldest. An entry SHALL carry nothing of the owner's data beyond the app's own refusal or error
text, exactly as the owner was shown it, and the identifier of a monobank account a request or an
operation was about: it SHALL never hold a сума, a назва, an опис or the text of a bank's
notification of its own making, and never the monobank token under any circumstance — an action is
named by its kind, a screen by its route, and a failure by the app's own text. Where that text
quotes what the owner typed into the refused field, the quote is in that one entry and nowhere
else.

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

- **WHEN** 2000 entries are in the журнал and one more is added
- **THEN** the журнал holds 2000 entries, the oldest is gone and the newest is the one just added

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

#### Scenario: An entry written before this build reads back unchanged

- **WHEN** the журнал holds entries stored by an earlier build, which carry no mark, no duration
  and no counts
- **THEN** each of those entries reads back with its moment, kind, name and detail exactly as
  before, and with none of the three

### Requirement: The журнал records every request that leaves the phone

The app SHALL add an entry to the журнал for every outbound request it makes through its own
request ports, at the moment the answer comes back or the request gives up. The entry SHALL carry
the method, the host and the shape of the path asked for, what came back — a status, or the app's
own words for a request that never got one — and how long the request took. Those own words SHALL
be the app's, chosen from what it distinguishes, and never the text of a caught error: a platform's
rejection may quote the whole URL it was given, and the shaping the path gets would be undone by
repeating it. It SHALL carry no
request header, no request body, no response body, and under no circumstance the monobank token or
any other secret. The path of a request to the monobank personal API SHALL be kept whole, including
the identifier of the рахунок it is about; the path of a request to any other host SHALL keep only
its endpoint shape, with every identifier in it replaced by a placeholder, and no query string is
kept for any host. Where the app reaches a service through a library rather than through a request
port — the Google sign-in exchange — the app SHALL record that reach as an operation instead, under
the requirement below.

#### Scenario: A statement request is an entry

- **WHEN** a sync asks the bank for one рахунок's statement window and the bank answers
- **THEN** the журнал gains an entry naming that request's method, host and whole path — the
  рахунок's identifier in it — the status that came back and how long it took

#### Scenario: A refused request is an entry with what was refused

- **WHEN** the bank answers a request with «too many requests»
- **THEN** the журнал gains an entry for that request carrying that status, and the run's own
  handling of it is unchanged

#### Scenario: A request that never got an answer is an entry too

- **WHEN** a request is given up on because it timed out
- **THEN** the журнал gains an entry for it saying so, with how long it waited

#### Scenario: A path that is not the bank's keeps only its shape

- **WHEN** the app fetches one бекап file from the owner's Drive
- **THEN** the журнал gains an entry naming the method, the host and the endpoint, and the entry
  contains neither that file's identifier nor any query string

#### Scenario: A request whose path is the owner's business is not described by its path

- **WHEN** the app looks a фіскальний чек up by its реквізити
- **THEN** the журнал gains an entry naming the method, the host and the endpoint with the
  реквізити replaced, and no part of the реквізити appears anywhere in the журнал

#### Scenario: No request entry carries the token

- **WHEN** the owner's token is kept, a sync makes every request a run makes, and the журнал is
  then read whole
- **THEN** no entry contains any part of that token, any request header or any response body

### Requirement: The журнал records the device's own half

The app SHALL add entries to the журнал for what the device does to it, as far as the device tells
it: the background sync task being registered or refused registration, each chance the system
gives it and what that chance came to, whether the app was in front of the owner when it ran, the
app moving between the foreground and the background, and the state of a permission the app
depends on — notification access, the notification listener's connection — whenever the app reads
it. Each SHALL name the fact by the device's own enumerated answer, never by a free text the app
composed.

#### Scenario: A background chance is an entry

- **WHEN** the system gives the app a chance to sync in the background and the run ends
- **THEN** the журнал holds an entry naming that chance, whether the app was in front of the
  owner, and what the run came to

#### Scenario: A refused registration is an entry

- **WHEN** the background sync task cannot be registered because the system does not allow it
- **THEN** the журнал holds an entry naming the registration and the device's answer

#### Scenario: A withdrawn permission is an entry

- **WHEN** the app reads the notification access permission and finds it no longer granted
- **THEN** the журнал holds an entry naming that permission and that state

#### Scenario: A permission that has not changed adds nothing

- **WHEN** the app reads the notification access permission four times and finds it granted each
  time
- **THEN** the журнал holds one entry for it, not four

#### Scenario: The listener's connection is an entry

- **WHEN** the app reads whether the notification listener is connected and finds that it is not
- **THEN** the журнал holds an entry naming the listener and that state

#### Scenario: Leaving and returning are entries

- **WHEN** the owner sends the app to the background and opens it again
- **THEN** the журнал holds an entry for each of those two moments

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

«Whether the working tree was clean» SHALL be answered about the sources the build is made from
and about nothing else: a file that is neither tracked by git nor part of what the build reads
SHALL NOT make a build report itself dirty. A build made in a working copy whose only difference
from the commit is such a file SHALL report that commit as clean.

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

#### Scenario: A build from a clean working copy is not called dirty

- **WHEN** the app is built in a working copy that matches its commit exactly except for files
  git does not track and the build never reads
- **THEN** the репорт names that commit and does not say the tree was dirty

#### Scenario: A build from an edited source is called dirty

- **WHEN** the app is built in a working copy holding an uncommitted edit to a file the build reads
- **THEN** the репорт names the commit and says the tree was dirty

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
2. **Summary** — how many requests were made, how many of them did not succeed, the slowest of
   them, how many sync runs the журнал holds and what the last one came to.
3. **User observation** — what the owner wrote about what happened, kept separate from «Що я
   робив», which on a репорт filed from the screen is the app's line and not theirs.
4. **Expected behaviour** — what the owner wrote about what should have happened.
5. **Context** — the moment, how the репорт was opened, and whether it has been handed over and
   when. The screenshots are named in «Screenshots» and not here.
6. **App/build/device** — the version, the commit and whether the tree was dirty, when it was
   built, the platform and its version, the device model and the number of migrations applied.
7. **Current route** — the route of the screen the репорт was filed from.
8. **Recent journal** — the whole журнал, one line per entry, in order; consecutive entries for one
   and the same screen MAY be rendered as one line carrying how many there were, since that loses
   no value the репорт holds.
9. **Relevant failures/errors** — the prompting failure or crash whole, with its stack readable as
   a stack, followed by every failure and crash entry the журнал holds.
10. **Network** — the requests that left the phone, each with its status, its duration and what it
    carried, in the order they were made.
11. **What the app did** — what the app did as a timeline, one operation at a time, with the
    requests that belong to it among its entries.
12. **Screenshots** — each скріншот by name, and in the handed-over file its image data with it; a
    скріншот the app could not capture SHALL be named here as missing, with the reason the репорт
    stored, so the same text is rendered from the same репорт after a restart.
13. **Reproduction context** — the route trail, the counts of what the phone holds, and a plain
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

#### Scenario: The summary counts what the журнал holds

- **WHEN** a репорт is rendered whose журнал holds twelve requests, two of which failed, and two
  sync runs of which the last ended «недоступно»
- **THEN** the text opens with a summary stating those numbers, which request took longest, and
  that the last run ended «недоступно»

#### Scenario: The requests are a section of their own

- **WHEN** a репорт whose журнал holds requests is rendered
- **THEN** the text holds a section naming each request with its status, its duration and what it
  carried, in the order they were made

#### Scenario: One operation reads as one timeline

- **WHEN** a репорт is rendered whose журнал holds a sync run's entries with other entries between
  them
- **THEN** the text holds a section grouping that run's entries together under the run, in order,
  with the requests that belong to it among them

#### Scenario: Repeated screens are one line

- **WHEN** a репорт is rendered whose журнал holds five consecutive entries for the same route
- **THEN** the журнал section shows one line for them saying it happened five times, and the
  moments of the first and the last

#### Scenario: A репорт with nothing to summarise still has the section

- **WHEN** a репорт is rendered whose журнал holds only screen entries
- **THEN** the summary, the requests section and the timeline are all present, each saying it has
  nothing

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

### Requirement: The журнал records what the app itself did, not only what refused, and why an answer it could not read failed

The app SHALL add entries to the журнал for the work it does on the owner's behalf, whether or not
it succeeds: a monobank sync run, each рахунок's turn within it, the collection of captured bank
notifications, a бекап, a відновлення, the Saldo import, and every reach for a service the app
makes through a library rather than through a request port — the Google sign-in exchange. Each
SHALL be recorded when it begins and when it ends; the ending entry SHALL carry what it came to, how long it took, and the counts
the operation measured — as numbers only. Entries belonging to one operation SHALL carry a shared
mark that ties them together, so a run's entries can be read as one run even when other entries
fall between them. A рахунок's turn that ends «недоступно» because the bank did answer but the app
could not read that answer as it expected SHALL carry one further entry naming why, in the app's
own enumerated word — never a sentence it composed. A turn that ends «недоступно» for a cause that
already reads as itself elsewhere in the журнал — the request never reached the bank, the bank
refused it outright, or the cause is the app's own and has nothing to do with what the bank
answered — adds no such entry.

#### Scenario: A sync run reads as a run

- **WHEN** a sync run over three linked рахунки finishes
- **THEN** the журнал holds an entry for the run beginning, one for each рахунок's turn with the
  outcome that turn came to, and one for the run ending with how long it took and how many
  транзакції it imported — all carrying the same mark

#### Scenario: A рахунок that fails is named among those that did not

- **WHEN** a run syncs two рахунки successfully and a third comes to «недоступно»
- **THEN** the журнал names all three turns with their outcomes, and the third's identifies which
  рахунок it was

#### Scenario: An operation that succeeds is recorded, not only one that fails

- **WHEN** a бекап is written successfully
- **THEN** the журнал holds its beginning and its ending with how long it took, and no failure
  entry

#### Scenario: The counts an operation measures are numbers

- **WHEN** the collection of captured bank notifications ends having made two чернетки out of five
  captured notifications
- **THEN** the журнал's entry for it carries those two numbers and no part of any notification's
  text

#### Scenario: A недоступно рахунок names a body it could not read at all

- **WHEN** a рахунок's request answers with a body that is not readable text the app can interpret
- **THEN** the журнал holds one more entry for that рахунок's turn, naming that the body could not
  be read

#### Scenario: A недоступно рахунок names a body of the wrong shape

- **WHEN** a рахунок's request answers with a body the app can read as text but that is not the
  shape the endpoint promises — for a reason other than the one above
- **THEN** the журнал holds one more entry for that рахунок's turn, naming that the body was not
  the expected shape

#### Scenario: A недоступно рахунок with no answer to read names no reason

- **WHEN** a рахунок's turn comes to «недоступно» because the request itself never reached the
  bank, the bank refused it with a status the run does not otherwise name, or the cause was the
  app's own and had nothing to do with what the bank answered
- **THEN** the журнал names the turn's outcome as it already does, and adds no further entry —
  the cause already reads as itself elsewhere in the журнал, or is not about the bank's answer at
  all

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
