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
headings: a summary of what the журнал holds, what the owner wrote, the build and device, the
prompting failure with its stack, the counts, the requests that left the phone, what the app did
as a timeline, the журнал as one line per entry, and — only in the file that is handed over —
every screenshot embedded as image data. The summary SHALL state how many requests were made, how
many of them did not succeed, the slowest of them, how many sync runs the журнал holds and what
the last one came to. The text SHALL contain every value the репорт holds, so what the owner reads
on the screen is what would leave; consecutive entries for one and the same screen MAY be rendered
as one line carrying how many there were, since that loses no value the репорт holds.

#### Scenario: The rendered text is the репорт

- **WHEN** a репорт with a prompting failure, ten journal entries naming ten different screens and
  one screenshot is rendered
- **THEN** the text carries the owner's lines, the build, the device, the failure with its stack,
  the counts and all ten entries in order, and the handed-over file additionally carries the
  screenshot's image data

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
